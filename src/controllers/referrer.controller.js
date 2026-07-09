import ReferrerApplication from '../models/ReferrerApplication.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendMail } from '../services/email.service.js';

// POST /api/public/referrer-applications  (no auth — website "Refer & Earn / For DSAs" form)
export const createReferrerApplication = asyncHandler(async (req, res) => {
  const {
    fullName, firmName, email, phone, city, state,
    pan, experience, monthlyVolume, products, message,
  } = req.body;

  const ref = await ReferrerApplication.create({
    fullName, firmName, email: String(email).toLowerCase(), phone, city, state,
    pan, experience, monthlyVolume,
    products: Array.isArray(products) ? products : (products ? [products] : []),
    message,
  });

  await sendMail({
    to: process.env.PARTNERS_EMAIL || email,
    subject: `New DSA & Connectors application — ${fullName}`,
    html: `<p>A new DSA &amp; Connectors application was submitted.</p>
           <ul>
             <li><strong>Name:</strong> ${fullName}${firmName ? ` (${firmName})` : ''}</li>
             <li><strong>Email:</strong> ${email}</li>
             <li><strong>Phone:</strong> ${phone}</li>
           </ul>`,
    type: 'referrer',
  });

  res.status(201).json({ application: { _id: ref._id, status: ref.status } });
});
