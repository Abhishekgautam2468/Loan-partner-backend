import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ROLES, STATUS_LIST } from '../utils/constants.js';
import * as auth from '../controllers/auth.controller.js';
import * as admin from '../controllers/admin.controller.js';
import * as docCtrl from '../controllers/document.controller.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Admin login is public (separate from customer login).
router.post('/login', authLimiter, [body('email').isEmail(), body('password').notEmpty()], validate, auth.adminLogin);

// Everything below requires an authenticated admin.
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get('/stats', admin.stats);

router.get('/applications', admin.listApplications);
router.get('/applications/:id', admin.getApplication);
router.patch(
  '/applications/:id/status',
  [body('toStatus').isIn(STATUS_LIST).withMessage('Invalid status')],
  validate,
  admin.updateStatus
);
router.post(
  '/applications/:id/share-to-lender',
  [body('lenderId').notEmpty().withMessage('lenderId is required')],
  validate,
  admin.shareToLender
);

router.get('/lender-applications', admin.listLenderApplications);
router.post(
  '/lender-applications',
  [
    body('institutionName').trim().notEmpty().withMessage('Institution name is required'),
    body('institutionType').trim().notEmpty().withMessage('Institution type is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
  ],
  validate,
  admin.createLender
);
router.get('/lender-applications/:id', admin.getLenderApplication);
router.patch(
  '/lender-applications/:id',
  [body('status').optional({ checkFalsy: true }).isString().withMessage('status must be a string')],
  validate,
  admin.updateLenderApplication
);
router.delete('/lender-applications/:id', admin.deleteLender);

router.get('/referrer-applications', admin.listReferrerApplications);
router.post(
  '/referrer-applications',
  [
    body('fullName').trim().notEmpty().withMessage('Name is required'),
    body('referrerType').trim().notEmpty().withMessage('Referrer type is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('phone').trim().notEmpty().withMessage('Phone is required'),
  ],
  validate,
  admin.createReferrer
);
router.get('/referrer-applications/:id', admin.getReferrerApplication);
router.patch(
  '/referrer-applications/:id',
  [body('status').optional({ checkFalsy: true }).isString().withMessage('status must be a string')],
  validate,
  admin.updateReferrerApplication
);
router.delete('/referrer-applications/:id', admin.deleteReferrer);

router.patch('/documents/:id/verify', docCtrl.verifyDocument);

export default router;
