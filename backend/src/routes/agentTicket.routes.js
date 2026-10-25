import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assignTicket, getTicket, listTickets, updateTicketStatus } from '../controllers/agentTicket.controller.js';
import { addComment, listComments } from '../controllers/comment.controller.js';

// Mounted at /api/tickets, AFTER Swati's ticket router (POST /, GET /my), so that
// GET /my is never read as a ticket id by GET /:id below (contract D-7).
// Authentication is applied per route so this router never affects other routers' paths.
const router = Router();
const staff = requireRole('agent', 'admin');

router.get('/', requireAuth, staff, listTickets);
router.get('/:id', requireAuth, getTicket);
router.patch('/:id/assign', requireAuth, staff, assignTicket);
router.patch('/:id/status', requireAuth, staff, updateTicketStatus);
router.get('/:id/comments', requireAuth, listComments);
router.post('/:id/comments', requireAuth, addComment);

export default router;
