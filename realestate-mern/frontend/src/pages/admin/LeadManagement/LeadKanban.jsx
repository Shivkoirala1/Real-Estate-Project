import React, { useEffect, useState } from 'react';
import { getLeads, updateLeadStage } from '../../../services/leadService';
import { useToast } from '../../../context/ToastContext';
import LeadCard from '../../../components/LeadManagement/LeadCard';
import LostReasonModal from '../../../components/LeadManagement/LostReasonModal';
import { STAGES, STAGE_META } from '../../../utils/leadConstants';
import { isLeadFrozenForManualMove } from '../../../utils/leadGuards';

// Kanban board: one column per pipeline stage, drag & drop to move leads.
// Uses native HTML5 drag events (no extra dependency) and optimistically
// updates the UI, rolling back if the API rejects the move.
//
// `pending_verification` stays visible as a column (leads must not disappear)
// but is never a drop target: the backend rejects every manual move into it
// (filing flow only). Frozen (verification-closed) cards are not draggable.
// Terminal stages (`closed`, `lost`) have no column: the default list query
// excludes them, and they are reachable via the list view's explicit stage
// filter instead.
const BOARD_STAGES = STAGES.filter((s) => s !== 'closed' && s !== 'lost');

const LeadKanban = ({ filters = {}, reloadKey = 0 }) => {
  const { showToast } = useToast();
  const [columns, setColumns] = useState(() =>
    Object.fromEntries(BOARD_STAGES.map((s) => [s, { leads: [], total: 0 }]))
  );
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [lostTarget, setLostTarget] = useState(null);
  const [lostSaving, setLostSaving] = useState(false);
  const [lostError, setLostError] = useState('');

  useEffect(() => {
    loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, filters.stage, filters.assignedAgent, filters.priority, filters.source, filters.search, filters.nextFollowUp]);

  const loadBoard = async () => {
    setLoading(true);
    try {
      // One fetch (agents are scoped server-side), then group locally
      const params = {
        limit: 300,
        includeCounts: true,
        sort: 'priority',
      };
      if (filters.assignedAgent) params.assignedAgent = filters.assignedAgent;
      if (filters.priority) params.priority = filters.priority;
      if (filters.source) params.source = filters.source;
      if (filters.search) params.search = filters.search;
      if (filters.nextFollowUp) params.nextFollowUp = filters.nextFollowUp;

      const result = await getLeads(params);
      const leads = result.leads || [];
      const counts = result.countsByStage || {};

      const next = {};
      BOARD_STAGES.forEach((stage) => {
        next[stage] = {
          leads: leads.filter((l) => l.stage === stage),
          total: counts[stage] ?? leads.filter((l) => l.stage === stage).length,
        };
      });
      setColumns(next);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load pipeline', 'error');
    } finally {
      setLoading(false);
    }
  };

  const moveLead = async (lead, stage, note) => {
    // Optimistic move
    setColumns((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((s) => {
        updated[s] = {
          ...updated[s],
          leads: updated[s].leads.filter((l) => l._id !== lead._id),
        };
      });
      if (updated[stage]) {
        updated[stage] = {
          ...updated[stage],
          leads: [{ ...lead, stage }, ...updated[stage].leads],
        };
      }
      return updated;
    });

    try {
      await updateLeadStage(lead._id, stage, note);
      showToast(`"${lead.name}" moved to ${STAGE_META[stage].label}`);
      loadBoard(); // refresh totals + ordering
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to move lead', 'error');
      loadBoard(); // roll back to server state
    }
  };

  const handleDrop = async (stage) => {
    const leadId = draggingId;
    setDraggingId(null);
    setDragOverStage(null);
    if (!leadId) return;

    const lead = Object.values(columns)
      .flatMap((c) => c.leads)
      .find((l) => l._id === leadId);
    if (!lead || lead.stage === stage) return;
    if (isLeadFrozenForManualMove(lead)) {
      showToast('This lead is frozen and cannot be moved manually', 'error');
      return;
    }
    // Drops into `lost` need a reason - collect it before moving.
    if (stage === 'lost') {
      setLostError('');
      setLostTarget(lead);
      return;
    }

    await moveLead(lead, stage);
  };

  const handleLostSubmit = async (reason) => {
    if (!reason || reason.trim().length < 10) {
      setLostError('Loss reason must be at least 10 characters after removing extra spaces');
      return;
    }
    const lead = lostTarget;
    if (!lead) return;
    setLostSaving(true);
    setLostError('');
    try {
      await moveLead(lead, 'lost', reason);
      setLostTarget(null);
    } catch (err) {
      // moveLead already toasted + rolled back to server state.
      setLostError(err.response?.data?.message || 'Failed to mark lead as lost');
    } finally {
      setLostSaving(false);
    }
  };

  return (
    <div className="overflow-x-auto pb-4 -mx-1 px-1">
      <LostReasonModal
        open={Boolean(lostTarget)}
        leadName={lostTarget?.name}
        saving={lostSaving}
        error={lostError}
        onClose={() => { if (!lostSaving) setLostTarget(null); }}
        onSubmit={handleLostSubmit}
      />
      <div className="flex gap-4 min-w-max">
        {BOARD_STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const isDragOver = dragOverStage === stage;
          // System-only stage: visible, never a drop target.
          const isDropDisabled = stage === 'pending_verification';
          return (
            <div
              key={stage}
              onDragOver={isDropDisabled ? undefined : (e) => {
                e.preventDefault();
                setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage((cur) => (cur === stage ? null : cur))}
              onDrop={isDropDisabled ? undefined : () => handleDrop(stage)}
              className={`flex-shrink-0 w-72 rounded-sm border transition-colors ${
                isDragOver ? 'border-brass bg-brass/5' : 'border-navy/10 bg-parchment/60'
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-navy/10">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-navy">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  {meta.label}
                </span>
                <span className="text-xs text-slate-muted">{columns[stage].total}</span>
              </div>
              {isDropDisabled && (
                <p className="px-4 pt-2 text-[11px] text-slate-muted">Moves here only via filing</p>
              )}

              <div className="p-3 space-y-3 min-h-[160px] max-h-[62vh] overflow-y-auto">
                {loading ? (
                  [...Array(2)].map((_, i) => (
                    <div key={i} className="h-24 bg-white/70 border border-navy/5 rounded-sm animate-pulse" />
                  ))
                ) : columns[stage].leads.length === 0 ? (
                  <p className="text-xs text-slate-muted text-center py-6">
                    {isDragOver ? 'Drop to move here' : 'No leads in this stage'}
                  </p>
                ) : (
                  columns[stage].leads.map((lead) => (
                    <KanbanCard
                      key={lead._id}
                      lead={lead}
                      frozen={isLeadFrozenForManualMove(lead)}
                      dragging={draggingId === lead._id}
                      onDragStart={() => setDraggingId(lead._id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverStage(null);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Thin wrapper around the shared LeadCard adding drag styling. Frozen
// verification/closed cards render dimmed and are not draggable.
const KanbanCard = ({ lead, frozen, dragging, onDragStart, onDragEnd }) => (
  <div
    draggable={!frozen}
    onDragStart={frozen ? undefined : onDragStart}
    onDragEnd={onDragEnd}
    title={frozen ? 'This lead is frozen and cannot be moved manually' : undefined}
    className={`${dragging ? 'opacity-40' : ''} ${frozen ? 'opacity-70 saturate-50' : ''}`}
  >
    <LeadCard lead={lead} compact />
  </div>
);

export default LeadKanban;
