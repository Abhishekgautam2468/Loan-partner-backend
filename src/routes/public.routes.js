import { Router } from 'express';
import { body } from 'express-validator';
import { uploadDocuments } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { LOAN_TYPES } from '../utils/constants.js';
import { AADHAAR_RE, PAN_RE } from '../utils/validators.js';
import * as appCtrl from '../controllers/application.controller.js';
import * as lenderCtrl from '../controllers/lender.controller.js';

// Unauthenticated, public-facing endpoints (website "Apply Now" form).
const router = Router();

router.post(
  '/applications',
  uploadDocuments,
  [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('aadhaarNumber').matches(AADHAAR_RE).withMessage('Aadhaar must be 12 digits'),
    body('panNumber').customSanitizer((v) => String(v || '').toUpperCase()).matches(PAN_RE).withMessage('PAN must be in format ABCDE1234F'),
    body('loanType').isIn(LOAN_TYPES).withMessage('Invalid loan type'),
    body('amountRequested').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  ],
  validate,
  appCtrl.createPublicApplication
);

router.post(
  '/lender-applications',
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

export default router;
