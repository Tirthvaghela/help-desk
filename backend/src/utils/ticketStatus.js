import { ApiError } from './ApiError.js';
import { requireOneOf } from './validate.js';
import { TICKET_STATUSES } from './ticketConstants.js';

// Allowed status changes (API contract §8): a ticket moves one step forward only.
//   open → in_progress → resolved
export const NEXT_STATUS = Object.freeze({
  open: 'in_progress',
  in_progress: 'resolved',
});

export function canTransition(from, to) {
  return Object.hasOwn(NEXT_STATUS, from) && NEXT_STATUS[from] === to;
}

// Validates the body of PATCH /api/tickets/:id/status before the ticket is loaded, so
// invalid input gets 400 before 404/403 (contract §2, order of checks). Returns the status.
// Other fields are ignored (contract §2).
export function parseStatusBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('Request body must be a JSON object');
  }
  const { status } = body;
  if (status === undefined || status === null || status === '') {
    throw ApiError.badRequest('status is required');
  }
  return requireOneOf(status, TICKET_STATUSES, 'status');
}

// D-10: a resolved ticket is final. Its status, assignee and priority can no longer change.
export function ticketResolvedError() {
  return ApiError.badRequest('This ticket is resolved and can no longer be changed', 'TICKET_RESOLVED');
}

// D-10 status rules for a loaded ticket ({ status, assignedTo }), checked in this order:
// resolved → 400 TICKET_RESOLVED; not one step forward → 400 INVALID_STATUS_TRANSITION;
// no assignee → 400 ASSIGNEE_REQUIRED (in progress and resolved tickets always have an owner).
// Agents only reach this for tickets assigned to them or unassigned (access rule), so with an
// assignee present the actor is that assignee or an admin.
export function assertStatusChangeAllowed(ticket, to) {
  if (ticket.status === 'resolved') throw ticketResolvedError();
  assertStatusTransition(ticket.status, to);
  if (ticket.assignedTo == null) {
    throw ApiError.badRequest(
      to === 'in_progress' ? 'Assign the ticket before starting work' : 'Assign the ticket before resolving it',
      'ASSIGNEE_REQUIRED',
    );
  }
  return to;
}

// Extra conditions for the atomic status update: still in the status checked, and still
// assigned, so a release or another change in between cannot leave a ticket without an owner.
export function statusUpdateConditions(ticket) {
  return { status: ticket.status, assignedTo: { $ne: null } };
}

// Validates a requested status change and returns the new status.
// Throws 400 VALIDATION_ERROR if `to` is missing or not a known status,
// and 400 INVALID_STATUS_TRANSITION if the move is not allowed.
export function assertStatusTransition(from, to) {
  if (to === undefined || to === null || to === '') {
    throw ApiError.badRequest('status is required');
  }
  requireOneOf(to, TICKET_STATUSES, 'status');

  if (!canTransition(from, to)) {
    throw ApiError.badRequest(`Cannot change status from ${from} to ${to}`, 'INVALID_STATUS_TRANSITION');
  }
  return to;
}
