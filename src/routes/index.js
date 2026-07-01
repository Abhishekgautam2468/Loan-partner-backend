import { Router } from 'express';
import authRoutes from './auth.routes.js';
import applicationRoutes from './application.routes.js';
import publicRoutes from './public.routes.js';
import adminRoutes from './admin.routes.js';
import documentRoutes from './document.routes.js';
import lenderRoutes from './lender.routes.js';
import { LOAN_TYPES, STATUS_LIST } from '../utils/constants.js';
import env from '../config/env.js';

const router = Router();

router.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
// Public reference data for the frontend (loan types, status labels).
router.get('/meta', (req, res) => res.json({ loanTypes: LOAN_TYPES, statuses: STATUS_LIST, contactEmail: env.contactEmail }));

router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/applications', applicationRoutes);
router.use('/admin', adminRoutes);
router.use('/documents', documentRoutes);
router.use('/lender', lenderRoutes);

export default router;
