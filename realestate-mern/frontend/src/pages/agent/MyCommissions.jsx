import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/axios';
import { imageUrl } from '../../utils/format';

const PAGE_SIZE = 10;

const STATUS_FILTERS = [
  ['all', 'All'],
  ['paid', 'Paid'],
  ['pending', 'Pending'],
];

const npr = (x) => `NPR ${Number(x ?? 0).toLocaleString()}`;

// Agent view of their commission ledger - one flat list of CommissionRecords
// generated automatically when an admin verifies one of their sales.
const MyCommissions = () => {
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  // null while loading (or if the request fails) - the stat cards show '—'
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params = { page, limit: PAGE_SIZE };
        if (statusFilter === 'paid') params.isPaid = 'true';
        if (statusFilter === 'pending') params.isPaid = 'false';
        params.sort = sort;
        const res = await api.get('/commissions', { params });
        if (cancelled) return;
        setCommissions(res.data?.commissions || []);
        setPagination(res.data?.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.message || 'Failed to load commissions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, page, sort]);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/commissions/summary')
      .then((res) => {
        if (!cancelled) setSummary(res.data?.summary || null);
      })
      .catch((err) => console.error('Failed to load commission summary:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const changeFilter = (key) => {
    if (key === statusFilter) return;
    setStatusFilter(key);
    setPage(1);
  };

  const goToPage = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) setPage(newPage);
  };

  const summaryCards = [
    ['This Month Earned', summary?.thisMonthEarned],
    ['Pending', summary?.pending],
    ['Lifetime Paid', summary?.lifetimePaid],
  ];

  return (
    <div>
      <p className="eyebrow mb-2">Agent</p>
      <h1 className="text-3xl mb-8">My Commissions</h1>

      {/* Mini earnings summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {summaryCards.map(([label, value]) => (
          <div key={label} className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">{label}</p>
            <p className={`text-xl sm:text-2xl font-display ${label === 'Pending' ? 'text-brass-dark' : 'text-navy'}`}>
              {summary ? npr(value) : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* Status filter chips + sort */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STATUS_FILTERS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => changeFilter(key)}
            className={`text-sm px-4 py-2 rounded-sm border ${
              statusFilter === key ? 'bg-navy text-ivory border-navy' : 'border-navy/15 text-navy'
            }`}
          >
            {label}
          </button>
        ))}
        <select
          className="input-field sm:w-48"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
          aria-label="Sort commissions"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="amount_desc">Amount: High→Low</option>
          <option value="amount_asc">Amount: Low→High</option>
        </select>
      </div>

      {error && <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm mb-6">{error}</div>}

      {loading ? (
        <p className="text-slate-muted">Loading commissions...</p>
      ) : commissions.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center">
          <p className="text-slate-muted">
            No commissions yet — they appear automatically when an admin verifies one of your sales.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                  <th className="px-5 py-3">Property</th>
                  <th className="px-5 py-3">Sale Amount</th>
                  <th className="px-5 py-3">Commission %</th>
                  <th className="px-5 py-3">Commission Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Paid date</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((c) => (
                  <tr key={c._id} className="border-b border-navy/5 last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={imageUrl(c.property?.media?.coverImage)}
                          className="w-10 h-10 rounded-sm object-cover flex-shrink-0"
                          alt={c.property?.title || 'Property'}
                        />
                        {c.property?.slug ? (
                          <Link
                            to={`/properties/${c.property.slug}`}
                            className="font-medium text-navy hover:text-brass"
                          >
                            {c.property?.title || 'Untitled property'}
                          </Link>
                        ) : (
                          <span className="font-medium text-navy">{c.property?.title || 'Untitled property'}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-ink">{npr(c.saleAmount)}</td>
                    <td className="px-5 py-3 text-slate-ink">{Number(c.commissionPercentage ?? 0)}%</td>
                    <td className="px-5 py-3 font-medium text-navy">{npr(c.commissionAmount)}</td>
                    <td className="px-5 py-3">
                      <span className={`status-badge ${c.isPaid ? 'bg-sage-light text-sage' : 'bg-brass-light text-brass-dark'}`}>
                        {c.isPaid ? 'Paid' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-ink">
                      {c.isPaid && c.paidAt ? new Date(c.paidAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-5">
            <p className="text-xs text-slate-muted">
              Showing{' '}
              {pagination.total === 0 ? 0 : (pagination.page - 1) * (pagination.limit || PAGE_SIZE) + 1}–
              {Math.min(pagination.page * (pagination.limit || PAGE_SIZE), pagination.total)} of{' '}
              {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-navy px-2">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
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

export default MyCommissions;
