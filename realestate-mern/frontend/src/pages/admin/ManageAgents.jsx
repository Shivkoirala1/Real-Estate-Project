import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAgents,
  createAgent,
  updateAgent,
  toggleAgentStatus,
  deleteAgent,
} from '../../services/agentService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

const PAGE_SIZE = 9;

const npr = (x) => `NPR ${Number(x || 0).toLocaleString()}`;

const emptyCreateForm = {
  name: '',
  email: '',
  password: '',
  phone: '',
  licenseNumber: '',
  employeeId: '',
  joinedAt: '',
};

const EDITABLE_PROFILE_DEFAULTS = {
  name: '',
  phone: '',
  licenseNumber: '',
  employeeId: '',
  joinedAt: '',
  password: '',
};

const ModalShell = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center px-4" role="dialog" aria-modal="true">
    <div className="absolute inset-0 bg-navy-dark/60" onClick={onClose} />
    <div className="relative bg-white rounded-sm shadow-lifted max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display text-xl text-navy">{title}</h2>
          {subtitle && <p className="text-sm text-slate-muted mt-0.5">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-slate-muted hover:text-navy transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  </div>
);

// Admin CRUD for agent accounts (Spec v2 F4). Performance stats and the
// drill-down links come from GET /api/agents (salesCount/salesValue/
// commissionEarned/commissionPaid nested under `performance`).
const ManageAgents = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  // Debounced search: the input updates immediately, `search` feeds the API.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const debounceRef = useRef(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createErrors, setCreateErrors] = useState({});
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState(null); // agent being edited
  const [editForm, setEditForm] = useState(EDITABLE_PROFILE_DEFAULTS);
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [busyId, setBusyId] = useState(null); // activate/deactivate/delete in flight

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAgents({ page, limit: PAGE_SIZE, search: search || undefined, sort: sort || undefined });
      setAgents(data.agents || []);
      setPagination(data.pagination || { page, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load agents');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, sort]);

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

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch(searchInput.trim());
    setPage(1);
  };

  const clearSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const handleSortChange = (e) => {
    setSort(e.target.value);
    setPage(1);
  };

  // ---------- create ----------
  const openCreate = () => {
    setCreateForm(emptyCreateForm);
    setCreateErrors({});
    setCreateOpen(true);
  };

  const validateCreate = () => {
    const next = {};
    if (!createForm.name.trim()) next.name = 'Name is required';
    if (!createForm.email.trim()) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) next.email = 'Enter a valid email address';
    if (!createForm.password) next.password = 'Password is required';
    else if (createForm.password.length < 6) next.password = 'Password must be at least 6 characters';
    setCreateErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!validateCreate()) return;
    setCreating(true);
    try {
      await createAgent({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        phone: createForm.phone.trim() || undefined,
        licenseNumber: createForm.licenseNumber.trim() || undefined,
        employeeId: createForm.employeeId.trim() || undefined,
        joinedAt: createForm.joinedAt || undefined,
      });
      showToast('Agent created');
      setCreateOpen(false);
      setPage(1);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create agent', 'error');
    } finally {
      setCreating(false);
    }
  };

  // ---------- edit ----------
  const openEdit = (agent) => {
    const profile = agent.agentProfile || {};
    setEditForm({
      name: agent.name || '',
      phone: agent.phone || '',
      licenseNumber: profile.licenseNumber || '',
      employeeId: profile.employeeId || '',
      joinedAt: profile.joinedAt ? new Date(profile.joinedAt).toISOString().slice(0, 10) : '',
      password: '',
    });
    setEditErrors({});
    setEditTarget(agent);
  };

  const validateEdit = () => {
    const next = {};
    if (!editForm.name.trim()) next.name = 'Name is required';
    if (editForm.password && editForm.password.length < 6) next.password = 'Password must be at least 6 characters';
    setEditErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editTarget || !validateEdit()) return;
    setSaving(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        agentProfile: {
          licenseNumber: editForm.licenseNumber.trim(),
          employeeId: editForm.employeeId.trim(),
          joinedAt: editForm.joinedAt, // '' clears the stored date (backend allows null)
        },
      };
      if (editForm.password) payload.password = editForm.password;
      await updateAgent(editTarget._id, payload);
      showToast('Agent updated');
      setEditTarget(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update agent', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---------- activate / deactivate ----------
  const handleToggleStatus = async (agent) => {
    const deactivating = agent.isActive;
    const ok = await confirm({
      title: deactivating ? 'Deactivate this agent?' : 'Activate this agent?',
      message: deactivating
        ? `${agent.name} will be signed out and blocked from logging in until reactivated. Their records are kept.`
        : `${agent.name} will regain access to the agent dashboard.`,
      confirmLabel: deactivating ? 'Deactivate' : 'Activate',
      cancelLabel: 'Cancel',
      tone: deactivating ? 'danger' : 'default',
    });
    if (!ok) return;

    setBusyId(agent._id);
    try {
      await toggleAgentStatus(agent._id);
      showToast(deactivating ? 'Agent deactivated' : 'Agent activated');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update agent status', 'error');
    } finally {
      setBusyId(null);
    }
  };

  // ---------- delete ----------
  const handleDelete = async (agent) => {
    const ok = await confirm({
      title: 'Delete this agent?',
      message: `This permanently removes the agent account for ${agent.name}. This action cannot be undone.`,
      confirmLabel: 'Delete agent',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;

    setBusyId(agent._id);
    try {
      await deleteAgent(agent._id);
      showToast('Agent deleted');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete agent', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const perf = (agent) =>
    agent.performance || {
      salesCount: agent.salesCount ?? 0,
      salesValue: agent.salesValue ?? 0,
      commissionEarned: agent.commissionEarned ?? 0,
      commissionPaid: agent.commissionPaid ?? 0,
    };

  const fmtDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow mb-2">Admin</p>
          <h1 className="text-3xl">Manage Agents</h1>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Add Agent
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            type="text"
            className="input-field pl-9 pr-8"
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={handleSearchChange}
            aria-label="Search agents"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
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
          className="input-field sm:w-48"
          value={sort}
          onChange={handleSortChange}
          aria-label="Sort agents"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name_asc">Name A–Z</option>
          <option value="top_performer">Top Performer</option>
        </select>
        <button type="submit" className="btn-secondary">
          Search
        </button>
      </form>

      {loading ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-muted">Loading agents...</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-navy/10 rounded-sm p-5 shadow-card animate-pulse">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-11 h-11 rounded-full bg-parchment"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-parchment rounded-sm w-1/4"></div>
                  <div className="h-3 bg-parchment rounded-sm w-1/3"></div>
                </div>
              </div>
              <div className="h-3 bg-parchment rounded-sm w-1/2 mb-4"></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="h-10 bg-parchment rounded-sm"></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm px-5 py-4 text-sm font-medium flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline underline-offset-2">
            Try again
          </button>
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 text-center shadow-card">
          <p className="text-slate-muted">
            {search ? `No agents match “${search}”.` : 'No agents yet — add your first agent.'}
          </p>
          {!search && (
            <button type="button" onClick={openCreate} className="btn-primary mt-5">
              Add Agent
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {agents.map((agent) => {
              const p = perf(agent);
              const profile = agent.agentProfile || {};
              const profileLine = [
                profile.licenseNumber ? `License: ${profile.licenseNumber}` : 'License: —',
                profile.employeeId ? `ID: ${profile.employeeId}` : 'ID: —',
                `Joined: ${fmtDate(profile.joinedAt)}`,
              ].join(' · ');

              return (
                <div key={agent._id} className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
                  {/* Identity row */}
                  <div className="flex items-start gap-4 mb-3">
                    <div className="w-11 h-11 rounded-full bg-navy text-ivory flex items-center justify-center font-display text-lg flex-shrink-0">
                      {(agent.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-navy truncate">{agent.name || 'Unnamed agent'}</p>
                        <span
                          className={`status-badge whitespace-nowrap ${
                            agent.isActive ? 'bg-sage-light text-sage' : 'bg-brick-light text-brick'
                          }`}
                        >
                          {agent.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-muted truncate">{agent.email}</p>
                      <p className="text-sm text-slate-muted">{agent.phone || 'No phone'}</p>
                    </div>
                  </div>

                  {/* Profile line */}
                  <p className="text-xs text-slate-muted border-t border-navy/5 pt-3 mb-3">{profileLine}</p>

                  {/* Performance mini-stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-muted">Sales</p>
                      <p className="text-sm font-medium text-navy">{p.salesCount ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-muted">Value</p>
                      <p className="text-sm font-medium text-navy">{npr(p.salesValue)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-muted">Commission earned</p>
                      <p className="text-sm font-medium text-navy">{npr(p.commissionEarned)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-muted">Commission paid</p>
                      <p className="text-sm font-medium text-navy">{npr(p.commissionPaid)}</p>
                    </div>
                  </div>

                  {/* Drill-down links */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-xs text-slate-muted mr-1">View:</span>
                    <Link
                      to={`/dashboard/admin/sales?agent=${agent._id}`}
                      className="text-xs font-medium text-brass-dark bg-brass/10 hover:bg-brass/20 border border-brass/25 rounded-sm px-2.5 py-1 transition-colors"
                    >
                      Sales
                    </Link>
                    <Link
                      to={`/dashboard/admin/commissions?agent=${agent._id}`}
                      className="text-xs font-medium text-brass-dark bg-brass/10 hover:bg-brass/20 border border-brass/25 rounded-sm px-2.5 py-1 transition-colors"
                    >
                      Commissions
                    </Link>
                    <Link
                      to="/dashboard/admin/analytics"
                      className="text-xs font-medium text-brass-dark bg-brass/10 hover:bg-brass/20 border border-brass/25 rounded-sm px-2.5 py-1 transition-colors"
                      title="EMI portfolio lives in the admin analytics view"
                    >
                      EMI (analytics)
                    </Link>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 border-t border-navy/5 pt-4">
                    <button
                      type="button"
                      onClick={() => openEdit(agent)}
                      disabled={busyId === agent._id}
                      className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(agent)}
                      disabled={busyId === agent._id}
                      className={`text-xs font-medium px-3 py-1.5 rounded-sm border transition-colors disabled:opacity-60 ${
                        agent.isActive
                          ? 'border-brick text-brick hover:bg-brick-light'
                          : 'border-sage text-sage hover:bg-sage-light'
                      }`}
                    >
                      {busyId === agent._id ? 'Working...' : agent.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(agent)}
                      disabled={busyId === agent._id}
                      className="text-xs font-medium px-3 py-1.5 rounded-sm border border-transparent text-brick hover:bg-brick-light transition-colors disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <p className="text-xs text-slate-muted">
              {pagination.total} agent{pagination.total === 1 ? '' : 's'}
              {search ? ` matching “${search}”` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((v) => Math.max(1, v - 1))}
                disabled={page <= 1}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-navy px-2">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((v) => Math.min(pagination.totalPages || 1, v + 1))}
                disabled={page >= (pagination.totalPages || 1)}
                className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create agent modal */}
      {createOpen && (
        <ModalShell
          title="Add Agent"
          subtitle="Creates a verified agent account that can log in immediately."
          onClose={() => {
            if (!creating) setCreateOpen(false);
          }}
        >
          <form onSubmit={handleCreate} noValidate>
            <div className="space-y-4">
              <div>
                <label className="label-field" htmlFor="ca-name">Name *</label>
                <input
                  id="ca-name"
                  className={`input-field ${createErrors.name ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                />
                {createErrors.name && <p className="text-xs text-brick mt-1">{createErrors.name}</p>}
              </div>
              <div>
                <label className="label-field" htmlFor="ca-email">Email *</label>
                <input
                  id="ca-email"
                  type="email"
                  className={`input-field ${createErrors.email ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="agent@example.com"
                />
                {createErrors.email && <p className="text-xs text-brick mt-1">{createErrors.email}</p>}
              </div>
              <div>
                <label className="label-field" htmlFor="ca-password">Password * (min 6 characters)</label>
                <input
                  id="ca-password"
                  type="password"
                  className={`input-field ${createErrors.password ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="At least 6 characters"
                />
                {createErrors.password && <p className="text-xs text-brick mt-1">{createErrors.password}</p>}
              </div>
              <div>
                <label className="label-field" htmlFor="ca-phone">Phone</label>
                <input
                  id="ca-phone"
                  className="input-field"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label-field" htmlFor="ca-license">License Number</label>
                  <input
                    id="ca-license"
                    className="input-field"
                    value={createForm.licenseNumber}
                    onChange={(e) => setCreateForm((f) => ({ ...f, licenseNumber: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="label-field" htmlFor="ca-employee">Employee ID</label>
                  <input
                    id="ca-employee"
                    className="input-field"
                    value={createForm.employeeId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, employeeId: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div>
                <label className="label-field" htmlFor="ca-joined">Joined At</label>
                <input
                  id="ca-joined"
                  type="date"
                  className="input-field"
                  value={createForm.joinedAt}
                  onChange={(e) => setCreateForm((f) => ({ ...f, joinedAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
                className="btn-secondary text-sm px-4 py-2"
              >
                Cancel
              </button>
              <button type="submit" disabled={creating} className="btn-primary text-sm px-4 py-2 disabled:opacity-60">
                {creating ? 'Creating...' : 'Create agent'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Edit agent modal */}
      {editTarget && (
        <ModalShell
          title="Edit Agent"
          subtitle={editTarget.email}
          onClose={() => {
            if (!saving) setEditTarget(null);
          }}
        >
          <form onSubmit={handleEdit} noValidate>
            <div className="space-y-4">
              <div>
                <label className="label-field" htmlFor="ea-name">Name *</label>
                <input
                  id="ea-name"
                  className={`input-field ${editErrors.name ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
                {editErrors.name && <p className="text-xs text-brick mt-1">{editErrors.name}</p>}
              </div>
              <div>
                <label className="label-field" htmlFor="ea-phone">Phone</label>
                <input
                  id="ea-phone"
                  className="input-field"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label-field" htmlFor="ea-license">License Number</label>
                  <input
                    id="ea-license"
                    className="input-field"
                    value={editForm.licenseNumber}
                    onChange={(e) => setEditForm((f) => ({ ...f, licenseNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label-field" htmlFor="ea-employee">Employee ID</label>
                  <input
                    id="ea-employee"
                    className="input-field"
                    value={editForm.employeeId}
                    onChange={(e) => setEditForm((f) => ({ ...f, employeeId: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label-field" htmlFor="ea-joined">Joined At</label>
                <input
                  id="ea-joined"
                  type="date"
                  className="input-field"
                  value={editForm.joinedAt}
                  onChange={(e) => setEditForm((f) => ({ ...f, joinedAt: e.target.value }))}
                />
              </div>
              <div>
                <label className="label-field" htmlFor="ea-password">Set new password</label>
                <input
                  id="ea-password"
                  type="password"
                  className={`input-field ${editErrors.password ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Leave blank to keep the current password"
                />
                {editErrors.password && <p className="text-xs text-brick mt-1">{editErrors.password}</p>}
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={saving}
                className="btn-secondary text-sm px-4 py-2"
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary text-sm px-4 py-2 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
};

export default ManageAgents;
