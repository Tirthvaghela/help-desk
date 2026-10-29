import mongoose from 'mongoose';
import { User, USER_ROLES } from '../models/User.js';
import { Ticket } from '../models/Ticket.js';
import { ApiError } from '../utils/ApiError.js';
import { requireJsonBody, requireOneOf } from '../utils/validate.js';
import { escapeRegex, readParam, readPositiveInteger, QUEUE_DEFAULT_LIMIT, QUEUE_MAX_LIMIT, QUEUE_MAX_SEARCH_LENGTH } from '../utils/ticketQuery.js';
import { serializeUser } from '../utils/userSerializer.js';

// Admin user management (API contract §11). Owner: Swatismita.
//
// C-2 (admin modifying self) is decided here as the contract's proposal: an admin cannot
// change their own role or deactivate themselves (400 CANNOT_MODIFY_SELF). That alone does
// not keep an admin: two admins demoting each other at the same moment would both succeed.
// applyChange() therefore refuses any change that leaves no active admin (409 LAST_ACTIVE_ADMIN).

function parseUserQuery(query) {
  const filter = {};

  const role = readParam(query, 'role');
  if (role !== undefined) filter.role = requireOneOf(role, USER_ROLES, 'role');

  const isActive = readParam(query, 'isActive');
  if (isActive !== undefined) {
    filter.isActive = requireOneOf(isActive, ['true', 'false'], 'isActive') === 'true';
  }

  const q = readParam(query, 'q');
  if (q !== undefined) {
    if (q.length > QUEUE_MAX_SEARCH_LENGTH) {
      throw ApiError.badRequest(`q must be at most ${QUEUE_MAX_SEARCH_LENGTH} characters`);
    }
    const pattern = escapeRegex(q);
    filter.$or = [{ name: { $regex: pattern, $options: 'i' } }, { email: { $regex: pattern, $options: 'i' } }];
  }

  const page = readPositiveInteger(query, 'page', { fallback: 1 });
  const limit = readPositiveInteger(query, 'limit', { fallback: QUEUE_DEFAULT_LIMIT, max: QUEUE_MAX_LIMIT });
  return { filter, page, limit, skip: (page - 1) * limit };
}

// Tickets per user, for the admin directory: tickets a customer created, or tickets an
// agent/admin is assigned to.
async function ticketCounts(users) {
  const customers = users.filter((u) => u.role === 'customer').map((u) => u._id);
  const staff = users.filter((u) => u.role !== 'customer').map((u) => u._id);
  const [created, assigned] = await Promise.all([
    customers.length
      ? Ticket.aggregate([{ $match: { createdBy: { $in: customers } } }, { $group: { _id: '$createdBy', count: { $sum: 1 } } }])
      : [],
    staff.length
      ? Ticket.aggregate([{ $match: { assignedTo: { $in: staff } } }, { $group: { _id: '$assignedTo', count: { $sum: 1 } } }])
      : [],
  ]);
  const counts = new Map([...created, ...assigned].map((row) => [String(row._id), row.count]));
  return (user) => counts.get(String(user._id)) ?? 0;
}

// GET /api/admin/users — filters: role, isActive, q (name/email); page, limit. Newest first.
export async function listUsers(req, res) {
  const { filter, page, limit, skip } = parseUserQuery(req.query);
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  const countFor = await ticketCounts(users);
  res.json({
    users: users.map((user) => ({ ...serializeUser(user), ticketCount: countFor(user) })),
    page,
    limit,
    total,
  });
}

// Loads the target user for a role/status change, checking in the contract's order:
// 400 INVALID_ID, 400 CANNOT_MODIFY_SELF, 404.
async function findTarget(req) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    throw ApiError.badRequest('Invalid user id', 'INVALID_ID');
  }
  if (String(req.params.id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot change your own role or account status', 'CANNOT_MODIFY_SELF');
  }
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

const isActiveAdmin = (user) => user.role === 'admin' && user.isActive;

// Saves a role/status change. If it removed an active admin and none is left, it is undone
// and refused. The check runs after the write, so of two simultaneous changes the later one
// always sees both and is the one undone (both may be undone, never neither).
async function applyChange(user, changes) {
  const previous = { role: user.role, isActive: user.isActive };
  const wasActiveAdmin = isActiveAdmin(user);
  Object.assign(user, changes);
  await user.save();

  if (wasActiveAdmin && !isActiveAdmin(user) && !(await User.exists({ role: 'admin', isActive: true }))) {
    await User.updateOne({ _id: user._id }, { $set: previous });
    throw ApiError.conflict('At least one active admin must remain. Try again.', 'LAST_ACTIVE_ADMIN');
  }
  return user;
}

// PATCH /api/admin/users/:id/role — { role }. Takes effect on the user's next request,
// because the role is read from the database every time (requireAuth).
export async function updateUserRole(req, res) {
  const body = requireJsonBody(req.body);
  const role = requireOneOf(body.role, USER_ROLES, 'role');
  const user = await applyChange(await findTarget(req), { role });
  res.json({ user: serializeUser(user) });
}

// PATCH /api/admin/users/:id/status — { isActive }. A deactivated user cannot sign in and
// their existing token is refused on the next request (403 ACCOUNT_DISABLED).
export async function updateUserStatus(req, res) {
  const body = requireJsonBody(req.body);
  if (typeof body.isActive !== 'boolean') {
    throw ApiError.badRequest('isActive must be true or false');
  }
  const user = await applyChange(await findTarget(req), { isActive: body.isActive });
  res.json({ user: serializeUser(user) });
}
