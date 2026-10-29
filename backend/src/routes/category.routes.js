import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listActiveCategories } from '../controllers/category.controller.js';

// Mounted at /api/categories. Any logged-in user (contract §10).
const router = Router();

router.get('/', requireAuth, listActiveCategories);

export default router;
