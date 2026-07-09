import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { uploadDocuments } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { ALL_LOAN_TYPES } from '../utils/constants.js';
import { AADHAAR_RE, PAN_RE } from '../utils/validators.js';
import * as appCtrl from '../controllers/application.controller.js';
import * as lenderCtrl from '../controllers/lender.controller.js';
import * as referrerCtrl from '../controllers/referrer.controller.js';

// Unauthenticated, public-facing endpoints (website "Apply Now" form).
const router = Router();

// Throttle public submissions to curb spam (uploads, DB rows, emails). The precheck
// endpoint is intentionally left unthrottled since the form calls it while stepping.
const submitLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post(
  '/applications',
  submitLimiter,
  uploadDocuments,
  [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('aadhaarNumber').optional({ checkFalsy: true }).matches(AADHAAR_RE).withMessage('Aadhaar must be 12 digits'),
    body('panNumber').customSanitizer((v) => String(v || '').toUpperCase()).matches(PAN_RE).withMessage('PAN must be in format ABCDE1234F'),
    body('loanType').isIn(ALL_LOAN_TYPES).withMessage('Invalid loan type'),
    body('amountRequested').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  ],
  validate,
  appCtrl.createPublicApplication
);

router.post(
  '/application-precheck',
  [
    body('panNumber').customSanitizer((v) => String(v || '').toUpperCase()).matches(PAN_RE).withMessage('PAN must be in format ABCDE1234F'),
    body('loanType').trim().notEmpty().withMessage('Loan type is required'),
  ],
  validate,
  appCtrl.applicationPrecheck
);

router.post(
  '/lender-applications',
  submitLimiter,
  [
    body('institutionName').trim().notEmpty().withMessage('Institution name is required'),
    body('institutionType').trim().notEmpty().withMessage('Institution type is required'),
    body('contactName').trim().notEmpty().withMessage('Contact name is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
  ],
  validate,
  lenderCtrl.createLenderApplication
);

router.post(
  '/referrer-applications',
  submitLimiter,
  [
    body('fullName').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
  ],
  validate,
  referrerCtrl.createReferrerApplication
);

export default router;
