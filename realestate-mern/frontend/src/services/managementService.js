import api from '../utils/axios';

// ------------------------------------------------------------------
// Admin-managed catalogue of management services.
// Owners select from active services; historical requests snapshot names.
// ------------------------------------------------------------------

/**
 * List services (active only unless admin passes includeInactive).
 * GET /api/management-services
 */
export const getManagementServices = async (params = {}) => {
  const { data } = await api.get('/management-services', { params });
  return data; // { success, count, services }
};

/**
 * Admin creates a service.
 * POST /api/management-services { name, description? }
 */
export const createManagementService = async (payload) => {
  const { data } = await api.post('/management-services', payload);
  return data;
};

/**
 * Admin edits name/description.
 * PATCH /api/management-services/:id
 */
export const updateManagementService = async (id, payload) => {
  const { data } = await api.patch(`/management-services/${id}`, payload);
  return data;
};

/**
 * Admin (de)activates. Soft change - history untouched.
 * PATCH /api/management-services/:id/status { isActive }
 */
export const setManagementServiceStatus = async (id, isActive) => {
  const { data } = await api.patch(`/management-services/${id}/status`, { isActive });
  return data;
};
