import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as auth from '../controllers/auth.controller.js';

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  validate,
  auth.register
);

router.post('/login', authLimiter, [body('email').isEmail(), body('password').notEmpty()], validate, auth.login);
router.post('/forgot-password', authLimiter, [body('email').isEmail()], validate, auth.forgotPassword);
router.post(
  '/reset-password',
  authLimiter,
  [body('email').isEmail(), body('token').notEmpty(), body('password').isLength({ min: 8 })],
  validate,
  auth.resetPassword
);
router.get('/me', requireAuth, auth.me);

export default router;
