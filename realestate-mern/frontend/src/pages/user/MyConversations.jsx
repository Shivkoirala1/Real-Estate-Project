import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getMyConversations,
  getConversationById,
  addMessageToConversation,
  closeConversation,
  reopenConversation,
} from '../../services/conversationService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConversations } from '../../context/ConversationContext';
import { timeAgo, imageUrl } from '../../utils/format';

// "My Conversations" - threads the signed-in user participates in, either as
// the property inquirer or as the owner/agent side (plan §5.1).
const MyConversations = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refreshUnreadCount } = useConversations();

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [listFilter, setListFilter] = useState('active'); // 'active' | 'closed' | 'all'

  const messagesRef = useRef(null);

  // The inquirer's own messages align right; everything else is "owner" side.
  const viewerSide = (conv) => {
    const inquirerId = conv?.inquirer?._id || conv?.inquirer;
    return inquirerId && String(inquirerId) === String(user?._id) ? 'inquirer' : 'owner';
  };

  const otherPartyName = (conv) =>
    viewerSide(conv) === 'inquirer' ? conv.owner?.name : conv.inquirer?.name || 'Inquirer';

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      // Backend expects isActive as 'true' | 'false' | 'all' — map the UI filter.
      const data = await getMyConversations({
        isActive: listFilter === 'active' ? 'true' : listFilter === 'closed' ? 'false' : 'all',
        limit: 50,
      });
      setConversations(data.conversations || []);
    } catch (err) {
      setConversations([]);
      showToast(err.response?.data?.message || 'Failed to load conversations', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listFilter]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Open a thread: full history + the backend stamps lastReadAt for this side,
  // so sync the navbar/sidebar badge right away.
  const openThread = async (id) => {
    setActiveId(id);
    try {
      const data = await getConversationById(id);
      setActive(data.conversation);
      refreshUnreadCount();
    } catch (err) {
      setActive(null);
      showToast(err.response?.data?.message || 'Failed to open conversation', 'error');
    }
  };

  // Auto-scroll the thread to the newest message on open / new message.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active, activeId]);

  const sendReply = async (e) => {
    e.preventDefault();
    if (!active || !reply.trim()) return;
    setSending(true);
    try {
      const data = await addMessageToConversation(active._id, reply.trim());
      setActive(data.conversation);
      setReply('');
      refreshUnreadCount(); // sending marks this side as current
      loadList();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!active) return;
    try {
      await closeConversation(active._id);
      const data = await getConversationById(active._id);
      setActive(data.conversation);
      loadList();
      showToast('Conversation marked as resolved');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to close conversation', 'error');
    }
  };

  const handleReopen = async () => {
    if (!active) return;
    try {
      await reopenConversation(active._id);
      const data = await getConversationById(active._id);
      setActive(data.conversation);
      loadList();
      showToast('Conversation reopened');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to reopen conversation', 'error');
    }
  };

  const filterOptions = [
    { value: 'active', label: 'Active' },
    { value: 'closed', label: 'Closed' },
    { value: 'all', label: 'All' },
  ];

  const isAdmin = user?.role === 'admin';

  return (
    <div className="max-w-6xl mx-auto px-5 md:px-8 py-10 md:py-14">
      <div className="mb-8">
        <p className="eyebrow mb-1">Messages</p>
        <h1 className="font-display text-2xl text-navy">My Conversations</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Thread list */}
        <div className="md:col-span-1">
          <div className="flex gap-1 bg-parchment rounded-sm p-1 flex-wrap mb-3">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={listFilter === opt.value}
                onClick={() => setListFilter(opt.value)}
                className={`text-xs md:text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${
                  listFilter === opt.value ? 'bg-white text-navy shadow-sm' : 'text-slate-muted hover:text-navy'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-center py-10 text-sm text-slate-muted">Loading conversations...</p>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-navy/20 rounded-sm bg-parchment/40">
              <p className="font-display text-lg text-navy mb-1">No conversations</p>
              <p className="text-slate-muted text-sm">
                Message an owner or agent from any property page and the thread will show up here.
              </p>
            </div>
          ) : (
            <ul className="bg-white border border-navy/10 rounded-sm divide-y divide-navy/10 max-h-[32rem] overflow-y-auto shadow-card">
              {conversations.map((c) => {
                const selected = activeId === c._id;
                return (
                  <li key={c._id}>
                    <button
                      type="button"
                      onClick={() => openThread(c._id)}
                      aria-pressed={selected}
                      aria-label={`Open conversation about ${c.property?.title || 'a property'}`}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        selected ? 'bg-parchment' : 'hover:bg-parchment/60'
                      }`}
                    >
                      {c.property?.media?.coverImage ? (
                        <img
                          src={imageUrl(c.property.media.coverImage)}
                          alt=""
                          className="w-10 h-10 rounded-sm object-cover flex-shrink-0"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="w-10 h-10 rounded-sm bg-navy/10 text-navy flex items-center justify-center text-sm font-semibold flex-shrink-0"
                        >
                          {(c.property?.title || 'C').charAt(0).toUpperCase()}
                        </span>
                      )}

                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-navy line-clamp-1">
                          {c.property?.title || 'General inquiry'}
                        </span>
                        <span className="block text-xs text-slate-muted line-clamp-1">
                          {otherPartyName(c)}
                        </span>
                      </span>

                      <span className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-[11px] text-slate-muted">{timeAgo(c.lastMessageAt)}</span>
                        {!c.isActive && (
                          <span className="status-badge bg-navy/10 text-navy">Closed</span>
                        )}
                        {c.unread && (
                          <span
                            className="inline-block w-2 h-2 rounded-full bg-brass"
                            aria-label="unread"
                          />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Thread pane */}
        <div className="md:col-span-2">
          {!active ? (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card h-full min-h-[16rem] flex items-center justify-center">
              <p className="text-slate-muted text-sm px-6 text-center">
                Select a conversation to view messages
              </p>
            </div>
          ) : (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card flex flex-col">
              {/* Thread header */}
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-navy/10">
                <div className="min-w-0">
                  <h2 className="font-display text-lg text-navy leading-tight line-clamp-1">
                    {active.property?.title || 'General inquiry'}
                  </h2>
                  <p className="text-xs text-slate-muted mt-0.5">
                    Conversation with {otherPartyName(active)}
                  </p>
                </div>
                {active.isActive ? (
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Mark this conversation as resolved"
                    className="text-xs font-medium text-slate-muted hover:text-brick transition-colors flex-shrink-0"
                  >
                    Mark resolved
                  </button>
                ) : (
                  <span className="status-badge bg-navy/10 text-navy flex-shrink-0">Closed</span>
                )}
              </div>

              {/* Messages */}
              <div
                ref={messagesRef}
                aria-live="polite"
                aria-label="Conversation messages"
                className="max-h-[28rem] overflow-y-auto px-5 py-4 space-y-3"
              >
                {(active.messages || []).map((m) => {
                  const mine = m.side === viewerSide(active);
                  return (
                    <div
                      key={m._id || `${m.side}-${m.createdAt}`}
                      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-sm px-3 py-2 ${
                          mine ? 'ml-auto bg-navy text-ivory' : 'bg-parchment text-navy'
                        }`}
                      >
                        <p
                          className={`text-[11px] mb-0.5 ${
                            mine ? 'text-ivory/70' : 'text-slate-muted'
                          }`}
                        >
                          {m.senderName || (m.side === 'owner' ? 'Agent' : 'Inquirer')} ·{' '}
                          {timeAgo(m.createdAt)}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply / closed state */}
              {active.isActive ? (
                <form onSubmit={sendReply} className="flex gap-2 px-5 py-4 border-t border-navy/10">
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply..."
                    aria-label="Write a reply"
                    className="input-field text-sm flex-1"
                  />
                  <button
                    type="submit"
                    disabled={sending || !reply.trim()}
                    className="btn-primary text-sm px-4 disabled:opacity-50"
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-navy/10">
                  <p className="text-sm text-slate-muted">This conversation was closed.</p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={handleReopen}
                      aria-label="Reopen this conversation"
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyConversations;
