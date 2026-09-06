import React, { useState } from 'react';
import { addLeadActivity } from '../../services/leadService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/format';

const ACTIVITY_ICONS = {
  created: '✦',
  stage_changed: '⇄',
  assigned: '◎',
  note_added: '✎',
  follow_up_set: '⏰',
  follow_up_done: '✓',
  converted: '⇢',
  conversation_message: '✉',
  updated: '•',
};

const ACTIVITY_COLORS = {
  created: '#1F2A44',
  stage_changed: '#4C6FA0',
  assigned: '#B8863B',
  note_added: '#6B8F71',
  follow_up_set: '#B8863B',
  follow_up_done: '#6B8F71',
  converted: '#A64B42',
  conversation_message: '#4C6FA0',
  updated: '#8A8A82',
};

// Embedded activity timeline for a single lead, with a quick note composer.
const LeadActivityTimeline = ({ lead, onChange }) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const activities = lead.activities || [];

  const addNote = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      await addLeadActivity(lead._id, note.trim(), 'note_added');
      setNote('');
      // Refresh full lead so the timeline includes the new entry
      onChange && (await onChange());
      showToast('Note added to timeline');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add note', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white border border-navy/10 rounded-sm p-5">
      <h3 className="font-semibold text-navy mb-4">Activity Timeline</h3>

      {user && (
        <div className="flex gap-2 mb-5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNote()}
            placeholder="Log a call, meeting, or note..."
            className="input-field text-sm"
          />
          <button
            onClick={addNote}
            disabled={sending || !note.trim()}
            className="btn-gold text-sm px-4 whitespace-nowrap disabled:opacity-50"
          >
            {sending ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {activities.length === 0 ? (
        <p className="text-sm text-slate-muted">No activity recorded yet.</p>
      ) : (
        <ol className="relative border-l border-navy/10 ml-3 space-y-4">
          {activities.map((a, i) => {
            const color = ACTIVITY_COLORS[a.type] || '#8A8A82';
            return (
              <li key={a._id || i} className="ml-6">
                <span
                  className="absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full text-[11px] bg-white border"
                  style={{ borderColor: `${color}55`, color }}
                >
                  {ACTIVITY_ICONS[a.type] || '•'}
                </span>
                <p className="text-sm text-slate-ink">{a.message}</p>
                <p className="text-[11px] text-slate-muted mt-0.5">
                  {a.byName || 'System'} · {timeAgo(a.createdAt)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default LeadActivityTimeline;
