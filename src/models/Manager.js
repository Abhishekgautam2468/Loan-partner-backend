import mongoose from 'mongoose';

// Managers are email-only records this version (no login). Schema is login-ready
// (active flag + optional passwordHash) so the future Partner Portal add-on drops in.
const managerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    active: { type: Boolean, default: true },
    passwordHash: { type: String }, // reserved for future login
  },
  { timestamps: true }
);

export default mongoose.model('Manager', managerSchema);
