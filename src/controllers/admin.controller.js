import Application from '../models/Application.js';
import Document from '../models/Document.js';
import LenderApplication from '../models/LenderApplication.js';
import ReferrerApplication from '../models/ReferrerApplication.js';
import StatusHistory from '../models/StatusHistory.js';
import { STATUS, STATUS_TRANSITIONS } from '../utils/constants.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import env from '../config/env.js';
import { sendMail } from '../services/email.service.js';
import { statusEmail, partnerStatusEmail, lenderInviteEmail } from '../services/templates.js';
import { uploadBuffer } from '../services/storage.service.js';
import { logActivity } from '../services/activity.service.js';

// Parse a value that may be a JSON array string, a single value, or already an array.
function parseIdList(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    try { const p = JSON.parse(v); return (Array.isArray(p) ? p : [p]).filter(Boolean); }
    catch { return [v]; }
  }
  return [];
}

// GET /api/admin/applications?status=&q=&from=&to=&loanType=&sort=&page=&limit=
// Two modes:
//   • no `page`  → legacy: up to 200 docs, no metadata (dashboard, notifications).
//   • with `page` → paginated: { applications, total, page, pageSize, statusCounts, loanTypes }.
// `statusCounts` and `loanTypes` are faceted over the filter WITHOUT the status
// constraint, so the status pills/dropdown stay accurate while a status is selected.
export const listApplications = asyncHandler(async (req, res) => {
  const { status, q, from, to, loanType, rm, sort, page } = req.query;

  const baseFilter = {};
  if (rm && rm.trim()) baseFilter.rmName = new RegExp(rm.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (from || to) {
    baseFilter.createdAt = {};
    if (from) baseFilter.createdAt.$gte = new Date(from);
    if (to) baseFilter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (loanType) baseFilter.loanType = loanType;
  if (q) {
    const rx = new RegExp(q.trim(), 'i');
    const or = [{ fullName: rx }, { email: rx }];
    if (/^[0-9a-fA-F]{24}$/.test(q.trim())) or.push({ _id: q.trim() });
    baseFilter.$or = or;
  }

  const sortMap = {
    newest: { createdAt: -1 }, oldest: { createdAt: 1 },
    amount_high: { amountRequested: -1 }, amount_low: { amountRequested: 1 },
    name: { fullName: 1 },
  };
  const sortBy = sortMap[sort] || sortMap.newest;
  const filter = status ? { ...baseFilter, status } : baseFilter;

  // Legacy, non-paginated mode.
  if (page === undefined) {
    const applications = await Application.find(filter).sort(sortBy).limit(200);
    return res.json({ applications });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 25));

  const [applications, total, statusAgg, loanTypes] = await Promise.all([
    Application.find(filter).sort(sortBy).skip((pageNum - 1) * pageSize).limit(pageSize),
    Application.countDocuments(filter),
    Application.aggregate([{ $match: baseFilter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.distinct('loanType', baseFilter),
  ]);

  const statusCounts = {};
  statusAgg.forEach((s) => { statusCounts[s._id] = s.count; });

  res.json({ applications, total, page: pageNum, pageSize, statusCounts, loanTypes: loanTypes.sort() });
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
  const { toStatus, remarks, approvedAmount } = req.body;
  if (toStatus === STATUS.REJECTED && !String(remarks || '').trim()) {
    throw new ApiError(400, 'A reason is required to reject an application');
  }
  // The approved amount is mandatory when approving.
  let approved;
  if (toStatus === STATUS.APPROVED) {
    approved = Number(approvedAmount);
    if (!(approved > 0)) throw new ApiError(400, 'Enter the approved amount');
  }
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
  if (toStatus === STATUS.APPROVED) app.approvedAmount = approved;
  await app.save();

  await StatusHistory.create({ applicationId: app._id, fromStatus, toStatus, changedByUserId: req.user._id, remarks });
  await logActivity({ actorUserId: req.user._id, action: 'application.status', targetType: 'Application', targetId: app._id, meta: { fromStatus, toStatus } });

  const { subject, html } = statusEmail(app, toStatus, remarks);
  await sendMail({ to: app.email, subject, html, type: 'status', applicationId: app._id });

  res.json({ application: app });
});

// PATCH /api/admin/applications/:id/assign-rm  { rmName }
// Records the Relationship Manager handling this proposal. Independent of status.
export const assignRm = asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id);
  if (!app) throw new ApiError(404, 'Application not found');
  let name = String(req.body.rmName || '').trim();
  // RM names are case-insensitive: if one already exists that matches ignoring case,
  // reuse its spelling so "kavya" and "Kavya" don't become two separate RMs.
  if (name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await Application.findOne({ rmName: new RegExp(`^${escaped}$`, 'i') }).select('rmName');
    if (existing?.rmName) name = existing.rmName;
  }
  app.rmName = name;
  await app.save();
  await logActivity({ actorUserId: req.user._id, action: 'application.assignRm', targetType: 'Application', targetId: app._id, meta: { rmName: app.rmName } });
  res.json({ application: app });
});

// GET /api/admin/rm-names → { rmNames: [...] }
// Distinct, non-empty RM names already assigned — powers the RM combobox.
export const listRmNames = asyncHandler(async (req, res) => {
  // Dedupe case-insensitively (keep the first spelling seen) so the combobox/filter
  // never lists "Kavya" and "kavya" separately.
  const seen = new Map();
  for (const raw of await Application.distinct('rmName')) {
    const t = (raw || '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!seen.has(k)) seen.set(k, t);
  }
  const names = [...seen.values()].sort((a, b) => a.localeCompare(b));
  res.json({ rmNames: names });
});

// POST /api/admin/applications/:id/share-to-lender
// Multipart body: lenderIds (JSON array; legacy single `lenderId` also accepted),
// documentIds (JSON array of existing Document ids to attach), and any newly
// uploaded `documents` files. Emails each selected lender the application details
// with the selected + uploaded documents as attachments.
const SHAREABLE = [STATUS.DOCUMENTS_VERIFIED, STATUS.FORWARDED_TO_MANAGER, STATUS.APPROVED];
export const shareToLender = asyncHandler(async (req, res) => {
  const app = await Application.findById(req.params.id);
  if (!app) throw new ApiError(404, 'Application not found');
  if (!SHAREABLE.includes(app.status)) {
    throw new ApiError(400, 'Verify the documents before sharing this application to a lender');
  }

  let lenderIds = parseIdList(req.body.lenderIds);
  if (lenderIds.length === 0 && req.body.lenderId) lenderIds = [req.body.lenderId];
  if (lenderIds.length === 0) throw new ApiError(400, 'Select at least one lender');

  const lenders = await LenderApplication.find({ _id: { $in: lenderIds } });
  if (lenders.length === 0) throw new ApiError(404, 'Lender not found');

  // Existing documents the admin chose to attach (default: all, when none specified).
  const docIds = parseIdList(req.body.documentIds);
  const selectedDocs = await Document.find(
    docIds.length ? { _id: { $in: docIds }, applicationId: app._id } : { applicationId: app._id }
  );

  // Persist any newly uploaded files as documents on this application (verified, so
  // they read as admin-supplied), then attach them too.
  const uploadedDocs = [];
  for (const file of (req.files || [])) {
    const result = await uploadBuffer(file);
    const doc = await Document.create({
      applicationId: app._id,
      category: 'Additional (lender share)',
      originalName: file.originalname,
      cloudinaryPublicId: result.public_id,
      cloudinaryUrl: result.secure_url,
      resourceType: result.resource_type || 'raw',
      mimeType: file.mimetype,
      sizeBytes: file.size,
      verificationStatus: 'verified',
    });
    uploadedDocs.push(doc);
  }

  // Record which documents shared lenders may view in the secure portal (union of
  // the admin's selection + any uploads, across shares). Nothing is attached to email.
  const sharedIds = new Set(app.sharedDocumentIds.map(String));
  [...selectedDocs, ...uploadedDocs].forEach((d) => sharedIds.add(String(d._id)));
  app.sharedDocumentIds = [...sharedIds];

  const results = [];
  for (const lender of lenders) {
    // Sharing a deal effectively onboards the lender.
    if (lender.status !== 'onboarded') { lender.status = 'onboarded'; await lender.save(); }
    // Basic-info invite with a secure link — the lender verifies their email with a
    // one-time code on the platform, then views details + documents there.
    const link = `${env.clientOrigin}/lender/access/${app._id}`;
    const { subject, html } = lenderInviteEmail(app, lender, link);
    let sent = false;
    try { sent = await sendMail({ to: lender.email, subject, html, type: 'lender-share', applicationId: app._id }); }
    catch (err) { console.error('[share] email failed', lender.email, err.message); }
    if (!app.sharedLenderIds.map(String).includes(String(lender._id))) app.sharedLenderIds.push(lender._id);
    app.assignedLenderId = lender._id;
    results.push({ lenderId: String(lender._id), institutionName: lender.institutionName, sent });
  }

  app.sharedToManagerAt = new Date();
  // First share advances the workflow stage (Approve stays available afterwards).
  if (app.status === STATUS.DOCUMENTS_VERIFIED) {
    app.forwardedAt = new Date();
    app.status = STATUS.FORWARDED_TO_MANAGER;
    await StatusHistory.create({ applicationId: app._id, fromStatus: STATUS.DOCUMENTS_VERIFIED, toStatus: STATUS.FORWARDED_TO_MANAGER, changedByUserId: req.user._id, remarks: `Shared with ${lenders.map((l) => l.institutionName).join(', ')}` });
  }
  await app.save();
  await logActivity({ actorUserId: req.user._id, action: 'application.share', targetType: 'Application', targetId: app._id, meta: { lenderIds, sharedDocumentCount: app.sharedDocumentIds.length, results } });

  const emailSent = results.some((r) => r.sent);
  res.json({ application: app, results, emailSent });
});

// ---- Lender applications (from the public "Become a Lender" form) ----
const LENDER_STATUSES = ['new', 'reviewing', 'onboarded', 'declined', 'blocked'];
// Valid starting statuses when an admin manually adds a lender. Declined/blocked
// are only reachable later via the pipeline, never at creation.
const LENDER_CREATE_STATUSES = ['new', 'reviewing', 'onboarded'];

// Allowed status transitions — the pipeline is rigid: an application moves
// forward new → reviewing → onboarded and cannot skip a stage or move back.
// Decline (from new/reviewing) and block (from any active stage) are side-exits,
// each with a single recovery path back to "reviewing".
const LENDER_TRANSITIONS = {
  new: ['reviewing', 'declined', 'blocked'],
  reviewing: ['onboarded', 'declined', 'blocked'],
  onboarded: ['blocked'],
  declined: ['reviewing'],
  blocked: ['reviewing'],
};

// Fields an admin may edit on a lender via PATCH.
const LENDER_EDITABLE = [
  'institutionName', 'institutionType', 'website', 'license', 'yearEstablished',
  'contactName', 'designation', 'email', 'phone', 'city', 'state',
  'ticketSizeFrom', 'geographies', 'message', 'products',
];

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
    status: LENDER_CREATE_STATUSES.includes(status) ? status : 'onboarded',
  });
  await logActivity({ actorUserId: req.user._id, action: 'lender.create', targetType: 'LenderApplication', targetId: lender._id });
  res.status(201).json({ lender });
});

