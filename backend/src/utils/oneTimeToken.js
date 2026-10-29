import { createHash, randomBytes } from 'node:crypto';
import { AuthToken } from '../models/AuthToken.js';
import { ApiError } from './ApiError.js';

// Creates and consumes one-time tokens (password reset, email change).
// Tokens are 32 random bytes from the OS CSPRNG; only their SHA-256 hash is stored.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function invalidLink() {
  return ApiError.badRequest('This link is invalid, has expired or was already used. Request a new one.', 'INVALID_OR_EXPIRED_TOKEN');
}

// Replaces any earlier tokens of this purpose for the user, so only the newest link works.
export async function issueToken({ userId, purpose, ttlMs, newEmail }) {
  await AuthToken.deleteMany({ user: userId, purpose });
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs);
  await AuthToken.create({ user: userId, purpose, tokenHash: hashToken(token), newEmail, expiresAt });
  return { token, expiresAt };
}

function readToken(value) {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) throw invalidLink();
  return value;
}

// Looks a token up without using it (e.g. to show the reset form). Throws if unusable.
export async function findToken(value, purpose) {
  const tokenHash = hashToken(readToken(value));
  const record = await AuthToken.findOne({ tokenHash, purpose, expiresAt: { $gt: new Date() } });
  if (!record) throw invalidLink();
  return record;
}

// Uses a token exactly once: the atomic delete means two simultaneous requests cannot both
// succeed. Throws if the token is unknown, expired or already used.
export async function consumeToken(value, purpose) {
  const tokenHash = hashToken(readToken(value));
  const record = await AuthToken.findOneAndDelete({ tokenHash, purpose, expiresAt: { $gt: new Date() } });
  if (!record) throw invalidLink();
  return record;
}
