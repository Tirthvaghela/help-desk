import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listUsers, updateUserRole, updateUserStatus } from '../controllers/adminUser.controller.js';

// Mounted at /api/admin/users (API contract §11). Admin only.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', listUsers);
router.patch('/:id/role', updateUserRole);
router.patch('/:id/status', updateUserStatus);

export default router;
