import api from '../utils/axios';

// ------------------------------------------------------------------
// Commissions service (Spec v2 - Feature 2).
// CommissionRecords are generated server-side when a sale is verified;
// agents see their own earnings, admins can mark records as paid.
// ------------------------------------------------------------------

/**
 * List commission records with filters + pagination (agents are auto-scoped
 * to their own records; admins can pass agent=<id>).
 * GET /api/commissions
 * params: { isPaid: 'true' | 'false', agent, from, to, page, limit }
 * response: {
 *   success, commissions,
 *   pagination: { page, limit, total, totalPages },
 *   totals: { totalPaidAmount, pendingAmount, paidCount, pendingCount }
 * }
 * Each record populates property (title slug media.coverImage status),
 * agent (name email) and sale (agreedPrice paymentType submittedAt).
 */
export const getCommissions = async (params = {}) => {
  const { data } = await api.get('/commissions', { params });
  return data;
};

/**
 * Summary of the current user's commission earnings.
 * GET /api/commissions/summary
 * response: { success, summary: { thisMonthEarned, thisMonthPaid, pending,
 *   pendingCount, lifetimePaid, lifetimePaidCount } }
 */
export const getCommissionSummary = async () => {
  const { data } = await api.get('/commissions/summary');
  return data;
};

/**
 * Mark a commission record as paid (admin only).
 * PATCH /api/commissions/:id/mark-paid
 * payload: { paidNote? }
 * response: { success, message, commission }
 */
export const markCommissionPaid = async (id, paidNote) => {
  const { data } = await api.patch(`/commissions/${id}/mark-paid`, { paidNote });
  return data;
};
