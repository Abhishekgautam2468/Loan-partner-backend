import env from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendMail } from '../services/email.service.js';

// Basic HTML-escape so user input can't inject markup into the notification email.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// POST /api/public/advisor-enquiry  (no auth — home "Talk to an advisor" popup)
// A lightweight enquiry: just the essentials, forwarded to the business inbox.
// No application/lead record is created — this is a simple contact forward.
export const createAdvisorEnquiry = asyncHandler(async (req, res) => {
  const { name, email, phone, address, amountRequested } = req.body;

  const sent = await sendMail({
    to: env.contactEmail,
    subject: `New advisor enquiry — ${name}`,
    html: `<p>A new "Talk to an advisor" enquiry was submitted from the website.</p>
           <ul>
             <li><strong>Name:</strong> ${esc(name)}</li>
             <li><strong>Email:</strong> ${esc(email)}</li>
             <li><strong>Contact:</strong> ${esc(phone)}</li>
             <li><strong>Address:</strong> ${esc(address)}</li>
             <li><strong>Requested loan amount:</strong> ${esc(amountRequested)}</li>
           </ul>`,
    type: 'advisor-enquiry',
  });

  res.status(201).json({ ok: true, sent });
});
