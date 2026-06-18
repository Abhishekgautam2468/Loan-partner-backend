import nodemailer from 'nodemailer';
import env from '../config/env.js';
import EmailLog from '../models/EmailLog.js';

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (env.smtp.host && env.smtp.user) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return transporter;
}

// Sends an email; if SMTP isn't configured, logs to console (dev fallback).
// Always records the attempt in EmailLog.
export async function sendMail({ to, subject, html, text, attachments, type = 'status', applicationId }) {
  const t = getTransporter();
  let sent = false;
  let error = null;
  try {
    if (!t) {
      console.log(`[email:DEV] to=${to} subject="${subject}" (SMTP not configured — not sent)`);
      sent = true; // treat as success in dev so flows don't break
    } else {
      await t.sendMail({ from: env.smtp.from, to, subject, html, text, attachments });
      sent = true;
    }
  } catch (err) {
    error = err.message;
    console.error('[email] send failed', err.message);
  }
  await EmailLog.create({
    applicationId,
    to,
    type,
    subject,
    status: sent ? 'sent' : 'failed',
    error,
  }).catch(() => {});
  return sent;
}
