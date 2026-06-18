import { Router } from 'express';
import authRoutes from './auth.routes.js';
import applicationRoutes from './application.routes.js';
import publicRoutes from './public.routes.js';
import adminRoutes from './admin.routes.js';
import documentRoutes from './document.routes.js';
import { LOAN_TYPES, STATUS_LIST } from '../utils/constants.js';

const router = Router();

router.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
// Public reference data for the frontend (loan types, status labels).
router.get('/meta', (req, res) => res.json({ loanTypes: LOAN_TYPES, statuses: STATUS_LIST }));

router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/applications', applicationRoutes);
router.use('/admin', adminRoutes);
router.use('/documents', documentRoutes);

export default router;
