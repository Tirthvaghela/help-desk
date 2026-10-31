import mongoose from 'mongoose';
import { User, USER_ROLES } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/token.js';
import { ensureDatabase } from './database.js';

// Contract §6 token rules. Owner: Swati (first implementation by the integration lead).

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

// Requires `Authorization: Bearer <token>`, verifies it, and loads the current user from
// the database into req.user. Missing, invalid or expired tokens and tokens for users that
// no longer exist get 401; deactivated accounts get 403 ACCOUNT_DISABLED. A valid token when the
// database cannot be used gets 503 DATABASE_UNAVAILABLE: the token is not to blame.
export async function requireAuth(req, res, next) {
  // Answers to authenticated requests are private: never keep them in browser or proxy caches.
  // Set first, so the 401/403 answers below carry it too.
  res.set('Cache-Control', 'no-store');
  const match = BEARER_PATTERN.exec(req.get('Authorization') ?? '');
  if (!match) {
    throw ApiError.unauthorized();
  }

  let payload;
  try {
    payload = verifyToken(match[1]);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  if (typeof payload.sub !== 'string' || !mongoose.isObjectIdOrHexString(payload.sub)) {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  await ensureDatabase();
  const user = await User.findById(payload.sub);
  if (!user) {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  // Signed out everywhere by a password change or reset (tokens from before `ver` = 0).
  if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
    throw ApiError.unauthorized('Your session has ended. Please sign in again.');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated', 'ACCOUNT_DISABLED');
  }

  req.user = user;
  next();
}

// Allows only the given roles. Use after requireAuth.
export function requireRole(...roles) {
  const unknown = roles.filter((role) => !USER_ROLES.includes(role));
  if (roles.length === 0 || unknown.length > 0) {
    throw new Error(`requireRole needs known roles, got: ${roles.join(', ') || '(none)'}`);
  }

  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized();
    }
    if (!roles.includes(req.user.role)) {
      throw ApiError.forbidden();
    }
    next();
  };
}
