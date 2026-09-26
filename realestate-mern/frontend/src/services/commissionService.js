import api from '../utils/axios';

// ------------------------------------------------------------------
// Commissions service (Spec v2 - Feature 2, two-phase payout).
// CommissionRecords are generated server-side when a sale/rental is verified;
// agents see their own earnings, admins settle each record in two ordered
// phases (mark-paid remains only as a deprecated compatibility alias).
// ------------------------------------------------------------------

/**
 * List commission records with filters + pagination (agents are auto-scoped
 * to their own records; admins can pass agent=<id>).
 * GET /api/commissions
 * params: { payoutStatus: 'pending' | 'partial' | 'paid', agent, from, to, page, limit, sort }
 *   (legacy isPaid: 'true' | 'false' still accepted)
 * response: {
 *   success, commissions,
 *   pagination: { page, limit, total, totalPages },
 *   totals: { totalPaidAmount, pendingAmount, partialAmount, paidCount, pendingCount, partialCount, unpaidCount }
 * }
 * Each record populates property (title slug media.coverImage status) and
 * agent (name email). Amounts are denormalized on the record itself.
 */
export const getCommissions = async (params = {}) => {
  const { data } = await api.get('/commissions', { params });
  return data;
};

/**
 * Summary of the current user's commission earnings.
 * GET /api/commissions/summary
 * response: { success, summary: { thisMonthEarned, thisMonthPaid, pending,
 *   pendingCount, lifetimePaid, lifetimePaidCount, partial, partialCount } }
 */
export const getCommissionSummary = async () => {
  const { data } = await api.get('/commissions/summary');
  return data;
};

/**
 * Pay phase 1 of a commission (admin only).
 * PATCH /api/commissions/:id/pay-phase-1
 * payload: { note? }
 * response: { success, message, commission }
 */
export const payPhase1 = async (id, note) => {
  const { data } = await api.patch(`/commissions/${id}/pay-phase-1`, { note });
  return data;
};

/**
 * Pay phase 2 of a commission (admin only; requires phase 1 paid).
 * PATCH /api/commissions/:id/pay-phase-2
 * payload: { note? }
 * response: { success, message, commission }
 */
export const payPhase2 = async (id, note) => {
  const { data } = await api.patch(`/commissions/${id}/pay-phase-2`, { note });
  return data;
};

/**
 * DEPRECATED compatibility alias - settles the remaining phase(s) in order.
 * New code must use payPhase1 / payPhase2. Kept so old callers keep working
 * until the backend removes the endpoint next release.
 * PATCH /api/commissions/:id/mark-paid
 * payload: { paidNote? }
 * response: { success, message, commission }
 */
export const markCommissionPaid = async (id, paidNote) => {
  const { data } = await api.patch(`/commissions/${id}/mark-paid`, { paidNote });
  return data;
};
