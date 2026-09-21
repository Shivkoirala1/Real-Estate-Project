import api from '../utils/axios';

// ------------------------------------------------------------------
// Rentals service — the lease counterpart of the Sale flow.
// Agents file rentals on leads for saleType 'rent' properties,
// admins verify/reject them (same single approval gate as Sales).
// ------------------------------------------------------------------

/**
 * File a rental deal on a lead -> lands in the admin verification queue.
 * POST /api/rentals
 * payload: {
 *   leadId,                      // required
 *   tenant: { name, phone?, email? },   // required (name)
 *   monthlyRent,                 // required, number > 0
 *   durationInMonths,            // optional (null/empty = open-ended tenancy), integer 1-360 when provided
 *   startDate,                   // required, lease start date
 *   securityDeposit?,            // optional, number >= 0
 *   remarks?,                    // optional free text
 * }
 * response: 201 { success, message, rental }
 */
export const createRental = async (payload) => {
  const { data } = await api.post('/rentals', payload);
  return data;
};

/**
 * List rentals — admin sees all, agent sees own filings.
 * GET /api/rentals
 * params: {
 *   status?,             // 'pending_review' | 'verified' | 'rejected'
 *   from?, to?,          // date range on submittedAt (YYYY-MM-DD)
 *   search?,             // tenant name (case-insensitive)
 *   agent?,              // admin only: filter by agent id
 *   sort?,               // 'newest' | 'oldest' | 'rent_desc' | 'rent_asc'
 *   page?, limit?,
 * }
 * response: {
 *   success, count, rentals,
 *   pagination: { page, limit, total, totalPages },
 *   countsByStatus: { pending_review, verified, rejected },  // for queue tab counters
 * }
 */
export const getRentals = async (params = {}) => {
  const { data } = await api.get('/rentals', { params });
  return data;
};

/**
 * Get a single rental with full context
 * (property, lead, agent, reviewer, tenant.user populated).
 * GET /api/rentals/:id
 * response: { success, rental }
 */
export const getRental = async (id) => {
  const { data } = await api.get(`/rentals/${id}`);
  return data;
};

/**
 * Admin verifies a pending rental -> property marked 'rented',
 * lead closed, commission recorded from the admin-entered amount.
 * PATCH /api/rentals/:id/verify
 * payload: { commissionAmount }  // required, non-negative number (0 allowed)
 * response: {
 *   success, message, rental,
 *   commission: { percentage, amount, leaseValue },
 * }
 */
export const verifyRental = async (id, commissionAmount) => {
  const { data } = await api.patch(`/rentals/${id}/verify`, { commissionAmount });
  return data;
};

/**
 * Admin rejects a pending rental (reason required) -> property back to
 * 'available', lead back to negotiation, agent can resubmit.
 * PATCH /api/rentals/:id/reject
 * payload: { reason }   // required
 * response: { success, message, rental }
 */
export const rejectRental = async (id, reason) => {
  const { data } = await api.patch(`/rentals/${id}/reject`, { reason });
  return data;
};