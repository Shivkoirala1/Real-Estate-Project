import React, { useCallback, useEffect, useState } from 'react';
import { getAgentAnalytics, exportAnalytics } from '../../services/analyticsService';
import { useToast } from '../../context/ToastContext';

const npr = (x) => `NPR ${Number(x || 0).toLocaleString()}`;

// 'YYYY-MM' -> short month label, rendered in UTC to match the backend's
// UTC-bucketed aggregation keys.
const monthLabel = (key) => {
  if (!key) return '—';
  const d = new Date(`${key}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
};

// Delta arrow with divide-by-zero guard: a previous month of 0 with any
// current activity renders as "New" instead of a fake percentage.
const Delta = ({ current, previous }) => {
  const delta = Number(current) - Number(previous);
  if (!delta) return <p className="text-xs text-slate-muted mt-1">No change vs last month</p>;
  const pct = Number(previous) > 0 ? Math.round((delta / Number(previous)) * 100) : null;
  const up = delta > 0;
  return (
    <p className={`text-xs font-medium mt-1 ${up ? 'text-sage' : 'text-brick'}`}>
      {up ? '▲' : '▼'} {pct === null ? 'New' : `${Math.abs(pct)}%`} vs last month
    </p>
  );
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

// Agent analytics (Spec v2 F4): month-over-month performance, commission
// summary, own EMI portfolio, monthly sales chart + report exports.
const AgentAnalytics = () => {
  const { showToast } = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(''); // 'csv' | 'pdf' while in flight

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAgentAnalytics();
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
      const { blob, filename } = await exportAnalytics({ type: 'agent', format });
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

  const performance = analytics?.performance || {};
  const thisMonth = performance.thisMonth || {};
  const previousMonth = performance.previousMonth || {};
  const commissions = analytics?.commissions || {};
  const emi = analytics?.emiPortfolio || {};
  const salesOverTime = analytics?.salesOverTime || [];

  if (loading) {
    return (
      <div>
        <p className="eyebrow mb-2">Agent</p>
        <h1 className="text-3xl mb-8">My Analytics</h1>
        <p className="text-sm text-slate-muted mb-5">Loading analytics...</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {[0, 1].map((i) => (
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
        <p className="eyebrow mb-2">Agent</p>
        <h1 className="text-3xl mb-8">My Analytics</h1>
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
          <p className="eyebrow mb-2">Agent</p>
          <h1 className="text-3xl">My Analytics</h1>
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

      {/* Performance — this month vs previous month */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Sales This Month</p>
          <p className="text-2xl font-display text-navy">{thisMonth.salesCount ?? 0}</p>
          <p className="text-sm text-slate-ink mt-1">{npr(thisMonth.salesValue)} in value</p>
          <Delta current={thisMonth.salesCount ?? 0} previous={previousMonth.salesCount ?? 0} />
          <p className="text-xs text-slate-muted mt-2">Previous month: {previousMonth.salesCount ?? 0} · {npr(previousMonth.salesValue)}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Sales Value This Month</p>
          <p className="text-2xl font-display text-navy">{npr(thisMonth.salesValue)}</p>
          <p className="text-sm text-slate-ink mt-1">{thisMonth.salesCount ?? 0} sale{(thisMonth.salesCount ?? 0) === 1 ? '' : 's'} closed</p>
          <Delta current={thisMonth.salesValue ?? 0} previous={previousMonth.salesValue ?? 0} />
          <p className="text-xs text-slate-muted mt-2">Previous month: {npr(previousMonth.salesValue)}</p>
        </div>
      </div>

      {/* Commission summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Earned This Month</p>
          <p className="text-2xl font-display text-navy">{npr(commissions.thisMonthEarned)}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Paid This Month</p>
          <p className="text-2xl font-display text-sage">{npr(commissions.thisMonthPaid)}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Pending</p>
          <p className="text-2xl font-display text-brass-dark">{npr(commissions.pending)}</p>
          <p className="text-xs text-slate-muted mt-1">{commissions.pendingCount ?? 0} record{(commissions.pendingCount ?? 0) === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Lifetime Paid</p>
          <p className="text-2xl font-display text-navy">{npr(commissions.lifetimePaid)}</p>
          <p className="text-xs text-slate-muted mt-1">{commissions.lifetimePaidCount ?? 0} record{(commissions.lifetimePaidCount ?? 0) === 1 ? '' : 's'}</p>
        </div>
      </div>

      {/* My EMI portfolio */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">My Active EMI Plans</p>
          <p className="text-2xl font-display text-navy">{emi.activePlans ?? 0}</p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Overdue Installments</p>
          <p className={`text-2xl font-display ${(emi.overdueInstallments ?? 0) > 0 ? 'text-brick' : 'text-navy'}`}>
            {emi.overdueInstallments ?? 0}
          </p>
        </div>
        <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">My Total Outstanding</p>
          <p className="text-2xl font-display text-navy">{npr(emi.totalOutstanding)}</p>
        </div>
      </div>

      {/* My sales over time */}
      <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <div>
            <h2 className="font-display text-lg text-navy">My sales over time</h2>
            <p className="text-xs text-slate-muted mt-0.5">Verified sales, last 12 months · bar height = sales value</p>
          </div>
          <span className="text-xs text-slate-muted">Peak {npr(Math.max(...salesOverTime.map((s) => Number(s.value) || 0), 0))}</span>
        </div>
        {salesOverTime.length === 0 ? (
          <p className="text-sm text-slate-muted py-10 text-center">
            No verified sales in the last 12 months yet — verified sales appear here.
          </p>
        ) : (
          <SalesBarChart series={salesOverTime} />
        )}
      </div>
    </div>
  );
};

export default AgentAnalytics;
