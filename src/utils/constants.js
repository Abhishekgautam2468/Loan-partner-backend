export const ROLES = { CUSTOMER: 'customer', ADMIN: 'admin' };

export const STATUS = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  DOCUMENTS_VERIFIED: 'Documents Verified',
  FORWARDED_TO_MANAGER: 'Forwarded to Lender',
  APPROVED: 'Approved',
  DISBURSED: 'Disbursed',
  REJECTED: 'Rejected',
};

export const STATUS_LIST = Object.values(STATUS);

// Allowed transitions an admin may set from a given status.
export const STATUS_TRANSITIONS = {
  [STATUS.SUBMITTED]: [STATUS.UNDER_REVIEW, STATUS.REJECTED],
  [STATUS.UNDER_REVIEW]: [STATUS.DOCUMENTS_VERIFIED, STATUS.REJECTED],
  [STATUS.DOCUMENTS_VERIFIED]: [STATUS.FORWARDED_TO_MANAGER, STATUS.APPROVED, STATUS.REJECTED],
  [STATUS.FORWARDED_TO_MANAGER]: [STATUS.APPROVED, STATUS.REJECTED],
  [STATUS.APPROVED]: [STATUS.DISBURSED],
  [STATUS.DISBURSED]: [],
  [STATUS.REJECTED]: [],
};

// Products offered in the application dropdowns (returned by /meta).
export const LOAN_TYPES = [
  'Personal Loan',
  'Business Loan',
  'Loan Against Property',
  'Project Funding',
  'Startup Funding',
  'Equipment Finance',
  'Purchase Invoice Discounting',
  'Sales Invoice Discounting',
  'Dealer Finance',
  'Vendor Finance',
  'Working Capital',
  'Others',
];

// Supply Chain Finance products. These are stored as regular Application records
// (loanType = product name) and reuse the entire loan pipeline. They appear in
// LOAN_TYPES but route to their own dedicated /scf forms on the frontend.
export const SCF_PRODUCTS = [
  'Purchase Invoice Discounting',
  'Sales Invoice Discounting',
  'Dealer Finance',
  'Vendor Finance',
];

// Loan types no longer offered in the dropdown but still accepted by validators so
// pre-existing applications (and their edits) remain valid.
export const LEGACY_LOAN_TYPES = [];

// Every accepted loanType (used by the model enum & route validators).
export const ALL_LOAN_TYPES = [...new Set([...LOAN_TYPES, ...SCF_PRODUCTS, ...LEGACY_LOAN_TYPES])];

export const DOC_VERIFICATION = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};
