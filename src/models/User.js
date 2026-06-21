import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../utils/constants.js';

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CUSTOMER, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    // A PAN may belong to exactly one account. Sparse so PAN-less accounts (e.g. the
    // seeded admin) don't collide on null. Set when an account is created/linked via an
    // application submit; enforced in the application controller.
    panNumber: {
      type: String,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
      index: { unique: true, sparse: true },
    },
    passwordHash: { type: String, required: true },
    // false for accounts auto-created on public application submit until the user sets a password.
    passwordSet: { type: Boolean, default: false },
    resetToken: { type: String },
    resetTokenExpiry: { type: Date },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function () {
  return { id: this._id, role: this.role, name: this.name, email: this.email, phone: this.phone, panNumber: this.panNumber, passwordSet: this.passwordSet };
};

export default mongoose.model('User', userSchema);
