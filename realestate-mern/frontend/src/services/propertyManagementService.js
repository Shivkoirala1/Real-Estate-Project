import api from '../utils/axios';

// ------------------------------------------------------------------
// Property-management service requests (owner → admin lifecycle, no agents).
// State machine: pending → active | declined; active →
// termination_pending → terminated; active → terminated (direct).
// ------------------------------------------------------------------

// Service catalogue lives in services/managementService.js (admin-managed,
// API-backed). Request payloads carry plain service-name strings.

/**
 * One-step owner wizard: create a management-purpose property AND file its
 * management request atomically (transaction server-side).
 * POST /api/property-management/with-property { property, services[], note? }
 */
export const createWithProperty = async ({ property, services, note }) => {
  const { data } = await api.post('/property-management/with-property', {
    property,
    services,
    ...(note ? { note } : {}),
  });
  return data; // { success, property, request }
};

/**
 * Owner creates a management request.
 * POST /api/property-management { property, services[], note? }
 */
export const createManagementRequest = async (payload) => {
  const { data } = await api.post('/property-management', payload);
  return data; // { success, request }
};

/**
 * Owner's own requests.
 * GET /api/property-management/my-requests
 */
export const getMyManagementRequests = async (params = {}) => {
  const { data } = await api.get('/property-management/my-requests', { params });
  return data; // { success, count, requests, pagination }
};

/**
 * Admin queue.
 * GET /api/property-management
 */
export const getManagementRequests = async (params = {}) => {
  const { data } = await api.get('/property-management', { params });
  return data; // { success, count, requests, pagination, countsByStatus }
};

/**
 * Single request (admin or owner).
 * GET /api/property-management/:id
 */
export const getManagementRequestById = async (id) => {
  const { data } = await api.get(`/property-management/${id}`);
  return data; // { success, request }
};

/**
 * Admin accepts (terminal): pending -> active.
 * PATCH /api/property-management/:id/accept
 */
export const acceptRequest = async (id) => {
  const { data } = await api.patch(`/property-management/${id}/accept`);
  return data;
};

/**
 * Admin declines (terminal): pending -> declined. Reason required.
 * PATCH /api/property-management/:id/decline { decisionReason }
 */
export const declineRequest = async (id, decisionReason) => {
  const { data } = await api.patch(`/property-management/${id}/decline`, { decisionReason });
  return data;
};

/**
 * Admin terminates directly: active -> terminated. Reason required.
 * PATCH /api/property-management/:id/terminate { terminatedReason }
 */
export const terminateManagement = async (id, terminatedReason) => {
  const { data } = await api.patch(`/property-management/${id}/terminate`, { terminatedReason });
  return data;
};

/**
 * Admin approves an owner-requested termination:
 * termination_pending -> terminated.
 * PATCH /api/property-management/:id/approve-termination
 */
export const approveTermination = async (id) => {
  const { data } = await api.patch(`/property-management/${id}/approve-termination`);
  return data;
};

/**
 * Owner requests termination: active -> termination_pending. Reason optional.
 * PATCH /api/property-management/:id/request-termination { terminationReason? }
 */
export const requestTermination = async (id, terminationReason) => {
  const { data } = await api.patch(`/property-management/${id}/request-termination`, {
    ...(terminationReason ? { terminationReason } : {}),
  });
  return data;
};

/**
 * Paginated activity timeline (newest first).
 * GET /api/property-management/:id/activities
 */
export const getActivities = async (id, params = {}) => {
  const { data } = await api.get(`/property-management/${id}/activities`, { params });
  return data; // { success, count, activities, pagination }
};

/**
 * Append a timeline note.
 * POST /api/property-management/:id/activities { message }
 */
export const addActivity = async (id, message) => {
  const { data } = await api.post(`/property-management/${id}/activities`, { message });
  return data; // { success, activity }
};
