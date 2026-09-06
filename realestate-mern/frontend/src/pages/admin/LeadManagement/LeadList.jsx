import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLeads, updateLeadStage, assignLeadToAgent } from '../../../services/leadService';
import { getUsers } from '../../../services/userService';
import { useToast } from '../../../context/ToastContext';
import LeadSourceIcon from '../../../components/LeadManagement/LeadSourceIcon';
import LeadStatusBadge from '../../../components/LeadManagement/LeadStatusBadge';
import { STAGES, STAGE_META, PRIORITIES, PRIORITY_META } from '../../../utils/leadConstants';
import { timeAgo } from '../../../utils/format';

// Table view of all leads with filtering, inline stage/agent updates and
// pagination. Complements the kanban board for bulk review.
const LeadList = ({ filters = {}, reloadKey = 0, onConverted }) => {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, currentPage: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [agents, setAgents] = useState([]);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    getUsers({ role: 'admin' })
      .then((data) => setAgents(data.users || []))
      .catch(() => setAgents([]));
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 10 };
      if (filters.stage) params.stage = filters.stage;
      if (filters.assignedAgent) params.assignedAgent = filters.assignedAgent;
      if (filters.priority) params.priority = filters.priority;
      if (filters.source) params.source = filters.source;
      if (filters.search) params.search = filters.search;
      if (filters.nextFollowUp) params.nextFollowUp = filters.nextFollowUp;

      const result = await getLeads(params);
      setLeads(result.leads || []);
      setPagination(result.pagination || { total: 0, pages: 1, currentPage: 1 });
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load leads', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters.stage, filters.assignedAgent, filters.priority, filters.source, filters.search, filters.nextFollowUp, reloadKey]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    setPage(1);
  }, [filters.stage, filters.assignedAgent, filters.priority, filters.source, filters.search, filters.nextFollowUp, reloadKey]);

  const changeStage = async (lead, stage) => {
    if (lead.stage === stage) return;
    setUpdatingId(lead._id);
    try {
      await updateLeadStage(lead._id, stage);
      showToast(`"${lead.name}" moved to ${STAGE_META[stage].label}`);
      await loadLeads();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update stage', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const changeAgent = async (lead, agentId) => {
    setUpdatingId(lead._id);
    try {
      // Assignment endpoints are admin-only; agents hitting this will see a
      // 403 surfaced by the toast below.
      await assignLeadToAgent(lead._id, agentId);
      showToast('Lead assigned');
      await loadLeads();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign lead', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const isOverdue = (lead) =>
    lead.nextFollowUp &&
    new Date(lead.nextFollowUp) < new Date() &&
    !['closed', 'lost'].includes(lead.stage);

  return (
    <div>
      <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-muted border-b border-navy/10">
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Follow-up</th>
              <th className="px-4 py-3">Activity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-muted">
                  Loading leads...
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-muted">
                  No leads match the current filters.
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const priority = PRIORITY_META[lead.priority] || PRIORITY_META.medium;
                return (
                  <tr key={lead._id} className="border-b border-navy/5 last:border-0 hover:bg-parchment/40">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/dashboard/lead-management/leads/${lead._id}`)}
                        className="text-left group"
                      >
                        <p className="font-medium text-navy group-hover:text-brass transition-colors">
                          {lead.name}
                        </p>
                        <p className="text-xs text-slate-muted">{lead.email}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <LeadSourceIcon source={lead.source} showLabel />
                    </td>
                    <td className="px-4 py-3 text-slate-ink max-w-[180px] truncate">
                      {lead.property ? lead.property.title : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={lead.stage}
                        disabled={updatingId === lead._id}
                        onChange={(e) => changeStage(lead, e.target.value)}
                        className="input-field text-xs py-1.5 w-40"
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {STAGE_META[s].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-ink">
                        <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                        {priority.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={lead.assignedAgent?._id || ''}
                        disabled={updatingId === lead._id}
                        onChange={(e) => changeAgent(lead, e.target.value)}
                        className="input-field text-xs py-1.5 w-36"
                      >
                        <option value="">Unassigned</option>
                        {agents.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {isOverdue(lead) ? (
                        <span className="text-brick font-medium">
                          Overdue · {new Date(lead.nextFollowUp).toLocaleDateString()}
                        </span>
                      ) : lead.nextFollowUp ? (
                        <span className="text-slate-ink">
                          {new Date(lead.nextFollowUp).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-slate-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-muted">
                      {timeAgo(lead.lastActivity || lead.updatedAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-slate-muted">
            Page {pagination.currentPage} of {pagination.pages} · {pagination.total} leads
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.currentPage <= 1}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={pagination.currentPage >= pagination.pages}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadList;
