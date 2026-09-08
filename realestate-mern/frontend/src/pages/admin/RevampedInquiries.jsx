import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  getInquiries,
  getSentInquiries,
  updateInquiry,
  replyToInquiry,
  deleteInquiry,
} from '../../services/inquiryService';
import { getUsers } from '../../services/userService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/format';

// Message read/response indicator (separate from pipeline `stage` below)
const messageStatusColors = {
  new: 'bg-brick-light text-brick',
  read: 'bg-parchment text-slate-ink',
  responded: 'bg-sage-light text-sage',
};

// ----- Pipeline stages -----
// These are the literal `stage` enum values the backend writes (see the Visit
// controller, which sets 'Site Visit Scheduled' / 'Office Visit Scheduled' /
// 'Negotiation' / 'Lost' automatically). The Kanban groups the two visit
// stages into one column since they represent the same point in the funnel.
const STAGE_COLUMNS = [
  { key: 'New', label: 'New', stages: ['New'], color: '#A64B42' }, // brick
  { key: 'Contacted', label: 'Contacted', stages: ['Contacted'], color: '#B08D57' }, // brass
  { key: 'VisitScheduled', label: 'Visit Scheduled', stages: ['Site Visit Scheduled', 'Office Visit Scheduled'], color: '#4C6FA0' }, // slate-blue
  { key: 'Negotiation', label: 'Negotiation', stages: ['Negotiation'], color: '#6B8F71' }, // sage
  { key: 'Closed', label: 'Closed', stages: ['Closed'], color: '#1F2A44' }, // navy
  { key: 'Lost', label: 'Lost', stages: ['Lost'], color: '#8A8A82' }, // slate-muted
];
const ALL_STAGES = STAGE_COLUMNS.flatMap((c) => c.stages);
const columnForStage = (stage) => STAGE_COLUMNS.find((c) => c.stages.includes(stage)) || STAGE_COLUMNS[0];

