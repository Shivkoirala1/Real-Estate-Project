import React, { useCallback, useEffect, useState } from 'react';
import { getSales, getSaleById } from '../../services/saleService';

// Status tab chips + badge colors (inline styles like LeadStatusBadge).
const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_META = {
  pending_review: { label: 'Pending Review', color: '#B8863B' }, // brass
  verified: { label: 'Verified', color: '#3C6E52' }, // sage
  rejected: { label: 'Rejected', color: '#A6472F' }, // brick
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

const PaymentTypeBadge = ({ type }) => (
  <span className="status-badge bg-navy/5 text-slate-ink px-2.5 py-1 text-[11px]">
    {PAYMENT_LABELS[type] || type || '—'}
  </span>
);

// ---------------- Detail modal ----------------

const SaleDetailModal = ({ saleId, onClose }) => {
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSaleById(saleId)
      .then((data) => {
        if (!cancelled) setSale(data.sale);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load sale details');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const showEmiNote = sale?.paymentType === 'emi' && sale?.status === 'verified';

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
            <p className="eyebrow mb-1">Sale Detail</p>
            <h2 className="text-xl">{sale?.property?.title || 'Sale'}</h2>
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
          <p className="px-6 py-12 text-center text-slate-muted">Loading sale details...</p>
        ) : error ? (
          <p className="px-6 py-12 text-center text-brick">{error}</p>
        ) : sale ? (
          <div className="px-6 py-5 space-y-5">
            {sale.status === 'rejected' && sale.rejectionReason && (
              <div className="bg-brick-light border border-brick/30 rounded-sm px-4 py-3 text-sm text-slate-ink">
                <span className="font-semibold text-brick">Rejected:</span> {sale.rejectionReason}
              </div>
            )}

            {showEmiNote && (
              <div className="bg-brass/10 border border-brass/30 rounded-sm px-4 py-3 text-sm text-slate-ink">
                This sale was paid via EMI — the <span className="font-medium text-navy">admin</span> initializes the buyer's installment plan after sale confirmation. Once created, the schedule (without amount details) appears under <span className="font-medium text-navy">EMI Sales</span>.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white border border-navy/10 rounded-sm p-4">
                <h3 className="font-semibold text-navy mb-3 text-sm">Buyer</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Name</dt>
                    <dd className="text-slate-ink text-right">{sale.buyer?.name || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Phone</dt>
                    <dd className="text-slate-ink text-right">{sale.buyer?.phone || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Email</dt>
                    <dd className="text-slate-ink text-right break-all">{sale.buyer?.email || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Account</dt>
                    <dd className="text-slate-ink text-right">
                      {sale.buyer?.user ? (
                        <span>
                          {sale.buyer.user.name}
                          <span className="text-sage text-xs"> (linked)</span>
                        </span>
                      ) : (
                        <span className="text-slate-muted">Guest</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="bg-white border border-navy/10 rounded-sm p-4">
                <h3 className="font-semibold text-navy mb-3 text-sm">Deal</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Agreed price</dt>
                    <dd className="text-slate-ink font-medium">{money(sale.agreedPrice)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Payment type</dt>
                    <dd>
                      <PaymentTypeBadge type={sale.paymentType} />
                    </dd>
                  </div>
                  {sale.downPaymentAmount != null && sale.downPaymentAmount > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-muted">Down payment</dt>
                      <dd className="text-slate-ink">{money(sale.downPaymentAmount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Agent</dt>
                    <dd className="text-slate-ink text-right">{sale.agent?.name || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Submitted</dt>
                    <dd className="text-slate-ink">
                      {sale.submittedAt ? new Date(sale.submittedAt).toLocaleDateString() : '—'}
                    </dd>
                  </div>
                  {sale.reviewedAt && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-muted">Reviewed</dt>
                      <dd className="text-slate-ink">
                        {new Date(sale.reviewedAt).toLocaleDateString()}
                        {sale.reviewedBy?.name ? ` by ${sale.reviewedBy.name}` : ''}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {sale.remarks && (
              <div className="bg-white border border-navy/10 rounded-sm p-4">
                <h3 className="font-semibold text-navy mb-2 text-sm">Remarks</h3>
                <p className="text-sm text-slate-ink whitespace-pre-wrap">{sale.remarks}</p>
              </div>
            )}

            <div className="bg-white border border-navy/10 rounded-sm p-4">
              <h3 className="font-semibold text-navy mb-3 text-sm">Activity</h3>
              {sale.activities?.length ? (
                <ol className="space-y-3">
                  {sale.activities.map((a, i) => {
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

// Agent's sale filings: submit -> admin verification -> verified/rejected.
const MySales = () => {

  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [counts, setCounts] = useState({ pending_review: 0, verified: 0, rejected: 0 });

  const [detailId, setDetailId] = useState(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 10 };
      if (statusFilter) params.status = statusFilter;
      params.sort = sort;
      const result = await getSales(params);
      setSales(result.sales || []);
      setPagination(result.pagination || null);
      if (result.countsByStatus) setCounts(result.countsByStatus);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load your sales');
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, sort]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const changeTab = (key) => {
    setStatusFilter(key);
    setPage(1);
  };

  const changeSort = (value) => {
    setSort(value);
    setPage(1);
  };

  const openDetail = (sale) => setDetailId(sale._id);
  const closeDetail = () => setDetailId(null);


  const totalCount = counts.pending_review + counts.verified + counts.rejected;
  const totalPages = pagination?.totalPages || 1;

  return (
    <div>
      <p className="eyebrow mb-2">Agent</p>
      <h1 className="text-3xl mb-8">My Sales</h1>

      {/* Status tabs */}
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
          aria-label="Sort sales"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="amount_desc">Amount: High→Low</option>
          <option value="amount_asc">Amount: Low→High</option>
        </select>
      </div>

      {loading ? (
        <div className="bg-white border border-navy/10 rounded-sm shadow-card p-10 text-center text-slate-muted">
          Loading your sales...
        </div>
      ) : error ? (
        <div className="bg-white border border-navy/10 rounded-sm shadow-card p-10 text-center">
          <p className="text-brick mb-4">{error}</p>
          <button onClick={loadSales} className="btn-secondary text-sm">
            Try again
          </button>
        </div>
      ) : sales.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm shadow-card p-10 text-center">
          <p className="text-slate-muted mb-2">
            {statusFilter
              ? `No ${STATUS_META[statusFilter]?.label.toLowerCase() || statusFilter} sales yet.`
              : 'No sales submitted yet.'}
          </p>
          <p className="text-xs text-slate-muted">
            Open a lead in the negotiation stage and use "Submit Sale" to file a deal for
            verification.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-navy/10 rounded-sm shadow-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-muted border-b border-navy/10">
                  <th className="px-5 py-3 font-semibold">Property</th>
                  <th className="px-5 py-3 font-semibold">Buyer</th>
                  <th className="px-5 py-3 font-semibold">Agreed Price</th>
                  <th className="px-5 py-3 font-semibold">Payment</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Reviewed</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/5">
                {sales.map((sale) => (
                  <React.Fragment key={sale._id}>
                    <tr
                      onClick={() => openDetail(sale)}
                      className="cursor-pointer hover:bg-parchment/40 transition-colors"
                    >
                      <td className="px-5 py-4 font-medium text-navy">
                        {sale.property?.title || '—'}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-ink">{sale.buyer?.name || '—'}</p>
                        {sale.buyer?.phone && (
                          <p className="text-xs text-slate-muted">{sale.buyer.phone}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-ink whitespace-nowrap">
                        {money(sale.agreedPrice)}
                      </td>
                      <td className="px-5 py-4">
                        <PaymentTypeBadge type={sale.paymentType} />
                      </td>
                      <td className="px-5 py-4 text-slate-muted whitespace-nowrap">
                        {sale.submittedAt ? new Date(sale.submittedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <SaleStatusBadge status={sale.status} />
                      </td>
                      <td className="px-5 py-4 text-slate-muted whitespace-nowrap">
                        {sale.reviewedAt ? new Date(sale.reviewedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(sale);
                          }}
                          className="text-xs text-brass hover:underline whitespace-nowrap"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                    {sale.status === 'rejected' && sale.rejectionReason && (
                      <tr>
                        <td colSpan={8} className="px-5 py-2">
                          <div className="bg-brick-light border border-brick/30 rounded-sm px-3 py-2 text-xs text-slate-ink">
                            <span className="font-semibold text-brick">Rejection reason:</span>{' '}
                            {sale.rejectionReason}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards */}
          <div className="md:hidden space-y-4">
            {sales.map((sale) => (
              <div
                key={sale._id}
                onClick={() => openDetail(sale)}
                className="bg-white border border-navy/10 rounded-sm p-5 shadow-card cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-navy">{sale.property?.title || '—'}</p>
                  <SaleStatusBadge status={sale.status} />
                </div>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Buyer</dt>
                    <dd className="text-slate-ink text-right">
                      {sale.buyer?.name || '—'}
                      {sale.buyer?.phone ? ` · ${sale.buyer.phone}` : ''}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Agreed price</dt>
                    <dd className="text-slate-ink">{money(sale.agreedPrice)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Payment</dt>
                    <dd>
                      <PaymentTypeBadge type={sale.paymentType} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Submitted</dt>
                    <dd className="text-slate-muted">
                      {sale.submittedAt ? new Date(sale.submittedAt).toLocaleDateString() : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-muted">Reviewed</dt>
                    <dd className="text-slate-muted">
                      {sale.reviewedAt ? new Date(sale.reviewedAt).toLocaleDateString() : '—'}
                    </dd>
                  </div>
                </dl>
                {sale.status === 'rejected' && sale.rejectionReason && (
                  <div className="mt-3 bg-brick-light border border-brick/30 rounded-sm px-3 py-2 text-xs text-slate-ink">
                    <span className="font-semibold text-brick">Rejection reason:</span>{' '}
                    {sale.rejectionReason}
                  </div>
                )}
                <div className="mt-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDetail(sale);
                    }}
                    className="text-xs text-brass hover:underline"
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.total > 0 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-xs text-slate-muted">
                Page {pagination.page} of {totalPages} · {pagination.total} sale
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

      {detailId && (
        <SaleDetailModal saleId={detailId} onClose={closeDetail} />
      )}
    </div>
  );
};

export default MySales;
