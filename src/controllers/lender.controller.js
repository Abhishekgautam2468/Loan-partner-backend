import LenderApplication from '../models/LenderApplication.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendMail } from '../services/email.service.js';

// POST /api/public/lender-applications  (no auth — website "Become a Lender" form)
export const createLenderApplication = asyncHandler(async (req, res) => {
  const {
    institutionName, institutionType, website, license, yearEstablished,
    contactName, designation, email, phone, city, state,
    products, ticketSizeFrom, geographies, message,
  } = req.body;

  const app = await LenderApplication.create({
    institutionName, institutionType, website, license, yearEstablished,
    contactName, designation, email: String(email).toLowerCase(), phone, city, state,
    products: Array.isArray(products) ? products : (products ? [products] : []),
    ticketSizeFrom, geographies, message,
  });

  // Notify the internal partnerships inbox (logged to console if SMTP is unset).
  await sendMail({
    to: process.env.PARTNERS_EMAIL || email,
    subject: `New lender application — ${institutionName} (${institutionType})`,
    html: `<p>A new lender application was submitted.</p>
           <ul>
             <li><strong>Institution:</strong> ${institutionName} (${institutionType})</li>
             <li><strong>Contact:</strong> ${contactName}${designation ? `, ${designation}` : ''}</li>
             <li><strong>Email:</strong> ${email}</li>
             <li><strong>Phone:</strong> ${phone}</li>
           </ul>`,
    type: 'lender',
  });

  res.status(201).json({ application: { _id: app._id, status: app.status } });
});
