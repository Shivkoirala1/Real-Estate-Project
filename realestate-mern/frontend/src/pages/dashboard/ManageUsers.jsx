import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

const verificationBadge = {
  pending: 'bg-brass/15 text-brass-dark',
  verified: 'bg-sage-light text-sage',
  rejected: 'bg-brick-light text-brick',
};

const ManageUsers = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/users${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      setUsers(data.users);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search]);

  const handleToggleStatus = async (id, isActive) => {
    const confirmed = await confirm({
      title: isActive ? 'Deactivate this user?' : 'Activate this user?',
      message: isActive
        ? "They won't be able to sign in until you activate their account again."
        : 'They will regain full access to sign in and use their account.',
      confirmLabel: isActive ? 'Yes, deactivate' : 'Yes, activate',
      cancelLabel: 'No, cancel',
      tone: isActive ? 'danger' : 'default',
    });
    if (!confirmed) return;
    try {
      await api.patch(`/users/${id}/status`);
      showToast('User status updated');
      load();
    } catch (err) {
      showToast('Failed to update status', 'error');
    }
  };

  const handleResetPassword = async (id) => {
    const confirmed = await confirm({
      title: 'Reset this password?',
      message: "The user's password will be replaced with a temporary one, which you'll need to share with them.",
      confirmLabel: 'Yes, reset it',
      cancelLabel: 'No, cancel',
    });
    if (!confirmed) return;
    try {
      const { data } = await api.post(`/users/${id}/reset-password`);
      showToast(`Temporary password: ${data.tempPassword}`);
    } catch (err) {
      showToast('Failed to reset password', 'error');
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Remove this user?',
      message: 'Their account will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Yes, remove them',
      cancelLabel: 'No, cancel',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.delete(`/users/${id}`);
      showToast('User removed');
      load();
    } catch (err) {
      showToast('Failed to remove user', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="eyebrow mb-2">Admin</p>
          <h1 className="text-3xl">Manage Users</h1>
        </div>
        <Link to="/dashboard/admin/verifications" className="btn-gold text-sm py-2.5 px-4">Review Pending Verifications</Link>
      </div>

      <input
        placeholder="Search by name or email..."
        className="input-field max-w-sm mb-6"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : (
        <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Verification</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b border-navy/5 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy">{u.name}</td>
                  <td className="px-5 py-3 text-slate-muted">{u.email}</td>
                  <td className="px-5 py-3 capitalize">{u.role}</td>
                  <td className="px-5 py-3">
                    <span className={`status-badge ${verificationBadge[u.verificationStatus]}`}>{u.verificationStatus}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`status-badge ${u.isActive ? 'bg-sage-light text-sage' : 'bg-brick-light text-brick'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => handleToggleStatus(u._id, u.isActive)} className="text-brass hover:underline">
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => handleResetPassword(u._id)} className="text-slate-muted hover:underline">Reset Password</button>
                      {u.role !== 'admin' && (
                        <button onClick={() => handleDelete(u._id)} className="text-brick hover:underline">Remove</button>
                      )}
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

export default ManageUsers;
