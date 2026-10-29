import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUnreadCount, listNotifications, markAllRead, markRead } from '../controllers/notification.controller.js';

// Mounted at /api/notifications (API contract §12a). Any signed-in user, own notifications only.
const router = Router();
router.use(requireAuth);

router.get('/', listNotifications);
router.get('/unread-count', getUnreadCount);
router.post('/read-all', markAllRead);
router.patch('/:id/read', markRead);

export default router;
