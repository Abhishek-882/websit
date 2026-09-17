import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { saveOtp, verifyAndConsumeOtp, findOrCreateUser, getUser } from '../db/database.js';

const GMAIL_SENDER = process.env.GMAIL_SENDER_EMAIL || '';
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || '';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const hasValidSmtp = Boolean(
  GMAIL_SENDER && 
  GMAIL_PASS && 
  GMAIL_SENDER !== 'test@gmail.com' && 
  GMAIL_PASS !== 'password'
);

let transporter = null;
if (hasValidSmtp) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_SENDER,
      pass: GMAIL_PASS
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
}

export async function sendOtp(email) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await saveOtp(email, otp);

  // If real SMTP credentials are NOT configured on the server, provide backup OTP immediately
  if (!transporter) {
    console.warn(`[AUTH] ⚠️ Gmail credentials not configured in environment. Backup OTP for ${email}: ${otp}`);
    return {
      success: true,
      deliveredVia: 'backup',
      backupOtp: otp,
      message: 'SMTP credentials not configured on server. Use the backup verification code below.'
    };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; background: #1a1a1a; color: #fff; padding: 20px;">
      <h2>Your Solana Radar Login Code</h2>
      <p>Use the following 6-digit code to log in:</p>
      <h1 style="font-family: monospace; font-size: 32px; background: #333; padding: 10px; display: inline-block;">${otp}</h1>
      <p>This code expires in 5 minutes.</p>
      <p style="color: #aaa; font-size: 12px;">If you didn't request this, ignore this email.</p>
    </div>
  `;

  try {
    // Send email with strict 6s timeout so it NEVER hangs
    const sendPromise = transporter.sendMail({
      from: `"Solana Radar" <${GMAIL_SENDER}>`,
      to: email,
      subject: 'Your Verification Code',
      html
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP connection timed out after 6 seconds')), 6000)
    );

    await Promise.race([sendPromise, timeoutPromise]);
    return { success: true, deliveredVia: 'email', message: 'OTP sent to your Gmail inbox (check spam folder).' };
  } catch (err) {
    console.warn(`[AUTH] ⚠️ SMTP email send failed (${err.message}). Falling back to backup OTP.`);
    return {
      success: true,
      deliveredVia: 'backup',
      backupOtp: otp,
      message: `Email could not be delivered (${err.message}). Use the backup code below to log in.`
    };
  }
}

export async function verifyOtp(email, otp) {
  const isValid = await verifyAndConsumeOtp(email, otp);
  if (!isValid) throw new Error('Invalid or expired OTP');
  
  const user = await findOrCreateUser(email);
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
  return { token, user };
}

export function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
