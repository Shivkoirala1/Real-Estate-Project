import api from "../utils/axios";

/**
 * Get the authenticated user's notifications
 * GET /api/notifications
 *
 * Supported query parameters:
 * - filter (all / unread)
 * - limit
 */
export const getNotifications = async ({ filter = "all", limit = 30 } = {}) => {
  const { data } = await api.get("/notifications", {
    params: { filter, limit },
  });
  return data; // { notifications, unreadCount }
};

/**
 * Get the authenticated user's unread notification count
 * GET /api/notifications/unread-count
 */
export const getUnreadCount = async () => {
  const { data } = await api.get("/notifications/unread-count");
  return data; // { unreadCount }
};

/**
 * Mark a single notification as read
 * PATCH /api/notifications/:id/read
 */
export const markNotificationAsRead = async (id) => {
  const { data } = await api.patch(`/notifications/${id}/read`);
  return data;
};

/**
 * Mark all of the user's notifications as read
 * PATCH /api/notifications/read-all
 */
export const markAllNotificationsAsRead = async () => {
  const { data } = await api.patch("/notifications/read-all");
  return data;
};

/**
 * Delete a notification
 * DELETE /api/notifications/:id
 */
export const deleteNotification = async (id) => {
  const { data } = await api.delete(`/notifications/${id}`);
  return data; // { message }
};
