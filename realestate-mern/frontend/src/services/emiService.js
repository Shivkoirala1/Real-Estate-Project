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
 * List EMI plans with filters + pagination (agents see plans they manage,
 * admins see all).
 * GET /api/emi-plans
 * params: { status, overdue: 'true', dueThisMonth: 'true', page, limit }
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
