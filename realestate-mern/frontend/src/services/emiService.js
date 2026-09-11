import api from '../utils/axios';

// ------------------------------------------------------------------
// EMI plans service (Spec v2 - Feature 3).
// A plan is attached to a verified sale and tracks its monthly
// installments; the buyer must be a registered account.
// ------------------------------------------------------------------

/**
 * Create an EMI plan for a verified sale.
 * POST /api/emi-plans
 * payload: {
 *   saleId,
 *   principalAmount,
 *   tenureMonths,
 *   installmentAmount,
 *   startDate
 * }
 * response: 201 { success, plan }
 */
export const createEmiPlan = async (payload) => {
  const { data } = await api.post('/emi-plans', payload);
  return data;
};

/**
 * List verified EMI sales that do not have an EMI plan yet (admin only).
 * This is the data source for the admin panel's "Initialize EMI Plan" picker -
 * plan creation lives exclusively in the admin role.
 * GET /api/emi-plans/eligible-sales
 * params: { search?, limit? }
 * response: { success, count, sales: [{ _id, property, buyer, agent, agreedPrice, downPaymentAmount, reviewedAt }] }
 */
export const getEligibleEmiSales = async (params = {}) => {
  const { data } = await api.get('/emi-plans/eligible-sales', { params });
  return data;
};

/**
 * List EMI plans with filters + pagination (agents see plans they manage,
 * admins see all).
 * GET /api/emi-plans
 * params: { status, overdue: 'true', dueThisMonth: 'true', sale, page, limit }
 *   sale - admin-only narrowing to a single sale (plan-exists check).
 * response: {
 *   success, plans,
 *   pagination: { page, limit, total, totalPages },
 *   summary: { activePlans, dueThisMonth, overdueInstallments, totalOutstanding }
 * }
 * Each plan (via toJSON) carries the virtuals nextDueInstallment,
 * outstandingBalance, totalPaid and overdueCount.
 */
export const getEmiPlans = async (params = {}) => {
  const { data } = await api.get('/emi-plans', { params });
  return data;
};

/**
 * Get a single EMI plan (populated sale/property/buyer, installments).
 * GET /api/emi-plans/:id
 * response: { success, plan, canManage }
 */
export const getEmiPlanById = async (id) => {
  const { data } = await api.get(`/emi-plans/${id}`);
  return data;
};

/**
 * Update an EMI plan - either activate/close it or reschedule it.
 * PATCH /api/emi-plans/:id
 * payload: { status? }  // e.g. 'active' | 'closed'
 *    or { reschedule: { startDate, installmentAmount? } }
 * response: { success, plan }
 */
export const updateEmiPlan = async (id, payload) => {
  const { data } = await api.patch(`/emi-plans/${id}`, payload);
  return data;
};

/**
 * Update a single installment within a plan.
 * PATCH /api/emi-plans/:planId/installments/:installmentNumber
 * payload: {
 *   status: 'paid' | 'pending' | 'waived',
 *   paidDate?, paidAmount?, remarks?,   // when marking paid
 *   dueDate?, amount?                   // when rescheduling one installment
 * }
 * response: { success, plan, progress: { paidCount, totalCount, allPaid } }
 */
export const updateInstallment = async (planId, installmentNumber, payload) => {
  const { data } = await api.patch(
    `/emi-plans/${planId}/installments/${installmentNumber}`,
    payload
  );
  return data;
};

/**
 * Buyer submits proof of payment for one installment (optional payment
 * slip image). Multipart because of the optional file.
 * POST /api/emi-plans/:planId/installments/:n/verification-request
 * payload: { paidAmount?, paidDate?, note?, paymentSlip?: File }
 * response: { success, message, plan }
 */
export const requestInstallmentVerification = async (planId, installmentNumber, { paidAmount, paidDate, note, paymentSlip } = {}) => {
  const formData = new FormData();
  if (paidAmount !== undefined && paidAmount !== null && paidAmount !== '') formData.append('paidAmount', paidAmount);
  if (paidDate) formData.append('paidDate', paidDate);
  if (note) formData.append('note', note);
  if (paymentSlip) formData.append('paymentSlip', paymentSlip);

  const { data } = await api.post(
    `/emi-plans/${planId}/installments/${installmentNumber}/verification-request`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data;
};

/**
 * Admin approves or rejects a buyer's payment verification request.
 * PATCH /api/emi-plans/:planId/installments/:n/verification-request
 * payload: { action: 'approve' | 'reject', reviewNote?, paidAmount?, paidDate? }
 * response: { success, message, plan }
 */
export const reviewInstallmentVerification = async (planId, installmentNumber, payload) => {
  const { data } = await api.patch(
    `/emi-plans/${planId}/installments/${installmentNumber}/verification-request`,
    payload
  );
  return data;
};

