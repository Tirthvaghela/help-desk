import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getAnalytics, getStats } from '../controllers/stats.controller.js';

// Mounted at /api/admin. Swati's admin users/categories routes use other paths.
const router = Router();

router.get('/stats', requireAuth, requireRole('admin'), getStats);
router.get('/analytics', requireAuth, requireRole('admin'), getAnalytics);

export default router;
