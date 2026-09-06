import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../utils/axios';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { timeAgo } from '../../utils/format';

// --- Tiny local API helpers (saleService.js is owned by another task) ---
const fetchSales = async (params) => {
  const res = await api.get('/sales', { params });
  return res.data; // { success, sales, pagination:{page,limit,total,totalPages}, countsByStatus }
};
const verifySale = async (id) => {
  const res = await api.patch(`/sales/${id}/verify`);
  return res.data; // { success, sale, commission:{percentage,amount,paymentType,requiresEmiPlan} }
};
const rejectSale = async (id, reason) => {
  const res = await api.patch(`/sales/${id}/reject`, { reason });
  return res.data; // { success, sale }
};

const PAGE_SIZE = 10;

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

const PAYMENT_LABELS = {
  full_payment: 'Full Payment',
  emi: 'EMI',
  bank_loan: 'Bank Loan',
};

const STATUS_BADGES = {
  pending_review: { label: 'Pending Review', className: 'bg-brass/10 text-brass-dark' },
  verified: { label: 'Verified', className: 'bg-sage-light text-sage' },
  rejected: { label: 'Rejected', className: 'bg-brick-light text-brick' },
};

const money = (x) => `NPR ${Number(x || 0).toLocaleString()}`;

// Admin queue for agent-filed sales (Spec v2 F1) - a flat list, not a Kanban.
const SalesVerification = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get('status') || '';
  // Drill-down from ManageAgents (?agent=<id>) - id-only filter is enough.
  const agentFilter = searchParams.get('agent') || '';
  const [sales, setSales] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // sale currently being rejected
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSales({
        status: status || undefined,
        agent: agentFilter || undefined,
        page,
        limit: PAGE_SIZE,
        sort,
      });
      const nextTotalPages = data.pagination?.totalPages || 1;
      // Reviewing the last item of the last page can leave us on a phantom
      // page - snap back to page 1 instead of showing a false empty state.
      if (page > 1 && (data.sales || []).length === 0 && nextTotalPages < page) {
        setPage(1);
        return;
      }
      setSales(data.sales || []);
      setCounts(data.countsByStatus || {});
      setPagination(data.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load sales');
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [status, agentFilter, page, sort]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter chips keep their state in the URL (?status=pending_review etc.)
  const handleStatusChange = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('status', value);
    else next.delete('status');
    setSearchParams(next);
    setPage(1);
  };

  const handleSortChange = (value) => {
    setSort(value);
    setPage(1);
  };

  const clearAgentFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('agent');
    setSearchParams(next);
    setPage(1);
  };

  const openReject = (sale) => {
    setRejectTarget(sale);
    setRejectReason('');
    setRejectError('');
  };

  const closeReject = () => {
    setRejectTarget(null);
    setRejectReason('');
    setRejectError('');
  };

  const handleVerify = async (sale) => {
    const ok = await confirm({
      title: 'Verify this sale?',
      message: `"${sale.property?.title || 'This property'}" will be marked sold, lead "${sale.lead?.name || 'the lead'}" will be closed and the agent's commission recorded. This cannot be undone.`,
      confirmLabel: 'Verify sale',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    setBusyId(sale._id);
    try {
      const data = await verifySale(sale._id);
      showToast('Sale verified — property marked sold, lead closed, commission recorded');
      if (data.commission?.requiresEmiPlan) {
        showToast('EMI sale — agent should initialize the EMI plan');
      }
      closeReject();
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to verify sale', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectReason.trim()) {
      setRejectError('A rejection reason is required');
      return;
    }
    setBusyId(rejectTarget._id);
    try {
      await rejectSale(rejectTarget._id, rejectReason.trim());
      showToast('Sale rejected — property returned to available, lead returned to negotiation');
      closeReject();
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to reject sale', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const allCount = (counts.pending_review || 0) + (counts.verified || 0) + (counts.rejected || 0);

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-3xl mb-1">Sales Verification</h1>
        <p className="text-sm text-slate-muted">Agent-filed sales awaiting your sign-off</p>
      </div>

      {/* Status filter chips — counters mirror the backend queue tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          const count = tab.value === '' ? allCount : counts[tab.value] || 0;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => handleStatusChange(tab.value)}
              className={`text-sm font-medium px-3.5 py-1.5 rounded-sm border transition-colors ${
                active
                  ? 'bg-navy border-navy text-ivory'
                  : 'bg-white border-navy/15 text-slate-muted hover:border-navy/30 hover:text-navy'
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-xs ${active ? 'text-ivory/70' : 'text-slate-muted'}`}>{count}</span>
            </button>
          );
        })}
        <select
          className="input-field sm:w-48"
          value={sort}
          onChange={(e) => handleSortChange(e.target.value)}
          aria-label="Sort sales"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="amount_desc">Amount: High→Low</option>
          <option value="amount_asc">Amount: Low→High</option>
        </select>
      </div>

      {/* Agent drill-down chip (from ManageAgents) */}
      {agentFilter && (
        <div className="flex items-center gap-2 mb-4">
          <span className="status-badge bg-brass/10 text-brass-dark inline-flex items-center gap-1.5">
            Filtered by agent
            <button
              type="button"
              onClick={clearAgentFilter}
              aria-label="Clear agent filter"
              className="hover:text-brick transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {loading ? (
        <div>
          <p className="text-sm text-slate-muted mb-4">Loading sales...</p>
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white border border-navy/10 rounded-sm p-5 shadow-card animate-pulse">
                <div className="h-4 bg-parchment rounded-sm w-1/3 mb-5"></div>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-parchment rounded-sm w-3/4"></div>
                    <div className="h-3 bg-parchment rounded-sm w-1/2"></div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="h-6 bg-parchment rounded-sm w-1/2"></div>
                    <div className="h-3 bg-parchment rounded-sm w-2/3"></div>
                  </div>
                  <div className="flex-1">
                    <div className="h-9 bg-parchment rounded-sm w-32"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm px-5 py-4 text-sm font-medium flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : sales.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center shadow-card">
          <p className="text-slate-muted">No sales in this view.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {sales.map((sale) => {
              const badge = STATUS_BADGES[sale.status] || STATUS_BADGES.pending_review;
              const property = sale.property || {};
              const priceMismatch = Math.abs(Number(sale.agreedPrice || 0) - Number(property.price || 0)) > 0;
              const downPayment = sale.downPaymentAmount;
              const isPending = sale.status === 'pending_review';

              return (
                <div
                  key={sale._id}
                  className={`bg-white border border-navy/10 rounded-sm shadow-card ${
                    sale.status === 'verified' ? 'border-l-4 border-l-sage' : ''
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <Link
                        to="/dashboard/admin/properties"
                        className="font-medium text-navy hover:text-brass transition-colors"
                      >
                        {property.title || 'Untitled property'}
                      </Link>
                      <span className={`status-badge whitespace-nowrap ${badge.className}`}>{badge.label}</span>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Buyer + filing agent */}
                      <div className="md:w-1/3">
                        <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Buyer</p>
                        <p className="text-sm font-medium text-navy flex items-center gap-2 flex-wrap">
                          {sale.buyer?.name || '—'}
                          {sale.buyer?.user && (
                            <span
                              className="status-badge bg-sage-light text-sage"
                              title="Buyer has a registered account"
                            >
                              Registered
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-slate-muted mt-0.5">
                          {[sale.buyer?.phone, sale.buyer?.email].filter(Boolean).join(' · ') || 'No contact details'}
                        </p>
                        <p className="text-sm text-slate-muted mt-3">
                          Agent: <span className="text-navy font-medium">{sale.agent?.name || '—'}</span>
                        </p>
                      </div>

                      {/* Deal terms */}
                      <div className="md:w-1/3">
                        <p className="text-2xl font-display text-navy">{money(sale.agreedPrice)}</p>
                        <p className="text-xs text-slate-muted mt-0.5">List price {money(property.price)}</p>
                        {priceMismatch && (
                          <span
                            className="status-badge bg-brass/10 text-brass-dark mt-2 inline-block"
                            title="Agreed price differs from the list price"
                          >
                            ≠ list price
                          </span>
                        )}
                        <p className="text-sm text-navy mt-3">
                          {PAYMENT_LABELS[sale.paymentType] || sale.paymentType}
                        </p>
                        {downPayment !== null && downPayment !== undefined && (
                          <p className="text-xs text-slate-muted mt-0.5">Down payment {money(downPayment)}</p>
                        )}
                        <p className="text-xs text-slate-muted mt-3">Submitted {timeAgo(sale.submittedAt)}</p>
                      </div>

                      {/* Actions / review info */}
                      <div className="md:flex-1 flex flex-col md:items-end gap-2">
                        {isPending ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleVerify(sale)}
                              disabled={busyId === sale._id}
                              className="bg-sage text-white text-sm font-medium px-4 py-2 rounded-sm hover:bg-sage/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {busyId === sale._id ? 'Verifying...' : 'Verify'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openReject(sale)}
                              disabled={busyId === sale._id}
                              className="border border-brick text-brick text-sm font-medium px-4 py-2 rounded-sm hover:bg-brick-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              Reject
                            </button>
                          </>
                        ) : sale.status === 'verified' ? (
                          <p className="text-sm text-sage md:text-right">
                            Reviewed by <span className="font-medium">{sale.reviewedBy?.name || 'admin'}</span>
                            {sale.reviewedAt && <> on {new Date(sale.reviewedAt).toLocaleDateString()}</>}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {sale.remarks && (
                      <p className="text-sm italic text-slate-ink mt-4 border-t border-navy/5 pt-3">
                        “{sale.remarks}”
                      </p>
                    )}

                    {sale.status === 'rejected' && (
                      <div className="bg-brick-light border border-brick/20 rounded-sm px-4 py-3 mt-4 text-sm text-brick">
                        <span className="font-medium">Reason:</span> {sale.rejectionReason || '—'}
                        <span className="text-brick/80">
                          {' '}— reviewed by {sale.reviewedBy?.name || 'admin'}
                          {sale.reviewedAt ? ` on ${new Date(sale.reviewedAt).toLocaleDateString()}` : ''}
                        </span>
                      </div>
                    )}

                    {/* Inline rejection form for the pending sale being rejected */}
                    {isPending && rejectTarget?._id === sale._id && (
                      <div className="border-t border-navy/10 mt-4 pt-4">
                        <label className="label-field">Rejection reason *</label>
                        <textarea
                          rows={2}
                          autoFocus
                          placeholder="Tell the agent why this sale cannot be verified..."
                          className={`input-field ${rejectError ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                          value={rejectReason}
                          onChange={(e) => {
                            setRejectReason(e.target.value);
                            if (rejectError) setRejectError('');
                          }}
                        />
                        {rejectError && <p className="text-xs text-brick mt-1">{rejectError}</p>}
                        <div className="flex justify-end gap-3 mt-3">
                          <button type="button" onClick={closeReject} className="btn-secondary text-sm px-4 py-2">
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleRejectSubmit}
                            disabled={busyId === sale._id}
                            className="bg-brick text-white text-sm font-medium px-4 py-2 rounded-sm hover:bg-brick/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {busyId === sale._id ? 'Rejecting...' : 'Reject sale'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <p className="text-xs text-slate-muted">
              {pagination.total} sale{pagination.total === 1 ? '' : 's'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-navy px-2">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SalesVerification;
