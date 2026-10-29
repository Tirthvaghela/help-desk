import { apiRequest, queryString } from './client.js';

// Admin API calls (API contract §10–§11). The backend refuses all of these for
// non-admins; the dashboard only shows them to admins.

// { total, byStatus, byCategory, byPriority, unresolvedByPriority, unassigned, byAssignee }
// `from` (Date or ISO string) limits the figures to tickets created since then.
export function getStats(token, { from } = {}) {
  const iso = from instanceof Date ? from.toISOString() : from;
  return apiRequest(`/api/admin/stats${queryString({ from: iso })}`, { token });
}

// { users, page, limit, total }; filters: role, isActive ("true"/"false"), q, page, limit.
export function listUsers(token, params = {}) {
  return apiRequest(`/api/admin/users${queryString(params)}`, { token });
}

export async function updateUserRole(token, id, role) {
  const result = await apiRequest(`/api/admin/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    token,
    body: { role },
  });
  return result.user;
}

export async function updateUserStatus(token, id, isActive) {
  const result = await apiRequest(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    token,
    body: { isActive },
  });
  return result.user;
}

// Active agents and admins: the people a ticket can be assigned to (contract D-2).
export async function listAssignableStaff(token) {
  const [agents, admins] = await Promise.all([
    listUsers(token, { role: 'agent', isActive: 'true', limit: 100 }),
    listUsers(token, { role: 'admin', isActive: 'true', limit: 100 }),
  ]);
  return [...agents.users, ...admins.users].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listAllCategories(token) {
  const result = await apiRequest('/api/admin/categories', { token });
  return result.categories;
}

export async function createCategory(token, { name, description }) {
  const result = await apiRequest('/api/admin/categories', {
    method: 'POST',
    token,
    body: { name, description },
  });
  return result.category;
}

// changes: { name?, description?, isActive? }
export async function updateCategory(token, id, changes) {
  const result = await apiRequest(`/api/admin/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: changes,
  });
  return result.category;
}

// A message that is safe to show for a failed admin request.
export function adminErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  switch (error?.code) {
    case 'NETWORK_ERROR':
    case 'VALIDATION_ERROR':
    case 'CATEGORY_EXISTS':
    case 'CANNOT_MODIFY_SELF':
    case 'LAST_ACTIVE_ADMIN':
      return error.message;
    case 'INVALID_ID':
    case 'NOT_FOUND':
      return 'That item no longer exists. Refresh and try again.';
    case 'FORBIDDEN':
      return 'You do not have permission to do this.';
    default:
      return error?.status >= 500 ? 'The server had a problem. Please try again in a moment.' : fallback;
  }
}
