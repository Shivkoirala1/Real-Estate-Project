import React, { useEffect, useMemo, useRef, useState } from 'react';
import { startConversation, getConversationById, addMessageToConversation, closeConversation } from '../../services/conversationService';
import { connectSocket, onSocketConnect } from '../../services/socket';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/format';

// Unified conversation thread attached to a lead. The lead payload carries
// thread SUMMARIES only (no messages[]); bodies load on demand per thread via
// GET /api/conversations/:id, which enforces participant-or-admin auth.
// Threads the viewer can't open (403) render their summary with an explicit
// fallback instead of failing silently.
const LeadConversationThread = ({ lead, onChange }) => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  // threadId -> { status: 'loading' | 'ready' | 'forbidden' | 'error', messages: [] }
  const [bodies, setBodies] = useState({});

  const threads = useMemo(
    () =>
      (lead.conversationThreads || [])
        .slice()
        .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt)),
    [lead.conversationThreads]
  );

  const threadIdsKey = useMemo(() => threads.map((t) => t._id).join(','), [threads]);

  // onChange reloads the lead (REST truth); keep a ref so socket handlers
  // below never capture a stale closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (threads.length === 0) {
        if (active) setBodies({});
        return;
      }
      if (active) {
        setBodies((prev) => {
          const next = {};
          for (const t of threads) {
            next[t._id] = prev[t._id] && prev[t._id].status === 'ready'
              ? prev[t._id]
              : { status: 'loading', messages: [] };
          }
          return next;
        });
      }
      const settled = await Promise.all(
        threads.map(async (t) => {
          try {
            const data = await getConversationById(t._id);
            return [t._id, { status: 'ready', messages: data.conversation?.messages || [] }];
          } catch (err) {
            const code = err.response?.status;
            return [t._id, { status: code === 403 ? 'forbidden' : 'error', messages: [] }];
          }
        })
      );
      if (active) setBodies(Object.fromEntries(settled));
    };
    load();
    return () => {
      active = false;
    };
    // Re-fetch when the summary set changes (initial mount + every
    // loadLead() refresh after reply/start/close).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadIdsKey]);

  // Live threads (Phase 9): join every visible thread room for instant
  // message delivery. History stays REST-owned (effect above); incoming
  // messages append locally with _id dedupe. Status changes (close/reopen)
  // alter thread chrome, so resync summaries through REST onChange.
  // Reconnect rejoins all rooms and resyncs to cover missed events.
  useEffect(() => {
    if (threads.length === 0) return undefined;
    const s = connectSocket();
    if (!s) return undefined;
    const ids = threads.map((t) => t._id);
    ids.forEach((id) => s.emit('conversation.join', { conversationId: id }));

    const onMessage = (payload) => {
      if (!payload || !payload.message || !payload.message._id) return;
      const id = payload.conversationId;
      setBodies((prev) => {
        const cur = prev[id];
        // REST load owns threads that aren't ready (loading/forbidden/error).
        if (!cur || cur.status !== 'ready') return prev;
        if (cur.messages.some((m) => String(m._id) === String(payload.message._id))) return prev;
        return { ...prev, [id]: { ...cur, messages: [...cur.messages, payload.message] } };
      });
    };
    const onStatus = (payload) => {
      if (!payload || typeof payload.isActive !== 'boolean') return;
      if (onChangeRef.current) onChangeRef.current();
    };
    s.on('v1.conversation.message', onMessage);
    s.on('v1.conversation.status', onStatus);
    const offConnect = onSocketConnect(() => {
      const sock = connectSocket();
      if (sock) ids.forEach((id) => sock.emit('conversation.join', { conversationId: id }));
      if (onChangeRef.current) onChangeRef.current();
    });
    return () => {
      ids.forEach((id) => s.emit('conversation.leave', { conversationId: id }));
      s.off('v1.conversation.message', onMessage);
      s.off('v1.conversation.status', onStatus);
      offConnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadIdsKey]);

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
          const body = bodies[thread._id] || { status: 'loading', messages: [] };
          const messages = body.messages;
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
                {body.status === 'loading' ? (
                  <p className="text-sm text-slate-muted">Loading messages…</p>
                ) : body.status === 'forbidden' ? (
                  <p className="text-sm text-slate-muted">
                    You don&apos;t have access to the messages in this thread — contact an admin or the thread owner.
                  </p>
                ) : body.status === 'error' ? (
                  <p className="text-sm text-slate-muted">Couldn&apos;t load messages. Try again later.</p>
                ) : (
                  messages.map((m) => {
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
                  })
                )}
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
