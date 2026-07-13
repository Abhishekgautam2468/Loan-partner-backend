import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { requireLenderToken } from '../middleware/lenderAuth.js';
import * as lender from '../controllers/lenderAccess.controller.js';

const router = Router();

// Throttle code request/verify to slow brute-forcing of the 6-digit code.
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.post(
  '/request-code',
  codeLimiter,
  [body('applicationId').notEmpty(), body('email').isEmail()],
  validate,
  lender.requestCode
);
router.post(
  '/verify-code',
  codeLimiter,
  [body('applicationId').notEmpty(), body('email').isEmail(), body('code').trim().notEmpty()],
  validate,
  lender.verifyCode
);

router.get('/applications/:id', requireLenderToken, lender.getApplication);
// `/documents/archive` must be declared before `/documents/:docId` so it isn't
// captured as a document id.
router.get('/applications/:id/documents/archive', requireLenderToken, lender.downloadArchive);
router.get('/applications/:id/documents/:docId', requireLenderToken, lender.getDocumentUrl);

export default router;
