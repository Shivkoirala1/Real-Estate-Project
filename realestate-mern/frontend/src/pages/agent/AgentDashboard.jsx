import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyLeads } from '../../services/leadService';
import api from '../../utils/axios';
import LeadStatusBadge from '../../components/LeadManagement/LeadStatusBadge';
import LeadSourceIcon from '../../components/LeadManagement/LeadSourceIcon';
import { timeAgo } from '../../utils/format';

// Agent overview: personal lead pipeline snapshot + the most urgent leads.
const AgentDashboard = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, overdue: 0 });
  // null while loading (or if the request fails) - the earnings card shows '—'
  const [commissionSummary, setCommissionSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getMyLeads({ limit: 100 });
        if (cancelled) return;
        const mine = result.leads || [];
        const now = new Date();
        setLeads(mine);
        setStats({
          total: result.pagination?.total ?? mine.length,
          active: mine.filter((l) => !['closed', 'lost'].includes(l.stage)).length,
          overdue: mine.filter(
            (l) =>
              l.nextFollowUp &&
              new Date(l.nextFollowUp) < now &&
              !['closed', 'lost'].includes(l.stage)
          ).length,
        });
      } catch (err) {
        console.error('Failed to load my leads:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Earnings summary is a nice-to-have on this overview - a failure here
    // must never break the leads snapshot, so it fails silently to '—'.
    (async () => {
      try {
        const res = await api.get('/commissions/summary');
        if (cancelled) return;
        setCommissionSummary(res.data?.summary || null);
      } catch (err) {
        console.error('Failed to load commission summary:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Urgent = overdue follow-ups first, then soonest follow-up, then recent activity
  const urgent = [...leads]
    .filter((l) => !['closed', 'lost'].includes(l.stage))
    .sort((a, b) => {
      const aOverdue = a.nextFollowUp && new Date(a.nextFollowUp) < new Date() ? 0 : 1;
      const bOverdue = b.nextFollowUp && new Date(b.nextFollowUp) < new Date() ? 0 : 1;
      if (aOverdue !== bOverdue) return aOverdue - bOverdue;
      if (a.nextFollowUp && b.nextFollowUp) {
        return new Date(a.nextFollowUp) - new Date(b.nextFollowUp);
      }
      return new Date(b.lastActivity || b.updatedAt) - new Date(a.lastActivity || a.updatedAt);
    })
    .slice(0, 5);

  return (
    <div>
      <p className="eyebrow mb-2">Overview</p>
      <h1 className="text-3xl mb-8">Agent Dashboard</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">My Leads</p>
          <p className="text-3xl font-display text-navy">{loading ? '—' : stats.total}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Active Pipeline</p>
          <p className="text-3xl font-display text-[#4C6FA0]">{loading ? '—' : stats.active}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Overdue Follow-ups</p>
          <p
            className="text-3xl font-display"
            style={{ color: stats.overdue > 0 ? '#A64B42' : '#8A8A82' }}
          >
            {loading ? '—' : stats.overdue}
          </p>
        </div>
      </div>

      {/* Earnings strip - one wide card under the three lead stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="md:col-span-3 bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <p className="text-xs uppercase tracking-wide text-slate-muted">Earnings (Commission)</p>
            <Link to="/dashboard/agent/commissions" className="text-sm text-brass hover:underline whitespace-nowrap">
              View my commissions →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">This Month</p>
              <p className="text-xl sm:text-2xl font-display text-navy">
                {commissionSummary ? `NPR ${Number(commissionSummary.thisMonthEarned).toLocaleString()}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Pending</p>
              <p className="text-xl sm:text-2xl font-display text-brass-dark">
                {commissionSummary ? `NPR ${Number(commissionSummary.pending).toLocaleString()}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Lifetime Paid</p>
              <p className="text-xl sm:text-2xl font-display text-navy">
                {commissionSummary ? `NPR ${Number(commissionSummary.lifetimePaid).toLocaleString()}` : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl">Needs your attention</h2>
        <Link to="/dashboard/agent/leads" className="text-sm text-brass hover:underline">
          View all my leads →
        </Link>
      </div>

      <div className="bg-white border border-navy/10 rounded-sm divide-y divide-navy/5">
        {loading ? (
          <p className="p-6 text-sm text-slate-muted">Loading leads...</p>
        ) : urgent.length === 0 ? (
          <p className="p-6 text-sm text-slate-muted">
            No active leads right now. New assignments will show up here.
          </p>
        ) : (
          urgent.map((lead) => (
            <Link
              key={lead._id}
              to={`/dashboard/lead-management/leads/${lead._id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-parchment/40 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-navy">{lead.name}</p>
                  <LeadStatusBadge stage={lead.stage} size="xs" />
                  <LeadSourceIcon source={lead.source} />
                </div>
                <p className="text-xs text-slate-muted mt-0.5">
                  {lead.nextFollowUp
                    ? `Follow-up ${new Date(lead.nextFollowUp).toLocaleDateString()}`
                    : `Updated ${timeAgo(lead.lastActivity || lead.updatedAt)}`}
                </p>
              </div>
              {lead.nextFollowUp && new Date(lead.nextFollowUp) < new Date() && (
                <span className="text-xs text-brick font-medium whitespace-nowrap">
                  Overdue →
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
};

export default AgentDashboard;
