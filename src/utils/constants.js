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

export const DOC_VERIFICATION = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};
