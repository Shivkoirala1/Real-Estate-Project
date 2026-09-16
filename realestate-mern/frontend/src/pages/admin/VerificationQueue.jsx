import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getSales, verifySale, rejectSale } from '../../services/saleService';
import { getRentals, verifyRental, rejectRental } from '../../services/rentalService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { timeAgo } from '../../utils/format';

const PAGE_SIZE = 10;

// ------------------------------------------------------------------
// Deal-type configuration — the single place that knows how the two
// flows differ. Adding a third deal type later means adding an entry
// here and a service, not rewriting the page.
// ------------------------------------------------------------------
const DEAL_TYPES = {
  sale: {
    label: 'Sales',
    service: { list: getSales, verify: verifySale, reject: rejectSale },
    personLabel: 'Buyer',
    amountLabel: 'Agreed price',
    sorts: [
      { value: 'newest', label: 'Newest' },
      { value: 'oldest', label: 'Oldest' },
      { value: 'amount_desc', label: 'Amount: High→Low' },
      { value: 'amount_asc', label: 'Amount: Low→High' },
    ],
    // Normalize a raw API record into the common view model
    normalize: (d) => ({
      _id: d._id,
      status: d.status,
      property: d.property,
      agent: d.agent,
      submittedAt: d.submittedAt,
      reviewedBy: d.reviewedBy,
      reviewedAt: d.reviewedAt,
      rejectionReason: d.rejectionReason,
      remarks: d.remarks,
      person: d.buyer,
      headline: `NPR ${Number(d.agreedPrice || 0).toLocaleString()}`,
      subLines: [
        { text: `List price NPR ${Number(d.property?.price || 0).toLocaleString()}`, muted: true },
        d.paymentType && {
          text: SALE_PAYMENT_LABELS[d.paymentType] || d.paymentType,
          badge: d.paymentType !== 'full_payment',
        },
        d.downPaymentAmount != null && { text: `Down payment NPR ${Number(d.downPaymentAmount).toLocaleString()}`, muted: true },
      ].filter(Boolean),
      // A pending EMI sale gets the post-verify EMI follow-up
      emiSale: d.paymentType === 'emi',
      metaChips: buildSaleChips(d),
    }),
  },
  rental: {
    label: 'Rentals',
    service: { list: getRentals, verify: verifyRental, reject: rejectRental },
    personLabel: 'Tenant',
    amountLabel: 'Monthly rent',
    sorts: [
      { value: 'newest', label: 'Newest' },
      { value: 'oldest', label: 'Oldest' },
      { value: 'rent_desc', label: 'Rent: High→Low' },
      { value: 'rent_asc', label: 'Rent: Low→High' },
    ],
    normalize: (d) => ({
      _id: d._id,
      status: d.status,
      property: d.property,
      agent: d.agent,
      submittedAt: d.submittedAt,
      reviewedBy: d.reviewedBy,
      reviewedAt: d.reviewedAt,
      rejectionReason: d.rejectionReason,
      remarks: d.remarks,
      person: d.tenant,
      headline: `NPR ${Number(d.monthlyRent || 0).toLocaleString()}`,
      headlineSuffix: '/mo',
      subLines: [
        {
          text: `Lease value NPR ${Number((d.monthlyRent || 0) * (d.durationInMonths || 0)).toLocaleString()} (${d.durationInMonths || '—'} months)`,
          strong: true,
        },
        d.securityDeposit > 0 && { text: `Deposit NPR ${Number(d.securityDeposit).toLocaleString()}`, muted: true },
      ].filter(Boolean),
      emiSale: false,
      metaChips: [],
    }),
  },
};

const SALE_PAYMENT_LABELS = {
  full_payment: 'Full Payment',
  emi: 'EMI',
  bank_loan: 'Bank Loan',
};

