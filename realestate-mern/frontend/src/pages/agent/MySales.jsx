import React, { useCallback, useEffect, useState } from 'react';
import { getSales, getSaleById } from '../../services/saleService';
import { getRentals, getRental } from '../../services/rentalService';

// ------------------------------------------------------------------
// Deal-type configuration — services, labels, sort keys, and how a
// raw record maps onto the shared view model. One entry per deal type;
// the rest of the page is type-agnostic.
// ------------------------------------------------------------------
const DEAL_TYPES = {
  sale: {
    key: 'sale',
    label: 'Sales',
    listService: getSales,
    detailService: getSaleById,
    personLabel: 'Buyer',
    amountHeading: 'Agreed Price',
    emptyHint:
      'Open a lead in the negotiation stage and use "Submit Sale" to file a deal for verification.',
    sorts: [
      { value: 'newest', label: 'Newest' },
      { value: 'oldest', label: 'Oldest' },
      { value: 'amount_desc', label: 'Amount: High→Low' },
      { value: 'amount_asc', label: 'Amount: Low→High' },
    ],
    // Extract the common shape + type-specific "terms" rows
    normalize: (d) => ({
      _id: d._id,
      status: d.status,
      propertyTitle: d.property?.title,
      personName: d.buyer?.name,
      personPhone: d.buyer?.phone,
      amount: d.agreedPrice,
      amountSuffix: '',
      submittedAt: d.submittedAt,
      reviewedAt: d.reviewedAt,
      badges: [{ label: PAYMENT_LABELS[d.paymentType] || d.paymentType, kind: 'payment' }],
      terms: [
        { label: 'Agreed price', value: money(d.agreedPrice), strong: true },
        d.paymentType && { label: 'Payment type', value: PAYMENT_LABELS[d.paymentType] || d.paymentType },
        d.downPaymentAmount != null && d.downPaymentAmount > 0 && {
          label: 'Down payment', value: money(d.downPaymentAmount),
        },
      ].filter(Boolean),
    }),
  },
  rental: {
    key: 'rental',
    label: 'Rentals',
    listService: getRentals,
    detailService: getRental,
    personLabel: 'Tenant',
    amountHeading: 'Monthly Rent',
    emptyHint:
      'Open a lead on a rent-listed property in the negotiation stage and use "File Rental" to submit the lease for verification.',
    sorts: [
      { value: 'newest', label: 'Newest' },
      { value: 'oldest', label: 'Oldest' },
      { value: 'rent_desc', label: 'Rent: High→Low' },
      { value: 'rent_asc', label: 'Rent: Low→High' },
    ],
    normalize: (d) => ({
      _id: d._id,
      status: d.status,
      propertyTitle: d.property?.title,
      personName: d.tenant?.name,
      personPhone: d.tenant?.phone,
      amount: d.monthlyRent,
      amountSuffix: '/mo',
      submittedAt: d.submittedAt,
      reviewedAt: d.reviewedAt,
      badges: [],
      terms: [
        { label: 'Monthly rent', value: money(d.monthlyRent), strong: true },
        { label: 'Duration', value: `${d.durationInMonths ?? '—'} months` },
        {
          label: 'Total lease value',
          value: money((d.monthlyRent || 0) * (d.durationInMonths || 0)),
        },
        d.securityDeposit > 0 && { label: 'Security deposit', value: money(d.securityDeposit) },
      ].filter(Boolean),
    }),
  },
};

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_META = {
  pending_review: { label: 'Pending Review', color: '#B8863B' }, // brass
  verified: { label: 'Verified', color: '#3C6E52' },             // sage
  rejected: { label: 'Rejected', color: '#A6472F' },             // brick
};

const PAYMENT_LABELS = {
  full_payment: 'Full Payment',
  emi: 'EMI',
  bank_loan: 'Bank Loan',
};

const ACTIVITY_COLORS = {
  submitted: '#B8863B',
  resubmitted: '#1B3B52',
  verified: '#3C6E52',
  rejected: '#A6472F',
  note_added: '#6B7A82',
  updated: '#6B7A82',
};

const money = (value) => `NPR ${Number(value || 0).toLocaleString()}`;

const SaleStatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || { label: status || 'Unknown', color: '#6B7A82' };
  return (
    <span
      className="status-badge inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px]"
      style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
};

const InfoBadge = ({ label }) => (
  <span className="status-badge bg-navy/5 text-slate-ink px-2.5 py-1 text-[11px]">{label}</span>
);

// ---------------- Detail modal (both deal types) ----------------

