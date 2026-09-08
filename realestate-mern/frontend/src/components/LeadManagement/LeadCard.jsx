import React from 'react';
import { useNavigate } from 'react-router-dom';
import LeadSourceIcon from './LeadSourceIcon';
import LeadStatusBadge from './LeadStatusBadge';
import { PRIORITY_META } from '../../utils/leadConstants';
import { timeAgo } from '../../utils/format';

// Reusable lead card used on the kanban board (draggable) and in lists.
const LeadCard = ({ lead, draggable = false, onDragStart, compact = false }) => {
  const navigate = useNavigate();
  const priority = PRIORITY_META[lead.priority] || PRIORITY_META.medium;

  const isOverdue =
    lead.nextFollowUp &&
    new Date(lead.nextFollowUp) < new Date() &&
    !['closed', 'lost'].includes(lead.stage);

  const open = () => navigate(`/dashboard/lead-management/leads/${lead._id}`);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={open}
      className={`bg-white border border-navy/10 rounded-sm p-3 cursor-pointer hover:border-brass/60 hover:shadow-card transition-shadow ${
        draggable ? 'active:cursor-grabbing' : ''
      }`}
      data-lead-id={lead._id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-navy text-sm truncate">{lead.name}</p>
          {!compact && (
            <p className="text-xs text-slate-muted truncate">
              {lead.email}
              {lead.phone ? ` · ${lead.phone}` : ''}
            </p>
          )}
        </div>
        <LeadSourceIcon source={lead.source} />
      </div>

      {lead.property && (
        <p className="mt-2 text-xs text-slate-muted truncate">
          <span className="text-slate-ink font-medium">Property:</span> {lead.property.title}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <LeadStatusBadge stage={lead.stage} size="xs" />
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-muted">
          <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
          {priority.label}
        </span>
      </div>

      {!compact && (
        <div className="mt-2.5 pt-2 border-t border-navy/5 flex items-center justify-between text-[11px] text-slate-muted">
          <span>{lead.assignedAgent ? lead.assignedAgent.name : 'Unassigned'}</span>
          <span>
            {isOverdue ? (
              <span className="text-brick font-medium">Follow-up overdue</span>
            ) : lead.nextFollowUp ? (
              <>Follow-up {timeAgo(lead.nextFollowUp)}</>
            ) : (
              <>Updated {timeAgo(lead.lastActivity || lead.updatedAt)}</>
            )}
          </span>
        </div>
      )}
    </div>
  );
};

export default LeadCard;
