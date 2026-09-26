import api from '../utils/axios';

// ------------------------------------------------------------------
// Sales service (Spec v2 - Feature 1).
// A Sale is filed by the lead's agent once a deal is agreed with the
// buyer; the admin's verification of this single record is the only
// approval gate (see backend saleRoutes.js). Verifying marks the
// property sold, closes the lead and generates a commission record.
// ------------------------------------------------------------------

/**
 * File a sale for a lead.
 * POST /api/sales
 * payload: {
 *   leadId,
 *   buyer: { name, phone, email, user? },
 *   agreedPrice,
 *   paymentType: 'full_payment' | 'emi' | 'bank_loan',
 *   downPaymentAmount?,   // reference only (emi-legacy / bank_loan)
 *   downPaymentPercent?,  // EMI percent entry 10-60 (authoritative when sent;
 *                         // amount derived server-side and stored alongside)
 *   remarks?
 * }
 * buyer.email is auto-linked to a registered account server-side;
 * paymentType 'emi' requires the buyer email to belong to a registered user.
 * response: 201 { success, message, sale }
 */
export const createSale = async (leadId, payload) => {
  const { data } = await api.post('/sales', { leadId, ...payload });
  return data;
};

/**
 * List sales with filters + pagination (agents are auto-scoped to their
 * own filings by the API; admins can pass agent=<id>).
 * GET /api/sales
 * params: { status, paymentType, from, to, search, page, limit }
 * response: {
 *   success, sales,
 *   pagination: { page, limit, total, totalPages },
 *   countsByStatus: { pending_review, verified, rejected }
 * }
 * Each sale populates property { title, slug, price, status, media.coverImage },
 * lead { name, email, phone }, agent { name, email }, reviewedBy { name }.
 */
export const getSales = async (params = {}) => {
  const { data } = await api.get('/sales', { params });
  return data;
};

/**
 * Get a single sale (deep populate incl. buyer.user, property.propertyType).
 * GET /api/sales/:id
 * response: { success, sale }
 */
export const getSaleById = async (id) => {
  const { data } = await api.get(`/sales/${id}`);
  return data;
};

/**
 * Verify a pending sale (admin only) - property -> sold, lead -> closed,
 * commission record generated inside one transaction (split 50/50 across
 * two payout phases unless firstPhaseAmount is given).
 * PATCH /api/sales/:id/verify
 * payload: { firstPhaseAmount? }  // optional, 0..commission total
 * response: { success, sale, commission: { percentage, amount, paymentType, requiresEmiPlan, phase1Amount, phase2Amount, payoutStatus } }
 */
export const verifySale = async (id, firstPhaseAmount) => {
  const payload = firstPhaseAmount === undefined || firstPhaseAmount === null || firstPhaseAmount === ''
    ? {}
    : { firstPhaseAmount };
  const { data } = await api.patch(`/sales/${id}/verify`, payload);
  return data;
};

/**
 * Reject a pending sale (admin only) - property -> available, lead -> negotiation.
 * PATCH /api/sales/:id/reject
 * payload: { reason }
 * response: { success, sale }
 */
export const rejectSale = async (id, reason) => {
  const { data } = await api.patch(`/sales/${id}/reject`, { reason });
  return data;
};
