import React, { useEffect, useState } from 'react';
import { createLead } from '../../../services/leadService';
import { getUsers } from '../../../services/userService';
import { getProperties } from '../../../services/propertyService';
import { useToast } from '../../../context/ToastContext';
import { CATEGORIES, PRIORITIES } from '../../../utils/leadConstants';

// Modal for manually creating a lead from the Lead Management dashboard.
const CreateLeadModal = ({ onClose, onCreated }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    category: 'property',
    priority: 'medium',
    assignedAgent: '',
    property: '',
    notes: '',
    nextFollowUp: '',
  });
  const [agents, setAgents] = useState([]);
  const [properties, setProperties] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUsers({ role: 'admin' })
      .then((data) => setAgents(data.users || []))
      .catch(() => setAgents([]));
    getProperties({ limit: 50, sort: 'newest' })
      .then((data) => setProperties(data.properties || []))
      .catch(() => setProperties([]));
  }, []);

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.email.trim()) next.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = 'Enter a valid email address';
    if (form.phone && !/^\d{10}$/.test(form.phone.trim()))
      next.phone = 'Phone must be exactly 10 digits';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        category: form.category,
        priority: form.priority,
      };
      if (form.assignedAgent) payload.assignedAgent = form.assignedAgent;
      if (form.property) payload.property = form.property;
      if (form.notes.trim()) payload.notes = form.notes.trim();
      if (form.nextFollowUp) payload.nextFollowUp = new Date(form.nextFollowUp).toISOString();

      const result = await createLead(payload);
      showToast('Lead created and added to the pipeline');
      onCreated && onCreated(result.lead);
      onClose();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create lead', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60" onClick={onClose}>
      <div
        className="bg-white w-full max-w-xl rounded-sm shadow-card max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-navy/10 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <p className="eyebrow mb-1">Lead Pipeline</p>
            <h2 className="text-xl">New Lead</h2>
          </div>
          <button onClick={onClose} className="text-slate-muted hover:text-navy text-2xl leading-none">
            ×
          </button>
        </div>

        <form onSubmit={submit} noValidate className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Full name *</label>
              <input
                className={`input-field ${errors.name ? 'border-brick' : ''}`}
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="e.g. Ram Bahadur Shrestha"
              />
              {errors.name && <p className="text-xs text-brick mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="label-field">Email *</label>
              <input
                type="email"
                className={`input-field ${errors.email ? 'border-brick' : ''}`}
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="you@example.com"
              />
              {errors.email && <p className="text-xs text-brick mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="label-field">Phone</label>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                className={`input-field ${errors.phone ? 'border-brick' : ''}`}
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, ''))}
                placeholder="98XXXXXXXX"
              />
              {errors.phone && <p className="text-xs text-brick mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="label-field">Category</label>
              <select
                className="input-field"
                value={form.category}
                onChange={(e) => handleChange('category', e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Assign agent</label>
              <select
                className="input-field"
                value={form.assignedAgent}
                onChange={(e) => handleChange('assignedAgent', e.target.value)}
              >
                <option value="">Unassigned (pool)</option>
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Priority</label>
              <select
                className="input-field"
                value={form.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Related property</label>
              <select
                className="input-field"
                value={form.property}
                onChange={(e) => handleChange('property', e.target.value)}
              >
                <option value="">None</option>
                {properties.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Next follow-up</label>
              <input
                type="datetime-local"
                className="input-field"
                value={form.nextFollowUp}
                onChange={(e) => handleChange('nextFollowUp', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label-field">Notes</label>
            <textarea
              rows={3}
              className="input-field"
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Context, budget, requirements..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-gold text-sm disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateLeadModal;
