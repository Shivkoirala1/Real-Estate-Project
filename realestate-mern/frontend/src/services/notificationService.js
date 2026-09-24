import api from "../utils/axios";

/**
 * Get the authenticated user's notifications
 * GET /api/notifications
 *
 * Supported query parameters:
 * - filter (all / unread)
 * - category (messages / visits / deals / management / payments; omitted = all)
 * - page
 * - limit
 */
export const getNotifications = async ({ filter = "all", category, page = 1, limit = 30 } = {}) => {
  const params = { filter, page, limit };
  if (category && category !== "all") params.category = category;
  const { data } = await api.get("/notifications", { params });
  return data; // { notifications, unreadCount, unreadByCategory, pagination }
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
