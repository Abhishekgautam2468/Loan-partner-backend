import { Router } from 'express';
import { body } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadDocuments } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { ROLES, ALL_LOAN_TYPES } from '../utils/constants.js';
import { AADHAAR_RE, PAN_RE } from '../utils/validators.js';
import * as appCtrl from '../controllers/application.controller.js';

const router = Router();

router.use(requireAuth, requireRole(ROLES.CUSTOMER));

router.post(
  '/',
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
  appCtrl.createApplication
);

router.get('/mine', appCtrl.myApplications);
router.get('/:id', appCtrl.myApplicationDetail);

export default router;
