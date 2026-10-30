import { createHash } from 'node:crypto';
import { ApiError } from './ApiError.js';

// Idempotency-Key support for POST /api/tickets (API contract §7). A client sends one key per
// intended submission and the same key on every retry of it.

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

// How long a repeated request waits for the first one to finish, how often it checks, and
// after how long an unfinished claim counts as abandoned (its request failed or the process
// stopped). Tests may lower these.
export const submissionTiming = { waitMs: 3000, pollMs: 100, staleMs: 30000 };

// The key from the request, or null when the header is absent (the request is then not
// idempotent, as before). A malformed key → 400 INVALID_IDEMPOTENCY_KEY.
export function readIdempotencyKey(req) {
  const key = req.get(IDEMPOTENCY_HEADER);
  if (key === undefined) return null;
  if (!KEY_PATTERN.test(key)) {
    throw ApiError.badRequest(
      'Idempotency-Key must be 8-128 characters: letters, digits, "-" or "_"',
      'INVALID_IDEMPOTENCY_KEY',
    );
  }
  return key;
}

// Keys are per user: the same key from two users is two separate submissions.
export function submissionId(userId, key) {
  return `${userId}:${key}`;
}

// A hash of the validated ticket fields, so a key reused for different content is refused.
export function requestFingerprint({ subject, description, category, priority }) {
  return createHash('sha256').update(JSON.stringify([subject, description, String(category), priority])).digest('hex');
}
