import { TICKET_STATUSES } from './ticketConstants.js';

// Builds the `byStatus` object for GET /api/admin/stats (API contract §11), which must
// always contain all three statuses, with 0 where there are no tickets.
//
// `rows` is the result of grouping tickets by status, e.g.
//   [{ _id: 'open', count: 12 }, { _id: 'resolved', count: 25 }]
// null or undefined (no results) gives all zeros.
//
// A status outside TICKET_STATUSES or an invalid count throws instead of being dropped,
// so corrupt data cannot produce silently wrong totals.
export function normalizeStatusCounts(rows) {
  const counts = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0]));
  if (rows === null || rows === undefined) return counts;

  if (!Array.isArray(rows)) {
    throw new TypeError('normalizeStatusCounts expects an array of { _id, count } rows');
  }

  for (const row of rows) {
    const status = row?._id;
    const count = row?.count;
    if (!TICKET_STATUSES.includes(status)) {
      throw new Error(`Unexpected ticket status in statistics: ${String(status)}`);
    }
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Invalid count for status ${status}: ${String(count)}`);
    }
    counts[status] += count;
  }
  return counts;
}
