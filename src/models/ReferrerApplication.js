import mongoose from 'mongoose';

// Onboarding application submitted by a prospective referrer / DSA / channel partner
// via the public site ("Refer & Earn" / "For Referrers & DSAs").
const referrerApplicationSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    referrerType: { type: String, required: true, trim: true }, // DSA / Consultant / Referral Partner / Individual
    firmName: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pan: { type: String, trim: true },               // for payouts
    experience: { type: String, trim: true },        // years in the business
    monthlyVolume: { type: String, trim: true },      // expected business volume

    products: { type: [String], default: [] },        // loan products they refer
    message: { type: String, trim: true },

    status: { type: String, enum: ['new', 'reviewing', 'onboarded', 'declined', 'blocked'], default: 'new', index: true },
  },
  { timestamps: true }
);

export default mongoose.model('ReferrerApplication', referrerApplicationSchema);
