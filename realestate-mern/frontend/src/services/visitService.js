import api from "../utils/axios";

/**
 * Get admin/staff visit queue
 *
 * GET /api/visits
 *
 * Supported filters:
 * - status
 * - assignedAgent
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
 * Can be used for:
 * - Approving
 * - Rejecting
 * - Assigning an agent
 * - Rescheduling
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