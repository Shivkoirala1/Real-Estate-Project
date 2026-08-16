import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { formatPrice, statusStyles, imageUrl } from '../../utils/format';

const statusLabels = { available: 'Available', reserved: 'Reserved', sold: 'Sold' };
const STATUS_RANK = { available: 0, reserved: 1, sold: 2 };

const ManageProperties = ({ showHeader = true }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = user?.role === 'admin';

  const load = async () => {
    setLoading(true);
    try {
      const endpoint = isAdmin ? '/properties?limit=100' : '/properties/my/listings';
      const { data } = await api.get(endpoint);
      setProperties(data.properties);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isAdmin]);

  const handleStatusChange = async (property, newStatus) => {
    if (newStatus === property.status) return;

    const confirmed = await confirm({
      title: 'Update property status?',
      message: `Change "${property.title}" from ${statusLabels[property.status]} to ${statusLabels[newStatus]}? Once saved, buyers will immediately see the new status.`,
      confirmLabel: 'Yes, update status',
      cancelLabel: 'No, keep as is',
    });
    if (!confirmed) return;

    try {
      await api.patch(`/properties/${property._id}/status`, { status: newStatus });
      showToast('Property status updated');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update status', 'error');
    }
  };

  const handleDelete = async (property) => {
    const confirmed = await confirm({
      title: 'Delete this property?',
      message: `"${property.title}" will be permanently removed and this can't be undone.`,
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'No, cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await api.delete(`/properties/${property._id}`);
      showToast('Property deleted');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete property', 'error');
    }
  };

  const newPath = isAdmin ? '/dashboard/admin/properties/new' : '/my-properties/new';
  const editPath = (id) => (isAdmin ? `/dashboard/admin/properties/${id}/edit` : `/my-properties/${id}/edit`);

  return (
    <div>
      {showHeader && (
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow mb-2">Manage</p>
          <h1 className="text-3xl">{isAdmin ? 'All Properties' : 'My Properties'}</h1>
        </div>
        <Link to={newPath} className="btn-gold text-sm py-2.5 px-4">+ Add Property</Link>
      </div>
      )}

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : properties.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-navy/20 rounded-sm">
          <p className="font-display text-xl mb-2">No properties yet</p>
          <Link to={newPath} className="text-brass hover:underline text-sm">Add your first property →</Link>
        </div>
      ) : (
        <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                <th className="px-5 py-3">Property</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p._id} className="border-b border-navy/5 last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <img src={imageUrl(p.media?.coverImage)} className="w-12 h-12 rounded-sm object-cover" alt={p.title} />
                      <span className="font-medium text-navy">{p.title}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">{formatPrice(p.price, p.currency)}</td>
                  <td className="px-5 py-3">
                    <select
                      value={p.status}
                      onChange={(e) => handleStatusChange(p, e.target.value)}
                      disabled={p.status === 'sold'}
                      title={p.status === 'sold' ? 'Sold is final and cannot be changed' : 'Update status'}
                      className="text-xs border border-navy/15 rounded-sm px-2 py-1.5 bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ color: statusStyles[p.status]?.bg }}
                    >
                      {Object.keys(statusLabels).map((key) => (
                        <option key={key} value={key} disabled={STATUS_RANK[key] < STATUS_RANK[p.status]}>
                          {statusLabels[key]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => navigate(editPath(p._id))} className="text-brass hover:underline">Edit</button>
                      <button onClick={() => handleDelete(p)} className="text-brick hover:underline">Delete</button>
                      <Link to={`/properties/${p.slug || p._id}`} className="text-slate-muted hover:underline">View</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ManageProperties;
