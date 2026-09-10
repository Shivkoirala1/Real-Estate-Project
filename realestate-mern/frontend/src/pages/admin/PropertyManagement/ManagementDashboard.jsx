import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getManagementRequests,
  MANAGEMENT_SERVICES,
} from '../../../services/propertyManagementService';
import { getAgents } from '../../../services/agentService';
import ManagementRequestCard from '../../../components/PropertyManagement/ManagementRequestCard';

const PAGE_SIZE = 10;

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'active', label: 'Active' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'terminated', label: 'Terminated' },
];

const agentLabel = (a) => a?.name || a?.user?.name || a?.email || a?.user?.email || 'Unnamed agent';

// Admin queue for owner-filed management requests (status tabs + filters +
// server pagination, mirroring SalesVerification / ManageProperties).
const ManagementDashboard = () => {
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [service, setService] = useState('');
  const [sort, setSort] = useState('newest');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Debounced search: input updates immediately, `search` feeds the API.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debounceRef = useRef(null);

  const [agents, setAgents] = useState([]);

  // Clear any pending debounce timer on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  // Agent options for the assignedAgent filter (silent failure: the dropdown
  // just stays empty).
  useEffect(() => {
    let active = true;
    getAgents({ limit: 100 })
      .then((data) => {
        if (active) setAgents(data.agents || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getManagementRequests({
        status: status || undefined,
        assignedAgent: agentFilter || undefined,
        service: service || undefined,
        search: search || undefined,
        from: from || undefined,
        to: to || undefined,
        sort,
        page,
        limit: PAGE_SIZE,
      });
      const nextTotalPages = data.pagination?.totalPages || 1;
      // Reviewing the last item of the last page can leave us on a phantom
      // page - snap back to page 1 instead of showing a false empty state.
      if (page > 1 && (data.requests || []).length === 0 && nextTotalPages < page) {
        setPage(1);
        return;
      }
      setRequests(data.requests || []);
      setCounts(data.countsByStatus || {});
      setPagination(data.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [status, agentFilter, service, search, from, to, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value.trim());
      setPage(1);
    }, 350);
  };

  // Every filter change resets the page to 1.
  const handleStatusChange = (value) => {
    setStatus(value);
    setPage(1);
  };
  const handleAgentChange = (e) => {
    setAgentFilter(e.target.value);
    setPage(1);
  };
  const handleServiceChange = (e) => {
    setService(e.target.value);
    setPage(1);
  };
  const handleSortChange = (e) => {
    setSort(e.target.value);
    setPage(1);
  };
  const handleFromChange = (e) => {
    setFrom(e.target.value);
    setPage(1);
  };
  const handleToChange = (e) => {
    setTo(e.target.value);
    setPage(1);
  };

  const goToPage = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPage(newPage);
    }
  };

  const allCount = STATUS_TABS.slice(1).reduce((sum, tab) => sum + (counts[tab.value] || 0), 0);

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-3xl mb-1">Property Management</h1>
        <p className="text-sm text-slate-muted">
          Review owner requests, assign agents and oversee every managed property.
        </p>
      </div>

      {/* Status filter tabs — counters mirror countsByStatus from the API */}
      <div className="flex flex-wrap items-center gap-2 mb-4" role="tablist" aria-label="Filter by status">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.value;
          const count = tab.value === '' ? allCount : counts[tab.value] || 0;
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={active}
              onClick={() => handleStatusChange(tab.value)}
              className={`text-sm font-medium px-3.5 py-2 rounded-sm border transition-colors ${
                active
                  ? 'bg-navy border-navy text-ivory'
                  : 'bg-white border-navy/15 text-slate-muted hover:border-navy/30 hover:text-navy'
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-xs ${active ? 'text-ivory/70' : 'text-slate-muted'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div className="flex flex-col lg:flex-row lg:flex-wrap gap-3 mb-6">
        <div className="relative lg:max-w-xs w-full">
          <input
            type="search"
            value={searchInput}
            onChange={handleSearchChange}
            placeholder="Search property or owner..."
            aria-label="Search property or owner"
            className="input-field pr-8"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                if (debounceRef.current) clearTimeout(debounceRef.current);
                setSearchInput('');
                setSearch('');
                setPage(1);
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-muted hover:text-navy"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        <select
          value={agentFilter}
          onChange={handleAgentChange}
          aria-label="Filter by assigned agent"
          className="input-field lg:max-w-[12rem]"
        >
          <option value="">All agents</option>
          <option value="unassigned">Unassigned</option>
          {agents.map((a) => (
            <option key={a._id} value={a._id}>
              {agentLabel(a)}
            </option>
          ))}
        </select>

        <select
          value={service}
          onChange={handleServiceChange}
          aria-label="Filter by service"
          className="input-field lg:max-w-[12rem]"
        >
          <option value="">All services</option>
          {MANAGEMENT_SERVICES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={handleSortChange}
          aria-label="Sort requests"
          className="input-field lg:max-w-[10rem]"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="status">Status</option>
        </select>

        <div className="flex items-center gap-2">
          <label htmlFor="pm-from" className="text-xs uppercase tracking-wide text-slate-muted whitespace-nowrap">
            From
          </label>
          <input
            id="pm-from"
            type="date"
            value={from}
            onChange={handleFromChange}
            aria-label="From date"
            className="input-field lg:max-w-[10rem]"
          />
          <label htmlFor="pm-to" className="text-xs uppercase tracking-wide text-slate-muted whitespace-nowrap">
            To
          </label>
          <input
            id="pm-to"
            type="date"
            value={to}
            onChange={handleToChange}
            aria-label="To date"
            className="input-field lg:max-w-[10rem]"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading requests...</p>
      ) : error ? (
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm px-5 py-4 text-sm font-medium flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center shadow-card">
          <p className="text-slate-muted">No management requests match your filters.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {requests.map((r) => (
              <ManagementRequestCard
                key={r._id}
                request={r}
                showOwner
                to={`/dashboard/admin/property-management/${r._id}`}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <p className="text-xs text-slate-muted">
              Showing{' '}
              {pagination.total === 0 ? 0 : (pagination.page - 1) * PAGE_SIZE + 1}–
              {Math.min(pagination.page * PAGE_SIZE, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="text-sm px-3 py-2 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-navy px-2">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pagination.totalPages}
                className="text-sm px-3 py-2 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
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

export default ManagementDashboard;
