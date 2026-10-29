// Client-side checks for the account forms, mirroring the backend rules (contract §6a).
// The server validates everything again. Each returns { field: message } for invalid fields.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same as backend utils/validate.js
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;

export function newPasswordError(password) {
  const trimmed = password.trim();
  if (!trimmed) return 'Enter a new password.';
  if (trimmed.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (new TextEncoder().encode(trimmed).length > PASSWORD_MAX_BYTES) return 'That password is too long (some characters count more than once).';
  return null;
}

function withoutEmpty(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

export function validatePasswordChange({ currentPassword, newPassword, confirmPassword }) {
  const newError = newPasswordError(newPassword);
  return withoutEmpty({
    currentPassword: currentPassword.trim() ? null : 'Enter your current password.',
    newPassword: newError ?? (newPassword === currentPassword ? 'Choose a password that is different from your current one.' : null),
    confirmPassword: !newError && newPassword !== confirmPassword ? 'The passwords do not match.' : null,
  });
}

export function validateEmailChange({ newEmail, currentPassword }, currentEmail = '') {
  const email = newEmail.trim().toLowerCase();
  let emailError = null;
  if (!email) emailError = 'Enter the new email address.';
  else if (email.length > 254 || !EMAIL_PATTERN.test(email)) emailError = 'Enter a valid email address.';
  else if (email === currentEmail.toLowerCase()) emailError = 'That is already your email address.';
  return withoutEmpty({
    newEmail: emailError,
    currentPassword: currentPassword.trim() ? null : 'Enter your current password.',
  });
}

export function validateResetPassword({ newPassword, confirmPassword }) {
  const newError = newPasswordError(newPassword);
  return withoutEmpty({
    newPassword: newError,
    confirmPassword: !newError && newPassword !== confirmPassword ? 'The passwords do not match.' : null,
  });
}

// The token from a link like /reset-password?token=…, or null if it is malformed.
export function tokenFromSearch(search) {
  const token = new URLSearchParams(search).get('token');
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
