import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import env from '../config/env.js';
import EmailLog from '../models/EmailLog.js';

// The logo is embedded inline (CID) so it renders in every mail client without
// depending on a public URL / CLIENT_ORIGIN. Templates reference it as cid:tp-logo.
const LOGO_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/logo.jpeg');
const logoAttachment = { filename: 'logo.jpeg', path: LOGO_PATH, cid: 'tp-logo' };

let transporter = null;
// A value is "real" only if present and not a left-over placeholder like <smtp-host>.
const configured = (v) => !!v && !/[<>]/.test(v);

function getTransporter() {
  if (transporter) return transporter;
  const host = (env.smtp.host || '').trim();
  const user = (env.smtp.user || '').trim();
  const pass = (env.smtp.pass || '').replace(/\s+/g, ''); // app passwords are entered without spaces
  if (configured(host) && configured(user)) {
    transporter = nodemailer.createTransport({
      host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user, pass },
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
      await t.sendMail({ from: env.smtp.from, to, subject, html, text, attachments: [...(attachments || []), logoAttachment] });
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
