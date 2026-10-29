import { Ticket } from '../models/Ticket.js';
import { ApiError } from '../utils/ApiError.js';
import { accessibleTicketFilter, findAccessibleTicket, ticketScope } from '../utils/ticketAccess.js';
import { parseQueueQuery, withAccessScope } from '../utils/ticketQuery.js';
import { assertAssignmentAllowed, parseAssignBody, requireEligibleAssignee } from '../utils/ticketAssign.js';
import { assertStatusTransition, parseStatusBody } from '../utils/ticketStatus.js';
import { serializeTicket, TICKET_DETAIL_POPULATE, TICKET_LIST_POPULATE } from '../utils/ticketSerializers.js';
import { notifyAssignmentChange, notifyStatusChange } from '../utils/notifications.js';

// Agent workflow ticket endpoints (API contract §7 GET /:id, §8). Owner: agent-workflow module.

async function respondWithTicket(res, ticket) {
  await ticket.populate(TICKET_DETAIL_POPULATE);
  res.json({ ticket: serializeTicket(ticket, { detail: true }) });
}

// GET /api/tickets — agent/admin queue.
export async function listTickets(req, res) {
  const { filter, page, limit, skip, sort } = parseQueueQuery(req.query, req.user._id);
  // The access rule and the user's filters are combined with $and, never merged.
  const query = withAccessScope(ticketScope(req.user), filter);

  const [tickets, total] = await Promise.all([
    Ticket.find(query)
      .select('-description -statusHistory')
      .sort({ ...sort, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate(TICKET_LIST_POPULATE),
    Ticket.countDocuments(query),
  ]);

  res.json({ tickets: tickets.map((ticket) => serializeTicket(ticket)), page, limit, total });
}

// GET /api/tickets/:id — detail for the owner, an agent within the access rule, or an admin (D-7).
export async function getTicket(req, res) {
  const ticket = await findAccessibleTicket(req.params.id, req.user);
  await respondWithTicket(res, ticket);
}

// PATCH /api/tickets/:id/assign — claim, release or assign (D-1, D-2) and/or set priority.
export async function assignTicket(req, res) {
  const update = parseAssignBody(req.body);
  const ticket = await findAccessibleTicket(req.params.id, req.user);
  assertAssignmentAllowed(req.user, update.assignedTo);
  if (update.assignedTo !== undefined) {
    await requireEligibleAssignee(update.assignedTo);
  }

  // Re-checks access inside the update, so a ticket claimed or reassigned meanwhile is not changed.
  const updated = await Ticket.findOneAndUpdate(
    accessibleTicketFilter(ticket._id, req.user),
    { $set: update },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) {
    await findAccessibleTicket(req.params.id, req.user); // throws the current 404 or 403
    throw ApiError.conflict('The ticket changed while it was being updated; please retry');
  }

  await notifyAssignmentChange(ticket, updated, req.user);
  await respondWithTicket(res, updated);
}

// PATCH /api/tickets/:id/status — one step forward: open → in_progress → resolved.
export async function updateTicketStatus(req, res) {
  const nextStatus = parseStatusBody(req.body);
  const ticket = await findAccessibleTicket(req.params.id, req.user);
  assertStatusTransition(ticket.status, nextStatus);

  const changedAt = new Date();
  const set = { status: nextStatus };
  if (nextStatus === 'resolved') set.resolvedAt = changedAt;

  // Matches only if the ticket is still accessible and still in the status checked above,
  // so two simultaneous changes cannot both apply.
  const updated = await Ticket.findOneAndUpdate(
    accessibleTicketFilter(ticket._id, req.user, { status: ticket.status }),
    { $set: set, $push: { statusHistory: { status: nextStatus, changedBy: req.user._id, changedAt } } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) {
    const current = await findAccessibleTicket(req.params.id, req.user); // throws 404 or 403
    assertStatusTransition(current.status, nextStatus); // throws if another change got there first
    throw ApiError.conflict('The ticket changed while it was being updated; please retry');
  }

  await notifyStatusChange(updated, req.user);
  await respondWithTicket(res, updated);
}
