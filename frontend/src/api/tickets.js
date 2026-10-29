import { apiRequest, queryString } from './client.js';

// Ticket API calls shared by the customer portal and the staff dashboards (API contract
// §7–§9). The backend decides which tickets each user may see; nothing here filters by owner.

export const TICKET_PRIORITIES = Object.freeze(['low', 'medium', 'high']);
export const TICKET_STATUSES = Object.freeze(['open', 'in_progress', 'resolved']);

// Status only moves forward: open → in_progress → resolved (contract §8).
const NEXT_STATUS = Object.freeze({ open: 'in_progress', in_progress: 'resolved' });
export function nextStatus(status) {
  return NEXT_STATUS[status] ?? null;
}

export const TICKET_LIMITS = Object.freeze({
  subject: { min: 5, max: 120 },
  description: { min: 10, max: 5000 },
  comment: { max: 2000 },
});

export async function listCategories(token) {
  const result = await apiRequest('/api/categories', { token });
  return result.categories;
}

// Customer's own tickets, newest first: { tickets, page, limit, total }.
export function listMyTickets(token, { status, page, limit } = {}) {
  return apiRequest(`/api/tickets/my${queryString({ status, page, limit })}`, { token });
}

export async function createTicket(token, { subject, description, categoryId, priority }) {
  const result = await apiRequest('/api/tickets', {
    method: 'POST',
    token,
    body: { subject, description, categoryId, priority },
  });
  return result.ticket;
}

// Staff queue (agents: unassigned + their own; admins: all): { tickets, page, limit, total }.
// Filters: status, priority, category, assignee ("me" | "unassigned" | user id), q, page, limit.
export function listQueue(token, params = {}) {
  return apiRequest(`/api/tickets${queryString(params)}`, { token });
}

export async function getTicket(token, id) {
  const result = await apiRequest(`/api/tickets/${encodeURIComponent(id)}`, { token });
  return result.ticket;
}

// { assignedTo?: userId | null, priority? } — agents may only claim (their own id) or
// release (null); admins may assign any active agent/admin.
export async function assignTicket(token, id, changes) {
  const result = await apiRequest(`/api/tickets/${encodeURIComponent(id)}/assign`, {
    method: 'PATCH',
    token,
    body: changes,
  });
  return result.ticket;
}

export async function updateTicketStatus(token, id, status) {
  const result = await apiRequest(`/api/tickets/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    token,
    body: { status },
  });
  return result.ticket;
}

// Oldest first.
export async function listComments(token, ticketId) {
  const result = await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/comments`, { token });
  return result.comments;
}

export async function addComment(token, ticketId, message) {
  const result = await apiRequest(`/api/tickets/${encodeURIComponent(ticketId)}/comments`, {
    method: 'POST',
    token,
    body: { message },
  });
  return result.comment;
}

// A message that is safe to show for a failed ticket request.
export function ticketErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.code === 'NETWORK_ERROR') return error.message;
  if (error?.code === 'INVALID_ID' || error?.status === 404) return 'This ticket could not be found.';
  if (error?.status === 403) return 'You do not have access to this ticket.';
  if (error?.status === 409) return 'This ticket was changed by someone else. Refresh and try again.';
  if (error?.status === 400 && error.message) return error.message;
  if (error?.status >= 500) return 'The server had a problem. Please try again in a moment.';
  return fallback;
}
