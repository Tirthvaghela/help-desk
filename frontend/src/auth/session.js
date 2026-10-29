// Token storage and role helpers shared by the auth provider, routes and pages.
//
// Only the JWT is stored. The user and their role are always loaded from the backend
// (GET /api/auth/me), so nothing kept in the browser can grant access by itself.
//
// sessionStorage keeps the session across page reloads and ends it when the tab closes.
// Where the frontend keeps the token is still an open team decision (contract C-6);
// change TOKEN_STORAGE here if it is decided differently.

const TOKEN_KEY = 'helpdesk_auth_token';
// Key used by the old client-only role login; removed so it can never be relied on again.
const LEGACY_ROLE_KEY = 'helpdesk_staff_role';

function tokenStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage blocked (e.g. strict privacy settings): login fails with TOKEN_STORAGE_FAILED
  }
}

export function readToken() {
  try {
    return tokenStorage()?.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

// Returns true only if the token was saved and reads back unchanged. There is no in-memory
// fallback: a session that silently vanished on reload would be inconsistent.
export function storeToken(token) {
  try {
    const storage = tokenStorage();
    if (!storage) return false;
    storage.setItem(TOKEN_KEY, token);
    return storage.getItem(TOKEN_KEY) === token;
  } catch {
    return false; // blocked or full
  }
}

export function clearToken() {
  try {
    const storage = tokenStorage();
    storage?.removeItem(TOKEN_KEY);
    storage?.removeItem(LEGACY_ROLE_KEY);
  } catch {
    // Nothing else to clear.
  }
}

// For an error from GET /api/auth/me: the notice to show if the backend has definitively
// rejected the token (API contract §6), otherwise null. Only a rejected token is deleted;
// network failures, 5xx and anything unexpected leave it in place so the check can be retried.
export function sessionEndedNotice(error) {
  if (error?.status === 401) return 'Your session has expired. Please sign in again.';
  if (error?.status === 403 && error.code === 'ACCOUNT_DISABLED') {
    return 'This account has been deactivated. Contact an administrator.';
  }
  return null;
}

// What an API error means for the session, given the token its request was sent with:
//   'end'    the backend rejected the current session (expired, invalid or deactivated)
//   'stale'  it rejected a request sent with an older token, from a session that has since
//            ended or been replaced (password change, sign-out, another sign-in); the
//            current session is unaffected and must not be ended by it
//   null     not a session problem; the page handles the error
// Requests sent without a token are never 'stale'.
export function sessionRejection(error, sentWith, current = readToken()) {
  if (!sessionEndedNotice(error)) return null;
  return sentWith && sentWith !== current ? 'stale' : 'end';
}

export const STAFF_ROLES = Object.freeze(['agent', 'admin']);

const DASHBOARD_PATHS = Object.freeze({
  agent: '/agent/dashboard',
  admin: '/admin/dashboard',
});

// Dashboard for a role, or null for roles without a staff workspace (customers).
export function dashboardPathFor(role) {
  return DASHBOARD_PATHS[role] ?? null;
}

export const CUSTOMER_HOME = '/tickets';

// Where a signed-in user of any role belongs: the staff dashboard or the customer portal.
export function homePathFor(role) {
  return role === 'customer' ? CUSTOMER_HOME : dashboardPathFor(role);
}

export const CUSTOMER_ONLY_MESSAGE =
  'This sign-in is for customers. Support staff should use the staff sign-in.';

export const STAFF_ONLY_MESSAGE =
  'This sign-in is for authorized support staff. Customer accounts cannot access the staff workspace.';
