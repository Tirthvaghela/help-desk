import bcrypt from 'bcryptjs';
import { ApiError } from './ApiError.js';
import { requireString } from './validate.js';

// Password rules shared by sign-up, password change and password reset (contract §6).

export const BCRYPT_COST = 12;
export const PASSWORD_MIN_LENGTH = 8;
// Registration accepted up to 128 characters before the 72-byte check was added, so login
// (and "current password" checks) keep that limit and existing accounts still work.
export const LOGIN_PASSWORD_MAX_LENGTH = 128;

// bcrypt only uses the first 72 bytes of a password, so longer ones are rejected rather
// than silently shortened. Bytes, not characters: "€" is one character but three bytes.
export function requireNewPassword(value, field = 'password') {
  const password = requireString(value, field, { min: PASSWORD_MIN_LENGTH });
  if (bcrypt.truncates(password)) {
    throw ApiError.badRequest(`${field} must be at most 72 bytes (some characters use more than one byte)`);
  }
  return password;
}

// A password the user types to prove who they are (sign-in, current password).
export function requireExistingPassword(value, field = 'password') {
  return requireString(value, field, { max: LOGIN_PASSWORD_MAX_LENGTH });
}

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function passwordMatches(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}
