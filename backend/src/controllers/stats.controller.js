import { Ticket } from '../models/Ticket.js';
import { Category } from '../models/Category.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { normalizeStatusCounts } from '../utils/ticketStats.js';
import { readParam } from '../utils/ticketQuery.js';
import { TICKET_PRIORITIES } from '../utils/ticketConstants.js';
import { serializeUserSummary, USER_SUMMARY_FIELDS } from '../utils/ticketSerializers.js';

// GET /api/admin/stats (API contract §11). Owner: agent-workflow module.
// Every breakdown comes from one aggregation, and `total` is derived from byStatus, so the
// numbers in one response always add up.
//
// Optional query `from` (ISO date): only tickets created at or after it ("last 7 days").
// Fields added for the admin dashboard, after total/byStatus/byCategory:
//   byPriority            { low, medium, high } — all tickets in range
//   unresolvedByPriority  { low, medium, high } — open + in progress
//   unassigned            unresolved tickets with no assignee
//   byAssignee            [{ assignee: UserSummary, total, byStatus }] — assigned tickets

// ISO 8601 only: a date (UTC midnight) or a date-time with Z or an offset. `new Date()` alone
// would accept "1" (year 2001), "10/29/2026" in the server's time zone, roll "2026-02-31"
// over to March, turn "T24:00" into the next day, and accept offsets such as "+23:59".
// Every part is therefore range-checked here before `new Date()` does the conversion.
const ISO_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-](\d{2}):(\d{2})))?$/;
// Real UTC offsets run from -12:00 to +14:00.
const MAX_OFFSET_MINUTES = 14 * 60;

function isValidIsoDate(raw) {
  const match = ISO_DATE_PATTERN.exec(raw);
  if (!match) return false;
  const [year, month, day, hour = 0, minute = 0, second = 0, offsetHours = 0, offsetMinutes = 0] = match
    .slice(1)
    .map((part) => (part === undefined ? undefined : Number(part)));
  const calendarDay = new Date(Date.UTC(year, month - 1, day));
  return (
    calendarDay.getUTCFullYear() === year &&
    calendarDay.getUTCMonth() === month - 1 &&
    calendarDay.getUTCDate() === day &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetMinutes <= 59 &&
    offsetHours * 60 + offsetMinutes <= MAX_OFFSET_MINUTES
  );
}

function parseFrom(query) {
  const raw = readParam(query, 'from');
  if (raw === undefined) return null;
  const from = new Date(raw);
  if (!isValidIsoDate(raw) || Number.isNaN(from.getTime())) {
    throw ApiError.badRequest('from must be an ISO date, e.g. 2026-10-01 or 2026-10-01T00:00:00Z');
  }
  return from;
}

function priorityCounts(rows) {
  const counts = Object.fromEntries(TICKET_PRIORITIES.map((priority) => [priority, 0]));
  for (const row of rows ?? []) {
    if (row._id in counts) counts[row._id] += row.count;
  }
  return counts;
}

export async function getStats(req, res) {
  const from = parseFrom(req.query);
  const match = from ? [{ $match: { createdAt: { $gte: from } } }] : [];
  const unresolved = { status: { $ne: 'resolved' } };

  const [result] = await Ticket.aggregate([
    ...match,
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byCategory: [
          { $group: { _id: '$category', count: { $sum: 1 } } },
          {
            $lookup: {
              from: Category.collection.collectionName,
              localField: '_id',
              foreignField: '_id',
              pipeline: [{ $project: { name: 1 } }],
              as: 'category',
            },
          },
          { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
          { $sort: { count: -1, 'category.name': 1, _id: 1 } },
        ],
        byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
        unresolvedByPriority: [{ $match: unresolved }, { $group: { _id: '$priority', count: { $sum: 1 } } }],
        unassigned: [{ $match: { ...unresolved, assignedTo: null } }, { $count: 'count' }],
        byAssignee: [
          { $match: { assignedTo: { $ne: null } } },
          { $group: { _id: { assignee: '$assignedTo', status: '$status' }, count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const byStatus = normalizeStatusCounts(result?.byStatus);
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
  // Inactive categories are included (D-6). Categories with no tickets are not listed.
  const byCategory = (result?.byCategory ?? []).map((row) => ({
    category: { id: String(row._id), name: row.category?.name ?? null },
    count: row.count,
  }));

  // Per-assignee status counts, with names looked up in one query.
  const perAssignee = new Map();
  for (const row of result?.byAssignee ?? []) {
    const key = String(row._id.assignee);
    if (!perAssignee.has(key)) perAssignee.set(key, []);
    perAssignee.get(key).push({ _id: row._id.status, count: row.count });
  }
  const assignees = await User.find({ _id: { $in: [...perAssignee.keys()] } }).select(USER_SUMMARY_FIELDS);
  const assigneeById = new Map(assignees.map((user) => [String(user._id), user]));
  const byAssignee = [...perAssignee.entries()]
    .map(([idValue, rows]) => {
      const counts = normalizeStatusCounts(rows);
      return {
        assignee: serializeUserSummary(assigneeById.get(idValue) ?? idValue),
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        byStatus: counts,
      };
    })
    .sort((a, b) => b.total - a.total || String(a.assignee.name).localeCompare(String(b.assignee.name)));

  res.json({
    total,
    byStatus,
    byCategory,
    byPriority: priorityCounts(result?.byPriority),
    unresolvedByPriority: priorityCounts(result?.unresolvedByPriority),
    unassigned: result?.unassigned?.[0]?.count ?? 0,
    byAssignee,
  });
}
