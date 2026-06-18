import Document from '../models/Document.js';
import Application from '../models/Application.js';
import { ROLES, DOC_VERIFICATION } from '../utils/constants.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { signedUrl } from '../services/storage.service.js';
import { logActivity } from '../services/activity.service.js';

// GET /api/documents/:id/download → { url } short-lived signed Cloudinary URL.
export const downloadDocument = asyncHandler(async (req, res) => {
  const doc = await Document.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Document not found');

  // Access: admin OR the customer who owns the parent application.
  if (req.user.role !== ROLES.ADMIN) {
    const app = await Application.findOne({ _id: doc.applicationId, customerId: req.user._id });
    if (!app) throw new ApiError(403, 'Not allowed');
  }
  const url = signedUrl(doc.cloudinaryPublicId, { resourceType: doc.resourceType });
  res.json({ url, filename: doc.originalName });
});

// PATCH /api/admin/documents/:id/verify  { verificationStatus }
export const verifyDocument = asyncHandler(async (req, res) => {
  const { verificationStatus } = req.body;
  if (!Object.values(DOC_VERIFICATION).includes(verificationStatus)) {
    throw new ApiError(400, 'Invalid verification status');
  }
  const doc = await Document.findByIdAndUpdate(
    req.params.id,
    { verificationStatus },
    { new: true }
  );
  if (!doc) throw new ApiError(404, 'Document not found');
  await logActivity({ actorUserId: req.user._id, action: 'document.verify', targetType: 'Document', targetId: doc._id, meta: { verificationStatus } });
  res.json({ document: doc });
});
