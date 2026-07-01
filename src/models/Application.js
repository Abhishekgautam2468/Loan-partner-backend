import mongoose from 'mongoose';
import { STATUS, STATUS_LIST, ALL_LOAN_TYPES } from '../utils/constants.js';

const applicationSchema = new mongoose.Schema(
  {
    // Optional: set for applications created by a logged-in customer. Public
    // (no-login) submissions from the website "Apply Now" form leave this null.
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    // Optional: some products (e.g. Purchase Invoice Discounting) don't collect Aadhaar.
    // When provided it must be 12 digits.
    aadhaarNumber: { type: String, match: /^\d{12}$/ },
    panNumber: { type: String, required: true, uppercase: true, match: /^[A-Z]{5}[0-9]{4}[A-Z]$/ },
    loanType: { type: String, required: true, enum: ALL_LOAN_TYPES },
    amountRequested: { type: Number, required: true, min: 0 },
    // Set by an admin at approval time.
    approvedAmount: { type: Number, min: 0 },
    // Relationship Manager handling this proposal (set by admin during review).
    rmName: { type: String, trim: true },
    tenureMonths: { type: Number, min: 0 },
    purpose: { type: String, trim: true },
    // Extended KYC / eligibility data captured by the multi-step application form.
    // Stored as a flexible sub-document: { personal, currentAddress, permanentAddress,
    // employmentType, salaried, selfEmployed, financial, references }.
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: STATUS_LIST, default: STATUS.SUBMITTED, index: true },
    assignedManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Manager' }, // legacy
    assignedLenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'LenderApplication' }, // most recent
    sharedLenderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LenderApplication' }], // all lenders shared with
    sharedDocumentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }], // docs a shared lender may view in the portal
    forwardedAt: { type: Date },
    sharedToManagerAt: { type: Date },
    rejectionReason: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('Application', applicationSchema);
