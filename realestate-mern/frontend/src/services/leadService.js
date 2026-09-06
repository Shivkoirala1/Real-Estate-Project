import api from '../utils/axios';

// ------------------------------------------------------------------
// Unified Lead Management service.
// Every lead - from contact forms, property/office visits, or manual
// creation - flows through these endpoints (see backend leadRoutes.js).
// ------------------------------------------------------------------

// ---------- CREATE ----------

/**
 * Create a lead manually.
 * POST /api/leads
 * payload: { name, email, phone, category, priority, assignedAgent, property, notes, nextFollowUp }
 */
export const createLead = async (leadData) => {
  const { data } = await api.post('/leads', leadData);
  return data; // { success, message, lead }
};

/**
 * Convert a contact form submission into a lead.
 * POST /api/contact-forms/:id/convert-to-lead
 * payload: { category, priority, assignedAgent, notes, property }
 */
export const convertContactFormToLead = async (contactFormId, leadData = {}) => {
  const { data } = await api.post(`/contact-forms/${contactFormId}/convert-to-lead`, leadData);
  return data; // { success, message, lead, conversation }
};

/**
 * Convert a visit request into a lead.
 * POST /api/visits/:id/convert-to-lead
 * payload: { category, priority, assignedAgent, notes, stage }
 */
export const convertVisitToLead = async (visitId, leadData = {}) => {
  const { data } = await api.post(`/visits/${visitId}/convert-to-lead`, leadData);
  return data; // { success, message, lead }
};

// ---------- READ ----------

/**
 * List leads with filters + pagination.
 * GET /api/leads
 * params: { stage, category, assignedAgent, priority, source, search,
 *           nextFollowUp: 'overdue', includeCounts, page, limit, sort }
 * Admins see everything; agents are scoped to their own leads by the API.
 */
export const getLeads = async (params = {}) => {
  const { data } = await api.get('/leads', { params });
  return data; // { success, leads, pagination, countsByStage? }
};

/**
 * List the current agent's leads.
 * GET /api/leads/my-leads
 */
export const getMyLeads = async (params = {}) => {
  const { data } = await api.get('/leads/my-leads', { params });
  return data; // { success, leads, pagination }
};

/**
 * Get a single lead (populated agent/property/contact form/visit/threads).
 * GET /api/leads/:id
 */
export const getLeadById = async (id) => {
  const { data } = await api.get(`/leads/${id}`);
  return data; // { success, lead }
};

// ---------- UPDATE ----------

/**
 * Update general lead details.
 * PATCH /api/leads/:id
 * payload: { name, email, phone, category, priority, notes, nextFollowUp, property }
 */
export const updateLead = async (id, updates) => {
  const { data } = await api.patch(`/leads/${id}`, updates);
  return data; // { success, message, lead }
};

/**
 * Move a lead to a different pipeline stage (kanban drag & drop).
 * PATCH /api/leads/:id/stage
 */
export const updateLeadStage = async (id, newStage) => {
  const { data } = await api.patch(`/leads/${id}/stage`, { stage: newStage });
  return data; // { success, message, lead }
};

/**
 * Assign (or reassign) a lead to an agent - admin only.
 * PATCH /api/leads/:id/assign | /api/leads/:id/reassign
 */
export const assignLeadToAgent = async (id, agentId) => {
  const { data } = await api.patch(`/leads/${id}/assign`, { assignedAgent: agentId });
  return data; // { success, message, lead }
};

export const reassignLead = async (id, newAgentId) => {
  const { data } = await api.patch(`/leads/${id}/reassign`, { assignedAgent: newAgentId });
  return data; // { success, message, lead }
};

/** PATCH /api/leads/:id/priority */
export const updateLeadPriority = async (id, priority) => {
  const { data } = await api.patch(`/leads/${id}/priority`, { priority });
  return data;
};

/** PATCH /api/leads/:id/notes */
export const updateLeadNotes = async (id, notes) => {
  const { data } = await api.patch(`/leads/${id}/notes`, { notes });
  return data;
};

/** PATCH /api/leads/:id/follow-up  (set or clear with null) */
export const setFollowUpDate = async (id, nextFollowUp) => {
  const { data } = await api.patch(`/leads/${id}/follow-up`, { nextFollowUp });
  return data;
};

/** PATCH /api/leads/:id/follow-up-done */
export const markFollowUpDone = async (id) => {
  const { data } = await api.patch(`/leads/${id}/follow-up-done`);
  return data; // { success, message, lead }
};

// ---------- DELETE ----------

/** DELETE /api/leads/:id (admin only) */
export const deleteLead = async (id) => {
  const { data } = await api.delete(`/leads/${id}`);
  return data; // { success, message }
};

// ---------- PIPELINE & ANALYTICS ----------

/**
 * Pipeline metrics: totals, conversion rate, avg close time, stage/source/
 * agent breakdowns, overdue follow-ups.
 * GET /api/leads/pipeline/metrics
 */
export const getPipelineMetrics = async () => {
  const { data } = await api.get('/leads/pipeline/metrics');
  return data; // { success, metrics }
};

/**
 * Next-best-action suggestion for a lead.
 * GET /api/leads/:id/suggested-action
 */
export const getSuggestedAction = async (id) => {
  const { data } = await api.get(`/leads/${id}/suggested-action`);
  return data; // { success, action, reason }
};

// ---------- ACTIVITY TIMELINE ----------

/** GET /api/leads/:id/activities */
export const getLeadActivities = async (id) => {
  const { data } = await api.get(`/leads/${id}/activities`);
  return data; // { success, activities }
};

/** POST /api/leads/:id/activities { message, type } */
export const addLeadActivity = async (id, message, type = 'note_added') => {
  const { data } = await api.post(`/leads/${id}/activities`, { message, type });
  return data; // { success, activities }
};
