import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import StatCard from '../../components/dashboard/StatCard';
import { formatPrice, statusStyles, imageUrl } from '../../utils/format';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    api.get('/dashboard/admin').then((res) => {
      setStats(res.data.stats);
      setRecent(res.data.recentListings);
    });
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
        </div>
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
