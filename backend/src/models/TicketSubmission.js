import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// One record per ticket submission sent with an Idempotency-Key (API contract §7). `_id` is
// "<userId>:<key>", so MongoDB's built-in unique _id index makes the claim atomic: of several
// identical requests exactly one insert succeeds. No other index is needed.
//   ticket       id of the ticket this submission creates (chosen before it is inserted)
//   fingerprint  hash of the validated request, so a key cannot be reused for other content
const ticketSubmissionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    ticket: { type: ObjectId, ref: 'Ticket', required: true },
    fingerprint: { type: String, required: true },
  },
  { versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
);

export const TicketSubmission = mongoose.model('TicketSubmission', ticketSubmissionSchema);
