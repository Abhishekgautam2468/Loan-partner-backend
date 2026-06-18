import Application from '../models/Application.js';
import Document from '../models/Document.js';
import StatusHistory from '../models/StatusHistory.js';
import { STATUS } from '../utils/constants.js';
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
async function submitApplication(req, { customerId }) {
  const { fullName, phone, email, aadhaarNumber, panNumber, loanType, amountRequested, purpose, tenureMonths } = req.body;

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
    panNumber: String(panNumber).toUpperCase(),
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

// POST /api/public/applications  (no auth — website "Apply Now" lead form)
export const createPublicApplication = asyncHandler(async (req, res) => {
  const app = await submitApplication(req, { customerId: null });
  res.status(201).json({ application: { _id: app._id, status: app.status } });
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
