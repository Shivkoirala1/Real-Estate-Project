import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getConversations,
  getConversationById,
  addMessageToConversation,
  closeConversation,
  reopenConversation,
} from '../../services/conversationService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConversations } from '../../context/ConversationContext';
import { timeAgo } from '../../utils/format';

const PAGE_SIZE = 15;

// Admin "Conversations Inbox" - every thread in the system with search,
// status filter and server-side pagination (plan §5.2 / §8.1).
const ConversationsInbox = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refreshUnreadCount } = useConversations();

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  // Debounced search: the input updates immediately, `search` feeds the API.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debounceRef = useRef(null);

  const [statusFilter, setStatusFilter] = useState('true'); // 'true' | 'false' | 'all'
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, currentPage: 1, limit: PAGE_SIZE });

  const messagesRef = useRef(null);

  // Admins usually sit on the owner side of a thread; fall back accordingly.
  const viewerSide = (conv) => {
    const inquirerId = conv?.inquirer?._id || conv?.inquirer;
    return inquirerId && String(inquirerId) === String(user?._id) ? 'inquirer' : 'owner';
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getConversations({
        page,
        limit: PAGE_SIZE,
        isActive: statusFilter,
        ...(search ? { search } : {}),
      });
      setConversations(data.conversations || []);
      setPagination(data.pagination || { total: 0, pages: 1, currentPage: page, limit: PAGE_SIZE });
    } catch (err) {
      setConversations([]);
      setPagination({ total: 0, pages: 1, currentPage: 1, limit: PAGE_SIZE });
      showToast(err.response?.data?.message || 'Failed to load conversations', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value.trim());
      setPage(1);
    }, 350);
  };

  const clearSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const openThread = async (id) => {
    setActiveId(id);
    try {
      const data = await getConversationById(id);
      setActive(data.conversation);
      refreshUnreadCount(); // opening stamps lastReadAt for this participant
    } catch (err) {
      setActive(null);
      showToast(err.response?.data?.message || 'Failed to open conversation', 'error');
    }
  };

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
      refreshUnreadCount();
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
      showToast('Conversation closed');
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

  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow mb-1">Admin</p>
        <h1 className="font-display text-2xl text-navy">Conversations Inbox</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[16rem] max-w-md">
          <input
            type="text"
            className="input-field pr-8"
            placeholder="Search by participant or property..."
            value={searchInput}
            onChange={handleSearchChange}
            aria-label="Search conversations"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-muted hover:text-navy"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="input-field w-auto"
        >
          <option value="true">Active</option>
          <option value="false">Closed</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Thread list */}
        <div className="md:col-span-1">
          {loading ? (
            <p className="text-center py-10 text-sm text-slate-muted">Loading conversations...</p>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-navy/20 rounded-sm bg-parchment/40">
              <p className="font-display text-lg text-navy mb-1">No conversations</p>
              <p className="text-slate-muted text-sm">
                {search
                  ? `No threads match “${search}”.`
                  : statusFilter === 'true'
                    ? 'No active threads right now.'
                    : 'Nothing here yet.'}
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
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        selected ? 'bg-parchment' : 'hover:bg-parchment/60'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-navy line-clamp-1">
                          {c.inquirer?.name || 'Inquirer'} → {c.owner?.name || 'Owner'}
                        </span>
                        {c.unread && (
                          <span
                            className="inline-block w-2 h-2 rounded-full bg-brass flex-shrink-0"
                            aria-label="unread"
                          />
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-xs text-slate-muted line-clamp-1">
                          {c.property?.title || 'General inquiry'}
                        </span>
                        <span className="text-[11px] text-slate-muted flex-shrink-0">
                          {timeAgo(c.lastMessageAt)}
                        </span>
                      </span>
                      {!c.isActive && (
                        <span className="status-badge bg-navy/10 text-navy inline-block mt-1.5">
                          Closed
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pagination */}
          {!loading && conversations.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-slate-muted">
                Page {pagination.currentPage} of {pagination.pages} · {pagination.total} conversation
                {pagination.total === 1 ? '' : 's'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.currentPage <= 1}
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={pagination.currentPage >= pagination.pages}
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
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
                    {active.inquirer?.name || 'Inquirer'} → {active.owner?.name || 'Owner'}
                  </p>
                </div>
                {active.isActive ? (
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close this conversation"
                    className="text-xs font-medium text-slate-muted hover:text-brick transition-colors flex-shrink-0"
                  >
                    Mark resolved
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReopen}
                    aria-label="Reopen this conversation"
                    className="text-xs font-medium text-slate-muted hover:text-brass transition-colors flex-shrink-0"
                  >
                    Reopen
                  </button>
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
                <div className="px-5 py-4 border-t border-navy/10">
                  <p className="text-sm text-slate-muted">This conversation was closed.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConversationsInbox;
