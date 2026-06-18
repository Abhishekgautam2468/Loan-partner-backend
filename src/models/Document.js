import mongoose from 'mongoose';
import { DOC_VERIFICATION } from '../utils/constants.js';

const documentSchema = new mongoose.Schema(
  {
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    // KYC category this file belongs to (e.g. "Aadhaar Card", "Salary Slips"). Free-form.
    category: { type: String, trim: true, default: 'Other' },
    originalName: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },
    cloudinaryUrl: { type: String, required: true }, // secure base url
    resourceType: { type: String, default: 'raw' },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    verificationStatus: {
      type: String,
      enum: Object.values(DOC_VERIFICATION),
      default: DOC_VERIFICATION.PENDING,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Document', documentSchema);
