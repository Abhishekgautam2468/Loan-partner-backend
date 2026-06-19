import Application from '../models/Application.js';
import Document from '../models/Document.js';
import LenderApplication from '../models/LenderApplication.js';
import ReferrerApplication from '../models/ReferrerApplication.js';
import StatusHistory from '../models/StatusHistory.js';
import { STATUS, STATUS_TRANSITIONS } from '../utils/constants.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { sendMail } from '../services/email.service.js';
import { statusEmail } from '../services/templates.js';
import { shareApplicationToLender } from '../services/share.service.js';
import { logActivity } from '../services/activity.service.js';

// GET /api/admin/applications?status=&q=&from=&to=
export const listApplications = asyncHandler(async (req, res) => {
  const { status, q, from, to } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (q) {
    const rx = new RegExp(q.trim(), 'i');
    const or = [{ fullName: rx }, { email: rx }];
    if (/^[0-9a-fA-F]{24}$/.test(q.trim())) or.push({ _id: q.trim() });
    filter.$or = or;
  }
  const applications = await Application.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ applications });
});

// GET /api/admin/applications/:id
export const getApplication = asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id)
    .populate('assignedLenderId', 'institutionName email')
    .populate('sharedLenderIds', 'institutionName email');
  if (!app) throw new ApiError(404, 'Application not found');
  const documents = await Document.find({ applicationId: app._id });
  const history = await StatusHistory.find({ applicationId: app._id })
    .populate('changedByUserId', 'name')
    .sort({ createdAt: 1 });
  res.json({ application: app, documents, history });
});

// PATCH /api/admin/applications/:id/status  { toStatus, remarks }
export const updateStatus = asyncHandler(async (req, res) => {
  const { toStatus, remarks } = req.body;
  const app = await Application.findById(req.params.id);
  if (!app) throw new ApiError(404, 'Application not found');

  const allowed = STATUS_TRANSITIONS[app.status] || [];
  if (!allowed.includes(toStatus)) {
    throw new ApiError(400, `Cannot move from "${app.status}" to "${toStatus}"`);
  }

  const fromStatus = app.status;
  app.status = toStatus;
  if (toStatus === STATUS.FORWARDED_TO_MANAGER) app.forwardedAt = new Date();
  if (toStatus === STATUS.REJECTED) app.rejectionReason = remarks || '';
  await app.save();

  await StatusHistory.create({ applicationId: app._id, fromStatus, toStatus, changedByUserId: req.user._id, remarks });
  await logActivity({ actorUserId: req.user._id, action: 'application.status', targetType: 'Application', targetId: app._id, meta: { fromStatus, toStatus } });

  const { subject, html } = statusEmail(app, toStatus, remarks);
  await sendMail({ to: app.email, subject, html, type: 'status', applicationId: app._id });

  res.json({ application: app });
});

// POST /api/admin/applications/:id/share-to-lender  { lenderId }
// Available once documents are verified; can be sent to multiple lenders.
const SHAREABLE = [STATUS.DOCUMENTS_VERIFIED, STATUS.FORWARDED_TO_MANAGER, STATUS.APPROVED];
export const shareToLender = asyncHandler(async (req, res) => {
  const { lenderId } = req.body;
  const app = await Application.findById(req.params.id);
  if (!app) throw new ApiError(404, 'Application not found');
  if (!SHAREABLE.includes(app.status)) {
    throw new ApiError(400, 'Verify the documents before sharing this application to a lender');
  }
  const lender = await LenderApplication.findById(lenderId);
  if (!lender) throw new ApiError(404, 'Lender not found');
  // Sharing a deal effectively onboards the lender.
  if (lender.status !== 'onboarded') { lender.status = 'onboarded'; await lender.save(); }

  const sent = await shareApplicationToLender(app, lender);
  if (!app.sharedLenderIds.map(String).includes(String(lender._id))) app.sharedLenderIds.push(lender._id);
  app.assignedLenderId = lender._id;
  app.sharedToManagerAt = new Date();
  // First share advances the workflow stage (Approve stays available afterwards).
  if (app.status === STATUS.DOCUMENTS_VERIFIED) {
    app.forwardedAt = new Date();
    app.status = STATUS.FORWARDED_TO_MANAGER;
    await StatusHistory.create({ applicationId: app._id, fromStatus: STATUS.DOCUMENTS_VERIFIED, toStatus: STATUS.FORWARDED_TO_MANAGER, changedByUserId: req.user._id, remarks: `Shared with ${lender.institutionName}` });
  }
  await app.save();
  await logActivity({ actorUserId: req.user._id, action: 'application.share', targetType: 'Application', targetId: app._id, meta: { lenderId, sent } });

  res.json({ application: app, emailSent: sent });
});

// ---- Lender applications (from the public "Become a Lender" form) ----
const LENDER_STATUSES = ['new', 'reviewing', 'onboarded', 'declined'];

export const listLenderApplications = asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(q.trim(), 'i');
    const or = [{ institutionName: rx }, { contactName: rx }, { email: rx }, { institutionType: rx }];
    if (/^[0-9a-fA-F]{24}$/.test(q.trim())) or.push({ _id: q.trim() });
    filter.$or = or;
  }
  const lenders = await LenderApplication.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ lenders });
});

