import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { Ticket } from '../models/Ticket.js';
import { ApiError } from '../utils/ApiError.js';
import { canAccessTicket } from '../utils/ticketAccess.js';
import { readParam, readPositiveInteger } from '../utils/ticketQuery.js';
import { requireOneOf } from '../utils/validate.js';

// In-app notifications (API contract §12a). Every route works only on the signed-in user's
// own notifications: the recipient is always req.user, never a value from the client.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function unreadCount(userId) {
  return Notification.countDocuments({ recipient: userId, readAt: null });
}

// The ticket link is included only while the reader can still open the ticket (e.g. not
// after it was reassigned away from them); otherwise `ticket` is null.
async function serializeAll(notifications, user) {
  const ticketIds = [...new Set(notifications.map((n) => n.ticket && String(n.ticket)).filter(Boolean))];
  const tickets = ticketIds.length ? await Ticket.find({ _id: { $in: ticketIds } }).select('ticketNumber createdBy assignedTo') : [];
  const visible = new Map(tickets.filter((ticket) => canAccessTicket(user, ticket)).map((ticket) => [String(ticket._id), ticket]));
  return notifications.map((n) => {
    const ticket = n.ticket ? visible.get(String(n.ticket)) : null;
    return {
      id: String(n._id),
      type: n.type,
      title: n.title,
      message: n.message,
      ticket: ticket ? { id: String(ticket._id), ticketNumber: ticket.ticketNumber } : null,
      readAt: n.readAt,
      createdAt: n.createdAt,
    };
  });
}

// GET /api/notifications — ?unread=true|false, page, limit (default 20, max 50); newest first.
// → { notifications, page, limit, total, unreadCount }
export async function listNotifications(req, res) {
  const filter = { recipient: req.user._id };
  const unread = readParam(req.query, 'unread');
  if (unread !== undefined && requireOneOf(unread, ['true', 'false'], 'unread') === 'true') {
    filter.readAt = null;
  }
  const page = readPositiveInteger(req.query, 'page', { fallback: 1 });
  const limit = readPositiveInteger(req.query, 'limit', { fallback: DEFAULT_LIMIT, max: MAX_LIMIT });

  const [notifications, total, unreadTotal] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Notification.countDocuments(filter),
    unreadCount(req.user._id),
  ]);
  res.json({ notifications: await serializeAll(notifications, req.user), page, limit, total, unreadCount: unreadTotal });
}

// GET /api/notifications/unread-count → { unreadCount }
export async function getUnreadCount(req, res) {
  res.json({ unreadCount: await unreadCount(req.user._id) });
}

// PATCH /api/notifications/:id/read → { notification, unreadCount }
// Someone else's notification is a 404, so its existence is not revealed.
export async function markRead(req, res) {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    throw ApiError.badRequest('Invalid notification id', 'INVALID_ID');
  }
  const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user._id });
  if (!notification) throw ApiError.notFound('Notification not found');
  if (!notification.readAt) {
    // Keeps the time it was first read if it is marked twice.
    notification.readAt = new Date();
    await notification.save();
  }
  const [serialized] = await serializeAll([notification], req.user);
  res.json({ notification: serialized, unreadCount: await unreadCount(req.user._id) });
}

// POST /api/notifications/read-all → { updated, unreadCount: 0 }
export async function markAllRead(req, res) {
  const result = await Notification.updateMany({ recipient: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ updated: result.modifiedCount, unreadCount: 0 });
}
