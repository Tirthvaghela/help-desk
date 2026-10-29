import { TICKET_LIMITS, TICKET_PRIORITIES } from '../../api/tickets.js';

// Client-side checks that mirror the backend's rules (auth.controller.js, Ticket model,
// TicketComment model), so most mistakes are caught before a request is sent. The backend
// still validates everything. Each function returns { field: message } for the invalid fields.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same as backend utils/validate.js
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt limit, checked by the backend in bytes

function lengthError(value, label, { min, max }) {
  const length = value.trim().length;
  if (length === 0) return `${label} is required.`;
  if (min && length < min) return `${label} must be at least ${min} characters.`;
  if (max && length > max) return `${label} must be at most ${max} characters.`;
  return null;
}

function emailError(email) {
  const value = email.trim();
  if (!value) return 'Email is required.';
  if (value.length > 254 || !EMAIL_PATTERN.test(value)) return 'Enter a valid email address.';
  return null;
}

function withoutEmpty(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

export function validateLogin({ email, password }) {
  return withoutEmpty({
    email: emailError(email),
    password: password.trim() ? null : 'Password is required.',
  });
}

export function validateSignup({ name, email, password, confirmPassword }) {
  // The backend trims the password before checking it, so the same is done here.
  const trimmed = password.trim();
  let passwordError = null;
  if (!trimmed) passwordError = 'Password is required.';
  else if (trimmed.length < PASSWORD_MIN_LENGTH) {
    passwordError = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  } else if (new TextEncoder().encode(trimmed).length > PASSWORD_MAX_BYTES) {
    passwordError = 'Password is too long (some characters count more than once).';
  }

  return withoutEmpty({
    name: lengthError(name, 'Name', { min: 2, max: 80 }),
    email: emailError(email),
    password: passwordError,
    confirmPassword: !passwordError && password !== confirmPassword ? 'Passwords do not match.' : null,
  });
}

export function validateTicket({ subject, description, categoryId, priority }) {
  return withoutEmpty({
    subject: lengthError(subject, 'Subject', TICKET_LIMITS.subject),
    description: lengthError(description, 'Description', TICKET_LIMITS.description),
    categoryId: categoryId ? null : 'Choose a category.',
    priority: TICKET_PRIORITIES.includes(priority) ? null : 'Choose a priority.',
  });
}

export function validateComment(message) {
  return lengthError(message, 'Message', TICKET_LIMITS.comment);
}

// A message that is safe to show for a failed sign-in or sign-up. ROLE_NOT_ALLOWED is handled
// by the page, which knows which sign-in the user should use instead.
export function authErrorMessage(error) {
  switch (error?.code) {
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password.';
    case 'ACCOUNT_DISABLED':
      return 'This account has been deactivated. Contact support.';
    case 'EMAIL_TAKEN':
      return 'An account with this email already exists. Sign in instead.';
    case 'VALIDATION_ERROR':
    case 'NETWORK_ERROR':
    case 'TOKEN_STORAGE_FAILED':
    case 'BAD_RESPONSE':
    case 'RATE_LIMITED':
      return error.message;
    default:
      return error?.status >= 500
        ? 'The server had a problem. Please try again in a moment.'
        : 'Something went wrong. Please try again.';
  }
}

// Where to go after signing in: back to the protected page that sent the user here, if any.
export function returnPath(state, fallback) {
  const from = state?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : fallback;
}