// ----- Shared conversation thread + reply box, used by both the Received -----
// ----- and Sent tabs. `viewerSide` is which side of the conversation the   -----
// ----- person looking at the screen is on, so their own messages align    -----
// ----- to the right like a familiar chat UI.                              -----
const MessageThread = ({ inquiry, viewerSide, onReply, sending }) => {
  const [text, setText] = useState('');
  const messages = inquiry.messages && inquiry.messages.length > 0
    ? inquiry.messages
    : [{ _id: 'legacy-initial', side: 'inquirer', senderName: inquiry.name, body: inquiry.message, createdAt: inquiry.createdAt }];

  const submit = () => {
    if (!text.trim()) return;
    onReply(text.trim());
    setText('');
  };

  return (
    <div>
      <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
        {messages.map((m) => {
          const isMine = m.side === viewerSide;
          return (
            <div key={m._id || `${m.side}-${m.createdAt}`} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-sm px-3 py-2 ${isMine ? 'bg-navy text-ivory' : 'bg-parchment text-slate-ink'}`}>
                <p className={`text-[11px] mb-0.5 ${isMine ? 'text-ivory/70' : 'text-slate-muted'}`}>
                  {m.senderName || m.sender?.name || (m.side === 'owner' ? 'Agent' : inquiry.name)} · {timeAgo(m.createdAt)}
                </p>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder={viewerSide === 'owner' ? 'Write a reply to send to the inquirer...' : 'Write a follow-up message...'}
          className="input-field flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <button onClick={submit} disabled={sending || !text.trim()} className="btn-gold text-sm px-4 self-end">
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

// Dropdown for manually moving an inquiry to a different pipeline stage
const StageSelect = ({ value, onChange, disabled, className = '' }) => (
  <select
    value={value || 'New'}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value)}
    className={`input-field text-sm py-1.5 ${className}`}
  >
    {ALL_STAGES.map((s) => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
);

// Dropdown for reassigning the agent handling an inquiry. Agents are fetched
// once and shared across the board; assumes admin/staff accounts are the
// `role: 'admin'` users, matching how Visit.assignedAgent is populated.
const AgentSelect = ({ agents, value, onChange, disabled, className = '' }) => (
  <select
    value={value || ''}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value || null)}
    className={`input-field text-sm py-1.5 ${className}`}
  >
    <option value="">Unassigned</option>
    {agents.map((a) => (
      <option key={a._id} value={a._id}>{a.name}</option>
    ))}
  </select>
);

// ----- Detail panel: full thread + stage/agent controls + status actions, -----
// ----- opened by clicking a card (Kanban) or a row (table).               -----
const InquiryDetailPanel = ({ inquiry, agents, onClose, onReply, sending, onStageChange, onAgentChange, onStatusChange, onDelete, isAdmin, savingField }) => {
  if (!inquiry) return null;
  return (
    <div className="fixed inset-0 bg-navy/40 z-40 flex items-stretch justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="eyebrow mb-1">Lead</p>
            <h2 className="text-xl text-navy">{inquiry.name}</h2>
            <p className="text-sm text-slate-muted">{inquiry.email}{inquiry.phone ? ` · ${inquiry.phone}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-slate-muted hover:text-navy text-xl leading-none">×</button>
        </div>

        {inquiry.property && (
          <Link to={`/properties/${inquiry.property.slug || inquiry.property._id}`} className="text-sm text-brass hover:underline block mb-4">
            Re: {inquiry.property.title}
          </Link>
        )}

        <div className="grid grid-cols-2 gap-4 mb-5 bg-parchment/60 rounded-sm p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Pipeline Stage</p>
            <StageSelect
              value={inquiry.stage}
              disabled={savingField === 'stage'}
              onChange={(stage) => onStageChange(inquiry, stage)}
              className="w-full"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Assigned Agent</p>
            <AgentSelect
              agents={agents}
              value={inquiry.assignedAgent?._id || inquiry.assignedAgent}
              disabled={savingField === 'assignedAgent'}
              onChange={(agentId) => onAgentChange(inquiry, agentId)}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <span className={`status-badge ${messageStatusColors[inquiry.status] || messageStatusColors.new}`}>{inquiry.status}</span>
          <span className="text-xs text-slate-muted">Received {timeAgo(inquiry.createdAt)}</span>
        </div>

        <MessageThread
          inquiry={inquiry}
          viewerSide="owner"
          sending={sending}
          onReply={(message) => onReply(inquiry._id, message)}
        />

        {isAdmin && (
          <div className="flex flex-wrap gap-3 text-sm mt-6 pt-4 border-t border-navy/10">
            {inquiry.status !== 'read' && <button onClick={() => onStatusChange(inquiry._id, 'read')} className="text-brass hover:underline">Mark as Read</button>}
            {inquiry.status !== 'responded' && <button onClick={() => onStatusChange(inquiry._id, 'responded')} className="text-sage hover:underline">Mark as Responded</button>}
            <button onClick={() => onDelete(inquiry._id)} className="text-brick hover:underline ml-auto">Delete</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ----- Kanban board across pipeline stages, with drag-and-drop between columns -----
const KanbanBoard = ({ inquiries, onOpen, onDropStage }) => {
  const [dragOverCol, setDragOverCol] = useState(null);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(STAGE_COLUMNS.map((c) => [c.key, []]));
    inquiries.forEach((inq) => {
      const col = columnForStage(inq.stage);
      map[col.key].push(inq);
    });
    return map;
  }, [inquiries]);

  const handleDrop = (e, column) => {
    e.preventDefault();
    setDragOverCol(null);
    const inquiryId = e.dataTransfer.getData('text/inquiry-id');
    const inquiry = inquiries.find((i) => i._id === inquiryId);
    if (!inquiry) return;
    // Visit Scheduled has two underlying stage values; infer which one based
    // on whether the lead is tied to a property (site visit) or not (office visit).
    const targetStage = column.key === 'VisitScheduled'
      ? (inquiry.property ? 'Site Visit Scheduled' : 'Office Visit Scheduled')
      : column.stages[0];
    if (targetStage !== inquiry.stage) onDropStage(inquiry, targetStage);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGE_COLUMNS.map((col) => (
        <div
          key={col.key}
          onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
          onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
          onDrop={(e) => handleDrop(e, col)}
          className={`flex-shrink-0 w-72 rounded-sm border ${dragOverCol === col.key ? 'border-brass bg-brass/5' : 'border-navy/10 bg-parchment/40'} p-3`}
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
              <p className="text-sm font-semibold text-navy">{col.label}</p>
            </div>
            <span className="text-xs text-slate-muted">{grouped[col.key].length}</span>
          </div>

          <div className="space-y-2 min-h-[60px]">
            {grouped[col.key].map((inq) => (
              <div
                key={inq._id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/inquiry-id', inq._id)}
                onClick={() => onOpen(inq)}
                className="bg-white border border-navy/10 rounded-sm p-3 shadow-card cursor-pointer hover:border-brass/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-navy leading-tight">{inq.name}</p>
                  {inq.status === 'new' && <span className="w-2 h-2 rounded-full bg-brick flex-shrink-0 mt-1" title="Unread" />}
                </div>
                {inq.property?.title && <p className="text-xs text-brass truncate mb-1">{inq.property.title}</p>}
                <p className="text-xs text-slate-muted truncate mb-2">{inq.message}</p>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-muted">{timeAgo(inq.createdAt)}</p>
                  <p className="text-[11px] text-slate-ink truncate max-w-[100px]">
                    {inq.assignedAgent?.name || 'Unassigned'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ----- Flat, filterable table view of the same pipeline data -----
const InquiryTable = ({ inquiries, onOpen }) => (
  <div className="overflow-x-auto border border-navy/10 rounded-sm">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-parchment text-left text-xs uppercase tracking-wide text-slate-muted">
          <th className="px-4 py-3">Lead</th>
          <th className="px-4 py-3">Property</th>
          <th className="px-4 py-3">Stage</th>
          <th className="px-4 py-3">Assigned Agent</th>
          <th className="px-4 py-3">Received</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {inquiries.map((inq) => {
          const col = columnForStage(inq.stage);
          return (
            <tr key={inq._id} className="border-t border-navy/10 hover:bg-parchment/40">
              <td className="px-4 py-3">
                <p className="font-medium text-navy flex items-center gap-1.5">
                  {inq.name}
                  {inq.status === 'new' && <span className="w-1.5 h-1.5 rounded-full bg-brick" title="Unread" />}
                </p>
                <p className="text-xs text-slate-muted">{inq.email}</p>
              </td>
              <td className="px-4 py-3 text-slate-ink">{inq.property?.title || '—'}</td>
              <td className="px-4 py-3">
                <span className="status-badge text-white" style={{ backgroundColor: col.color }}>{inq.stage || 'New'}</span>
              </td>
              <td className="px-4 py-3 text-slate-ink">{inq.assignedAgent?.name || 'Unassigned'}</td>
              <td className="px-4 py-3 text-slate-muted whitespace-nowrap">{timeAgo(inq.createdAt)}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onOpen(inq)} className="text-navy font-medium hover:underline">Open</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ----- Received inquiries: the agent/admin-facing lead pipeline -----
const ReceivedInquiries = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [inquiries, setInquiries] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('board'); // 'board' | 'table'
  const [stageFilter, setStageFilter] = useState('');
  const [activeInquiry, setActiveInquiry] = useState(null);
  const [sendingReplyFor, setSendingReplyFor] = useState(null);
  const [savingField, setSavingField] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInquiries();
      setInquiries(data.inquiries);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load the assignable agent list once. Adjust the endpoint/params here if
  // your API exposes staff differently than `role=admin`.
  useEffect(() => {
    getUsers({ role: 'admin' })
      .then((data) => setAgents(data.users || data.data || []))
      .catch(() => setAgents([]));
  }, []);

  const patchInquiry = async (id, body, field) => {
    setSavingField(field);
    try {
      const data = await updateInquiry(id, body);
      setInquiries((prev) => prev.map((i) => (i._id === id ? { ...i, ...(data.inquiry || body) } : i)));
      setActiveInquiry((prev) => (prev && prev._id === id ? { ...prev, ...(data.inquiry || body) } : prev));
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update inquiry', 'error');
    } finally {
      setSavingField(null);
    }
  };

  const handleStageChange = (inquiry, stage) => patchInquiry(inquiry._id, { stage }, 'stage');
  const handleAgentChange = (inquiry, assignedAgent) => patchInquiry(inquiry._id, { assignedAgent }, 'assignedAgent');

  const updateStatus = async (id, status) => {
    try {
      await updateInquiry(id, { status });
      showToast('Inquiry updated');
      setInquiries((prev) => prev.map((i) => (i._id === id ? { ...i, status } : i)));
      setActiveInquiry((prev) => (prev && prev._id === id ? { ...prev, status } : prev));
    } catch (err) {
      showToast('Failed to update', 'error');
    }
  };

  const remove = async (id) => {
    const confirmed = await confirm({
      title: 'Delete this inquiry?',
      message: 'This conversation thread will be permanently deleted.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'No, cancel',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteInquiry(id);
      showToast('Inquiry deleted');
      setActiveInquiry(null);
      load();
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  const sendReply = async (id, message) => {
    setSendingReplyFor(id);
    try {
      const data = await replyToInquiry(id, message);
      showToast('Reply sent to the inquirer');
      // Refresh just this thread's messages/status rather than the whole board
      setInquiries((prev) => prev.map((i) => (i._id === id ? { ...i, ...data.inquiry } : i)));
      setActiveInquiry((prev) => (prev && prev._id === id ? { ...prev, ...data.inquiry } : prev));
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send reply', 'error');
    } finally {
      setSendingReplyFor(null);
    }
  };

  const filtered = stageFilter
    ? inquiries.filter((i) => columnForStage(i.stage).key === stageFilter)
    : inquiries;

  if (loading) return <p className="text-slate-muted">Loading...</p>;
  if (inquiries.length === 0) {
    return <p className="text-slate-muted py-10 text-center border border-dashed border-navy/20 rounded-sm">No inquiries yet.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex gap-1 bg-parchment rounded-sm p-1 flex-wrap">
          <button
            onClick={() => setStageFilter('')}
            className={`text-xs md:text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${stageFilter === '' ? 'bg-white text-navy shadow-sm' : 'text-slate-muted hover:text-navy'}`}
          >
            All
          </button>
          {STAGE_COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => setStageFilter(col.key)}
              className={`text-xs md:text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${stageFilter === col.key ? 'bg-white text-navy shadow-sm' : 'text-slate-muted hover:text-navy'}`}
            >
              {col.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-parchment rounded-sm p-1">
          <button
            onClick={() => setView('board')}
            className={`text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${view === 'board' ? 'bg-white text-navy shadow-sm' : 'text-slate-muted hover:text-navy'}`}
          >
            Board
          </button>
          <button
            onClick={() => setView('table')}
            className={`text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${view === 'table' ? 'bg-white text-navy shadow-sm' : 'text-slate-muted hover:text-navy'}`}
          >
            Table
          </button>
        </div>
      </div>

      {view === 'board' ? (
        <KanbanBoard inquiries={filtered} onOpen={setActiveInquiry} onDropStage={handleStageChange} />
      ) : (
        <InquiryTable inquiries={filtered} onOpen={setActiveInquiry} />
      )}

      <InquiryDetailPanel
        inquiry={activeInquiry}
        agents={agents}
        isAdmin
        sending={sendingReplyFor === activeInquiry?._id}
        savingField={savingField}
        onClose={() => setActiveInquiry(null)}
        onReply={sendReply}
        onStageChange={handleStageChange}
        onAgentChange={handleAgentChange}
        onStatusChange={updateStatus}
        onDelete={remove}
      />
    </div>
  );
};

// ----- Sent inquiries: messages YOU sent about other people's listings, and their status -----
const SentInquiries = () => {
  const { showToast } = useToast();
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openThreadFor, setOpenThreadFor] = useState(null);
  const [sendingReplyFor, setSendingReplyFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getSentInquiries();
      setInquiries(data.inquiries);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sendFollowUp = async (id, message) => {
    setSendingReplyFor(id);
    try {
      await replyToInquiry(id, message);
      showToast('Message sent');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send message', 'error');
    } finally {
      setSendingReplyFor(null);
    }
  };

  if (loading) return <p className="text-slate-muted">Loading...</p>;
  if (inquiries.length === 0) {
    return (
      <p className="text-slate-muted py-10 text-center border border-dashed border-navy/20 rounded-sm">
        You haven't sent any inquiries yet. Reach out from any property's detail page.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {inquiries.map((inq) => {
        const col = columnForStage(inq.stage);
        return (
          <div key={inq._id} className="bg-white border border-navy/10 rounded-sm p-5">
            <div className="flex items-start justify-between mb-2 gap-3">
              <div>
                {inq.property ? (
                  <Link to={`/properties/${inq.property._id}`} className="font-semibold text-navy hover:text-brass">
                    {inq.property.title}
                  </Link>
                ) : (
                  <p className="font-semibold text-navy">{inq.subject || 'General Inquiry'}</p>
                )}
                <p className="text-xs text-slate-muted mt-0.5">Sent {timeAgo(inq.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`status-badge flex-shrink-0 ${messageStatusColors[inq.status]}`}>
                  {inq.status === 'new' ? 'Awaiting reply' : inq.status === 'read' ? 'Seen by agent' : 'Responded'}
                </span>
                {inq.stage && (
                  <span className="status-badge text-white text-[11px]" style={{ backgroundColor: col.color }}>{inq.stage}</span>
                )}
              </div>
            </div>

            {openThreadFor === inq._id ? (
              <MessageThread
                inquiry={inq}
                viewerSide="inquirer"
                sending={sendingReplyFor === inq._id}
                onReply={(message) => sendFollowUp(inq._id, message)}
              />
            ) : (
              <>
                <p className="text-sm text-slate-ink mb-3">{inq.message}</p>
                {inq.response ? (
                  <div className="bg-sage-light border-l-2 border-sage rounded-sm px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-sage mb-1">
                      Reply from {inq.respondedBy?.name || 'the agent'}
                    </p>
                    <p className="text-sm text-slate-ink">{inq.response}</p>
                    {inq.respondedAt && <p className="text-xs text-slate-muted mt-1">{timeAgo(inq.respondedAt)}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-slate-muted italic">No reply yet — you'll get a notification the moment there's an update.</p>
                )}
              </>
            )}

            <button
              onClick={() => setOpenThreadFor(openThreadFor === inq._id ? null : inq._id)}
              className="text-sm text-navy font-medium hover:underline mt-3"
            >
              {openThreadFor === inq._id ? 'Hide conversation' : 'Open conversation & reply'}
            </button>
          </div>
        );
      })}
    </div>
  );
};

const tabBtnClass = (active) =>
  `px-4 py-2.5 text-sm font-medium rounded-sm transition-colors ${
    active ? 'bg-navy text-ivory' : 'text-slate-ink hover:bg-parchment'
  }`;

const Inquiries = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = !isAdmin ? 'sent' : (searchParams.get('tab') === 'sent' ? 'sent' : 'received');
  const [tab, setTab] = useState(initialTab);

  const switchTab = (next) => {
    setTab(next);
    setSearchParams(next === 'sent' ? { tab: 'sent' } : {});
  };

  return (
    <div>
      <p className="eyebrow mb-2">Messages</p>
      <h1 className="text-3xl mb-6">{isAdmin ? 'Lead Pipeline' : 'My Inquiries'}</h1>

      {isAdmin && (
        <div className="flex gap-2 mb-6 border-b border-navy/10 pb-4">
          <button onClick={() => switchTab('received')} className={tabBtnClass(tab === 'received')}>Pipeline</button>
          <button onClick={() => switchTab('sent')} className={tabBtnClass(tab === 'sent')}>Sent by Me</button>
        </div>
      )}

      {tab === 'received' ? <ReceivedInquiries /> : <SentInquiries />}
    </div>
  );
};

export default Inquiries;