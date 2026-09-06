import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDashboard } from '../../services/dashboardService';
import { getPipelineMetrics } from '../../services/leadService';
import StatCard from '../../components/layout/StatCard';
import { formatPrice, statusStyles, imageUrl } from '../../utils/format';

// Same card markup as StatCard, wrapped in a Link so the whole card navigates
const LinkedStatCard = ({ label, value, accent = '#B8863B', to }) => (
  <Link
    to={to}
    className="block bg-white border border-navy/10 rounded-sm p-5 shadow-card hover:border-brass/60 transition-colors"
  >
    <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">{label}</p>
    <p className="text-3xl font-display" style={{ color: accent }}>{value}</p>
  </Link>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [leadMetrics, setLeadMetrics] = useState(null);

  useEffect(() => {
    getAdminDashboard().then((data) => {
      setStats(data.stats);
      setRecent(data.recentListings);
    });
  }, []);

  useEffect(() => {
    // Lead pipeline widget - fails silently if the metrics endpoint is
    // unavailable so the rest of the dashboard is unaffected.
    getPipelineMetrics()
      .then((data) => setLeadMetrics(data.metrics))
      .catch(() => setLeadMetrics(null));
  }, []);

  return (
    <div>
      <p className="eyebrow mb-2">Overview</p>
      <h1 className="text-3xl mb-8">Administrator Dashboard</h1>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Properties" value={stats.totalProperties} />
          <StatCard label="Available" value={stats.availableProperties} accent="#3C6E52" />
          <StatCard label="Reserved" value={stats.reservedProperties} accent="#B8863B" />
          <StatCard label="Sold" value={stats.soldProperties} accent="#A6472F" />
          <StatCard label="Registered Users" value={stats.totalUsers} />
          <StatCard label="New Inquiries" value={stats.newInquiries} accent="#A6472F" />
          <LinkedStatCard label="Sales to Verify" value={stats.pendingSaleVerifications} accent="#B8863B" to="/dashboard/admin/sales" />
          <LinkedStatCard label="Agents" value={stats.agentCount} to="/dashboard/admin/agents" />
        </div>
      )}

      {/* Lead pipeline widget */}
      {leadMetrics && (
        <Link
          to="/dashboard/admin/lead-management"
          className="block bg-white border border-navy/10 rounded-sm p-5 mb-6 hover:border-brass/60 transition-colors"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg">Lead Pipeline</h2>
            <span className="text-sm text-brass">Open pipeline board →</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Total Leads</p>
              <p className="text-2xl font-display text-navy">{leadMetrics.totalLeads}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Active</p>
              <p className="text-2xl font-display text-[#4C6FA0]">{leadMetrics.activeLeads}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Conversion Rate</p>
              <p className="text-2xl font-display text-[#6B8F71]">{leadMetrics.conversionRate}%</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Overdue Follow-ups</p>
              <p
                className="text-2xl font-display"
                style={{ color: leadMetrics.overdueFollowUps > 0 ? '#A64B42' : '#8A8A82' }}
              >
                {leadMetrics.overdueFollowUps}
              </p>
            </div>
          </div>
          {leadMetrics.topAgent && (
            <p className="text-xs text-slate-muted mt-4">
              Top closer: <span className="text-slate-ink font-medium">{leadMetrics.topAgent.name}</span> ·{' '}
              {leadMetrics.topAgent.leads} closed
            </p>
          )}
        </Link>
      )}

      {stats?.pendingVerifications > 0 && (
        <Link
          to="/dashboard/admin/verifications"
          className="block bg-brass/10 border border-brass/40 rounded-sm px-5 py-4 mb-10 hover:bg-brass/15 transition-colors"
        >
          <span className="font-semibold text-brass-dark">{stats.pendingVerifications} registration{stats.pendingVerifications === 1 ? '' : 's'}</span>
          <span className="text-slate-ink"> waiting for identity verification — review now →</span>
        </Link>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl">Recently Added Properties</h2>
        <Link to="/dashboard/admin/properties" className="text-sm text-brass hover:underline">View all →</Link>
      </div>

      <div className="bg-white border border-navy/10 rounded-sm overflow-hidden">
        {recent.length === 0 ? (
          <p className="p-6 text-sm text-slate-muted">No properties listed yet.</p>
        ) : (
          recent.map((p) => {
            const status = statusStyles[p.status] || statusStyles.available;
            return (
              <div key={p._id} className="flex items-center gap-4 px-5 py-4 border-b border-navy/5 last:border-0">
                <img src={imageUrl(p.media?.coverImage)} alt={p.title} className="w-14 h-14 rounded-sm object-cover" />
                <div className="flex-1">
                  <p className="font-medium text-navy">{p.title}</p>
                  <p className="text-sm text-slate-muted">{formatPrice(p.price)}</p>
                </div>
                <span className="status-badge text-white" style={{ backgroundColor: status.bg }}>{status.label}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
