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

// A PAN may belong to exactly one customer account. Block any submit that would
// attach a PAN already registered to a different account.
async function assertPanOwnership(pan, { reqUser, email }) {
  const byPan = await User.findOne({ panNumber: pan });
  if (reqUser) {
    if (byPan && !byPan._id.equals(reqUser._id)) {
      throw new ApiError(409, 'This PAN is already registered to another account.');
    }
    if (reqUser.panNumber && reqUser.panNumber !== pan) {
      throw new ApiError(409, 'Your account is registered with a different PAN.');
    }
  } else if (byPan && byPan.email !== email) {
    throw new ApiError(409, 'This PAN is already registered to another account. Please log in to continue.');
  }
}

// Bind a PAN to an account, enforcing one-PAN-per-account. Idempotent. This must
// NEVER fail silently: an unbound panNumber breaks the "this PAN already has an
// account" detection on the apply form, so conflicts and write errors are surfaced.
async function ensurePanBound(user, panNumber) {
  if (!user) return;
  const pan = String(panNumber || '').toUpperCase().trim();
  if (!pan) throw new ApiError(400, 'A PAN is required to bind to the account.');
  if (user.panNumber === pan) return; // already bound — nothing to do
  if (user.panNumber && user.panNumber !== pan) {
    throw new ApiError(409, 'Your account is registered with a different PAN.');
  }
  const holder = await User.findOne({ panNumber: pan, _id: { $ne: user._id } }).select('_id');
  if (holder) throw new ApiError(409, 'This PAN is already registered to another account.');
  user.panNumber = pan;
  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'This PAN is already registered to another account.');
    console.error('[pan-bind] failed to bind PAN', { userId: user._id?.toString(), pan, error: err.message });
    throw err; // surface — do not swallow
  }
}

// POST /api/applications  (customer; multipart with `documents` files)
// Shared submission logic. `customerId` is null for public (no-login) submissions.
// Statuses that count as "in progress" (not yet decided).
const PENDING_STATUSES = [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.DOCUMENTS_VERIFIED, STATUS.FORWARDED_TO_MANAGER];

async function submitApplication(req, { customerId }) {
  const { fullName, phone, email, aadhaarNumber, panNumber, loanType, amountRequested, purpose, tenureMonths } = req.body;
  const pan = String(panNumber).toUpperCase();
  const emailLc = String(email).toLowerCase();

  // A PAN belongs to exactly one account — reject before creating anything.
  await assertPanOwnership(pan, { reqUser: req.user, email: emailLc });

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
    email: emailLc,
    aadhaarNumber,
    panNumber: pan,
    loanType,
    amountRequested,
    tenureMonths: tenureMonths ? Number(tenureMonths) : undefined,
    purpose,
    details,
    status: STATUS.SUBMITTED,
  });

  // Bind the PAN to a logged-in customer's account. (Public submits bind it via
  // linkOrCreateAccount.) Idempotent and never silent — throws on conflict.
  if (req.user) await ensurePanBound(req.user, pan);

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
  // Bind the PAN to the account (creates or backfills). Idempotent; throws on a
  // genuine conflict rather than leaving the account without a PAN.
  await ensurePanBound(user, app.panNumber);
  // Associate this and any prior unlinked applications for this email.
  await Application.updateMany({ email: app.email, customerId: null }, { customerId: user._id });

  if (!user.passwordSet) {
    const setupToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = crypto.createHash('sha256').update(setupToken).digest('hex');
    user.resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min
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
  const email = String(req.body.email || '').toLowerCase().trim();
  const { loanType } = req.body;

  // Duplicate in-progress application for this PAN + product.
  let pending = false;
  if (pan && loanType) {
    const existing = await Application.findOne({ panNumber: pan, loanType, status: { $in: PENDING_STATUSES } }).select('_id');
    pending = !!existing;
  }

  // An existing account linked to this PAN or email (each maps to a single account).
  // We return the account email so the login page can pre-fill it.
  const or = [];
  if (pan) or.push({ panNumber: pan });
  if (email) or.push({ email });
  let account = or.length ? await User.findOne({ $or: or }).select('email') : null;

  // User.panNumber isn't reliably populated, so matching a PAN to a User directly
  // often fails. The canonical owner of a PAN is whoever owns an application carrying
  // it — resolve the account through that application so a returning applicant is
  // detected even when they enter a different email than their account's.
  if (!account && pan) {
    const ownedApp = await Application.findOne({ panNumber: pan, customerId: { $ne: null } })
      .select('customerId')
      .populate('customerId', 'email');
    if (ownedApp?.customerId) account = ownedApp.customerId;
  }

  res.json({ pending, accountExists: !!account, accountEmail: account?.email || null });
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
