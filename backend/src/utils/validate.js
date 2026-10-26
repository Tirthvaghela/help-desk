import { ApiError } from './ApiError.js';

// Small server-side validation helpers. Each one throws a 400 VALIDATION_ERROR
// with a clear message, or returns the cleaned value.

// Express 5 leaves req.body undefined when no JSON body was sent, so check it before
// reading fields; otherwise `req.body.x` throws and the client gets a 500.
export function requireJsonBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('Request body must be a JSON object');
  }
  return body;
}

export function requireString(value, field, { min = 1, max = Infinity } = {}) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw ApiError.badRequest(`${field} must be at least ${min} characters`);
  }
  if (trimmed.length > max) {
    throw ApiError.badRequest(`${field} must be at most ${max} characters`);
  }
  return trimmed;
}

export function requireOneOf(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw ApiError.badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireEmail(value, field = 'email') {
  const email = requireString(value, field, { max: 254 }).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw ApiError.badRequest(`${field} must be a valid email address`);
  }
  return email;
}
