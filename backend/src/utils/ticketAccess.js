import mongoose from 'mongoose';
import { Ticket } from '../models/Ticket.js';
import { ApiError } from './ApiError.js';
import { withAccessScope } from './ticketQuery.js';

// The single ticket-access rule for every ticket and comment route (contract D-5).
//   customer: tickets they created
//   agent:    unassigned tickets and tickets assigned to them (contract OPEN-1)
//   admin:    all tickets
//   anything else: no access

function toId(value) {
  return value?._id ?? value;
}

function sameId(a, b) {
  return a != null && b != null && String(toId(a)) === String(toId(b));
}

// MongoDB filter for the tickets this user may see. Use it in every list, count and update
// query, combined with other filters through withAccessScope().
export function ticketScope(user) {
  switch (user?.role) {
    case 'admin':
      return {};
    case 'agent':
      return { $or: [{ assignedTo: null }, { assignedTo: user._id }] };
    case 'customer':
      return { createdBy: user._id };
    default:
      throw ApiError.forbidden();
  }
}

// Same rule for a ticket already loaded (works with populated or plain references).
export function canAccessTicket(user, ticket) {
  switch (user?.role) {
    case 'admin':
      return true;
    case 'agent':
      return toId(ticket.assignedTo) == null || sameId(ticket.assignedTo, user._id);
    case 'customer':
      return sameId(ticket.createdBy, user._id);
    default:
      return false;
  }
}

// Who may reply: the customer who owns the ticket, the agent it is assigned to, and any admin.
// Agents can read unassigned tickets but must claim them before replying (D-11).
export function canReplyToTicket(user, ticket) {
  if (user?.role === 'agent') return sameId(ticket.assignedTo, user._id);
  return canAccessTicket(user, ticket);
}

// The same rule as a database filter, for re-checking after a reply is stored.
export function replyFilter(ticketId, user) {
  return accessibleTicketFilter(ticketId, user, user?.role === 'agent' ? { assignedTo: user._id } : {});
}

export function replyForbidden() {
  return ApiError.forbidden('Assign this ticket to yourself to reply');
}

// Filter for an atomic update of one ticket, so access is re-checked inside the update
// itself, e.g. Ticket.findOneAndUpdate(accessibleTicketFilter(id, user, { status: 'open' }), …).
export function accessibleTicketFilter(ticketId, user, conditions = {}) {
  return withAccessScope(ticketScope(user), { _id: ticketId, ...conditions });
}

// Loads one ticket for this user, checking in the contract's order:
// 400 INVALID_ID, then 404 NOT_FOUND, then 403 FORBIDDEN.
export async function findAccessibleTicket(ticketId, user) {
  if (!mongoose.isObjectIdOrHexString(ticketId)) {
    throw ApiError.badRequest('Invalid ticket id', 'INVALID_ID');
  }
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    throw ApiError.notFound('Ticket not found');
  }
  if (!canAccessTicket(user, ticket)) {
    throw ApiError.forbidden('You do not have access to this ticket');
  }
  return ticket;
}
