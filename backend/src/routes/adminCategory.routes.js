import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createCategory, listAllCategories, updateCategory } from '../controllers/category.controller.js';

// Mounted at /api/admin/categories (API contract §10). Admin only.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', listAllCategories);
router.post('/', createCategory);
router.patch('/:id', updateCategory);

export default router;