export const getLenderApplication = asyncHandler(async (req, res) => {
  const lender = await LenderApplication.findById(req.params.id);
  if (!lender) throw new ApiError(404, 'Lender application not found');
  res.json({ lender });
});

// PATCH /api/admin/lender-applications/:id
// Handles both a status change (rigidly validated against the pipeline) and
// editing of lender details. Either or both may be present in the body.
export const updateLenderApplication = asyncHandler(async (req, res) => {
  const lender = await LenderApplication.findById(req.params.id);
  if (!lender) throw new ApiError(404, 'Lender application not found');

  const { status } = req.body;
  let statusChanged = false;
  if (status !== undefined && status !== lender.status) {
    if (!LENDER_STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
    const allowed = LENDER_TRANSITIONS[lender.status] || [];
    if (!allowed.includes(status)) {
      throw new ApiError(400, `Cannot change status from "${lender.status}" to "${status}".`);
    }
    lender.status = status;
    statusChanged = true;
    await logActivity({ actorUserId: req.user._id, action: 'lender.status', targetType: 'LenderApplication', targetId: lender._id, meta: { status } });
  }

  let edited = false;
  for (const k of LENDER_EDITABLE) {
    if (req.body[k] === undefined) continue;
    if (k === 'products') lender.products = Array.isArray(req.body[k]) ? req.body[k] : (req.body[k] ? [req.body[k]] : []);
    else if (k === 'email') lender.email = String(req.body[k]).toLowerCase();
    else lender[k] = req.body[k];
    edited = true;
  }
  if (edited) await logActivity({ actorUserId: req.user._id, action: 'lender.edit', targetType: 'LenderApplication', targetId: lender._id });

  await lender.save();
  if (statusChanged) {
    const { subject, html } = partnerStatusEmail({ name: lender.contactName || lender.institutionName, role: 'lender', status: lender.status });
    await sendMail({ to: lender.email, subject, html, type: 'lender' });
  }
  res.json({ lender });
});

export const deleteLender = asyncHandler(async (req, res) => {
  const lender = await LenderApplication.findByIdAndDelete(req.params.id);
  if (!lender) throw new ApiError(404, 'Lender not found');
  // Un-assign from any applications that were shared with this lender, and pull the
  // lender out of every application's sharedLenderIds so no dangling reference is left
  // behind (a stale ref populates as null and breaks the application detail view).
  await Application.updateMany({ assignedLenderId: lender._id }, { $unset: { assignedLenderId: '' } });
  await Application.updateMany({ sharedLenderIds: lender._id }, { $pull: { sharedLenderIds: lender._id } });
  await logActivity({ actorUserId: req.user._id, action: 'lender.delete', targetType: 'LenderApplication', targetId: lender._id });
  res.json({ message: 'Lender deleted' });
});

// ---- Referrer / DSA applications (from the public "Refer & Earn" form) ----
// Referrers reuse the exact same status pipeline as lenders.
const REFERRER_STATUSES = LENDER_STATUSES;
const REFERRER_CREATE_STATUSES = LENDER_CREATE_STATUSES;
const REFERRER_TRANSITIONS = LENDER_TRANSITIONS;
const REFERRER_EDITABLE = [
  'fullName', 'referrerType', 'firmName', 'email', 'phone', 'city', 'state',
  'pan', 'experience', 'monthlyVolume', 'message', 'products',
];

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
    status: REFERRER_CREATE_STATUSES.includes(status) ? status : 'onboarded',
  });
  await logActivity({ actorUserId: req.user._id, action: 'referrer.create', targetType: 'ReferrerApplication', targetId: referrer._id });
  res.status(201).json({ referrer });
});

