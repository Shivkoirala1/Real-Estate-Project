import api from "../utils/axios";

/**
 * Get all users
 * GET /api/users
 *
 * Optional query parameters:
 * - role
 * - search
 */
export const getUsers = async (params = {}) => {
  const response = await api.get("/users", {
   params
  });

  return response.data;
};

/**
 * Get a single user
 * GET /api/users/:id
 */
export const getUser = async (userId) => {
  const response = await api.get(`/users/${userId}`);

  return response.data;
};

/**
 * Update a user
 * PUT /api/users/:id
 *
 * Supported fields:
 * - name
 * - phone
 * - role
 */
export const updateUser = async (userId, userData) => {
  const response = await api.put(`/users/${userId}`, userData);

  return response.data;
};

/**
 * Activate / deactivate a user
 * PATCH /api/users/:id/status
 */
export const toggleUserStatus = async (userId) => {
  const response = await api.patch(`/users/${userId}/status`);

  return response.data;
};

/**
 * Reset a user's password
 * POST /api/users/:id/reset-password
 */
export const resetUserPassword = async (userId) => {
  const response = await api.post(`/users/${userId}/reset-password`);

  return response.data;
};

/**
 * Delete a user
 * DELETE /api/users/:id
 */
export const deleteUser = async (userId) => {
  const response = await api.delete(`/users/${userId}`);

  return response.data;
};

/**
 * Get users pending identity verification
 * GET /api/users/verifications/pending
 */
export const getPendingVerifications = async () => {
  const response = await api.get("/users/verifications/pending");

  return response.data;
};

/**
 * Approve or reject a user's identity verification
 * PATCH /api/users/:id/verify
 *
 * status:
 * - verified
 * - rejected
 *
 * note is optional.
 */
export const verifyUser = async (userId, status, note = "") => {
  const response = await api.patch(`/users/${userId}/verify`, {
    status,
    note,
  });

  return response.data;
};
