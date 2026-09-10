import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeads } from '../../../context/LeadContext';
import LeadStats from './LeadStats';
import LeadKanban from './LeadKanban';
import LeadList from './LeadList';
import ContactFormsInbox from './ContactFormsInbox';
import CreateLeadModal from './CreateLeadModal';
import { STAGES, STAGE_META, SOURCES, SOURCE_META, PRIORITIES } from '../../../utils/leadConstants';
import { getAgents } from '../../../services/agentService';

// Unified Lead Management dashboard - the single surface for the whole lead
// pipeline: kanban board, table view, and the contact form inbox whose
// submissions can be converted into leads in one click.
const LeadDashboard = () => {
  const { state, setFilters, resetFilters } = useLeads();
  const { filters } = state;

  const [view, setView] = useState('kanban'); // kanban | list | inbox
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [agents, setAgents] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    getAgents()
      .then((data) => setAgents(data.agents || []))
      .catch(() => setAgents([]));
  }, []);

  // Deep links from notifications / stats: ?followUp=overdue&tab=list
  useEffect(() => {
    const followUp = searchParams.get('followUp');
    const tab = searchParams.get('tab');
    if (followUp === 'overdue') {
      setFilters({ nextFollowUp: 'overdue' });
      if (tab === 'list') setView('list');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const clearFollowUpFilter = () => {
    resetFilters();
    setSearchParams({});
  };

  const refresh = () => setReloadKey((k) => k + 1);

  const hasFilters =
    filters.stage || filters.assignedAgent || filters.priority || filters.source ||
    filters.search || filters.nextFollowUp;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow mb-2">CRM</p>
          <h1 className="text-3xl">Lead Management</h1>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-gold">
          + New Lead
        </button>
      </div>

      <LeadStats reloadKey={reloadKey} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-navy/10 mb-5">
        {[
          { key: 'kanban', label: 'Pipeline Board' },
          { key: 'list', label: 'All Leads' },
          { key: 'inbox', label: 'Contact Form Inbox' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === key
                ? 'border-brass text-brass-dark'
                : 'border-transparent text-slate-muted hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters (pipeline + list views) */}
      {view !== 'inbox' && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <select
            value={filters.stage || ''}
            onChange={(e) => setFilters({ stage: e.target.value || null })}
            className="input-field text-sm py-2 w-auto min-w-[140px]"
          >
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_META[s].label}
              </option>
            ))}
          </select>

          <select
            value={filters.assignedAgent || ''}
            onChange={(e) => setFilters({ assignedAgent: e.target.value || null })}
            className="input-field text-sm py-2 w-auto min-w-[150px]"
          >
            <option value="">All agents</option>
            <option value="unassigned">Unassigned</option>
            {agents.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            value={filters.source || ''}
            onChange={(e) => setFilters({ source: e.target.value || null })}
            className="input-field text-sm py-2 w-auto min-w-[140px]"
          >
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_META[s].label}
              </option>
            ))}
          </select>

          <select
            value={filters.priority || ''}
            onChange={(e) => setFilters({ priority: e.target.value || null })}
            className="input-field text-sm py-2 w-auto min-w-[120px]"
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>

          <input
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            placeholder="Search name, email, phone..."
            className="input-field text-sm py-2 w-56"
          />

          {filters.nextFollowUp === 'overdue' && (
            <button
              onClick={clearFollowUpFilter}
              className="bg-brick/10 text-brick text-sm rounded-sm px-3 py-2 border border-brick/30 hover:bg-brick/15"
            >
              Overdue follow-ups ×
            </button>
          )}

          {hasFilters && (
            <button
              onClick={() => {
                resetFilters();
                setSearchParams({});
              }}
              className="text-sm text-slate-muted hover:text-navy underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {view === 'kanban' && (
        <LeadKanban filters={filters} reloadKey={reloadKey} />
      )}
      {view === 'list' && (
        <LeadList filters={filters} reloadKey={reloadKey} onConverted={refresh} />
      )}
      {view === 'inbox' && <ContactFormsInbox onConverted={refresh} />}

      {showCreateModal && (
        <CreateLeadModal
          onClose={() => setShowCreateModal(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
};

export default LeadDashboard;
