import { Ticket } from '../models/Ticket.js';
import { Category } from '../models/Category.js';
import { User } from '../models/User.js';
import { slaState } from './sla.js';
import { TICKET_PRIORITIES, TICKET_STATUSES } from './ticketConstants.js';

// GET /api/admin/analytics (API contract §11). Every figure covers the tickets created in the
// range (`from` <= createdAt <= `to`, null for no limit). Read-only.
//
// Two reads: the counts come from one aggregation, the SLA states from a cursor through slaState
// (the one definition of those rules, so they are not repeated as database expressions). There
// is no snapshot across them, so a ticket changing during the request can make the SLA figures
// differ from the counts by that ticket.

const QUERY_LIMIT_MS = 15_000;
const SLA_CURSOR_BATCH = 1000;

// Every value of slaState (utils/sla.js) and its key in the response.
const SLA_KEYS = Object.freeze({
  met: 'met',
  missed: 'missed',
  due: 'due',
  due_soon: 'dueSoon',
  overdue: 'overdue',
  no_sla: 'noSla',
});

// { open: 0, …, other: 0 } from [{ _id, count }]: a value outside `known` goes to `other` instead
// of failing the whole report or disappearing from the totals.
function countsByKnownValue(rows, known) {
  const counts = Object.fromEntries(known.map((value) => [value, 0]));
  counts.other = 0;
  for (const row of rows ?? []) {
    counts[known.includes(row._id) ? row._id : 'other'] += row.count;
  }
  return counts;
}

function byCategoryRows(rows) {
  return (rows ?? [])
    .map((row) => ({
      category: {
        id: row._id == null ? null : String(row._id),
        name: row.category?.name ?? null,
        isActive: row.category?.isActive ?? null,
      },
      count: row.count,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.category.name === null) - (b.category.name === null) ||
        String(a.category.name).localeCompare(String(b.category.name)) ||
        String(a.category.id).localeCompare(String(b.category.id)),
    );
}

// Staff only, by name and id. Someone whose role has since become customer is no longer staff,
// and a deleted user has no name: both are returned by id only.
async function byAssigneeRows(rows) {
  const perAssignee = new Map();
  for (const row of rows ?? []) {
    const id = String(row._id.assignee);
    if (!perAssignee.has(id)) perAssignee.set(id, []);
    perAssignee.get(id).push({ _id: row._id.status, count: row.count });
  }
  const staff = await User.find({ _id: { $in: [...perAssignee.keys()] }, role: { $ne: 'customer' } })
    .select('name')
    .maxTimeMS(QUERY_LIMIT_MS)
    .lean();
  const nameById = new Map(staff.map((user) => [String(user._id), user.name]));

  return [...perAssignee.entries()]
    .map(([id, statusRows]) => {
      const byStatus = countsByKnownValue(statusRows, TICKET_STATUSES);
      return {
        assignee: { id, name: nameById.get(id) ?? null },
        total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
        byStatus,
      };
    })
    .sort((a, b) => b.total - a.total || String(a.assignee.name).localeCompare(String(b.assignee.name)));
}

// Only for resolved tickets with real dates and a resolution that is not before the creation.
// updatedAt is never used: replies and other changes move it after a ticket is resolved.
const RESOLUTION_MS = {
  $cond: [
    {
      $and: [
        { $eq: [{ $type: '$createdAt' }, 'date'] },
        { $eq: [{ $type: '$resolvedAt' }, 'date'] },
        { $gte: ['$resolvedAt', '$createdAt'] },
      ],
    },
    { $subtract: ['$resolvedAt', '$createdAt'] },
    null,
  ],
};

async function readCounts(match) {
  const unresolved = { status: { $ne: 'resolved' } };
  const [result] = await Ticket.aggregate([
    { $match: match },
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
        byCategory: [
          { $group: { _id: '$category', count: { $sum: 1 } } },
          {
            $lookup: {
              from: Category.collection.collectionName,
              localField: '_id',
              foreignField: '_id',
              pipeline: [{ $project: { name: 1, isActive: 1 } }],
              as: 'category',
            },
          },
          { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        ],
        unassigned: [{ $match: { ...unresolved, assignedTo: null } }, { $count: 'count' }],
        byAssignee: [
          { $match: { assignedTo: { $ne: null } } },
          { $group: { _id: { assignee: '$assignedTo', status: '$status' }, count: { $sum: 1 } } },
        ],
        resolution: [
          { $match: { status: 'resolved' } },
          { $project: { ms: RESOLUTION_MS } },
          {
            $group: {
              _id: null,
              averageMilliseconds: { $avg: '$ms' },
              eligibleCount: { $sum: { $cond: [{ $eq: ['$ms', null] }, 0, 1] } },
              excludedCount: { $sum: { $cond: [{ $eq: ['$ms', null] }, 1, 0] } },
            },
          },
        ],
      },
    },
  ]).option({ maxTimeMS: QUERY_LIMIT_MS });
  return result;
}

// Only the fields slaState reads, one batch at a time, so the tickets are never all in memory.
async function readSlaCounts(match, now) {
  const counts = Object.fromEntries(Object.values(SLA_KEYS).map((key) => [key, 0]));
  const cursor = Ticket.find(match)
    .select('status createdAt dueAt resolvedAt')
    .lean()
    .maxTimeMS(QUERY_LIMIT_MS)
    .batchSize(SLA_CURSOR_BATCH)
    .cursor();
  for await (const ticket of cursor) {
    counts[SLA_KEYS[slaState(ticket, now)]] += 1;
  }
  return counts;
}

// Met / (Met + Missed) as a percentage, rounded down to one decimal so that a ticket missed never
// shows as 100%; null with nothing to measure. Whole-number arithmetic first: 57 / 100 * 100 is
// 56.99… in floating point.
export function compliancePercent(met, missed) {
  const eligible = met + missed;
  return eligible === 0 ? null : Math.floor((met * 1000) / eligible) / 10;
}

export async function buildAnalytics({ from = null, to = null, now = new Date() } = {}) {
  const createdAt = {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
  const match = Object.keys(createdAt).length > 0 ? { createdAt } : {};

  const [counts, sla] = await Promise.all([readCounts(match), readSlaCounts(match, now)]);

  const byStatus = countsByKnownValue(counts?.byStatus, TICKET_STATUSES);
  const resolution = counts?.resolution?.[0];

  return {
    filters: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null, basis: 'createdAt' },
    asOf: now.toISOString(),
    overview: {
      total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
      unassigned: counts?.unassigned?.[0]?.count ?? 0,
    },
    byStatus,
    byPriority: countsByKnownValue(counts?.byPriority, TICKET_PRIORITIES),
    byCategory: byCategoryRows(counts?.byCategory),
    resolutionTime: {
      averageMilliseconds: resolution?.averageMilliseconds ?? null,
      eligibleCount: resolution?.eligibleCount ?? 0,
      excludedCount: resolution?.excludedCount ?? 0,
    },
    sla: {
      ...sla,
      compliancePercent: compliancePercent(sla.met, sla.missed),
      eligibleResolvedCount: sla.met + sla.missed,
    },
    byAssignee: await byAssigneeRows(counts?.byAssignee),
  };
}
