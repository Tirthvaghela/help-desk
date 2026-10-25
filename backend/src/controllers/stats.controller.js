import { Ticket } from '../models/Ticket.js';
import { Category } from '../models/Category.js';
import { normalizeStatusCounts } from '../utils/ticketStats.js';

// GET /api/admin/stats (API contract §11). Owner: agent-workflow module.
// Both breakdowns come from one aggregation, and `total` is derived from byStatus,
// so the numbers in one response always add up.
export async function getStats(req, res) {
  const [result] = await Ticket.aggregate([
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

  res.json({ total, byStatus, byCategory });
}
