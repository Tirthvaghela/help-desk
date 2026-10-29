import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Login tokens (contract OPEN-2: JWT Bearer token). The payload holds the user id (`sub`)
// and the user's token version (`ver`); role and account status are always read from the
// database on each request. A token whose `ver` no longer matches the user's tokenVersion
// is refused (signed out by a password change or reset). Tokens issued before `ver`
// existed count as version 0.
// The algorithm is pinned so a token signed any other way is rejected.
const ALGORITHM = 'HS256';

export function signToken(user, { expiresIn = env.jwtExpiresIn } = {}) {
  const id = user?._id ?? user?.id;
  if (!id) {
    throw new Error('signToken requires a user with an id');
  }
  return jwt.sign({ ver: user?.tokenVersion ?? 0 }, env.jwtSecret, { subject: String(id), expiresIn, algorithm: ALGORITHM });
}

// Returns the payload, or throws if the signature, algorithm or expiry is invalid.
export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
}
