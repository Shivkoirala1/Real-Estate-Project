import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getLeadById,
  updateLead,
  updateLeadStage,
  assignLeadToAgent,
  updateLeadPriority,
  markFollowUpDone,
  setFollowUpDate,
  deleteLead,
  getSuggestedAction,
} from '../../../services/leadService';
import { getUsers } from '../../../services/userService';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useAuth } from '../../../context/AuthContext';
import LeadActivityTimeline from '../../../components/LeadManagement/LeadActivityTimeline';
import LeadConversationThread from '../../../components/LeadManagement/LeadConversationThread';
import LeadStatusBadge from '../../../components/LeadManagement/LeadStatusBadge';
import LeadSourceIcon from '../../../components/LeadManagement/LeadSourceIcon';
import SubmitSaleModal from '../../../components/LeadManagement/SubmitSaleModal';
import { STAGES, STAGE_META, PRIORITIES, CATEGORIES } from '../../../utils/leadConstants';
import { timeAgo } from '../../../utils/format';

// Single lead view: contact info + pipeline controls on the left, activity
// timeline in the middle, unified conversation thread on the right.
const LeadDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [followUpLocal, setFollowUpLocal] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [showSubmitSale, setShowSubmitSale] = useState(false);

  const loadLead = useCallback(async () => {
    try {
      const result = await getLeadById(id);
      setLead(result.lead);
      setNotes(result.lead.notes || '');
      setFollowUpLocal(
        result.lead.nextFollowUp
          ? new Date(result.lead.nextFollowUp).toISOString().slice(0, 16)
          : ''
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load lead', 'error');
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadLead();
  }, [loadLead]);

  useEffect(() => {
    if (!lead || !lead._id) return;
    getSuggestedAction(lead._id)
      .then((data) => setSuggestion(data))
      .catch(() => setSuggestion(null));
  }, [lead]);

  useEffect(() => {
    getUsers({ role: 'admin' })
      .then((data) => setAgents(data.users || []))
      .catch(() => setAgents([]));
  }, []);

  const runUpdate = async (fn, successMessage) => {
    setSaving(true);
    try {
      await fn();
      if (successMessage) showToast(successMessage);
      await loadLead();
    } catch (err) {
      showToast(err.response?.data?.message || 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = () =>
    runUpdate(() => updateLead(lead._id, { notes }), 'Notes saved');

  const saveFollowUp = () =>
    runUpdate(
      () =>
        setFollowUpDate(
          lead._id,
          followUpLocal ? new Date(followUpLocal).toISOString() : null
        ),
      followUpLocal ? 'Follow-up scheduled' : 'Follow-up cleared'
    );

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete this lead?',
      message: `"${lead.name}" will be permanently removed from the pipeline. This cannot be undone.`,
      confirmLabel: 'Delete lead',
      cancelLabel: 'Keep it',
    });
    if (!ok) return;
    try {
      await deleteLead(lead._id);
      showToast('Lead deleted');
      navigate('/dashboard/admin/lead-management');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete lead', 'error');
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-slate-muted">Loading lead...</div>;
  }

  if (!lead) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-muted mb-4">Lead not found.</p>
        <Link to="/dashboard/admin/lead-management" className="btn-secondary text-sm">
          ← Back to pipeline
        </Link>
      </div>
    );
  }

  const isOverdue =
    lead.nextFollowUp &&
    new Date(lead.nextFollowUp) < new Date() &&
    !['closed', 'lost'].includes(lead.stage);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/dashboard/admin/lead-management" className="text-xs text-brass hover:underline">
            ← Lead Pipeline
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-2xl">{lead.name}</h1>
            <LeadStatusBadge stage={lead.stage} />
            <LeadSourceIcon source={lead.source} showLabel />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lead.stage === 'negotiation' && lead.property && (
            <button
              onClick={() => setShowSubmitSale(true)}
              className="btn-gold text-sm"
              title="File a sale for admin verification"
            >
              Submit Sale
            </button>
          )}
          {user?.role === 'admin' && (
            <button
              onClick={handleDelete}
              className="text-sm text-white bg-red-500 hover:bg-red-600 px-3 py-1 hover:underline  "
              title="Delete lead (admin only)"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {lead.stage === 'pending_sale_verification' && (
        <div className="bg-brass/10 border border-brass/30 rounded-sm px-5 py-3 mb-6 text-sm">
          <span className="font-semibold text-brass-dark">
            Sale submitted — awaiting admin verification.
          </span>{' '}
          <span className="text-slate-ink">
            The property is reserved until an admin reviews it.
          </span>
        </div>
      )}

      {suggestion && (
        <div className="bg-brass/10 border border-brass/30 rounded-sm px-5 py-3 mb-6 text-sm">
          <span className="font-semibold text-brass-dark">Suggested next step:</span>{' '}
          <span className="text-slate-ink">{suggestion.reason}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: lead info + pipeline controls */}
        <div className="space-y-6">
          <div className="bg-white border border-navy/10 rounded-sm p-5">
            <h3 className="font-semibold text-navy mb-4">Contact</h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-muted">Email</dt>
                <dd className="text-slate-ink text-right break-all">{lead.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-muted">Phone</dt>
                <dd className="text-slate-ink">{lead.phone || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-muted">Account</dt>
                <dd className="text-slate-ink">
                  {lead.user ? (
                    <span>
                      {lead.user.name}
                      <span className="text-slate-muted text-xs"> (registered)</span>
                    </span>
                  ) : (
                    <span className="text-slate-muted">Guest</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-muted">Property</dt>
                <dd className="text-slate-ink text-right">{lead.property?.title || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-muted">Created</dt>
                <dd className="text-slate-ink">{timeAgo(lead.createdAt)}</dd>
              </div>
              {lead.closedAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-muted">Closed</dt>
                  <dd className="text-slate-ink">{timeAgo(lead.closedAt)}</dd>
                </div>
              )}
            </dl>
            {lead.contactForm && (
              <Link
                to={`/dashboard/admin/lead-management/contact-forms/${lead.contactForm._id || lead.contactForm}`}
                className="inline-block mt-3 text-xs text-brass hover:underline"
              >
                View original contact form →
              </Link>
            )}
            {lead.visit && (
              <p className="mt-2 text-xs text-slate-muted">
                Linked visit: {new Date(lead.visit.requestedSlot).toLocaleString()} ({lead.visit.status?.replace(/_/g, ' ')})
              </p>
            )}
          </div>

          <div className="bg-white border border-navy/10 rounded-sm p-5 space-y-4">
            <h3 className="font-semibold text-navy">Pipeline</h3>

            <div>
              <label className="label-field">Stage</label>
              <select
                value={lead.stage}
                disabled={saving}
                onChange={(e) =>
                  runUpdate(() => updateLeadStage(lead._id, e.target.value), 'Stage updated')
                }
                className="input-field text-sm"
              >
                {STAGES.filter((s) => s !== 'closed' || user?.role === 'admin').map((s) => (
                  <option key={s} value={s}>
                    {STAGE_META[s].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-field">Assigned agent</label>
              <select
                value={lead.assignedAgent?._id || ''}
                disabled={saving}
                onChange={(e) =>
                  runUpdate(
                    () => assignLeadToAgent(lead._id, e.target.value),
                    'Agent assigned'
                  )
                }
                className="input-field text-sm"
              >
                <option value="">Unassigned</option>
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
                value={lead.priority}
                disabled={saving}
                onChange={(e) =>
                  runUpdate(() => updateLeadPriority(lead._id, e.target.value), 'Priority updated')
                }
                className="input-field text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-field">Category</label>
              <select
                value={lead.category}
                disabled={saving}
                onChange={(e) =>
                  runUpdate(() => updateLead(lead._id, { category: e.target.value }), 'Category updated')
                }
                className="input-field text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-field">Next follow-up</label>
              <div className="flex md:flex-wrap gap-2">
                <input
                  type="datetime-local"
                  className="input-field text-sm"
                  value={followUpLocal}
                  onChange={(e) => setFollowUpLocal(e.target.value)}
                />
                <button
                  onClick={saveFollowUp}
                  disabled={saving}
                  className="btn-secondary text-xs px-3 whitespace-nowrap"
                >
                  Save
                </button>
              </div>
              {lead.nextFollowUp && (
                <button
                  onClick={() => runUpdate(() => markFollowUpDone(lead._id), 'Follow-up marked done')}
                  disabled={saving}
                  className="mt-2 text-xs text-sage hover:underline"
                >
                  ✓ Mark follow-up done
                </button>
              )}
              {isOverdue && (
                <p className="mt-2 text-xs text-brick font-medium">Follow-up is overdue</p>
              )}
            </div>
          </div>

          <div className="bg-white border border-navy/10 rounded-sm p-5">
            <h3 className="font-semibold text-navy mb-3">Internal notes</h3>
            <textarea
              rows={5}
              className="input-field text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Budget, requirements, call summaries..."
            />
            <button
              onClick={saveNotes}
              disabled={saving || notes === (lead.notes || '')}
              className="btn-gold text-sm mt-3 w-full disabled:opacity-50"
            >
              Save notes
            </button>
          </div>
        </div>

        {/* Middle: timeline */}
        <LeadActivityTimeline lead={lead} onChange={loadLead} />

        {/* Right: conversations */}
        <LeadConversationThread lead={lead} onChange={loadLead} />
      </div>

      <SubmitSaleModal
        lead={lead}
        property={lead.property}
        open={showSubmitSale}
        onClose={() => setShowSubmitSale(false)}
        onSuccess={() => {
          setShowSubmitSale(false);
          loadLead();
        }}
      />
    </div>
  );
};

export default LeadDetail;
