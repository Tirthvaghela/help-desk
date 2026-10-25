import mongoose from 'mongoose';
import { applyToJSON } from './toJSON.js';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '../utils/ticketConstants.js';

// docs/DATA_MODEL.md §3.3. Owner: Swati (first implementation by the integration lead).

const { ObjectId } = mongoose.Schema.Types;

const statusChangeSchema = new mongoose.Schema(
  {
    status: { type: String, enum: TICKET_STATUSES, required: true },
    changedBy: { type: ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: [true, 'ticketNumber is required'],
      unique: true,
      match: [/^HD-[1-9]\d*$/, 'ticketNumber must look like HD-<number>'],
    },
    subject: {
      type: String,
      required: [true, 'subject is required'],
      trim: true,
      minlength: [5, 'subject must be at least 5 characters'],
      maxlength: [120, 'subject must be at most 120 characters'],
    },
    description: {
      type: String,
      required: [true, 'description is required'],
      trim: true,
      minlength: [10, 'description must be at least 10 characters'],
      maxlength: [5000, 'description must be at most 5000 characters'],
    },
    category: { type: ObjectId, ref: 'Category', required: [true, 'category is required'] },
    priority: {
      type: String,
      required: [true, 'priority is required'],
      enum: { values: TICKET_PRIORITIES, message: `priority must be one of: ${TICKET_PRIORITIES.join(', ')}` },
    },
    status: {
      type: String,
      enum: { values: TICKET_STATUSES, message: `status must be one of: ${TICKET_STATUSES.join(', ')}` },
      default: 'open',
    },
    statusHistory: { type: [statusChangeSchema], default: [] },
    createdBy: { type: ObjectId, ref: 'User', required: [true, 'createdBy is required'] },
    // null means unassigned; part of the agent access rule (contract OPEN-1).
    assignedTo: { type: ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The first history entry is written when the ticket is created (contract §3).
ticketSchema.pre('validate', function addInitialStatus() {
  if (this.isNew && this.statusHistory.length === 0) {
    this.statusHistory.push({ status: this.status, changedBy: this.createdBy, changedAt: new Date() });
  }
});

ticketSchema.index({ createdBy: 1, createdAt: -1 });
ticketSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
ticketSchema.index({ status: 1, category: 1 });
applyToJSON(ticketSchema);

export const Ticket = mongoose.model('Ticket', ticketSchema);