// POST /api/admin/lender-applications  (admin manually onboards a lender)
export const createLender = asyncHandler(async (req, res) => {
  const {
    institutionName, institutionType, website, license, yearEstablished,
    contactName, designation, email, phone, city, state,
    products, ticketSizeFrom, geographies, message, status,
  } = req.body;
  const lender = await LenderApplication.create({
    institutionName, institutionType, website, license, yearEstablished,
    contactName: contactName?.trim() || institutionName,
    designation, email: String(email).toLowerCase(), phone, city, state,
    products: Array.isArray(products) ? products : (products ? [products] : []),
    ticketSizeFrom, geographies, message,
    status: LENDER_STATUSES.includes(status) ? status : 'onboarded',
  });
  await logActivity({ actorUserId: req.user._id, action: 'lender.create', targetType: 'LenderApplication', targetId: lender._id });
  res.status(201).json({ lender });
});

export const getLenderApplication = asyncHandler(async (req, res) => {
  const lender = await LenderApplication.findById(req.params.id);
  if (!lender) throw new ApiError(404, 'Lender application not found');
  res.json({ lender });
});

export const updateLenderApplication = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!LENDER_STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
  const lender = await LenderApplication.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!lender) throw new ApiError(404, 'Lender application not found');
  await logActivity({ actorUserId: req.user._id, action: 'lender.status', targetType: 'LenderApplication', targetId: lender._id, meta: { status } });
  res.json({ lender });
});

export const deleteLender = asyncHandler(async (req, res) => {
  const lender = await LenderApplication.findByIdAndDelete(req.params.id);
  if (!lender) throw new ApiError(404, 'Lender not found');
  // Un-assign from any applications that were shared with this lender.
  await Application.updateMany({ assignedLenderId: lender._id }, { $unset: { assignedLenderId: '' } });
  await logActivity({ actorUserId: req.user._id, action: 'lender.delete', targetType: 'LenderApplication', targetId: lender._id });
  res.json({ message: 'Lender deleted' });
});

// ---- Referrer / DSA applications (from the public "Refer & Earn" form) ----
const REFERRER_STATUSES = ['new', 'reviewing', 'onboarded', 'declined'];

export const listReferrerApplications = asyncHandler(async (req, res) => {
  const { status, q } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(q.trim(), 'i');
    const or = [{ fullName: rx }, { firmName: rx }, { email: rx }, { referrerType: rx }];
    if (/^[0-9a-fA-F]{24}$/.test(q.trim())) or.push({ _id: q.trim() });
    filter.$or = or;
  }
  const referrers = await ReferrerApplication.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ referrers });
});

export const createReferrer = asyncHandler(async (req, res) => {
  const { fullName, referrerType, firmName, email, phone, city, state, pan, experience, monthlyVolume, products, message, status } = req.body;
  const referrer = await ReferrerApplication.create({
    fullName, referrerType, firmName, email: String(email).toLowerCase(), phone, city, state,
    pan, experience, monthlyVolume,
    products: Array.isArray(products) ? products : (products ? [products] : []),
    message,
    status: REFERRER_STATUSES.includes(status) ? status : 'onboarded',
  });
  await logActivity({ actorUserId: req.user._id, action: 'referrer.create', targetType: 'ReferrerApplication', targetId: referrer._id });
  res.status(201).json({ referrer });
});

export const getReferrerApplication = asyncHandler(async (req, res) => {
  const referrer = await ReferrerApplication.findById(req.params.id);
  if (!referrer) throw new ApiError(404, 'Referrer application not found');
  res.json({ referrer });
});

export const updateReferrerApplication = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!REFERRER_STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
  const referrer = await ReferrerApplication.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!referrer) throw new ApiError(404, 'Referrer application not found');
  await logActivity({ actorUserId: req.user._id, action: 'referrer.status', targetType: 'ReferrerApplication', targetId: referrer._id, meta: { status } });
  res.json({ referrer });
});

export const deleteReferrer = asyncHandler(async (req, res) => {
  const referrer = await ReferrerApplication.findByIdAndDelete(req.params.id);
  if (!referrer) throw new ApiError(404, 'Referrer not found');
  await logActivity({ actorUserId: req.user._id, action: 'referrer.delete', targetType: 'ReferrerApplication', targetId: referrer._id });
  res.json({ message: 'Referrer deleted' });
});

// GET /api/admin/stats
export const stats = asyncHandler(async (req, res) => {
  const [total, approved, rejected, pending, assigned] = await Promise.all([
    Application.countDocuments(),
    Application.countDocuments({ status: STATUS.APPROVED }),
    Application.countDocuments({ status: STATUS.REJECTED }),
    Application.countDocuments({ status: { $in: [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.DOCUMENTS_VERIFIED, STATUS.FORWARDED_TO_MANAGER] } }),
    Application.countDocuments({ assignedLenderId: { $ne: null } }),
  ]);

  const monthly = await Application.aggregate([
    { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { '_id.y': -1, '_id.m': -1 } },
    { $limit: 12 },
  ]);

  res.json({ counts: { total, approved, rejected, pending, assigned }, monthly });
});
