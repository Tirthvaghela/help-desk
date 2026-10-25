import { Ticket } from '../models/Ticket.js';
import { TicketComment, COMMENT_MAX_LENGTH } from '../models/TicketComment.js';
import { ApiError } from '../utils/ApiError.js';
import { accessibleTicketFilter, findAccessibleTicket } from '../utils/ticketAccess.js';
import { requireString } from '../utils/validate.js';
import { serializeComment, USER_SUMMARY_FIELDS } from '../utils/ticketSerializers.js';

// Ticket conversation endpoints (API contract §9, D-3, D-4). Owner: agent-workflow module.

// GET /api/tickets/:id/comments — oldest first.
export async function listComments(req, res) {
  const ticket = await findAccessibleTicket(req.params.id, req.user);
  const comments = await TicketComment.find({ ticket: ticket._id })
    .sort({ createdAt: 1, _id: 1 })
    .populate({ path: 'author', select: USER_SUMMARY_FIELDS });

  res.json({ comments: comments.map(serializeComment) });
}

// POST /api/tickets/:id/comments — allowed on resolved tickets; never changes the status (D-3).
export async function addComment(req, res) {
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw ApiError.badRequest('Request body must be a JSON object');
  }
  // Only `message` is read; author, ticket and createdAt are set by the server.
  const message = requireString(req.body.message, 'message', { max: COMMENT_MAX_LENGTH });
  const ticket = await findAccessibleTicket(req.params.id, req.user);

  const comment = await TicketComment.create({ ticket: ticket._id, author: req.user._id, message });

  // Access may have been revoked (e.g. the ticket reassigned) between the check above and
  // the insert. Re-check with the database filter and undo the comment if so. The standalone
  // MongoDB used here does not support transactions.
  if (!(await Ticket.exists(accessibleTicketFilter(ticket._id, req.user)))) {
    await TicketComment.deleteOne({ _id: comment._id });
    await findAccessibleTicket(req.params.id, req.user); // throws the current 404 or 403
    throw ApiError.forbidden('You do not have access to this ticket');
  }

  await comment.populate({ path: 'author', select: USER_SUMMARY_FIELDS });

  res.status(201).json({ comment: serializeComment(comment) });
}
