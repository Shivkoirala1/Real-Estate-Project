import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminAnalytics, exportAnalytics } from '../../services/analyticsService';
import { useToast } from '../../context/ToastContext';
import { STAGES, STAGE_META } from '../../utils/leadConstants';

const npr = (x) => `NPR ${Number(x || 0).toLocaleString()}`;

// 'YYYY-MM' -> short month label, rendered in UTC to match the backend's
// UTC-bucketed aggregation keys.
const monthLabel = (key) => {
  if (!key) return '—';
  const d = new Date(`${key}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
};

// Pure-CSS bar chart (no chart library) - brass bars on parchment tracks.
const SalesBarChart = ({ series }) => {
  const max = Math.max(...series.map((s) => Number(s.value) || 0), 0);
  return (
    <div className="flex items-end gap-1 sm:gap-2 h-44">
      {series.map((s) => {
        const value = Number(s.value) || 0;
        const height = max > 0 ? (value / max) * 100 : 0;
        return (
          <div key={s.month} className="flex-1 min-w-0 flex flex-col items-center h-full">
            <div
              className="w-full max-w-[36px] flex-1 bg-parchment rounded-sm flex items-end"
              title={`${monthLabel(s.month)} (${s.month}): ${s.count} sale${s.count === 1 ? '' : 's'} · ${npr(value)}`}
            >
              <div
                className="w-full bg-brass rounded-t-sm"
                style={{ height: `${height}%`, minHeight: value > 0 ? '2px' : 0 }}
              />
            </div>
            <span className="text-[10px] text-slate-muted mt-1.5 whitespace-nowrap">{monthLabel(s.month)}</span>
          </div>
        );
      })}
    </div>
  );
};

// Admin analytics (Spec v2 F4): platform KPIs, monthly sales chart,
// commission split, agent leaderboard, pipeline snapshot + report exports.
const Analytics = () => {
  const { showToast } = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(''); // 'csv' | 'pdf' while in flight

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminAnalytics();
      setAnalytics(data.analytics || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load analytics');
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const { blob, filename } = await exportAnalytics({ type: 'admin', format });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report downloaded');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to export report', 'error');
    } finally {
      setExporting('');
    }
  };

  const salesOverTime = analytics?.salesOverTime || [];
  const commissions = analytics?.commissions || {};
  const emi = analytics?.emiPortfolio || {};
  const leaderboard = analytics?.agentLeaderboard || [];
  const pipeline = analytics?.pipeline || {};
  const countsByStage = pipeline.countsByStage || {};
  const pendingVerifications = pipeline.pendingSaleVerifications ?? 0;

  const verifiedSalesValue = salesOverTime.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  const salesCountTotal = salesOverTime.reduce((sum, s) => sum + (Number(s.count) || 0), 0);
  const commissionSplitTotal = (Number(commissions.paidAmount) || 0) + (Number(commissions.pendingAmount) || 0);

  // Stage chips: zero-init over every known stage so nothing silently hides.
  const stageChips = STAGES.map((stage) => ({
    stage,
    meta: STAGE_META[stage] || { label: stage, bg: 'bg-parchment', text: 'text-slate-ink' },
    count: countsByStage[stage] ?? 0,
  }));
  const unknownStages = Object.keys(countsByStage).filter((s) => !STAGES.includes(s) && countsByStage[s] > 0);

  if (loading) {
    return (
      <div>
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-3xl mb-8">Analytics</h1>
        <p className="text-sm text-slate-muted mb-5">Loading analytics...</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-navy/10 rounded-sm p-5 shadow-card animate-pulse">
              <div className="h-3 bg-parchment rounded-sm w-1/2 mb-3"></div>
              <div className="h-7 bg-parchment rounded-sm w-3/4"></div>
            </div>
          ))}
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card animate-pulse h-64"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-3xl mb-8">Analytics</h1>
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm px-5 py-4 text-sm font-medium flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline underline-offset-2">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow mb-2">Admin</p>
          <h1 className="text-3xl">Analytics</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => handleExport('csv')} disabled={!!exporting} className="btn-secondary text-sm px-4 py-2 disabled:opacity-60">
            {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
          </button>
          <button type="button" onClick={() => handleExport('pdf')} disabled={!!exporting} className="btn-primary text-sm px-4 py-2 disabled:opacity-60">
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* KPI row 1 — sales + commissions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Verified Sales Value (12 mo)</p>
          <p className="text-2xl font-display text-navy">{npr(verifiedSalesValue)}</p>
          <p className="text-xs text-slate-muted mt-1">{salesCountTotal} sale{salesCountTotal === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Commission Earned</p>
          <p className="text-2xl font-display text-navy">{npr(commissions.earnedTotal)}</p>
          <p className="text-xs text-slate-muted mt-1">All records, lifetime</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Commission Paid</p>
          <p className="text-2xl font-display text-sage">{npr(commissions.paidAmount)}</p>
          <p className="text-xs text-slate-muted mt-1">{commissions.paidCount ?? 0} record{(commissions.paidCount ?? 0) === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Commission Pending</p>
          <p className="text-2xl font-display text-brass-dark">{npr(commissions.pendingAmount)}</p>
          <p className="text-xs text-slate-muted mt-1">{commissions.pendingCount ?? 0} record{(commissions.pendingCount ?? 0) === 1 ? '' : 's'}</p>
        </div>
      </div>

      {/* KPI row 2 — EMI portfolio */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">EMI Total Outstanding</p>
          <p className="text-2xl font-display text-navy">{npr(emi.totalOutstanding)}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Active EMI Plans</p>
          <p className="text-2xl font-display text-navy">{emi.activePlans ?? 0}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Overdue Installments</p>
          <p className={`text-2xl font-display ${(emi.overdueInstallments ?? 0) > 0 ? 'text-brick' : 'text-navy'}`}>
            {emi.overdueInstallments ?? 0}
          </p>
        </div>
      </div>

      {/* Sales volume & value over time */}
      <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <div>
            <h2 className="font-display text-lg text-navy">Sales volume &amp; value over time</h2>
            <p className="text-xs text-slate-muted mt-0.5">Verified sales, last 12 months · bar height = sales value</p>
          </div>
          <span className="text-xs text-slate-muted">Peak {npr(Math.max(...salesOverTime.map((s) => Number(s.value) || 0), 0))}</span>
        </div>
        {salesOverTime.length === 0 ? (
          <p className="text-sm text-slate-muted py-10 text-center">No verified sales in the last 12 months yet.</p>
        ) : (
          <SalesBarChart series={salesOverTime} />
        )}
      </div>

      {/* Commission paid vs pending */}
      <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card mb-6">
        <h2 className="font-display text-lg text-navy mb-5">Commission paid vs pending</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-medium text-sage">Paid</p>
              <p className="text-sm font-medium text-navy">{npr(commissions.paidAmount)}</p>
            </div>
            <div className="h-3 bg-parchment rounded-sm overflow-hidden">
              <div
                className="h-full bg-sage rounded-sm"
                style={{
                  width: `${commissionSplitTotal > 0 ? ((Number(commissions.paidAmount) || 0) / commissionSplitTotal) * 100 : 0}%`,
                  minWidth: (Number(commissions.paidAmount) || 0) > 0 ? '2px' : 0,
                }}
              />
            </div>
            <p className="text-xs text-slate-muted mt-1.5">{commissions.paidCount ?? 0} record{(commissions.paidCount ?? 0) === 1 ? '' : 's'} settled</p>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-sm font-medium text-brass-dark">Pending</p>
              <p className="text-sm font-medium text-navy">{npr(commissions.pendingAmount)}</p>
            </div>
            <div className="h-3 bg-parchment rounded-sm overflow-hidden">
              <div
                className="h-full bg-brass rounded-sm"
                style={{
                  width: `${commissionSplitTotal > 0 ? ((Number(commissions.pendingAmount) || 0) / commissionSplitTotal) * 100 : 0}%`,
                  minWidth: (Number(commissions.pendingAmount) || 0) > 0 ? '2px' : 0,
                }}
              />
            </div>
            <p className="text-xs text-slate-muted mt-1.5">{commissions.pendingCount ?? 0} record{(commissions.pendingCount ?? 0) === 1 ? '' : 's'} awaiting payment</p>
          </div>
        </div>
      </div>

      {/* Agent leaderboard */}
      <div className="bg-white border border-navy/10 rounded-sm shadow-card mb-6 overflow-hidden">
        <div className="p-5 pb-3">
          <h2 className="font-display text-lg text-navy">Agent leaderboard</h2>
          <p className="text-xs text-slate-muted mt-0.5">Top agents by verified sales value</p>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-slate-muted py-10 text-center border-t border-navy/5">
            No verified sales yet — the leaderboard fills in as sales are verified.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-navy/5">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-muted">
                  <th className="px-5 py-3 w-10">#</th>
                  <th className="px-5 py-3">Agent</th>
                  <th className="px-5 py-3 text-right">Sales</th>
                  <th className="px-5 py-3 text-right">Sale Value</th>
                  <th className="px-5 py-3 text-right">Commission Earned</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => (
                  <tr key={row.agentId || i} className="border-t border-navy/5">
                    <td className="px-5 py-3 text-slate-muted">{i + 1}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-navy">{row.name || 'Unknown agent'}</p>
                      {row.email && <p className="text-xs text-slate-muted">{row.email}</p>}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-ink">{row.salesCount ?? 0}</td>
                    <td className="px-5 py-3 text-right text-slate-ink">{npr(row.salesValue)}</td>
                    <td className="px-5 py-3 text-right font-medium text-navy">{npr(row.commissionEarned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pipeline snapshot */}
      <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
        <h2 className="font-display text-lg text-navy mb-1">Pipeline snapshot</h2>
        <p className="text-xs text-slate-muted mb-4">Current lead counts by pipeline stage</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {stageChips.map(({ stage, meta, count }) => (
            <span
              key={stage}
              title={meta.description || meta.label}
              className={`status-badge ${meta.bg} ${meta.text}`}
            >
              {meta.label}: {count}
            </span>
          ))}
          {unknownStages.map((stage) => (
            <span key={stage} className="status-badge bg-parchment text-slate-ink">
              {stage}: {countsByStage[stage]}
            </span>
          ))}
        </div>
        <Link
          to="/dashboard/admin/sales"
          className="inline-flex items-center gap-2 text-sm font-medium text-brass-dark bg-brass/10 hover:bg-brass/20 border border-brass/25 rounded-sm px-3 py-2 transition-colors"
        >
          Sales awaiting verification: {pendingVerifications}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
};

export default Analytics;