const DealDetailModal = ({ type, dealId, onClose }) => {
  const [deal, setDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cfg = DEAL_TYPES[type] || DEAL_TYPES.sale;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    cfg.detailService(dealId)
      .then((data) => {
        if (!cancelled) setDeal(data.sale || data.rental);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load details');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg, dealId]);

  const view = deal ? cfg.normalize(deal) : null;
  const showEmiNote = type === 'sale' && deal?.paymentType === 'emi' && deal?.status === 'verified';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-dark/60"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-sm shadow-lifted max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-navy/10 sticky top-0 bg-white">
          <div>
            <p className="eyebrow mb-1">
              {cfg.label.replace(/s$/, '')} Detail
            </p>
            <h2 className="text-xl">{view?.propertyTitle || 'Loading...'}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-muted hover:text-navy text-xl leading-none p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="px-6 py-12 text-center text-slate-muted">Loading details...</p>
        ) : error ? (
          <p className="px-6 py-12 text-center text-brick">{error}</p>
        ) : view ? (
          <div className="px-6 py-5 space-y-5">
            {deal.status === 'rejected' && deal.rejectionReason && (
              <div className="bg-brick-light border border-brick/30 rounded-sm px-4 py-3 text-sm text-slate-ink">
                <span className="font-semibold text-brick">Rejected:</span> {deal.rejectionReason}
              </div>
            )}

            {showEmiNote && (
              <div className="bg-brass/10 border border-brass/30 rounded-sm px-4 py-3 text-sm text-slate-ink">
                This sale was paid via EMI — the <span className="font-medium text-navy">admin</span> initializes
                the buyer's installment plan after sale confirmation. Once created, the schedule (without amount
                details) appears under <span className="font-medium text-navy">EMI Sales</span>.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Person (buyer/tenant) */}
              <div className="bg-white border border-navy/10 rounded-sm p-4">
                <h3 className="font-semibold text-navy mb-3 text-sm">{cfg.personLabel}</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Name</dt>
                    <dd className="text-slate-ink text-right">{view.personName || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Phone</dt>
                    <dd className="text-slate-ink text-right">{deal[type === 'rental' ? 'tenant' : 'buyer']?.phone || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Email</dt>
                    <dd className="text-slate-ink text-right break-all">
                      {deal[type === 'rental' ? 'tenant' : 'buyer']?.email || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Account</dt>
                    <dd className="text-slate-ink text-right">
                      {deal[type === 'rental' ? 'tenant' : 'buyer']?.user ? (
                        <span>
                          {deal[type === 'rental' ? 'tenant' : 'buyer'].user.name}
                          <span className="text-sage text-xs"> (linked)</span>
                        </span>
                      ) : (
                        <span className="text-slate-muted">Guest</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Deal terms — type-driven rows */}
              <div className="bg-white border border-navy/10 rounded-sm p-4">
                <h3 className="font-semibold text-navy mb-3 text-sm">Deal</h3>
                <dl className="space-y-2 text-sm">
                  {view.terms.map((t) => (
                    <div key={t.label} className="flex justify-between gap-3">
                      <dt className="text-slate-muted">{t.label}</dt>
                      <dd className={`text-right ${t.strong ? 'text-slate-ink font-medium' : 'text-slate-ink'}`}>
                        {t.value}
                      </dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Agent</dt>
                    <dd className="text-slate-ink text-right">{deal.agent?.name || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Submitted</dt>
                    <dd className="text-slate-ink">
                      {deal.submittedAt ? new Date(deal.submittedAt).toLocaleDateString() : '—'}
                    </dd>
                  </div>
                  {deal.reviewedAt && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-muted">Reviewed</dt>
                      <dd className="text-slate-ink">
                        {new Date(deal.reviewedAt).toLocaleDateString()}
                        {deal.reviewedBy?.name ? ` by ${deal.reviewedBy.name}` : ''}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {deal.remarks && (
              <div className="bg-white border border-navy/10 rounded-sm p-4">
                <h3 className="font-semibold text-navy mb-2 text-sm">Remarks</h3>
                <p className="text-sm text-slate-ink whitespace-pre-wrap">{deal.remarks}</p>
              </div>
            )}

            {/* Activity timeline — identical shape on both models */}
            <div className="bg-white border border-navy/10 rounded-sm p-4">
              <h3 className="font-semibold text-navy mb-3 text-sm">Activity</h3>
              {deal.activities?.length ? (
                <ol className="space-y-3">
                  {deal.activities.map((a, i) => {
                    const color = ACTIVITY_COLORS[a.type] || '#6B7A82';
                    return (
                      <li key={i} className="flex gap-3 text-sm">
                        <span
                          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <div>
                          <p className="text-slate-ink">{a.message}</p>
                          <p className="text-xs text-slate-muted mt-0.5">
                            <span className="uppercase tracking-wider" style={{ color }}>
                              {String(a.type || 'updated').replace(/_/g, ' ')}
                            </span>{' '}
                            · {a.byName || 'System'} ·{' '}
                            {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-slate-muted">No activity recorded yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ---------------- Page ----------------

// Agent's filings across both deal types:
// submit -> admin verification -> verified / rejected.
const MyDeals = () => {
  const [type, setType] = useState('sale'); // 'sale' | 'rental'
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [counts, setCounts] = useState({ pending_review: 0, verified: 0, rejected: 0 });

  const [detail, setDetail] = useState(null); // { type, dealId }

  const cfg = DEAL_TYPES[type];

  // Switching type invalidates page/sort/selection — sort keys differ per type
  const changeType = (next) => {
    if (next === type) return;
    setType(next);
    setStatusFilter('');
    setSort('newest');
    setPage(1);
    setCounts({ pending_review: 0, verified: 0, rejected: 0 });
  };

  const loadDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 10, sort };
      if (statusFilter) params.status = statusFilter;
      const result = await cfg.listService(params);
      // Both services return their own key; pick whichever exists
      setDeals(result.sales || result.rentals || []);
      setPagination(result.pagination || null);
      if (result.countsByStatus) setCounts(result.countsByStatus);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to load your ${cfg.label.toLowerCase()}`);
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [cfg, statusFilter, page, sort]);

  useEffect(() => {
    loadDeals();
  }, [loadDeals]);

  const changeTab = (key) => {
    setStatusFilter(key);
    setPage(1);
  };

  const changeSort = (value) => {
    setSort(value);
    setPage(1);
  };

  const openDetail = (deal) => setDetail({ type, dealId: deal._id });
  const closeDetail = () => setDetail(null);

  const totalCount = counts.pending_review + counts.verified + counts.rejected;
  const totalPages = pagination?.totalPages || 1;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow mb-2">Agent</p>
          <h1 className="text-3xl">My Deals</h1>
          <p className="text-sm text-slate-muted mt-1">
            Sales and rental filings — track their verification status here
          </p>
        </div>

        {/* Deal type toggle */}
        <div className="grid grid-cols-2 gap-1 bg-parchment rounded-sm p-1">
          {Object.values(DEAL_TYPES).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => changeType(t.key)}
              className={`text-sm font-medium px-5 py-2 rounded-sm transition-colors ${
                type === t.key ? 'bg-white text-navy shadow-sm' : 'text-slate-muted hover:text-navy'
              }`}
            >
              My {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status tabs + sort (sort options are type-specific) */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_TABS.map((tab) => {
          const count = tab.key === '' ? totalCount : counts[tab.key] || 0;
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key || 'all'}
              onClick={() => changeTab(tab.key)}
              className={`px-4 py-2 rounded-sm text-sm font-medium border transition-colors ${
                active
                  ? 'bg-navy text-ivory border-navy'
                  : 'bg-white text-slate-ink border-navy/10 hover:border-navy/40'
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-xs ${active ? 'text-brass-light' : 'text-slate-muted'}`}>
                {count}
              </span>
            </button>
          );
        })}
        <select
          className="input-field sm:w-48"
          value={sort}
          onChange={(e) => changeSort(e.target.value)}
          aria-label={`Sort ${cfg.label.toLowerCase()}`}
        >
          {cfg.sorts.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="bg-white border border-navy/10 rounded-sm shadow-card p-10 text-center text-slate-muted">
          Loading your {cfg.label.toLowerCase()}...
        </div>
      ) : error ? (
        <div className="bg-white border border-navy/10 rounded-sm shadow-card p-10 text-center">
          <p className="text-brick mb-4">{error}</p>
          <button onClick={loadDeals} className="btn-secondary text-sm">
            Try again
          </button>
        </div>
      ) : deals.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm shadow-card p-10 text-center">
          <p className="text-slate-muted mb-2">
            {statusFilter
              ? `No ${STATUS_META[statusFilter]?.label.toLowerCase() || statusFilter} ${cfg.label.toLowerCase()} yet.`
              : `No ${cfg.label.toLowerCase()} submitted yet.`}
          </p>
          <p className="text-xs text-slate-muted">{cfg.emptyHint}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-navy/10 rounded-sm shadow-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-muted border-b border-navy/10">
                  <th className="px-5 py-3 font-semibold">Property</th>
                  <th className="px-5 py-3 font-semibold">{cfg.personLabel}</th>
                  <th className="px-5 py-3 font-semibold">{cfg.amountHeading}</th>
                  <th className="px-5 py-3 font-semibold">Terms</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Reviewed</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/5">
                {deals.map((raw) => {
                  const deal = cfg.normalize(raw);
                  return (
                    <React.Fragment key={deal._id}>
                      <tr
                        onClick={() => openDetail(raw)}
                        className="cursor-pointer hover:bg-parchment/40 transition-colors"
                      >
                        <td className="px-5 py-4 font-medium text-navy">
                          {deal.propertyTitle || '—'}
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-slate-ink">{deal.personName || '—'}</p>
                          {deal.personPhone && (
                            <p className="text-xs text-slate-muted">{deal.personPhone}</p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-ink whitespace-nowrap">
                          {money(deal.amount)}
                          {deal.amountSuffix && (
                            <span className="text-xs text-slate-muted">{deal.amountSuffix}</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {deal.badges.length > 0 ? (
                              deal.badges.map((b) => <InfoBadge key={b.label} label={b.label} />)
                            ) : (
                              <span className="text-xs text-slate-muted">
                                {cfg.key === 'rental'
                                  ? `${raw.durationInMonths ?? '—'} mo lease`
                                  : '—'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-muted whitespace-nowrap">
                          {deal.submittedAt ? new Date(deal.submittedAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-5 py-4">
                          <SaleStatusBadge status={deal.status} />
                        </td>
                        <td className="px-5 py-4 text-slate-muted whitespace-nowrap">
                          {deal.reviewedAt ? new Date(deal.reviewedAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(raw);
                            }}
                            className="text-xs text-brass hover:underline whitespace-nowrap"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                      {deal.status === 'rejected' && raw.rejectionReason && (
                        <tr>
                          <td colSpan={8} className="px-5 py-2">
                            <div className="bg-brick-light border border-brick/30 rounded-sm px-3 py-2 text-xs text-slate-ink">
                              <span className="font-semibold text-brick">Rejection reason:</span>{' '}
                              {raw.rejectionReason}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-4">
            {deals.map((raw) => {
              const deal = cfg.normalize(raw);
              return (
                <div
                  key={deal._id}
                  onClick={() => openDetail(raw)}
                  className="bg-white border border-navy/10 rounded-sm p-5 shadow-card cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-navy">{deal.propertyTitle || '—'}</p>
                    <SaleStatusBadge status={deal.status} />
                  </div>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-muted">{cfg.personLabel}</dt>
                      <dd className="text-slate-ink text-right">
                        {deal.personName || '—'}
                        {deal.personPhone ? ` · ${deal.personPhone}` : ''}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-muted">{cfg.amountHeading}</dt>
                      <dd className="text-slate-ink">
                        {money(deal.amount)}
                        {deal.amountSuffix}
                      </dd>
                    </div>
                    {deal.terms
                      .filter((t) => !t.strong)
                      .slice(0, 2)
                      .map((t) => (
                        <div key={t.label} className="flex justify-between gap-3">
                          <dt className="text-slate-muted">{t.label}</dt>
                          <dd className="text-slate-ink">{t.value}</dd>
                        </div>
                      ))}
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-muted">Submitted</dt>
                      <dd className="text-slate-muted">
                        {deal.submittedAt ? new Date(deal.submittedAt).toLocaleDateString() : '—'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-muted">Reviewed</dt>
                      <dd className="text-slate-muted">
                        {deal.reviewedAt ? new Date(deal.reviewedAt).toLocaleDateString() : '—'}
                      </dd>
                    </div>
                  </dl>
                  {deal.status === 'rejected' && raw.rejectionReason && (
                    <div className="mt-3 bg-brick-light border border-brick/30 rounded-sm px-3 py-2 text-xs text-slate-ink">
                      <span className="font-semibold text-brick">Rejection reason:</span>{' '}
                      {raw.rejectionReason}
                    </div>
                  )}
                  <div className="mt-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(raw);
                      }}
                      className="text-xs text-brass hover:underline"
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination && pagination.total > 0 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-xs text-slate-muted">
                Page {pagination.page} of {totalPages} · {pagination.total}{' '}
                {cfg.label.toLowerCase().replace(/s$/, '')}
                {pagination.total === 1 ? '' : 's'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {detail && (
        <DealDetailModal type={detail.type} dealId={detail.dealId} onClose={closeDetail} />
      )}
    </div>
  );
};

export default MyDeals;