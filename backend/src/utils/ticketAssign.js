import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { ApiError } from './ApiError.js';
import { requireOneOf } from './validate.js';
import { TICKET_PRIORITIES } from './ticketConstants.js';
import { ticketResolvedError } from './ticketStatus.js';

// Validates the body of PATCH /api/tickets/:id/assign (API contract §8) and returns
// only the fields that may be applied: { assignedTo?, priority? }.
//
// Other fields are never read or returned, so they can never reach the database
// (contract §2: unknown fields in request bodies are ignored).
//
// This checks the request shape only. Who may assign whom is checked by
// assertAssignmentAllowed (D-1) and requireEligibleAssignee (D-2).
export function parseAssignBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('Request body must be a JSON object');
  }

  const hasAssignee = Object.hasOwn(body, 'assignedTo') && body.assignedTo !== undefined;
  const hasPriority = Object.hasOwn(body, 'priority') && body.priority !== undefined;

  if (!hasAssignee && !hasPriority) {
    throw ApiError.badRequest('Provide assignedTo, priority, or both');
  }

  const update = {};

  if (hasAssignee) {
    const { assignedTo } = body;
    if (assignedTo !== null && (typeof assignedTo !== 'string' || !mongoose.isObjectIdOrHexString(assignedTo))) {
      throw ApiError.badRequest('assignedTo must be a valid user id or null', 'INVALID_ID');
    }
    update.assignedTo = assignedTo;
  }

  if (hasPriority) {
    update.priority = requireOneOf(body.priority, TICKET_PRIORITIES, 'priority');
  }

  return update;
}

// Roles that may be assigned tickets (contract D-2).
export const ASSIGNABLE_ROLES = Object.freeze(['agent', 'admin']);

// Contract D-1: an agent may assign a ticket only to themselves (claim) or to nobody
// (release); an admin may assign any eligible user. `assignedTo` undefined means the
// request does not change the assignee.
export function assertAssignmentAllowed(actor, assignedTo) {
  if (actor?.role === 'admin') return;

  if (actor?.role === 'agent') {
    if (assignedTo === undefined || assignedTo === null || String(assignedTo) === String(actor._id)) return;
    throw ApiError.forbidden('Agents can only assign tickets to themselves');
  }
  throw ApiError.forbidden();
}

// D-10 state rules for PATCH /assign on a loaded ticket ({ status }):
//   resolved                      → 400 TICKET_RESOLVED (no assignee or priority changes)
//   in progress, assignedTo: null → 400 ASSIGNEE_REQUIRED (reassign instead of releasing)
// Checked after the permission (D-1) and eligibility (D-2) checks, so their errors are unchanged.
export function assertAssignmentStateAllowed(ticket, update) {
  if (ticket.status === 'resolved') throw ticketResolvedError();
  if (update.assignedTo === null && ticket.status === 'in_progress') {
    throw ApiError.badRequest('An in-progress ticket must keep an assignee; reassign it instead', 'ASSIGNEE_REQUIRED');
  }
}

// Extra conditions for the atomic assignment update, matching the rules above, so a status
// change in between cannot slip a release past them.
export function assignmentUpdateConditions(update) {
  return update.assignedTo === null ? { status: 'open' } : { status: { $ne: 'resolved' } };
}

// Contract D-2: the assignee must be an existing, active agent or admin. Returns the user,
// or null when unassigning. Any other id is a 400, because the 404 is reserved for the ticket.
export async function requireEligibleAssignee(assignedTo) {
  if (assignedTo === null) return null;
  // Mongoose drops undefined filter values, which would match any active agent.
  if (assignedTo === undefined) {
    throw new Error('requireEligibleAssignee needs an id or null');
  }

  const assignee = await User.findOne({ _id: assignedTo, role: { $in: ASSIGNABLE_ROLES }, isActive: true });
  if (!assignee) {
    throw ApiError.badRequest('assignedTo must be an active agent or admin');
  }
  return assignee;
}
