import mongoose from 'mongoose';
import { applyToJSON } from './toJSON.js';

// docs/DATA_MODEL.md §3.4, contract D-4. Owner: agent-workflow module.
// The API calls this shape "Comment" and uses the keys `comment` / `comments`.

const { ObjectId } = mongoose.Schema.Types;

export const COMMENT_MAX_LENGTH = 2000;

const ticketCommentSchema = new mongoose.Schema(
  {
    ticket: { type: ObjectId, ref: 'Ticket', required: [true, 'ticket is required'] },
    author: { type: ObjectId, ref: 'User', required: [true, 'author is required'] },
    message: {
      type: String,
      required: [true, 'message is required'],
      trim: true,
      maxlength: [COMMENT_MAX_LENGTH, `message must be at most ${COMMENT_MAX_LENGTH} characters`],
    },
  },
  // Comments are never edited, so only createdAt is stored.
  { timestamps: { createdAt: true, updatedAt: false } },
);

ticketCommentSchema.index({ ticket: 1, createdAt: 1 });
applyToJSON(ticketCommentSchema);

export const TicketComment = mongoose.model('TicketComment', ticketCommentSchema);
