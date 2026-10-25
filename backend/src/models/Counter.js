import mongoose from 'mongoose';

// Atomic sequence numbers (docs/DATA_MODEL.md §3.5 and §6). Owner: Swati.

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export const Counter = mongoose.model('Counter', counterSchema);

// Increments and returns the named sequence. Safe under concurrency: each call gets a
// different number. The first call for a new name returns 1 (starting value Q-3 is open).
export async function nextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return counter.seq;
}

export async function nextTicketNumber() {
  return `HD-${await nextSequence('ticket')}`;
}
