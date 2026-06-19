import crypto from 'crypto';
import Application from '../models/Application.js';
import Document from '../models/Document.js';
import StatusHistory from '../models/StatusHistory.js';
import User from '../models/User.js';
import { STATUS, ROLES } from '../utils/constants.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { uploadBuffer } from '../services/storage.service.js';
import { sendMail } from '../services/email.service.js';
import { statusEmail } from '../services/templates.js';
import { logActivity } from '../services/activity.service.js';

// Tolerantly parse a JSON string field from multipart form-data.
function safeParse(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// POST /api/applications  (customer; multipart with `documents` files)
// Shared submission logic. `customerId` is null for public (no-login) submissions.
// Statuses that count as "in progress" (not yet decided).
const PENDING_STATUSES = [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.DOCUMENTS_VERIFIED, STATUS.FORWARDED_TO_MANAGER];

async function submitApplication(req, { customerId }) {
  const { fullName, phone, email, aadhaarNumber, panNumber, loanType, amountRequested, purpose, tenureMonths } = req.body;
  const pan = String(panNumber).toUpperCase();

  // One application per category at a time: block if a non-decided one already exists for this PAN.
  const inProgress = await Application.findOne({ panNumber: pan, loanType, status: { $in: PENDING_STATUSES } });
  if (inProgress) {
    throw new ApiError(409, `You already have a ${loanType} application in progress (currently "${inProgress.status}"). You can apply again only once it is approved or rejected.`);
  }

  // The multi-step form sends extended KYC data as a JSON string in `details`
  // and an aligned `documentCategories` JSON array (one label per uploaded file).
  const details = safeParse(req.body.details, {});
  const categories = safeParse(req.body.documentCategories, []);

  const app = await Application.create({
    customerId: customerId || undefined,
    fullName,
    phone,
    email: email.toLowerCase(),
    aadhaarNumber,
    panNumber: pan,
    loanType,
    amountRequested,
    tenureMonths: tenureMonths ? Number(tenureMonths) : undefined,
    purpose,
    details,
    status: STATUS.SUBMITTED,
  });

  // Upload each file to Cloudinary (private) and persist Document rows.
  const files = req.files || [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = await uploadBuffer(file);
    await Document.create({
      applicationId: app._id,
      category: categories[i] || 'Other',
      originalName: file.originalname,
      cloudinaryPublicId: result.public_id,
      cloudinaryUrl: result.secure_url,
      resourceType: result.resource_type || 'raw',
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
  }

  // Re-apply: reuse documents from a previous application owned by this customer (no re-upload).
  const reuseId = req.body.reuseDocumentsFrom;
  if (customerId && reuseId) {
    const prior = await Application.findOne({ _id: reuseId, customerId });
    if (prior) {
      const priorDocs = await Document.find({ applicationId: prior._id });
      for (const d of priorDocs) {
        await Document.create({
          applicationId: app._id,
          category: d.category,
          originalName: d.originalName,
          cloudinaryPublicId: d.cloudinaryPublicId,
          cloudinaryUrl: d.cloudinaryUrl,
          resourceType: d.resourceType,
          mimeType: d.mimeType,
          sizeBytes: d.sizeBytes,
          verificationStatus: 'pending', // re-verify for the new application
        });
      }
    }
  }

  await StatusHistory.create({ applicationId: app._id, fromStatus: null, toStatus: STATUS.SUBMITTED, changedByUserId: null });
  await logActivity({ actorUserId: customerId || null, action: 'application.create', targetType: 'Application', targetId: app._id });

  const { subject, html } = statusEmail(app, STATUS.SUBMITTED);
  await sendMail({ to: app.email, subject, html, type: 'status', applicationId: app._id });

  return app;
}

export const createApplication = asyncHandler(async (req, res) => {
  const app = await submitApplication(req, { customerId: req.user._id });
  res.status(201).json({ application: app });
});

// Links a public submission to a customer account (creating one if needed), and
// returns whether the account already has a password + a one-time setup token if not.
async function linkOrCreateAccount(app) {
  let user = await User.findOne({ email: app.email });
  if (!user) {
    user = new User({ name: app.fullName, email: app.email, phone: app.phone, role: ROLES.CUSTOMER, passwordSet: false });
    await user.setPassword(crypto.randomBytes(24).toString('hex')); // placeholder, unusable until set
    await user.save();
  }
  // Associate this and any prior unlinked applications for this email.
  await Application.updateMany({ email: app.email, customerId: null }, { customerId: user._id });

  if (!user.passwordSet) {
    const setupToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = crypto.createHash('sha256').update(setupToken).digest('hex');
    user.resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await user.save();
    return { email: user.email, exists: false, setupToken };
  }
  return { email: user.email, exists: true };
}

// POST /api/public/application-precheck  { panNumber, loanType }
// Returns whether a pending application already exists for this PAN + category,
// so the form can warn early instead of failing at submit.
export const applicationPrecheck = asyncHandler(async (req, res) => {
  const pan = String(req.body.panNumber || '').toUpperCase().trim();
  const { loanType } = req.body;
  if (!pan || !loanType) return res.json({ pending: false });
  const existing = await Application.findOne({ panNumber: pan, loanType, status: { $in: PENDING_STATUSES } }).select('_id');
  res.json({ pending: !!existing });
});

// POST /api/public/applications  (no auth — website "Apply Now" lead form)
export const createPublicApplication = asyncHandler(async (req, res) => {
  const app = await submitApplication(req, { customerId: null });
  const account = await linkOrCreateAccount(app);
  res.status(201).json({ application: { _id: app._id, status: app.status }, account });
});

// GET /api/applications/mine
export const myApplications = asyncHandler(async (req, res) => {
  const apps = await Application.find({ customerId: req.user._id }).sort({ createdAt: -1 });
  res.json({ applications: apps });
});

// GET /api/applications/:id  (customer's own, with docs + timeline)
export const myApplicationDetail = asyncHandler(async (req, res) => {
  const app = await Application.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!app) throw new ApiError(404, 'Application not found');
  const documents = await Document.find({ applicationId: app._id }).select('-cloudinaryUrl -cloudinaryPublicId');
  const history = await StatusHistory.find({ applicationId: app._id }).sort({ createdAt: 1 });
  res.json({ application: app, documents, history });
});
