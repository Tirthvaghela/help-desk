import { ApiError } from './ApiError.js';
import { requireOneOf } from './validate.js';
import { TICKET_PRIORITIES, TICKET_STATUSES } from './ticketConstants.js';

// Query parsing for the ticket queue, GET /api/tickets (API contract §8).

export const QUEUE_DEFAULT_LIMIT = 20;
export const QUEUE_MAX_LIMIT = 100;
export const QUEUE_MAX_SEARCH_LENGTH = 100;
export const QUEUE_SORT = Object.freeze({ createdAt: -1 });

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

// Escapes characters that have a special meaning in regular expressions,
// so user input is always matched literally.
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns a query parameter as a trimmed string, or undefined when it is absent or empty.
// Repeated parameters (?status=a&status=b) arrive as arrays and are rejected.
export function readParam(query, name) {
  const value = query[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`${name} must be a single value`);
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readObjectId(query, name) {
  const value = readParam(query, name);
  if (value !== undefined && !OBJECT_ID_PATTERN.test(value)) {
    throw ApiError.badRequest(`${name} must be a valid id`);
  }
  return value;
}

export function readPositiveInteger(query, name, { fallback, max = Number.MAX_SAFE_INTEGER }) {
  const value = readParam(query, name);
  if (value === undefined) return fallback;

  const number = Number(value);
  if (!POSITIVE_INTEGER_PATTERN.test(value) || !Number.isSafeInteger(number)) {
    throw ApiError.badRequest(`${name} must be a whole number of at least 1`);
  }
  if (number > max) {
    throw ApiError.badRequest(`${name} must be at most ${max}`);
  }
  return number;
}

// Combines an access-scope filter with the user's own filters so that both always apply.
// Never merge them with object spread: if both contain $or, the second would silently
// replace the first and drop the access rule.
export function withAccessScope(scope, filter) {
  if (!scope || typeof scope !== 'object') {
    throw new Error('withAccessScope requires an access-scope filter');
  }
  const parts = [scope, filter].filter((part) => part && Object.keys(part).length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

// Turns the queue's query string into a MongoDB filter plus pagination.
//
// `currentUserId` is the authenticated user's id, used for `assignee=me`.
//
// The returned filter contains only the user's own filters. It does NOT apply the
// agent access policy (OPEN-1); combine both with withAccessScope(), e.g.
//   Ticket.find(withAccessScope(accessScope, filter))
export function parseQueueQuery(query = {}, currentUserId) {
  const filter = {};

  const status = readParam(query, 'status');
  if (status !== undefined) {
    filter.status = requireOneOf(status, TICKET_STATUSES, 'status');
  }

  const priority = readParam(query, 'priority');
  if (priority !== undefined) {
    filter.priority = requireOneOf(priority, TICKET_PRIORITIES, 'priority');
  }

  const category = readObjectId(query, 'category');
  if (category !== undefined) {
    filter.category = category;
  }

  const assignee = readParam(query, 'assignee');
  if (assignee === 'unassigned') {
    filter.assignedTo = null;
  } else if (assignee === 'me') {
    if (!currentUserId) {
      throw new Error('parseQueueQuery needs currentUserId to resolve assignee=me');
    }
    filter.assignedTo = currentUserId;
  } else if (assignee !== undefined) {
    filter.assignedTo = readObjectId(query, 'assignee');
  }

  const q = readParam(query, 'q');
  if (q !== undefined) {
    if (q.length > QUEUE_MAX_SEARCH_LENGTH) {
      throw ApiError.badRequest(`q must be at most ${QUEUE_MAX_SEARCH_LENGTH} characters`);
    }
    const pattern = escapeRegex(q);
    filter.$or = [
      { ticketNumber: { $regex: pattern, $options: 'i' } },
      { subject: { $regex: pattern, $options: 'i' } },
    ];
  }

  const page = readPositiveInteger(query, 'page', { fallback: 1 });
  const limit = readPositiveInteger(query, 'limit', { fallback: QUEUE_DEFAULT_LIMIT, max: QUEUE_MAX_LIMIT });

  return { filter, page, limit, skip: (page - 1) * limit, sort: QUEUE_SORT };
}