// Cross-cutting review chips for sales (misprice, EMI, registered buyer)
function buildSaleChips(d) {
  const chips = [];
  if (Math.abs(Number(d.agreedPrice || 0) - Number(d.property?.price || 0)) > 0) {
    chips.push({ label: '≠ list price', className: 'bg-brass/10 text-brass-dark', title: 'Agreed price differs from the list price' });
  }
  return chips;
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_BADGES = {
  pending_review: { label: 'Pending Review', className: 'bg-brass/10 text-brass-dark' },
  verified: { label: 'Verified', className: 'bg-sage-light text-sage' },
  rejected: { label: 'Rejected', className: 'bg-brick-light text-brick' },
};

const money = (x) => `NPR ${Number(x || 0).toLocaleString()}`;

// ------------------------------------------------------------------
// Admin verification queue — handles BOTH sale and rental filings.
// The deal type lives in the URL (?type=sale|rental) so links from
// dashboards/notifications land on the right tab directly.
// ------------------------------------------------------------------
const VerificationQueue = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL is the source of truth — shareable, back-button friendly
  const type = DEAL_TYPES[searchParams.get('type')] ? searchParams.get('type') : 'sale';
  const status = searchParams.get('status') || '';
  const agentFilter = searchParams.get('agent') || '';

  const [deals, setDeals] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [busyId, setBusyId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  const activeType = DEAL_TYPES[type];

  // Reset page/sort when the deal type flips — sort keys differ per type
  useEffect(() => {
    setPage(1);
    setSort('newest');
  }, [type]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await activeType.service.list({
        status: status || undefined,
        agent: agentFilter || undefined,
        page,
        limit: PAGE_SIZE,
        sort,
      });
      const nextTotalPages = data.pagination?.totalPages || 1;
      // Reviewing the last item of the last page can leave us on a phantom
      // page - snap back to page 1 instead of showing a false empty state.
      if (page > 1 && (data.rentals || data.sales || []).length === 0 && nextTotalPages < page) {
        setPage(1);
        return;
      }
      setDeals(data.rentals || data.sales || []);
      setCounts(data.countsByStatus || {});
      setPagination(data.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || `Failed to load ${type} records`);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [activeType, status, agentFilter, page, sort, type]);

  useEffect(() => {
    load();
  }, [load]);

  // --- URL-param helpers ---
  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const handleTypeChange = (value) => {
    setParam('type', value === 'sale' ? null : value); // sale is the default, no param needed
    setRejectTarget(null);
  };
  const handleStatusChange = (value) => {
    setParam('status', value);
    setPage(1);
    setRejectTarget(null);
  };
  const handleSortChange = (value) => {
    setSort(value);
    setPage(1);
  };
  const clearAgentFilter = () => {
    setParam('agent', null);
    setPage(1);
  };

  // --- Actions ---
  const openReject = (deal) => {
    setRejectTarget(deal);
    setRejectReason('');
    setRejectError('');
  };
  const closeReject = () => {
    setRejectTarget(null);
    setRejectReason('');
    setRejectError('');
  };

  const handleVerify = async (deal) => {
    const isRental = type === 'rental';
    const ok = await confirm({
      title: isRental ? 'Verify this rental?' : 'Verify this sale?',
      message: isRental
        ? `"${deal.property?.title || 'This property'}" will be marked rented, lead "${deal.person?.name || 'the lead'}" will be closed and the agent's commission recorded. This cannot be undone.`
        : `"${deal.property?.title || 'This property'}" will be marked sold, lead "${deal.person?.name || 'the lead'}" will be closed and the agent's commission recorded. This cannot be undone.`,
      confirmLabel: isRental ? 'Verify rental' : 'Verify sale',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    setBusyId(deal._id);
    try {
      const data = await activeType.service.verify(deal._id);
      showToast(
        isRental
          ? 'Rental verified — property marked rented, lead closed, commission recorded'
          : 'Sale verified — property marked sold, lead closed, commission recorded',
      );
      closeReject();
      load();

      // EMI follow-up is sale-only
      if (data.commission?.requiresEmiPlan) {
        const initNow = await confirm({
          title: 'EMI sale verified',
          message: `"${deal.property?.title || 'This property'}" was paid via EMI. Initialize the buyer's installment plan now?`,
          confirmLabel: 'Initialize EMI plan',
          cancelLabel: 'Later',
        });
        if (initNow) navigate(`/dashboard/admin/emi-plans?new=${deal._id}`);
      }
    } catch (err) {
      showToast(err.response?.data?.message || `Failed to verify ${type}`, 'error');
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
      await activeType.service.reject(rejectTarget._id, rejectReason.trim());
      showToast(
        type === 'rental'
          ? 'Rental rejected — property returned to available, lead returned to negotiation'
          : 'Sale rejected — property returned to available, lead returned to negotiation',
      );
      closeReject();
      load();
    } catch (err) {
      showToast(err.response?.data?.message || `Failed to reject ${type}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const allCount = (counts.pending_review || 0) + (counts.verified || 0) + (counts.rejected || 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Admin</p>
          <h1 className="text-3xl mb-1">Verification Queue</h1>
          <p className="text-sm text-slate-muted">Agent-filed sales &amp; rentals awaiting your sign-off</p>
        </div>

        {/* Deal type toggle — the primary switch, visually stronger than filters */}
        <div className="grid grid-cols-2 gap-1 bg-parchment rounded-sm p-1">
          {Object.entries(DEAL_TYPES).map(([value, cfg]) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTypeChange(value)}
              className={`text-sm font-medium px-5 py-2 rounded-sm transition-colors ${
                type === value ? 'bg-white text-navy shadow-sm' : 'text-slate-muted hover:text-navy'
              }`}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status filter chips + sort */}
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
          aria-label={`Sort ${type} records`}
        >
          {activeType.sorts.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Agent drill-down chip (from ManageAgents) */}
      {agentFilter && (
        <div className="flex items-center gap-2 mb-4">
          <span className="status-badge bg-brass/10 text-brass-dark inline-flex items-center gap-1.5">
            Filtered by agent
            <button type="button" onClick={clearAgentFilter} aria-label="Clear agent filter" className="hover:text-brick transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {loading ? (
        <div>
          <p className="text-sm text-slate-muted mb-4">Loading {activeType.label.toLowerCase()}...</p>
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
          <button type="button" onClick={load} className="underline underline-offset-2">Try again</button>
        </div>
      ) : deals.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center shadow-card">
          <p className="text-slate-muted">No {activeType.label.toLowerCase()} in this view.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {deals.map((raw) => {
              const deal = activeType.normalize(raw);
              const badge = STATUS_BADGES[deal.status] || STATUS_BADGES.pending_review;
              const isPending = deal.status === 'pending_review';

              return (
                <div
                  key={deal._id}
                  className={`bg-white border border-navy/10 rounded-sm shadow-card ${
                    deal.status === 'verified' ? 'border-l-4 border-l-sage' : ''
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to="/dashboard/admin/properties"
                          className="font-medium text-navy hover:text-brass transition-colors"
                        >
                          {deal.property?.title || 'Untitled property'}
                        </Link>
                        <span className="status-badge bg-navy/5 text-navy text-xs">
                          {type === 'rental' ? 'Rent' : 'Sale'}
                        </span>
                        {deal.metaChips.map((chip) => (
                          <span key={chip.label} className={`status-badge ${chip.className}`} title={chip.title}>
                            {chip.label}
                          </span>
                        ))}
                      </div>
                      <span className={`status-badge whitespace-nowrap ${badge.className}`}>{badge.label}</span>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Tenant/Buyer + filing agent */}
                      <div className="md:w-1/3">
                        <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">{activeType.personLabel}</p>
                        <p className="text-sm font-medium text-navy flex items-center gap-2 flex-wrap">
                          {deal.person?.name || '—'}
                          {deal.person?.user && (
                            <span className="status-badge bg-sage-light text-sage" title="Has a registered account">
                              Registered
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-slate-muted mt-0.5">
                          {[deal.person?.phone, deal.person?.email].filter(Boolean).join(' · ') || 'No contact details'}
                        </p>
                        <p className="text-sm text-slate-muted mt-3">
                          Agent: <span className="text-navy font-medium">{deal.agent?.name || '—'}</span>
                        </p>
                      </div>

                      {/* Deal terms — driven by the normalized view model */}
                      <div className="md:w-1/3">
                        <p className="text-2xl font-display text-navy">
                          {deal.headline}
                          {deal.headlineSuffix && (
                            <span className="text-sm font-body text-slate-muted">{deal.headlineSuffix}</span>
                          )}
                        </p>
                        {deal.subLines.map((line, i) => (
                          <p
                            key={i}
                            className={`${line.muted ? 'text-xs text-slate-muted' : 'text-sm text-navy'} ${i === 0 ? 'mt-0.5' : 'mt-1'}`}
                          >
                            {line.text}
                          </p>
                        ))}
                        <p className="text-xs text-slate-muted mt-3">Submitted {timeAgo(deal.submittedAt)}</p>
                      </div>

                      {/* Actions / review info */}
                      <div className="md:flex-1 flex flex-col md:items-end gap-2">
                        {isPending ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleVerify(raw)}
                              disabled={busyId === deal._id}
                              className="bg-sage text-white text-sm font-medium px-4 py-2 rounded-sm hover:bg-sage/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {busyId === deal._id ? 'Verifying...' : 'Verify'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openReject(deal)}
                              disabled={busyId === deal._id}
                              className="border border-brick text-brick text-sm font-medium px-4 py-2 rounded-sm hover:bg-brick-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              Reject
                            </button>
                          </>
                        ) : deal.status === 'verified' ? (
                          <p className="text-sm text-sage md:text-right">
                            Reviewed by <span className="font-medium">{deal.reviewedBy?.name || 'admin'}</span>
                            {deal.reviewedAt && <> on {new Date(deal.reviewedAt).toLocaleDateString()}</>}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {deal.remarks && (
                      <p className="text-sm italic text-slate-ink mt-4 border-t border-navy/5 pt-3">“{deal.remarks}”</p>
                    )}

                    {deal.status === 'rejected' && (
                      <div className="bg-brick-light border border-brick/20 rounded-sm px-4 py-3 mt-4 text-sm text-brick">
                        <span className="font-medium">Reason:</span> {deal.rejectionReason || '—'}
                        <span className="text-brick/80">
                          {' '}— reviewed by {deal.reviewedBy?.name || 'admin'}
                          {deal.reviewedAt ? ` on ${new Date(deal.reviewedAt).toLocaleDateString()}` : ''}
                        </span>
                      </div>
                    )}

                    {/* Inline rejection form */}
                    {isPending && rejectTarget?._id === deal._id && (
                      <div className="border-t border-navy/10 mt-4 pt-4">
                        <label className="label-field">Rejection reason *</label>
                        <textarea
                          rows={2}
                          autoFocus
                          placeholder={`Tell the agent why this ${type} cannot be verified...`}
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
                            disabled={busyId === deal._id}
                            className="bg-brick text-white text-sm font-medium px-4 py-2 rounded-sm hover:bg-brick/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {busyId === deal._id ? 'Rejecting...' : `Reject ${type}`}
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
              {pagination.total} record{pagination.total === 1 ? '' : 's'}
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
              <span className="text-sm text-navy px-2">{pagination.page} / {pagination.totalPages}</span>
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

export default VerificationQueue;