export const getReferrerApplication = asyncHandler(async (req, res) => {
  const referrer = await ReferrerApplication.findById(req.params.id);
  if (!referrer) throw new ApiError(404, 'Referrer application not found');
  res.json({ referrer });
});

// PATCH /api/admin/referrer-applications/:id
// Mirrors the lender handler: a status change is rigidly validated against the same
// pipeline, and lender-style detail editing is supported. Either or both may be present.
export const updateReferrerApplication = asyncHandler(async (req, res) => {
  const referrer = await ReferrerApplication.findById(req.params.id);
  if (!referrer) throw new ApiError(404, 'Referrer application not found');

  const { status } = req.body;
  let statusChanged = false;
  if (status !== undefined && status !== referrer.status) {
    if (!REFERRER_STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
    const allowed = REFERRER_TRANSITIONS[referrer.status] || [];
    if (!allowed.includes(status)) {
      throw new ApiError(400, `Cannot change status from "${referrer.status}" to "${status}".`);
    }
    referrer.status = status;
    statusChanged = true;
    await logActivity({ actorUserId: req.user._id, action: 'referrer.status', targetType: 'ReferrerApplication', targetId: referrer._id, meta: { status } });
  }

  let edited = false;
  for (const k of REFERRER_EDITABLE) {
    if (req.body[k] === undefined) continue;
    if (k === 'products') referrer.products = Array.isArray(req.body[k]) ? req.body[k] : (req.body[k] ? [req.body[k]] : []);
    else if (k === 'email') referrer.email = String(req.body[k]).toLowerCase();
    else referrer[k] = req.body[k];
    edited = true;
  }
  if (edited) await logActivity({ actorUserId: req.user._id, action: 'referrer.edit', targetType: 'ReferrerApplication', targetId: referrer._id });

  await referrer.save();
  if (statusChanged) {
    const { subject, html } = partnerStatusEmail({ name: referrer.fullName, role: 'referrer', status: referrer.status });
    await sendMail({ to: referrer.email, subject, html, type: 'referrer' });
  }
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
