import api from "../utils/axios";

/**
 * Get the visit queue
 *
 * GET /api/visits
 *
 * Admins see every visit; agents are scoped by the API to the visits
 * assigned to them (any assignedAgent filter they pass is ignored).
 *
 * Supported filters:
 * - status
 * - assignedAgent (admins only)
 * - visitType
 * - property
 * - page
 * - limit
 */
export const getVisits = async ({
  status,
  assignedAgent,
  visitType,
  property,
  page = 1,
  limit = 10,
} = {}) => {
  const { data } = await api.get("/visits", {
    params: {
      status,
      assignedAgent,
      visitType,
      property,
      page,
      limit,
    },
  });

  return data;
};


/**
 * Get the currently authenticated user's visits
 *
 * GET /api/visits/my-visits
 */
export const getMyVisits = async ({
  status,
  page = 1,
  limit = 10,
} = {}) => {
  const { data } = await api.get("/visits/my-visits", {
    params: {
      status,
      page,
      limit,
    },
  });

  return data;
};


/**
 * Get a single visit
 *
 * GET /api/visits/:id
 */
export const getVisitById = async (id) => {
  const { data } = await api.get(`/visits/${id}`);

  return data;
};


/**
 * Create a visit request
 *
 * POST /api/visits
 */
export const createVisit = async ({
  property,
  requestedSlot,
  buyerNotes,
  inquiryId,
  visitType = "property",
}) => {
  const { data } = await api.post("/visits", {
    property,
    requestedSlot,
    buyerNotes,
    inquiryId,
    visitType,
  });

  return data;
};


/**
 * Update a visit
 *
 * PATCH /api/visits/:id
 *
 * Admins manage the full lifecycle:
 * - Approving
 * - Rejecting
 * - Assigning an agent
 * - Rescheduling
 * - Updating internal notes
 *
 * Assigned agents are limited by the API to:
 * - Marking the visit completed or cancelled
 * - Updating internal notes
 */
export const updateVisit = async (id, payload) => {
  const { data } = await api.patch(
    `/visits/${id}`,
    payload
  );

  return data;
};


/**
 * Cancel the authenticated buyer's visit
 *
 * PATCH /api/visits/:id/cancel
 */
export const cancelVisit = async (id) => {
  const { data } = await api.patch(
    `/visits/${id}/cancel`
  );

  return data;
};

export const getAgents = async () => {
  const { data } = await api.get("/users/agents");
  return data;
}