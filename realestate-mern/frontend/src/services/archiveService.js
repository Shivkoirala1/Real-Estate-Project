import api from '../utils/axios';

// ------------------------------------------------------------------
// Admin cold-storage archive + data-retention job control.
// Backed by /api/admin/archives/* (admin only).
// ------------------------------------------------------------------

/**
 * List archived records.
 * GET /api/admin/archives?type=&page=&limit=&includeRestored=
 * response: { success, count, pagination, items }
 */
export const listArchives = async (params = {}) => {
  const { data } = await api.get('/admin/archives', { params });
  return data;
};

/**
 * View one archived record's full snapshot.
 * GET /api/admin/archives/:id
 * response: { success, archive }
 */
export const getArchive = async (id) => {
  const { data } = await api.get(`/admin/archives/${id}`);
  return data;
};

/**
 * Restore an archived record back into its live collection.
 * POST /api/admin/archives/:id/restore
 * response: { success, message, record }
 */
export const restoreArchive = async (id) => {
  const { data } = await api.post(`/admin/archives/${id}/restore`);
  return data;
};

/**
 * Recent job run history.
 * GET /api/admin/archives/jobs/history?job=&limit=
 * response: { success, count, logs }
 */
export const getJobHistory = async (params = {}) => {
  const { data } = await api.get('/admin/archives/jobs/history', { params });
  return data;
};

/**
 * Run an archival/retention job on demand.
 * POST /api/admin/archives/jobs/:job/run?dryRun=true|false
 * response: { success, message, result, log }
 */
export const runJob = async (job, dryRun) => {
  const { data } = await api.post(`/admin/archives/jobs/${job}/run`, null, {
    params: { dryRun: dryRun ? 'true' : 'false' },
  });
  return data;
};
