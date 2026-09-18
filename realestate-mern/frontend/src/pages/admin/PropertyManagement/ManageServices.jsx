import React, { useCallback, useEffect, useState } from 'react';
import {
  getManagementServices,
  createManagementService,
  updateManagementService,
  setManagementServiceStatus,
} from '../../../services/managementService';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';

// Admin catalogue of management services. Deactivation is soft: historical
// requests keep displaying their snapshotted service names.
const ManageServices = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getManagementServices({ includeInactive: true });
      setServices(data.services || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load services', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateManagementService(editingId, { name: name.trim(), description: description.trim() });
        showToast('Service updated');
      } else {
        await createManagementService({ name: name.trim(), description: description.trim() });
        showToast('Service created');
      }
      resetForm();
      await load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save service', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (service) => {
    const next = !service.isActive;
    const ok = await confirm({
      title: next ? 'Reactivate this service?' : 'Deactivate this service?',
      message: next
        ? 'Owners will be able to select it again.'
        : 'Owners will no longer see it, but historical requests keep displaying its name. This can be undone.',
      confirmLabel: next ? 'Yes, reactivate' : 'Yes, deactivate',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      await setManagementServiceStatus(service._id, next);
      showToast(next ? 'Service reactivated' : 'Service deactivated');
      await load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update service', 'error');
    }
  };

  return (
    <div>
      <p className="eyebrow mb-2">Admin</p>
      <h1 className="text-3xl mb-1">Management Services</h1>
      <p className="text-sm text-slate-muted mb-6">
        Services owners can select when requesting management. Deactivation hides a service from new requests without altering history.
      </p>

      <form onSubmit={handleSubmit} className="bg-white border border-navy/10 rounded-sm shadow-card p-5 mb-6">
        <h2 className="font-semibold text-navy mb-4">{editingId ? 'Edit service' : 'New service'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="ms-name" className="label-field">Name *</label>
            <input
              id="ms-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. rent_collection"
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="ms-desc" className="label-field">Description</label>
            <input
              id="ms-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this service covers"
              className="input-field"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving || !name.trim()} className="btn-primary text-sm px-4 py-2 disabled:opacity-60">
            {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create service'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="btn-secondary text-sm px-4 py-2">
              Cancel
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-slate-muted">Loading services...</p>
      ) : services.length === 0 ? (
        <p className="text-sm text-slate-muted">No services yet.</p>
      ) : (
        <div className="bg-white border border-navy/10 rounded-sm shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy/10 text-left">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Description</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s._id} className="border-b border-navy/5 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy">{s.name}</td>
                  <td className="px-5 py-3 text-slate-ink">{s.description || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`status-badge ${s.isActive ? 'bg-sage-light text-sage' : 'bg-navy/10 text-slate-muted'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(s._id);
                        setName(s.name);
                        setDescription(s.description || '');
                      }}
                      className="text-sm text-brass hover:underline mr-4"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggle(s)}
                      className="text-sm text-slate-muted hover:text-navy"
                    >
                      {s.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
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

export default ManageServices;
