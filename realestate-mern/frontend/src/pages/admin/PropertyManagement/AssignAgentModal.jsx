import React, { useEffect, useState } from 'react';
import { getAgents } from '../../../services/agentService';
import { assignAgent } from '../../../services/propertyManagementService';
import { useToast } from '../../../context/ToastContext';

// Admin modal to assign / reassign / unassign an agent on a management
// request. Agent options come from GET /api/agents (flat shape: user fields
// on the agent itself, e.g. agent.name); the resolver below also tolerates a
// populated { user: { name, email } } shape defensively. Same modal shell as
// RequestManagementModal (overlay + Escape + backdrop close).
const agentLabel = (a) => a?.name || a?.user?.name || a?.email || a?.user?.email || 'Unnamed agent';
const agentValue = (a) => a?._id;

const AssignAgentModal = ({ request, onClose, onAssigned }) => {
  const { showToast } = useToast();

  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  // '' = nothing chosen yet; 'unassign' = unassign the current agent;
  // otherwise the agent _id.
  const [selected, setSelected] = useState(request?.assignedAgent?._id || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAgents({ limit: 100 });
        if (active) {
          // Only currently-active agents are assignable.
          setAgents((data.agents || []).filter((a) => a.isActive !== false));
        }
      } catch (err) {
        if (active) {
          showToast(err.response?.data?.message || 'Failed to load agents', 'error');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [showToast]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = async () => {
    if (selected === '' || submitting) return;
    const agentId = selected === 'unassign' ? null : selected;
    setSubmitting(true);
    try {
      const data = await assignAgent(request._id, agentId);
      showToast(agentId ? 'Agent assigned' : 'Agent unassigned');
      onAssigned && onAssigned(data.request);
      onClose();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to assign agent', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-agent-title"
    >
      <div className="absolute inset-0 bg-navy/60" onClick={onClose} />

      <div className="relative bg-white rounded-sm shadow-lifted max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h2 id="assign-agent-title" className="font-display text-xl text-navy">
              Assign / Reassign Agent
            </h2>
            {request?.property?.title && (
              <p className="text-sm text-slate-muted mt-0.5">For “{request.property.title}”</p>
            )}
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

        {loading ? (
          <p className="text-sm text-slate-muted py-6">Loading agents...</p>
        ) : (
          <>
            <fieldset className="mb-6 max-h-72 overflow-y-auto">
              <legend className="label-field">Agent</legend>
              <div className="space-y-2">
                {request?.assignedAgent && (
                  <label
                    htmlFor="agent-option-unassign"
                    className={`flex items-start gap-2.5 border rounded-sm px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                      selected === 'unassign'
                        ? 'border-brick bg-brick-light/50 text-navy font-medium'
                        : 'border-navy/15 text-slate-ink hover:border-navy/30'
                    }`}
                  >
                    <input
                      id="agent-option-unassign"
                      type="radio"
                      name="agent-choice"
                      value="unassign"
                      checked={selected === 'unassign'}
                      onChange={() => setSelected('unassign')}
                      className="accent-brick mt-0.5 flex-shrink-0"
                    />
                    <span>
                      Unassign current agent
                      <span className="block text-xs text-slate-muted font-normal">
                        {request.assignedAgent.name || 'Current agent'} will be removed from this request.
                      </span>
                    </span>
                  </label>
                )}

                {agents.map((a) => {
                  const id = agentValue(a);
                  const isCurrent = request?.assignedAgent?._id === id;
                  return (
                    <label
                      key={id}
                      htmlFor={`agent-option-${id}`}
                      className={`flex items-start gap-2.5 border rounded-sm px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                        selected === id
                          ? 'border-brass bg-brass/10 text-navy font-medium'
                          : 'border-navy/15 text-slate-ink hover:border-navy/30'
                      }`}
                    >
                      <input
                        id={`agent-option-${id}`}
                        type="radio"
                        name="agent-choice"
                        value={id}
                        checked={selected === id}
                        onChange={() => setSelected(id)}
                        className="accent-brass mt-0.5 flex-shrink-0"
                      />
                      <span>
                        {agentLabel(a)}
                        <span className="block text-xs text-slate-muted font-normal">
                          {isCurrent ? 'Currently assigned' : a?.email || a?.user?.email || ''}
                        </span>
                      </span>
                    </label>
                  );
                })}

                {agents.length === 0 && !request?.assignedAgent && (
                  <p className="text-sm text-slate-muted py-2">
                    No active agents available to assign.
                  </p>
                )}
              </div>
            </fieldset>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={selected === '' || submitting}
                className="btn-gold text-sm px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving...' : 'Save assignment'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AssignAgentModal;
