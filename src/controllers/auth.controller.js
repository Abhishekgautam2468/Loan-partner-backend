import crypto from 'crypto';
import User from '../models/User.js';
import { ROLES } from '../utils/constants.js';
import { signToken } from '../utils/jwt.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { sendMail } from '../services/email.service.js';
import { passwordOtpEmail } from '../services/templates.js';
import { logActivity } from '../services/activity.service.js';

const issue = (user) => signToken({ sub: user._id.toString(), role: user.role });

// Customer self-registration ONLY. Admins are seeded, never self-registered.
export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw new ApiError(409, 'An account with this email already exists');
  const user = new User({ name, email, phone, role: ROLES.CUSTOMER, passwordSet: true });
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

// Sends a 6-digit OTP to the email on record (used for both "forgot password" and
// setting a password on an auto-created account).
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  // We surface "no account" explicitly so users aren't left waiting for an email
  // that will never arrive (deliberate trade-off against account enumeration).
  if (!user) throw new ApiError(404, 'No account found with this email address.');
  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  user.resetToken = crypto.createHash('sha256').update(otp).digest('hex');
  user.resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  await user.save();
  const { subject, html } = passwordOtpEmail(otp);
  await sendMail({ to: user.email, type: 'auth', subject, html });
  res.json({ message: 'A verification code has been sent to your email.' });
});

// Verifies the OTP / setup code and sets the password. Logs the user in on success.
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, password } = req.body;
  const hashed = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
  const user = await User.findOne({
    email: email.toLowerCase(),
    resetToken: hashed,
    resetTokenExpiry: { $gt: new Date() },
  });
  if (!user) throw new ApiError(400, 'Invalid or expired code');
  await user.setPassword(password);
  user.passwordSet = true;
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  await user.save();
  await logActivity({ actorUserId: user._id, action: 'password.set', targetType: 'User', targetId: user._id });
  res.json({ token: issue(user), user: user.toSafeJSON() });
});
