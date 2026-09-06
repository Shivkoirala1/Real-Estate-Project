import api from '../utils/axios';

// ------------------------------------------------------------------
// Analytics service (Spec v2).
// Dashboard aggregates + CSV/PDF report export. /admin requires admin,
// /agent is scoped to the current agent.
// ------------------------------------------------------------------

/**
 * Admin-wide analytics: sales over time, commissions, EMI portfolio,
 * agent leaderboard and pipeline counts.
 * GET /api/analytics/admin (admin only)
 * response: { success, analytics: {
 *   salesOverTime: [{ month, count, value }], commissions, commissionOverTime,
 *   emiPortfolio, agentLeaderboard: [{ name, email, salesCount, salesValue, commissionEarned }],
 *   pipeline: { countsByStage, pendingSaleVerifications }
 * } }
 */
export const getAdminAnalytics = async () => {
  const { data } = await api.get('/analytics/admin');
  return data;
};

/**
 * Analytics for the signed-in agent: month-over-month performance,
 * commissions, EMI portfolio and sales over time.
 * GET /api/analytics/agent
 * response: { success, analytics: {
 *   performance: { thisMonth: { salesCount, salesValue }, previousMonth: { ... } },
 *   commissions: { thisMonthEarned, thisMonthPaid, pending, lifetimePaid },
 *   emiPortfolio, salesOverTime
 * } }
 */
export const getAgentAnalytics = async () => {
  const { data } = await api.get('/analytics/agent');
  return data;
};

/**
 * Download an analytics report as a binary blob (CSV or PDF).
 * GET /api/analytics/export?type=admin|agent&format=csv|pdf
 * Must use responseType 'blob'; the filename is parsed from the
 * content-disposition header with a client-side fallback.
 * response: { blob, filename }
 */
export const exportAnalytics = async ({ type = 'admin', format = 'csv' } = {}) => {
  const response = await api.get('/analytics/export', {
    params: { type, format },
    responseType: 'blob',
  });
  const disposition = response.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const filename = match ? match[1] : `report-${type}-${Date.now()}.${format}`;
  return { blob: response.data, filename };
};
