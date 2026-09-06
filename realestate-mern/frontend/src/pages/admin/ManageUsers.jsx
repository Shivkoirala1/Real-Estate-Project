import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getUsers,
  toggleUserStatus,
  resetUserPassword,
  deleteUser,
} from '../../services/userService';
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
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);

    try {
      const data = await getUsers({
        search: search || undefined,
        sort,
      });

      setUsers(data.users);
    } catch (err) {
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, sort]);

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
      await toggleUserStatus(id);

      showToast('User status updated');

      load();
    } catch (err) {
      showToast('Failed to update status', 'error');
    }
  };

  const handleResetPassword = async (id) => {
    const confirmed = await confirm({
      title: 'Reset this password?',
      message:
        "The user's password will be replaced with a temporary one, which you'll need to share with them.",
      confirmLabel: 'Yes, reset it',
      cancelLabel: 'No, cancel',
    });

    if (!confirmed) return;

    try {
      const data = await resetUserPassword(id);

      showToast(`Temporary password: ${data.tempPassword}`);
    } catch (err) {
      showToast('Failed to reset password', 'error');
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Remove this user?',
      message:
        'Their account will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Yes, remove them',
      cancelLabel: 'No, cancel',
      tone: 'danger',
    });

    if (!confirmed) return;

    try {
      await deleteUser(id);

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
          <p className="text-sm text-slate-muted mt-1">
            Buyer accounts. Agent accounts are managed under{' '}
            <Link to="/dashboard/admin/agents" className="text-brass hover:underline">
              Manage Agents
            </Link>
            .
          </p>
        </div>

        <Link
          to="/dashboard/admin/verifications"
          className="btn-gold text-sm py-2.5 px-4"
        >
          Review Pending Verifications
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <input
          placeholder="Search by name or email..."
          className="input-field max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input-field sm:max-w-[10rem]"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort users"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name_asc">Name A–Z</option>
        </select>
      </div>

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
                <tr
                  key={u._id}
                  className="border-b border-navy/5 last:border-0"
                >
                  <td className="px-5 py-3 font-medium text-navy">
                    {u.name}
                  </td>

                  <td className="px-5 py-3 text-slate-muted">
                    {u.email}
                  </td>

                  <td className="px-5 py-3">
                    <span className="status-badge bg-navy/10 text-navy capitalize">{u.role}</span>
                  </td>

                  <td className="px-5 py-3">
                    <span
                      className={`status-badge ${
                        verificationBadge[u.verificationStatus]
                      }`}
                    >
                      {u.verificationStatus}
                    </span>
                  </td>

                  <td className="px-5 py-3">
                    <span
                      className={`status-badge ${
                        u.isActive
                          ? 'bg-sage-light text-sage'
                          : 'bg-brick-light text-brick'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  <td className="px-5 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() =>
                          handleToggleStatus(u._id, u.isActive)
                        }
                        className="text-brass hover:underline"
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>

                      <button
                        onClick={() => handleResetPassword(u._id)}
                        className="text-slate-muted hover:underline"
                      >
                        Reset Password
                      </button>

                      {u.role !== 'admin' && (
                        <button
                          onClick={() => handleDelete(u._id)}
                          className="text-brick hover:underline"
                        >
                          Remove
                        </button>
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
