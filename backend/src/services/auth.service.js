import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { saveOtp, verifyAndConsumeOtp, findOrCreateUser, getUser, saveUserPin, getUserPin } from '../db/database.js';

// ── JWT Secret ──────────────────────────────────────────────────────
// MUST be set as a fixed env var in Render dashboard for sessions to survive restarts.
// If not set, we derive a deterministic fallback from stable machine info so it is at
// least consistent within one running process rather than purely random each call.
// PROPER FIX: Set JWT_SECRET=<any long random string> in Render environment variables.
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Deterministic fallback — consistent per OS username+cwd combo, NOT truly random
  const fallbackBase = `${process.env.USERNAME || process.env.USER || 'srv'}:${process.cwd()}`;
  JWT_SECRET = crypto.createHash('sha256').update(fallbackBase).digest('hex');
  console.warn('[AUTH] ⚠️  JWT_SECRET env var not set. Sessions will NOT survive a server hostname change.');
  console.warn('[AUTH] ⚠️  Add JWT_SECRET to your Render environment variables to fix persistent login.');
}

// ── SMTP Configuration ──────────────────────────────────────────────
const GMAIL_SENDER = process.env.GMAIL_SENDER_EMAIL || '';
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || '';

const hasValidSmtp = Boolean(
  GMAIL_SENDER &&
  GMAIL_PASS &&
  GMAIL_SENDER.includes('@') &&
  GMAIL_PASS.length > 8
);

let transporter = null;
if (hasValidSmtp) {
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',   // explicit host avoids IPv6 resolution
    port: 587,                // STARTTLS port — works on all Render regions
    secure: false,            // upgrade via STARTTLS, not SSL
    family: 4,                // force IPv4 — Render does NOT support IPv6
    auth: {
      user: GMAIL_SENDER,
      pass: GMAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}

// ── OTP Sending ─────────────────────────────────────────────────────

export async function sendOtp(email) {
  // If SMTP is not configured at all, throw an honest error — no fake fallback
  if (!transporter) {
    throw new Error(
      'Gmail SMTP is not configured on the server. ' +
      'Set GMAIL_SENDER_EMAIL and GMAIL_APP_PASSWORD in Render environment variables to enable email delivery.'
    );
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await saveOtp(email, otp);

  const html = `
    <div style="font-family: Arial, sans-serif; background: #090d16; color: #f1f5f9; padding: 32px; border-radius: 8px; max-width: 480px;">
      <h2 style="color: #06b6d4; margin-top: 0;">MEME_CAT — Verification Code</h2>
      <p style="color: #cbd5e1;">Enter the following 6-digit code to verify your account:</p>
      <div style="font-family: monospace; font-size: 36px; font-weight: 900; letter-spacing: 8px; background: #1e293b; padding: 16px 24px; border-radius: 6px; display: inline-block; color: #ffffff; margin: 12px 0;">
        ${otp}
      </div>
      <p style="color: #94a3b8; font-size: 13px;">This code expires in <strong>5 minutes</strong>.</p>
      <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">If you did not request this, you can safely ignore this email.</p>
    </div>
  `;

  // Enforce a hard timeout so the request never hangs indefinitely
  const sendPromise = transporter.sendMail({
    from: `"MEME_CAT" <${GMAIL_SENDER}>`,
    to: email,
    subject: 'Your MEME_CAT Verification Code',
    html,
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Gmail SMTP connection timed out after 10 seconds')), 10000)
  );

  await Promise.race([sendPromise, timeoutPromise]);
  return { success: true, message: 'Verification code sent to your Gmail inbox. Check your spam/junk folder if it does not appear within 60 seconds.' };
}

// ── OTP Verification ────────────────────────────────────────────────

export async function verifyOtp(email, otp) {
  const isValid = await verifyAndConsumeOtp(email, otp);
  if (!isValid) throw new Error('Invalid or expired verification code');

  const user = await findOrCreateUser(email);
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

  // Let the client know whether a PIN has been set so it can decide next step
  const pinHash = await getUserPin(email);
  return { token, user, hasPinSet: Boolean(pinHash) };
}

// ── 4-Digit PIN ─────────────────────────────────────────────────────

export async function setPinForUser(email, pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');
  const pinHash = crypto.createHash('sha256').update(`${email}:${pin}`).digest('hex');
  await saveUserPin(email, pinHash);
}

export async function verifyPinAndIssueToken(email, pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');

  const storedHash = await getUserPin(email);
  if (!storedHash) throw new Error('No PIN set for this account. Please log in with Gmail OTP first.');

  const incomingHash = crypto.createHash('sha256').update(`${email}:${pin}`).digest('hex');
  if (incomingHash !== storedHash) throw new Error('Incorrect PIN');

  const user = await findOrCreateUser(email);
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
  return { token, user };
}

export async function hasPinSet(email) {
  const pinHash = await getUserPin(email);
  return Boolean(pinHash);
}

// ── JWT Middleware ───────────────────────────────────────────────────

export function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}
