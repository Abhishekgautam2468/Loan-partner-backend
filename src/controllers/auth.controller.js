import crypto from 'crypto';
import User from '../models/User.js';
import { ROLES } from '../utils/constants.js';
import { signToken } from '../utils/jwt.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { sendMail } from '../services/email.service.js';
import { logActivity } from '../services/activity.service.js';

const issue = (user) => signToken({ sub: user._id.toString(), role: user.role });

// Customer self-registration ONLY. Admins are seeded, never self-registered.
export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw new ApiError(409, 'An account with this email already exists');
  const user = new User({ name, email, phone, role: ROLES.CUSTOMER });
  await user.setPassword(password);
  await user.save();
  await logActivity({ actorUserId: user._id, action: 'register', targetType: 'User', targetId: user._id });
  res.status(201).json({ token: issue(user), user: user.toSafeJSON() });
});

const loginWithRole = (expectedRole) =>
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.role !== expectedRole) throw new ApiError(401, 'Invalid credentials');
    const ok = await user.verifyPassword(password);
    if (!ok) throw new ApiError(401, 'Invalid credentials');
    res.json({ token: issue(user), user: user.toSafeJSON() });
  });

export const login = loginWithRole(ROLES.CUSTOMER);
export const adminLogin = loginWithRole(ROLES.ADMIN);

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  // Always respond 200 to avoid account enumeration.
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await user.save();
    const link = `${process.env.CLIENT_ORIGIN || ''}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    await sendMail({
      to: user.email,
      type: 'auth',
      subject: 'Reset your TrioPaisa password',
      html: `<p>Reset your password using the link below (valid 1 hour):</p><p><a href="${link}">${link}</a></p>`,
    });
  }
  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, password } = req.body;
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    email: email.toLowerCase(),
    resetToken: hashed,
    resetTokenExpiry: { $gt: new Date() },
  });
  if (!user) throw new ApiError(400, 'Invalid or expired reset token');
  await user.setPassword(password);
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  await user.save();
  res.json({ message: 'Password updated. You can now log in.' });
});
