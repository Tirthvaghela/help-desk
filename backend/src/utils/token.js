import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Login tokens (contract OPEN-2: JWT Bearer token). The payload holds only the user id
// (`sub`); role and account status are always read from the database on each request.
// The algorithm is pinned so a token signed any other way is rejected.
const ALGORITHM = 'HS256';

export function signToken(user, { expiresIn = env.jwtExpiresIn } = {}) {
  const id = user?._id ?? user?.id;
  if (!id) {
    throw new Error('signToken requires a user with an id');
  }
  return jwt.sign({}, env.jwtSecret, { subject: String(id), expiresIn, algorithm: ALGORITHM });
}

// Returns the payload, or throws if the signature, algorithm or expiry is invalid.
export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
}
