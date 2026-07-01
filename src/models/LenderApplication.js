import mongoose from 'mongoose';

// Onboarding application submitted by a prospective lending partner
// (Bank / NBFC / DSA / Consultant / Referral Partner) via the public site.
const lenderApplicationSchema = new mongoose.Schema(
  {
    institutionName: { type: String, required: true, trim: true },
    institutionType: { type: String, required: true, trim: true },
    website: { type: String, trim: true },
    license: { type: String, trim: true },          // RBI reg / license no. (banks & NBFCs)
    yearEstablished: { type: String, trim: true },

    contactName: { type: String, required: true, trim: true },
    designation: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },

    products: { type: [String], default: [] },      // products they want to fund
    ticketSizeFrom: { type: String, trim: true },
    geographies: { type: String, trim: true },
    message: { type: String, trim: true },

    status: { type: String, enum: ['new', 'reviewing', 'onboarded', 'declined', 'blocked'], default: 'new', index: true },

    // Transient one-time code for secure portal access (sha256 hash + expiry).
    accessOtp: { type: String },
    accessOtpExpiry: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('LenderApplication', lenderApplicationSchema);
