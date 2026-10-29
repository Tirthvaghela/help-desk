import { apiRequest } from './client.js';

// Account security API (contract §6a). Reset and verification tokens come from the link in
// the email and are sent in request bodies only, never in API URLs.

// → { user, token }: other sessions are signed out; this one continues with `token`.
export function changePassword(token, { currentPassword, newPassword }) {
  return apiRequest('/api/auth/me/password', { method: 'POST', token, body: { currentPassword, newPassword } });
}

// → { pendingEmail, expiresAt }; the email changes only after the link is opened.
export function requestEmailChange(token, { newEmail, currentPassword }) {
  return apiRequest('/api/auth/me/email', { method: 'POST', token, body: { newEmail, currentPassword } });
}

export function getPendingEmailChange(token) {
  return apiRequest('/api/auth/me/email', { token });
}

export function cancelEmailChange(token) {
  return apiRequest('/api/auth/me/email', { method: 'DELETE', token });
}

// → { email }
export function verifyEmailChange(verificationToken) {
  return apiRequest('/api/auth/verify-email', { method: 'POST', body: { token: verificationToken } });
}

// → { message } — the same whether or not the account exists.
export function requestPasswordReset(email) {
  return apiRequest('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

// → { valid: true, expiresAt } or throws INVALID_OR_EXPIRED_TOKEN
export function checkResetToken(resetToken) {
  return apiRequest('/api/auth/reset-password/check', { method: 'POST', body: { token: resetToken } });
}

// → { message }; the user signs in afterwards.
export function resetPassword(resetToken, newPassword) {
  return apiRequest('/api/auth/reset-password', { method: 'POST', body: { token: resetToken, newPassword } });
}

// A message that is safe to show for a failed account-security request.
export function accountErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  switch (error?.code) {
    case 'VALIDATION_ERROR':
    case 'INVALID_CURRENT_PASSWORD':
    case 'EMAIL_TAKEN':
    case 'INVALID_OR_EXPIRED_TOKEN':
    case 'EMAIL_DELIVERY_FAILED':
    case 'RATE_LIMITED':
    case 'NETWORK_ERROR':
      return error.message;
    default:
      return error?.status >= 500 ? 'The server had a problem. Please try again in a moment.' : fallback;
  }
}
