import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { saveOtp, verifyAndConsumeOtp, findOrCreateUser, getUser } from '../db/database.js';

const GMAIL_SENDER = process.env.GMAIL_SENDER_EMAIL || 'test@gmail.com';
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || 'password';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_SENDER,
    pass: GMAIL_PASS
  }
});

export async function sendOtp(email) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await saveOtp(email, otp);

  const html = `
    <div style="font-family: Arial, sans-serif; background: #1a1a1a; color: #fff; padding: 20px;">
      <h2>Your Login Code</h2>
      <p>Use the following 6-digit code to log in:</p>
      <h1 style="font-family: monospace; font-size: 32px; background: #333; padding: 10px; display: inline-block;">${otp}</h1>
      <p>This code expires in 5 minutes.</p>
      <p style="color: #aaa; font-size: 12px;">If you didn't request this, ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"App Auth" <${GMAIL_SENDER}>`,
    to: email,
    subject: 'Your Verification Code',
    html
  });
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
