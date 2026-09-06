import api from '../utils/axios';

// ------------------------------------------------------------------
// Agents service (Spec v2 - Feature 4, admin only).
// Manage agent accounts (users with role 'agent') and their attached
// agentProfile (license number, employee id, join date).
// ------------------------------------------------------------------

/**
 * List agents with per-agent performance stats.
 * GET /api/agents
 * params: { search, page, limit }
 * response: { success, count, agents, pagination: { page, limit, total, totalPages } }
 * Each agent: user fields + agentProfile { licenseNumber, employeeId, joinedAt }
 * + salesCount, salesValue, commissionEarned, commissionPaid.
 */
export const getAgents = async (params = {}) => {
  const { data } = await api.get('/agents', { params });
  return data;
};

/**
 * Create an agent account (email is marked verified automatically).
 * POST /api/agents
 * payload: { name, email, password, phone?, licenseNumber?, employeeId?, joinedAt? }
 * response: 201 { success, agent }
 */
export const createAgent = async (payload) => {
  const { data } = await api.post('/agents', payload);
  return data;
};

/**
 * Get a single agent (populated agentProfile + performance stats).
 * GET /api/agents/:id
 * response: { success, agent }
 */
export const getAgent = async (id) => {
  const { data } = await api.get(`/agents/${id}`);
  return data;
};

/**
 * Drill-down summary for one agent (sales, commissions, EMI portfolio).
 * GET /api/agents/:id/summary
 * response: { success, summary }
 */
export const getAgentSummary = async (id) => {
  const { data } = await api.get(`/agents/${id}/summary`);
  return data;
};

/**
 * Update an agent - profile fields, activation and optional password reset.
 * PUT /api/agents/:id
 * payload: { name?, phone?, isActive?, password?, agentProfile? }
 * response: { success, agent }
 */
export const updateAgent = async (id, payload) => {
  const { data } = await api.put(`/agents/${id}`, payload);
  return data;
};

/**
 * Toggle an agent's isActive flag (admins cannot deactivate themselves).
 * PATCH /api/agents/:id/status
 * response: { success, agent }
 */
export const toggleAgentStatus = async (id) => {
  const { data } = await api.patch(`/agents/${id}/status`);
  return data;
};

/**
 * Delete an agent account.
 * DELETE /api/agents/:id
 * response: { success, message }
 */
export const deleteAgent = async (id) => {
  const { data } = await api.delete(`/agents/${id}`);
  return data;
};
