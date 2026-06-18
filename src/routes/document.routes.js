import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as docCtrl from '../controllers/document.controller.js';

const router = Router();

// Any authenticated user; ownership/role checked in the controller.
router.get('/:id/download', requireAuth, docCtrl.downloadDocument);

export default router;
