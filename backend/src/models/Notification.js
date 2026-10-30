import mongoose from 'mongoose';
import { applyToJSON } from './toJSON.js';

// In-app notifications about ticket activity (docs/DATA_MODEL.md §3.7).
// One document per recipient. The recipient always comes from the server, never the client.

export const NOTIFICATION_TYPES = Object.freeze([
  'ticket_created',
  'ticket_assigned',
  'ticket_unassigned',
  'priority_changed',
  'status_changed',
  'ticket_resolved',
  'comment_added',
]);

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 300 },
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Newest first per recipient (list), and unread per recipient (badge count).
notificationSchema.index({ recipient: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
applyToJSON(notificationSchema);

export const Notification = mongoose.model('Notification', notificationSchema);
