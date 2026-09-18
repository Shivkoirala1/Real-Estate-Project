import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyManagementRequests } from '../../services/propertyManagementService';
import { useToast } from '../../context/ToastContext';
import ManagementRequestCard from '../../components/PropertyManagement/ManagementRequestCard';

const PAGE_SIZE = 10;

// Owner's own management requests + statuses. Creation happens through the
// property creation flow (purpose = Management), not from this page.
const MyManagementRequests = () => {
  const { showToast } = useToast();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyManagementRequests({ page, limit: PAGE_SIZE });
      const list = data.requests || [];
      if (page > 1 && list.length === 0 && (data.pagination?.totalPages || 1) < page) {
        setPage(1);
        return;
      }
      setRequests(list);
      setPagination(data.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load requests', 'error');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [page, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p className="eyebrow mb-2">My Properties</p>
      <h1 className="text-3xl mb-1">My Management Requests</h1>
      <p className="text-sm text-slate-muted mb-6">
        Track your property management requests. New requests start from{' '}
        <Link to="/my-properties/new" className="text-brass hover:underline">
          property creation
        </Link>{' '}
        with purpose set to Management.
      </p>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading requests...</p>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center shadow-card">
          <p className="text-slate-muted mb-4">No management requests yet.</p>
          <Link to="/my-properties/new" className="btn-gold text-sm px-4 py-2">
            Register a property for management
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {requests.map((r) => (
              <ManagementRequestCard key={r._id} request={r} to={`/my-properties/management/${r._id}`} />
            ))}
          </div>
          <div className="flex items-center justify-between mt-6">
            <p className="text-xs text-slate-muted">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="text-sm px-3 py-2 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
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

export default MyManagementRequests;
