import { Ticket } from '../models/Ticket.js';
import { ApiError } from '../utils/ApiError.js';
import { accessibleTicketFilter, findAccessibleTicket, ticketScope } from '../utils/ticketAccess.js';
import { parseQueueQuery, withAccessScope } from '../utils/ticketQuery.js';
import {
  assertAssignmentAllowed,
  assertAssignmentStateAllowed,
  assignmentUpdateConditions,
  parseAssignBody,
  requireEligibleAssignee,
} from '../utils/ticketAssign.js';
import { assertStatusChangeAllowed, parseStatusBody, statusUpdateConditions } from '../utils/ticketStatus.js';
import { serializeTicket, TICKET_DETAIL_POPULATE, TICKET_LIST_POPULATE } from '../utils/ticketSerializers.js';
import { notifyAssignmentChange, notifyStatusChange } from '../utils/notifications.js';
import { emailStatusChange } from '../utils/ticketEmails.js';
import { computeDueAt, toValidDate } from '../utils/sla.js';
import { env } from '../config/env.js';

// Agent workflow ticket endpoints (API contract §7 GET /:id, §8). Owner: agent-workflow module.

// `user` decides the shape: staff also get the SLA due date, customers (GET /:id) do not.
async function respondWithTicket(res, ticket, user) {
  await ticket.populate(TICKET_DETAIL_POPULATE);
  res.json({ ticket: serializeTicket(ticket, { detail: true, staff: isStaff(user) }) });
}

function isStaff(user) {
  return user.role === 'agent' || user.role === 'admin';
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

  res.json({ tickets: tickets.map((ticket) => serializeTicket(ticket, { staff: true })), page, limit, total });
}

// GET /api/tickets/:id — detail for the owner, an agent within the access rule, or an admin (D-7).
export async function getTicket(req, res) {
  const ticket = await findAccessibleTicket(req.params.id, req.user);
  await respondWithTicket(res, ticket, req.user);
}

// PATCH /api/tickets/:id/assign — claim, release or assign (D-1, D-2) and/or set priority.
// D-10: not on resolved tickets; an in-progress ticket can be reassigned but not released.
export async function assignTicket(req, res) {
  const update = parseAssignBody(req.body);
  const ticket = await findAccessibleTicket(req.params.id, req.user);
  assertAssignmentAllowed(req.user, update.assignedTo);
  if (update.assignedTo !== undefined) {
    await requireEligibleAssignee(update.assignedTo);
  }
  assertAssignmentStateAllowed(ticket, update);

  // SLA: a new priority moves the due date to createdAt + the new target, in the same update.
  // The update also requires the priority it was computed from, so a concurrent priority change
  // makes this one fail (409) instead of leaving a due date that belongs to another priority.
  // Tickets from before SLAs (no dueAt) keep having none.
  const set = { ...update };
  const conditions = assignmentUpdateConditions(update);
  if (update.priority !== undefined) {
    conditions.priority = ticket.priority;
    if (update.priority !== ticket.priority && toValidDate(ticket.dueAt)) {
      set.dueAt = computeDueAt(ticket.createdAt, update.priority, env.sla);
    }
  }

  // Re-checks access and the D-10 state inside the update, so a ticket claimed, reassigned or
  // moved on meanwhile is not changed.
  const updated = await Ticket.findOneAndUpdate(
    accessibleTicketFilter(ticket._id, req.user, conditions),
    { $set: set },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) {
    const current = await findAccessibleTicket(req.params.id, req.user); // throws the current 404 or 403
    assertAssignmentStateAllowed(current, update); // throws if the ticket moved on meanwhile
    throw ApiError.conflict('The ticket changed while it was being updated; please retry');
  }

  await notifyAssignmentChange(ticket, updated, req.user);
  await respondWithTicket(res, updated, req.user);
}

// PATCH /api/tickets/:id/status — one step forward: open → in_progress → resolved.
// D-10: only for assigned tickets (by the assignee, or an admin); resolved tickets are final.
export async function updateTicketStatus(req, res) {
  const nextStatus = parseStatusBody(req.body);
  const ticket = await findAccessibleTicket(req.params.id, req.user);
  assertStatusChangeAllowed(ticket, nextStatus);

  const changedAt = new Date();
  const set = { status: nextStatus };
  if (nextStatus === 'resolved') set.resolvedAt = changedAt;

  // Matches only if the ticket is still accessible, still in the status checked above and still
  // assigned, so two simultaneous changes cannot both apply and a release cannot slip in.
  const updated = await Ticket.findOneAndUpdate(
    accessibleTicketFilter(ticket._id, req.user, statusUpdateConditions(ticket)),
    { $set: set, $push: { statusHistory: { status: nextStatus, changedBy: req.user._id, changedAt } } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!updated) {
    const current = await findAccessibleTicket(req.params.id, req.user); // throws 404 or 403
    assertStatusChangeAllowed(current, nextStatus); // throws if another change got there first
    throw ApiError.conflict('The ticket changed while it was being updated; please retry');
  }

  await notifyStatusChange(updated, req.user);
  // Not awaited: the customer's email is sent in the background (tracked for shutdown), and a
  // failure is only logged. `ticket.status` is the status the update was conditioned on.
  emailStatusChange(updated, ticket.status, req.user);
  await respondWithTicket(res, updated, req.user);
}
