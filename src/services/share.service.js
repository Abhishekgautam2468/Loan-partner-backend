import Document from '../models/Document.js';
import { signedUrl } from './storage.service.js';
import { sendMail } from './email.service.js';
import { managerShareEmail } from './templates.js';

// Fetch a Cloudinary asset (via short-lived signed URL) into a Buffer for attaching.
async function fetchAttachment(doc) {
  const url = signedUrl(doc.cloudinaryPublicId, { resourceType: doc.resourceType });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${doc.originalName} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { filename: doc.originalName, content: buf, contentType: doc.mimeType };
}

// Email a lending partner the approved application's details + all documents as raw attachments.
export async function shareApplicationToLender(app, lender) {
  const docs = await Document.find({ applicationId: app._id });
  const attachments = [];
  for (const d of docs) {
    try {
      attachments.push(await fetchAttachment(d));
    } catch (err) {
      console.error('[share] attachment skipped', err.message);
    }
  }
  const { subject, html } = managerShareEmail(app);
  return sendMail({
    to: lender.email,
    subject,
    html,
    attachments,
    type: 'lender-share',
    applicationId: app._id,
  });
}
