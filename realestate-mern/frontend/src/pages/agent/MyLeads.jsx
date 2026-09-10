import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMyLeads,
  updateLeadStage,
  markFollowUpDone,
} from '../../services/leadService';
import { useToast } from '../../context/ToastContext';
import LeadStatusBadge from '../../components/LeadManagement/LeadStatusBadge';
import LeadSourceIcon from '../../components/LeadManagement/LeadSourceIcon';
import { STAGES, STAGE_META } from '../../utils/leadConstants';
import { timeAgo } from '../../utils/format';

// Agent's personal lead queue - "My Leads". Shows assigned leads with quick
// stage changes and one-click follow-up completion.
const MyLeads = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('');
  const [stats, setStats] = useState({ total: 0, overdue: 0, active: 0 });

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 100 };
      if (stageFilter) params.stage = stageFilter;
      const result = await getMyLeads(params);
      const mine = result.leads || [];
      setLeads(mine);

      // Local stats from the fetched queue
      const now = new Date();
      setStats({
        total: result.pagination?.total ?? mine.length,
        active: mine.filter((l) => !['closed', 'lost'].includes(l.stage)).length,
        overdue: mine.filter(
          (l) => l.nextFollowUp && new Date(l.nextFollowUp) < now && !['closed', 'lost'].includes(l.stage)
        ).length,
      });
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load your leads', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageFilter]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const changeStage = async (lead, stage) => {
    if (lead.stage === stage) return;
    try {
      await updateLeadStage(lead._id, stage);
      showToast(`Moved to ${STAGE_META[stage].label}`);
      loadLeads();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update stage', 'error');
    }
  };

  const completeFollowUp = async (lead) => {
    try {
      await markFollowUpDone(lead._id);
      showToast('Follow-up marked as done');
      loadLeads();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to mark follow-up', 'error');
    }
  };

  return (
    <div>
      <p className="eyebrow mb-2">Agent CRM</p>
      <h1 className="text-3xl mb-6">My Leads</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Assigned to me</p>
          <p className="text-3xl font-display text-navy">{stats.total}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Active</p>
          <p className="text-3xl font-display text-[#4C6FA0]">{stats.active}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Overdue follow-ups</p>
          <p className="text-3xl font-display" style={{ color: stats.overdue > 0 ? '#A64B42' : '#8A8A82' }}>
            {stats.overdue}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="input-field text-sm py-2 w-auto"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_META[s].label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-navy/10 rounded-sm divide-y divide-navy/5">
        {loading ? (
          <p className="p-8 text-center text-slate-muted">Loading your leads...</p>
        ) : leads.length === 0 ? (
          <p className="p-8 text-center text-slate-muted">
            No leads assigned to you yet. New assignments appear here and in your notifications.
          </p>
        ) : (
          leads.map((lead) => {
            const isOverdue =
              lead.nextFollowUp &&
              new Date(lead.nextFollowUp) < new Date() &&
              !['closed', 'lost'].includes(lead.stage);
            return (
              <div key={lead._id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    onClick={() => navigate(`/dashboard/lead-management/leads/${lead._id}`)}
                    className="flex-1 min-w-[220px] text-left group"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-navy group-hover:text-brass transition-colors">
                        {lead.name}
                      </p>
                      <LeadStatusBadge stage={lead.stage} size="xs" />
                      <LeadSourceIcon source={lead.source} />
                    </div>
                    <p className="text-xs text-slate-muted mt-0.5">
                      {lead.email}
                      {lead.phone ? ` · ${lead.phone}` : ''}
                      {lead.property ? ` · ${lead.property.title}` : ''} · updated{' '}
                      {timeAgo(lead.lastActivity || lead.updatedAt)}
                    </p>
                  </button>

                  <div className="flex items-center gap-2 flex-wrap">
                    {lead.nextFollowUp && (
                      <span
                        className={`text-xs ${isOverdue ? 'text-brick font-medium' : 'text-slate-muted'}`}
                      >
                        {isOverdue ? 'Overdue: ' : 'Follow-up: '}
                        {new Date(lead.nextFollowUp).toLocaleDateString()}
                      </span>
                    )}
                    {lead.nextFollowUp && (
                      <button
                        onClick={() => completeFollowUp(lead)}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        ✓ Done
                      </button>
                    )}
                    <select
                      value={lead.stage}
                      onChange={(e) => changeStage(lead, e.target.value)}
                      className="input-field text-xs py-1.5 w-40"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_META[s].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MyLeads;
