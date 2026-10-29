import { apiRequest, queryString } from './client.js';

// In-app notifications (contract §12a). Always the signed-in user's own notifications.

// → { notifications, page, limit, total, unreadCount }
export function listNotifications(token, { page, limit, unread } = {}) {
  return apiRequest(`/api/notifications${queryString({ page, limit, unread })}`, { token });
}

export async function getUnreadCount(token) {
  const result = await apiRequest('/api/notifications/unread-count', { token });
  return result.unreadCount;
}

// → { notification, unreadCount }
export function markNotificationRead(token, id) {
  return apiRequest(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', token });
}

// → { updated, unreadCount: 0 }
export function markAllNotificationsRead(token) {
  return apiRequest('/api/notifications/read-all', { method: 'POST', token });
}

// Where a notification about `ticket` leads for this role (null when there is no ticket
// link, e.g. the reader can no longer open the ticket).
export function notificationLink(notification, role) {
  const id = notification?.ticket?.id;
  if (!id) return null;
  if (role === 'customer') return `/tickets/${id}`;
  if (role === 'agent') return `/agent/dashboard?ticket=${encodeURIComponent(id)}`;
  if (role === 'admin') return `/admin/dashboard?ticket=${encodeURIComponent(id)}`;
  return null;
}
