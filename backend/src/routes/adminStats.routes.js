import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getStats } from '../controllers/stats.controller.js';

// Mounted at /api/admin. Swati's admin users/categories routes use other paths.
const router = Router();

router.get('/stats', requireAuth, requireRole('admin'), getStats);

export default router;
