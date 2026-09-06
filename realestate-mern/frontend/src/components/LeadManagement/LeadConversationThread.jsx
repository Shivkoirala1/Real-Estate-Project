import React, { useMemo, useState } from 'react';
import { startConversation, addMessageToConversation, closeConversation } from '../../services/conversationService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/format';

// Unified conversation thread attached to a lead. Renders every thread linked
// to the lead (lead.conversationThreads) with a reply box; admins/agents can
// also open a new thread when the lead is tied to a registered user.
const LeadConversationThread = ({ lead, onChange }) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);

  const threads = useMemo(
    () =>
      (lead.conversationThreads || [])
        .slice()
        .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)),
    [lead.conversationThreads]
  );

  const isAdmin = user?.role === 'admin';

  const startThread = async () => {
    if (!lead.user) {
      showToast('This lead has no linked registered user to converse with', 'error');
      return;
    }
    setStarting(true);
    try {
      // Owner is the assigned agent (or the acting admin) on the other side
      const ownerId = lead.assignedAgent?._id || user._id;
      await startConversation({
        inquirer: lead.user._id || lead.user,
        owner: ownerId,
        lead: lead._id,
        property: lead.property?._id || lead.property || undefined,
        initialMessage: `Hi ${lead.name}, following up on your inquiry.`,
      });
      showToast('Conversation started');
      onChange && (await onChange());
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to start conversation', 'error');
    } finally {
      setStarting(false);
    }
  };

  const reply = async (thread) => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await addMessageToConversation(thread._id, text.trim());
      setText('');
      onChange && (await onChange());
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white border border-navy/10 rounded-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-navy">Conversations</h3>
        {threads.length === 0 && lead.user && (
          <button
            onClick={startThread}
            disabled={starting}
            className="text-xs text-brass hover:underline disabled:opacity-50"
          >
            {starting ? 'Starting...' : '+ Start thread'}
          </button>
        )}
      </div>

      {threads.length === 0 ? (
        <p className="text-sm text-slate-muted">
          {lead.user
            ? 'No conversation yet. Start a thread to message this lead.'
            : 'No conversation possible - this lead came from an unregistered contact (no account to message).'}
        </p>
      ) : (
        threads.map((thread) => {
          const messages = thread.messages || [];
          // "Owner" side aligns right for admins/agents viewing the pipeline
          const viewerSide = isAdmin || thread.owner?._id === user?._id ? 'owner' : 'inquirer';
          return (
            <div key={thread._id} className="border border-navy/10 rounded-sm p-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-muted">
                  Thread · {thread.isActive ? 'Active' : 'Closed'}
                </p>
                {isAdmin && thread.isActive && (
                  <button
                    onClick={async () => {
                      await closeConversation(thread._id);
                      onChange && (await onChange());
                    }}
                    className="text-[11px] text-slate-muted hover:text-brick"
                  >
                    Close thread
                  </button>
                )}
              </div>

              <div className="space-y-3 mb-3 max-h-72 overflow-y-auto pr-1">
                {messages.map((m) => {
                  const isMine = m.side === viewerSide;
                  return (
                    <div
                      key={m._id || `${m.side}-${m.createdAt}`}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-sm px-3 py-2 ${
                          isMine ? 'bg-navy text-ivory' : 'bg-parchment text-slate-ink'
                        }`}
                      >
                        <p
                          className={`text-[11px] mb-0.5 ${
                            isMine ? 'text-ivory/70' : 'text-slate-muted'
                          }`}
                        >
                          {m.senderName || m.sender?.name || (m.side === 'owner' ? 'Agent' : lead.name)} ·{' '}
                          {timeAgo(m.createdAt)}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {thread.isActive && (
                <div className="flex gap-2">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && reply(thread)}
                    placeholder="Write a reply..."
                    className="input-field text-sm flex-1"
                  />
                  <button
                    onClick={() => reply(thread)}
                    disabled={sending || !text.trim()}
                    className="btn-gold text-sm px-4 disabled:opacity-50"
                  >
                    {sending ? '...' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default LeadConversationThread;
