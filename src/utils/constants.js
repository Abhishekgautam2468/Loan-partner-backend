export const ROLES = { CUSTOMER: 'customer', ADMIN: 'admin' };

export const STATUS = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  DOCUMENTS_VERIFIED: 'Documents Verified',
  FORWARDED_TO_MANAGER: 'Forwarded to Lender',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const STATUS_LIST = Object.values(STATUS);

// Allowed transitions an admin may set from a given status.
export const STATUS_TRANSITIONS = {
  [STATUS.SUBMITTED]: [STATUS.UNDER_REVIEW, STATUS.REJECTED],
  [STATUS.UNDER_REVIEW]: [STATUS.DOCUMENTS_VERIFIED, STATUS.REJECTED],
  [STATUS.DOCUMENTS_VERIFIED]: [STATUS.FORWARDED_TO_MANAGER, STATUS.APPROVED, STATUS.REJECTED],
  [STATUS.FORWARDED_TO_MANAGER]: [STATUS.APPROVED, STATUS.REJECTED],
  [STATUS.APPROVED]: [],
  [STATUS.REJECTED]: [],
};

export const LOAN_TYPES = [
  'Personal Loan',
  'Business Loan',
  'Home Loan',
  'Vehicle Loan',
  'Gold Loan',
  'Loan Against Property',
  'Unsecured Business Loan',
];

// Supply Chain Finance products. These are stored as regular Application records
// (loanType = product name) and reuse the entire loan pipeline. /meta intentionally
// returns only LOAN_TYPES, so SCF products do not appear in the generic loan dropdown.
export const SCF_PRODUCTS = [
  'Purchase Invoice Discounting',
  'Sales Invoice Discounting',
  'Dealer Finance',
  'Vendor Finance',
];

// Every accepted loanType across loans + SCF (used by the model enum & route validators).
export const ALL_LOAN_TYPES = [...LOAN_TYPES, ...SCF_PRODUCTS];

export const DOC_VERIFICATION = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};
