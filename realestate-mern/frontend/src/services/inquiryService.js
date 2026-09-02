import api from "../utils/axios";

/**
 * Create an inquiry (public contact form or property detail page)
 * POST /api/inquiries
 *
 * Supported fields:
 * - name, email, phone, subject, message
 * - property (optional — links the inquiry to a listing)
 */
export const createInquiry = async (payload) => {
  const { data } = await api.post("/inquiries", payload);
  return data; // { message, inquiry }
};

/**
 * Get inquiries received by the authenticated user
 * (admins receive everyone's)
 * GET /api/inquiries
 */
export const getInquiries = async () => {
  const { data } = await api.get("/inquiries");
  return data; // { inquiries }
};

/**
 * Get inquiries the authenticated user has sent
 * GET /api/inquiries/sent
 */
export const getSentInquiries = async () => {
  const { data } = await api.get("/inquiries/sent");
  return data; // { inquiries }
};

/**
 * Update an inquiry
 * PATCH /api/inquiries/:id
 *
 * Can be used for:
 * - status (new / read / responded)
 * - stage (pipeline stage)
 * - assignedAgent
 */
export const updateInquiry = async (id, payload) => {
  const { data } = await api.patch(`/inquiries/${id}`, payload);
  return data; // { message, inquiry }
};

/**
 * Reply to an inquiry's conversation thread
 * PATCH /api/inquiries/:id/reply
 */
export const replyToInquiry = async (id, message) => {
  const { data } = await api.patch(`/inquiries/${id}/reply`, { message });
  return data; // { message, inquiry }
};

/**
 * Delete an inquiry and its conversation thread
 * DELETE /api/inquiries/:id
 */
export const deleteInquiry = async (id) => {
  const { data } = await api.delete(`/inquiries/${id}`);
  return data; // { message }
};
