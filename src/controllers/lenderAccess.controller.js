import crypto from 'crypto';
import Application from '../models/Application.js';
import LenderApplication from '../models/LenderApplication.js';
import Document from '../models/Document.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { signToken } from '../utils/jwt.js';
import { signedUrl } from '../services/storage.service.js';
import { sendMail } from '../services/email.service.js';
import { passwordOtpEmail } from '../services/templates.js';

const sha256 = (v) => crypto.createHash('sha256').update(String(v).trim()).digest('hex');

// Find an onboarded lender by email that the application was actually shared with.
async function sharedLenderFor(app, email) {
  if (!app) return null;
  const lender = await LenderApplication.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!lender) return null;
  const shared = (app.sharedLenderIds || []).map(String).includes(String(lender._id));
  return shared ? lender : null;
}

// POST /api/lender/request-code  { applicationId, email }
// Emails a 6-digit code if the email is a lender this application was shared with.
export const requestCode = asyncHandler(async (req, res) => {
  const { applicationId, email } = req.body;
  const app = await Application.findById(applicationId);
  const lender = await sharedLenderFor(app, email);
  // Generic response either way to avoid leaking which emails have access.
  if (lender) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    lender.accessOtp = sha256(otp);
    lender.accessOtpExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await lender.save();
    const { subject, html } = passwordOtpEmail(otp);
    const sent = await sendMail({ to: lender.email, type: 'lender-access', subject, html });
    // Diagnostic: whether the OTP mail actually went out (false ⇒ SMTP not configured
    // or the provider rejected it — the lender will never receive a code).
    console.log(`[lender-access] OTP request app=${applicationId} email=${String(email || '').trim()} matched=yes sent=${sent}`);
  } else {
    // The email entered isn't a lender this application was shared with (often a typo
    // or a different address than the one on the invite) — no code is ever sent.
    console.warn(`[lender-access] OTP request app=${applicationId} email=${String(email || '').trim()} matched=NO — not a shared lender for this application`);
  }
  res.json({ message: 'If this email has access, a verification code has been sent.' });
});

// POST /api/lender/verify-code  { applicationId, email, code }
// Verifies the code and issues a 2-hour lender token scoped to this application.
export const verifyCode = asyncHandler(async (req, res) => {
  const { applicationId, email, code } = req.body;
  const app = await Application.findById(applicationId);
  const lender = await sharedLenderFor(app, email);
  // Normalise to digits only so stray spaces / pasted formatting never cause a false mismatch.
  const cleanCode = String(code || '').replace(/\D/g, '');
  if (!lender || !lender.accessOtp || !lender.accessOtpExpiry) {
    console.warn(`[lender-access] verify FAIL app=${applicationId} email=${String(email || '').trim()} reason=${!lender ? 'not-a-shared-lender' : 'no-code-on-record'}`);
    throw new ApiError(400, 'Invalid or expired code');
  }
  if (lender.accessOtp !== sha256(cleanCode)) {
    console.warn(`[lender-access] verify FAIL app=${applicationId} email=${String(email || '').trim()} reason=code-mismatch`);
    throw new ApiError(400, 'Invalid or expired code');
  }
  if (lender.accessOtpExpiry < new Date()) {
    console.warn(`[lender-access] verify FAIL app=${applicationId} email=${String(email || '').trim()} reason=expired`);
    throw new ApiError(400, 'Invalid or expired code');
  }
  lender.accessOtp = undefined;
  lender.accessOtpExpiry = undefined;
  await lender.save();
  const token = signToken(
    { scope: 'lender', lenderId: lender._id.toString(), email: lender.email, applicationId: String(app._id) },
    { expiresIn: '2h' }
  );
  res.json({ token, lender: { institutionName: lender.institutionName } });
});

// Ensure the lender token is for the application being requested.
function assertScope(req) {
  if (!req.lender || req.lender.scope !== 'lender') throw new ApiError(401, 'Authentication required');
  if (String(req.lender.applicationId) !== String(req.params.id)) throw new ApiError(403, 'Not authorized for this application');
}

// GET /api/lender/applications/:id  (lender token)
// Returns the application details + the metadata of documents shared with lenders.
export const getApplication = asyncHandler(async (req, res) => {
  assertScope(req);
  const app = await Application.findById(req.params.id);
  if (!app) throw new ApiError(404, 'Application not found');
  const docs = await Document.find({ _id: { $in: app.sharedDocumentIds || [] } })
    .select('_id originalName category mimeType');
  res.json({
    application: {
      _id: app._id,
      fullName: app.fullName,
      phone: app.phone,
      email: app.email,
      loanType: app.loanType,
      amountRequested: app.amountRequested,
      approvedAmount: app.approvedAmount,
      tenureMonths: app.tenureMonths,
      purpose: app.purpose,
      status: app.status,
      aadhaarNumber: app.aadhaarNumber,
      panNumber: app.panNumber,
      details: app.details || {},
      createdAt: app.createdAt,
    },
    documents: docs,
  });
});

// GET /api/lender/applications/:id/documents/:docId  (lender token)
// Returns a short-lived signed URL for a document shared with lenders.
export const getDocumentUrl = asyncHandler(async (req, res) => {
  assertScope(req);
  const app = await Application.findById(req.params.id).select('sharedDocumentIds');
  if (!app) throw new ApiError(404, 'Application not found');
  if (!(app.sharedDocumentIds || []).map(String).includes(String(req.params.docId))) {
    throw new ApiError(404, 'Document not found');
  }
  const doc = await Document.findById(req.params.docId);
  if (!doc) throw new ApiError(404, 'Document not found');
  const url = signedUrl(doc.cloudinaryPublicId, { resourceType: doc.resourceType });
  res.json({ url, originalName: doc.originalName, mimeType: doc.mimeType });
});
