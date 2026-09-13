import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { convertContactFormToLead, convertVisitToLead } from '../../../services/leadService';
import { getUsers } from '../../../services/userService';
import { useToast } from '../../../context/ToastContext';
import { CATEGORIES, PRIORITIES } from '../../../utils/leadConstants';

/**
 * Shared conversion modal: turns either a contact form submission or a visit
 * request into a pipeline lead in one click.
 *
 * props:
 *  - sourceType: 'contact_form' | 'visit'
 *  - source:     the contactForm or visit record
 *  - onClose, onConverted
 */
const ConvertToLeadModal = ({ sourceType, source, onClose, onConverted }) => {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    assignedAgent: '',
    category: 'property',
    priority: sourceType === 'visit' ? 'high' : 'medium',
    notes: defaultNotes(sourceType, source),
  });
  const [agents, setAgents] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUsers({ role: 'admin' })
      .then((data) => setAgents(data.users || []))
      .catch(() => setAgents([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        category: form.category,
        priority: form.priority,
      };
      if (form.assignedAgent) payload.assignedAgent = form.assignedAgent;
      if (form.notes.trim()) payload.notes = form.notes.trim();

      const result =
        sourceType === 'visit'
          ? await convertVisitToLead(source._id, payload)
          : await convertContactFormToLead(source._id, payload);

      showToast(
        result.deduped
          ? 'This visit was already linked to a lead - opening it'
          : 'Converted to lead',
      );
      onConverted && onConverted(result.lead);
      onClose();
      navigate(`/dashboard/lead-management/leads/${result.lead._id}`);
    } catch (err) {
      const data = err.response?.data;
      if (data?.leadId) {
        // Already converted - take the user to the existing lead
        showToast('Already converted - opening the existing lead', 'error');
        onClose();
        navigate(`/dashboard/lead-management/leads/${data.leadId}`);
        return;
      }
      showToast(data?.message || 'Failed to convert', 'error');
    } finally {
      setSaving(false);
    }
  };

  const nameGuess =
    sourceType === 'visit'
      ? source?.requestedBy?.name || 'this visit'
      : source?.name || 'this submission';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md rounded-sm shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-navy/10">
          <p className="eyebrow mb-1">Smart Conversion</p>
          <h2 className="text-xl">Convert to Lead</h2>
          <p className="text-sm text-slate-muted mt-1">
            Create a pipeline lead for <span className="font-medium text-slate-ink">{nameGuess}</span>.
            {sourceType === 'contact_form' && ' Contact details are pulled from the submission.'}
            {sourceType === 'visit' && ' The visit stays linked and the lead starts at Site Visit.'}
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="label-field">Assign agent</label>
            <select
              className="input-field"
              value={form.assignedAgent}
              onChange={(e) => setForm({ ...form, assignedAgent: e.target.value })}
            >
              <option value="">Unassigned (pool)</option>
              {sourceType === 'visit' && source?.assignedAgent && !agents.some((a) => a._id === source.assignedAgent?._id) && (
                <option value={source.assignedAgent._id || source.assignedAgent}>
                  {source.assignedAgent.name || 'Visit agent'}
                </option>
              )}
              {agents.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Category</label>
              <select
                className="input-field"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Priority</label>
              <select
                className="input-field"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label-field">Notes</label>
            <textarea
              rows={3}
              className="input-field"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Context carried onto the lead..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-gold text-sm disabled:opacity-50">
              {saving ? 'Converting...' : 'Convert to Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const defaultNotes = (sourceType, source) => {
  if (sourceType === 'visit') {
    const slot = source?.requestedSlot ? new Date(source.requestedSlot).toLocaleString() : 'unscheduled';
    return `Follow-up from ${
      source?.visitType === 'office' ? 'office visit' : 'property visit'
    } scheduled for ${slot}.`;
  }
  if (sourceType === 'contact_form') {
    return source?.message ? `Original message: "${source.message.slice(0, 140)}"` : '';
  }
  return '';
};

export default ConvertToLeadModal;
