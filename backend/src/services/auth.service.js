import https from 'https';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { saveOtp, verifyAndConsumeOtp, findOrCreateUser, saveUserPin, getUserPin } from '../db/database.js';

// ── JWT Secret ──────────────────────────────────────────────────────
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.createHash('sha256').update(`${process.env.USERNAME || process.env.USER || 'srv'}:${process.cwd()}`).digest('hex');
  console.warn('[AUTH] JWT_SECRET not set — add it to Render env vars for persistent login.');
}

// ── Brevo HTTP API ───────────────────────────────────────────────────
// Uses HTTPS port 443 only — Render blocks SMTP ports 25/465/587.
// Free plan: 300 emails/day. Sign up at brevo.com.
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_SENDER  = process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_SENDER_EMAIL || '';
const hasBrevo = Boolean(BREVO_API_KEY && BREVO_SENDER);
if (!hasBrevo) console.warn('[AUTH] Set BREVO_API_KEY + BREVO_SENDER_EMAIL (or GMAIL_SENDER_EMAIL) in Render env vars.');

function sendViaBrevo(toEmail, subject, htmlContent) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sender:      { name: 'MEME_CAT', email: BREVO_SENDER },
      to:          [{ email: toEmail }],
      subject,
      htmlContent,
    });
    const req = https.request({
      hostname: 'api.brevo.com',
      port:     443,
      path:     '/v3/smtp/email',
      method:   'POST',
      headers: {
        'api-key':        BREVO_API_KEY,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept':         'application/json',
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true });
        else reject(new Error(`Brevo API error ${res.statusCode}: ${raw}`));
      });
    });
    const t = setTimeout(() => { req.destroy(); reject(new Error('Email API timed out after 12s')); }, 12000);
    req.on('close', () => clearTimeout(t));
    req.on('error', e => { clearTimeout(t); reject(e); });
    req.write(body);
    req.end();
  });
}

export async function sendOtp(email) {
  if (BREVO_API_KEY && BREVO_API_KEY.startsWith('xsmtpsib-')) {
    throw new Error(
      'Brevo SMTP key detected (starts with xsmtpsib-). ' +
      'The HTTP API requires a Brevo API Key (starts with xkeysib-). ' +
      'In your Brevo dashboard, go to Settings -> SMTP & API -> click the "API Keys" tab (NOT the SMTP tab) -> click "Generate a new API key".'
    );
  }

  if (!hasBrevo && !process.env.RESEND_API_KEY) {
    throw new Error(
      'Email delivery not configured. Set BREVO_API_KEY (starts with xkeysib-) and GMAIL_SENDER_EMAIL in Render environment variables.'
    );
  }
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await saveOtp(email, otp);
  const html = `<div style="font-family:Arial,sans-serif;background:#090d16;color:#f1f5f9;padding:32px;border-radius:8px;max-width:480px;"><h2 style="color:#06b6d4;margin-top:0;">MEME_CAT Verification Code</h2><p style="color:#cbd5e1;">Enter this 6-digit code to verify your account:</p><div style="font-family:monospace;font-size:36px;font-weight:900;letter-spacing:8px;background:#1e293b;padding:16px 24px;border-radius:6px;display:inline-block;color:#fff;margin:12px 0;">${otp}</div><p style="color:#94a3b8;font-size:13px;">Expires in <strong>5 minutes</strong>.</p><p style="color:#64748b;font-size:12px;">If you did not request this, ignore this email.</p></div>`;
  await sendViaBrevo(email, 'Your MEME_CAT Verification Code', html);
  return { success: true, message: 'Code sent to your email. Check spam/junk if not received within 60 seconds.' };
}

// ── Verify OTP ──────────────────────────────────────────────────────

export async function verifyOtp(email, otp) {
  const isValid = await verifyAndConsumeOtp(email, otp);
  if (!isValid) throw new Error('Invalid or expired verification code');
  const user  = await findOrCreateUser(email);
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
  return { token, user, hasPinSet: Boolean(await getUserPin(email)) };
}

// ── 4-Digit PIN ─────────────────────────────────────────────────────

export async function setPinForUser(email, pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');
  await saveUserPin(email, crypto.createHash('sha256').update(`${email}:${pin}`).digest('hex'));
}

export async function verifyPinAndIssueToken(email, pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');
  const stored = await getUserPin(email);
  if (!stored) throw new Error('No PIN set. Log in with email OTP first.');
  if (crypto.createHash('sha256').update(`${email}:${pin}`).digest('hex') !== stored) throw new Error('Incorrect PIN');
  const user = await findOrCreateUser(email);
  return { token: jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' }), user };
}

export async function hasPinSet(email) {
  return Boolean(await getUserPin(email));
}

// ── JWT Middleware ───────────────────────────────────────────────────

export function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}
