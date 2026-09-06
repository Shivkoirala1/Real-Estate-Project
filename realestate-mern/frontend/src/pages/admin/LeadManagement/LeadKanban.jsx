import React, { useEffect, useState } from 'react';
import { getLeads, updateLeadStage } from '../../../services/leadService';
import { useToast } from '../../../context/ToastContext';
import LeadCard from '../../../components/LeadManagement/LeadCard';
import { STAGES, STAGE_META } from '../../../utils/leadConstants';

// Kanban board: one column per pipeline stage, drag & drop to move leads.
// Uses native HTML5 drag events (no extra dependency) and optimistically
// updates the UI, rolling back if the API rejects the move.
const LeadKanban = ({ filters = {}, reloadKey = 0 }) => {
  const { showToast } = useToast();
  const [columns, setColumns] = useState(() =>
    Object.fromEntries(STAGES.map((s) => [s, { leads: [], total: 0 }]))
  );
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);

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
      STAGES.forEach((stage) => {
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

  const handleDrop = async (stage) => {
    const leadId = draggingId;
    setDraggingId(null);
    setDragOverStage(null);
    if (!leadId) return;

    const lead = Object.values(columns)
      .flatMap((c) => c.leads)
      .find((l) => l._id === leadId);
    if (!lead || lead.stage === stage) return;

    // Optimistic move
    setColumns((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((s) => {
        updated[s] = {
          ...updated[s],
          leads: updated[s].leads.filter((l) => l._id !== leadId),
        };
      });
      updated[stage] = {
        ...updated[stage],
        leads: [{ ...lead, stage }, ...updated[stage].leads],
      };
      return updated;
    });

    try {
      await updateLeadStage(leadId, stage);
      showToast(`"${lead.name}" moved to ${STAGE_META[stage].label}`);
      loadBoard(); // refresh totals + ordering
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to move lead', 'error');
      loadBoard(); // roll back to server state
    }
  };

  return (
    <div className="overflow-x-auto pb-4 -mx-1 px-1">
      <div className="flex gap-4 min-w-max">
        {STAGES.map((stage) => {
          const meta = STAGE_META[stage];
          const isDragOver = dragOverStage === stage;
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage((cur) => (cur === stage ? null : cur))}
              onDrop={() => handleDrop(stage)}
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

// Thin wrapper around the shared LeadCard adding drag styling.
const KanbanCard = ({ lead, dragging, onDragStart, onDragEnd }) => (
  <div
    draggable
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    className={dragging ? 'opacity-40' : ''}
  >
    <LeadCard lead={lead} compact />
  </div>
);

export default LeadKanban;
