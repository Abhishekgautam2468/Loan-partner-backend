import mongoose from 'mongoose';
import env from '../config/env.js';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import { ROLES } from '../utils/constants.js';

// Creates (or updates the password of) the admin account from SEED_ADMIN_* env vars.
(async () => {
  await connectDB();
  const { name, email, password } = env.seedAdmin;
  let user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    user = new User({ name, email: email.toLowerCase(), role: ROLES.ADMIN });
  } else {
    user.role = ROLES.ADMIN;
  }
  await user.setPassword(password);
  await user.save();
  console.log(`[seed] admin ready: ${email}`);
  await mongoose.disconnect();
  process.exit(0);
})();
