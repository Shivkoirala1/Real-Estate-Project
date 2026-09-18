import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getMyConversations,
  getConversations,
  getConversationById,
  addMessageToConversation,
  closeConversation,
  reopenConversation,
} from '../../services/conversationService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConversations } from '../../context/ConversationContext';
import { connectSocket, onSocketConnect } from '../../services/socket';
import { timeAgo, imageUrl } from '../../utils/format';

const PAGE_SIZE = 15;
const OWN_PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Closed' },
  { value: 'all', label: 'All' },
];

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------
// admin  -> every conversation on the platform, server-side search +
//           pagination (getConversations); the only role that can reopen a
//           closed thread.
// agent  -> only threads where they're the owner side (getMyConversations),
//           client-side search over what's already loaded, "Load more"
//           instead of full pagination.
// user   -> same data shape as agent, but from the inquirer side. Copy
//           differs slightly (empty states, subtitle wording).
// ---------------------------------------------------------------------------
const ROLE_COPY = {
  admin: {
    eyebrow: 'Admin',
    title: 'Conversations Inbox',
    emptyTitle: 'No conversations',
    emptyBody: ({ hasSearch, status }) =>
      hasSearch
        ? 'No threads match your search.'
        : status === 'true'
        ? 'No active threads right now.'
        : 'Nothing here yet.',
  },
  agent: {
    eyebrow: 'Messages',
    title: 'Conversations',
    emptyTitle: 'No conversations yet',
    emptyBody: () => 'When someone messages you about one of your listings, it will show up here.',
  },
  user: {
    eyebrow: 'Messages',
    title: 'My Conversations',
    emptyTitle: 'No conversations yet',
    emptyBody: () => 'Message an owner or agent from any property page and the thread will show up here.',
  },
};

const initials = (label) => (label || 'C').charAt(0).toUpperCase();

const Avatar = ({ src, label }) =>
  src ? (
    <img src={src} alt="" className="w-10 h-10 rounded-sm object-cover flex-shrink-0" />
  ) : (
    <span
      aria-hidden="true"
      className="w-10 h-10 rounded-sm bg-navy/10 text-navy flex items-center justify-center text-sm font-semibold flex-shrink-0"
    >
      {initials(label)}
    </span>
  );

const SkeletonList = () => (
  <ul className="bg-white border border-navy/10 rounded-sm divide-y divide-navy/10 shadow-card">
    {[0, 1, 2, 3, 4].map((i) => (
      <li key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
        <span className="w-10 h-10 rounded-sm bg-navy/10 flex-shrink-0" />
        <span className="flex-1 min-w-0 space-y-2">
          <span className="block h-3 w-3/5 rounded-sm bg-navy/10" />
          <span className="block h-2.5 w-2/5 rounded-sm bg-navy/10" />
        </span>
      </li>
    ))}
  </ul>
);

const MessageBubble = ({ message, mine }) => (
  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
    <div
      className={`max-w-[85%] rounded-sm px-3 py-2 ${
        mine ? 'ml-auto bg-navy text-ivory' : 'bg-parchment text-navy'
      }`}
    >
      <p className={`text-[11px] mb-0.5 ${mine ? 'text-ivory/70' : 'text-slate-muted'}`}>
        {message.senderName || (message.side === 'owner' ? 'Agent' : 'Inquirer')} · {timeAgo(message.createdAt)}
      </p>
      <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
    </div>
  </div>
);

const Conversations = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { refreshUnreadCount } = useConversations();

  const role = user?.role === 'admin' ? 'admin' : user?.role === 'agent' ? 'agent' : 'user';
  const isAdmin = role === 'admin';
  const canReopen = isAdmin;
  const copy = ROLE_COPY[role];

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [active, setActive] = useState(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const [statusFilter, setStatusFilter] = useState('true');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, currentPage: 1, limit: PAGE_SIZE });
  const [ownLimit, setOwnLimit] = useState(OWN_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  const debounceRef = useRef(null);
  const messagesRef = useRef(null);
  const textareaRef = useRef(null);
  // Refs so socket handlers (subscribed per open thread) always see fresh
  // values without re-subscribing on every render.
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const loadListRef = useRef(null);
  const openThreadRef = useRef(null);

  const viewerSide = useCallback(
    (conv) => {
      const inquirerId = conv?.inquirer?._id || conv?.inquirer;
      return inquirerId && String(inquirerId) === String(user?._id) ? 'inquirer' : 'owner';
    },
    [user?._id]
  );

  const otherPartyName = useCallback(
    (conv) => (viewerSide(conv) === 'inquirer' ? conv.owner?.name : conv.inquirer?.name || 'Inquirer'),
    [viewerSide]
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const data = await getConversations({
          page,
          limit: PAGE_SIZE,
          isActive: statusFilter,
          ...(search ? { search } : {}),
        });
        setConversations(data.conversations || []);
        setPagination(data.pagination || { total: 0, pages: 1, currentPage: page, limit: PAGE_SIZE });
      } else {
        const data = await getMyConversations({ isActive: statusFilter, limit: ownLimit });
        const list = data.conversations || [];
        setConversations(list);
        setHasMore(list.length >= ownLimit);
      }
    } catch (err) {
      setConversations([]);
      if (isAdmin) setPagination({ total: 0, pages: 1, currentPage: 1, limit: PAGE_SIZE });
      showToast(err.response?.data?.message || 'Failed to load conversations', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, page, statusFilter, search, ownLimit]);

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
    if (!isAdmin) return; // non-admin search filters client-side, no debounce needed
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

  // Narrows the already-loaded list for agents/users; admins are filtered
  // server-side already so this just passes their list straight through.
  const visibleConversations = useMemo(() => {
    if (isAdmin || !searchInput.trim()) return conversations;
    const q = searchInput.trim().toLowerCase();
    return conversations.filter((c) => {
      const property = c.property?.title?.toLowerCase() || '';
      const person = (otherPartyName(c) || '').toLowerCase();
      return property.includes(q) || person.includes(q);
    });
  }, [conversations, isAdmin, searchInput, otherPartyName]);

  const openThread = async (id) => {
    setActiveId(id);
    setActiveLoading(true);
    try {
      const data = await getConversationById(id);
      setActive(data.conversation);
      refreshUnreadCount();
    } catch (err) {
      setActive(null);
      showToast(err.response?.data?.message || 'Failed to open conversation', 'error');
    } finally {
      setActiveLoading(false);
    }
  };

  const closeThreadView = () => {
    setActiveId(null);
    setActive(null);
  };

  loadListRef.current = loadList;
  openThreadRef.current = openThread;

  // Live thread (Phase 9): join the open thread's room for instant message
  // and status delivery. REST stays authoritative — history loads via
  // openThread, and every (re)connect rejoins + reloads history to cover
  // missed events. Polling is untouched (Phase 10 owns removal).
  useEffect(() => {
    if (!activeId) return undefined;
    const s = connectSocket();
    if (!s) return undefined;
    const roomId = activeId;
    s.emit('conversation.join', { conversationId: roomId });

    const onMessage = (payload) => {
      if (!payload || payload.conversationId !== activeIdRef.current) return;
      const msg = payload.message;
      if (!msg || !msg._id) return;
      setActive((prev) => {
        if (!prev || String(prev._id) !== String(payload.conversationId)) return prev;
        if ((prev.messages || []).some((m) => String(m._id) === String(msg._id))) return prev;
        return { ...prev, messages: [...(prev.messages || []), msg] };
      });
      // Keep badge/list truthful while viewing: the count and inbox preview
      // refresh through existing REST paths.
      refreshUnreadCount();
      if (loadListRef.current) loadListRef.current();
    };
    const onStatus = (payload) => {
      if (!payload || payload.conversationId !== activeIdRef.current) return;
      if (typeof payload.isActive !== 'boolean') return;
      const { conversationId, isActive } = payload;
      setActive((prev) =>
        prev && String(prev._id) === String(conversationId) ? { ...prev, isActive } : prev
      );
      setConversations((prev) =>
        prev.map((c) => (String(c._id) === String(conversationId) ? { ...c, isActive } : c))
      );
    };
    s.on('v1.conversation.message', onMessage);
    s.on('v1.conversation.status', onStatus);
    const offConnect = onSocketConnect(() => {
      const id = activeIdRef.current;
      if (!id) return;
      const sock = connectSocket();
      if (sock) sock.emit('conversation.join', { conversationId: id });
      if (openThreadRef.current) openThreadRef.current(id);
    });
    return () => {
      s.emit('conversation.leave', { conversationId: roomId });
      s.off('v1.conversation.message', onMessage);
      s.off('v1.conversation.status', onStatus);
      offConnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active, activeId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [reply, activeId]);

  const sendReply = async (e) => {
    e.preventDefault();
    if (!active || !reply.trim() || sending) return;
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

  const handleReplyKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply(e);
    }
  };

  const handleCloseConversation = async () => {
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

  const handleReopenConversation = async () => {
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

  const emptyBody = copy.emptyBody({ hasSearch: Boolean(isAdmin ? search : searchInput), status: statusFilter });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-5 md:px-8 py-8 md:py-14">
      <div className="mb-6 md:mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow mb-1">{copy.eyebrow}</p>
          <h1 className="font-display text-2xl text-navy">{copy.title}</h1>
        </div>
        {isAdmin && !loading && (
          <p className="text-xs text-slate-muted">
            {pagination.total} conversation{pagination.total === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[14rem] sm:min-w-[16rem] max-w-md">
          <input
            type="text"
            className="input-field pr-8"
            placeholder={isAdmin ? 'Search by participant or property...' : 'Search your conversations...'}
            value={searchInput}
            onChange={handleSearchChange}
            aria-label="Search conversations"
          />
          {searchInput && (
            <button
              type="button"
              onClick={isAdmin ? clearSearch : () => setSearchInput('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-muted hover:text-navy"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {isAdmin ? (
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="input-field w-auto"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="flex gap-1 bg-parchment rounded-sm p-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={statusFilter === opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`text-xs md:text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${
                  statusFilter === opt.value ? 'bg-white text-navy shadow-sm' : 'text-slate-muted hover:text-navy'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Thread list — collapses behind the open thread on small screens */}
        <div className={`md:col-span-1 ${activeId ? 'hidden md:block' : ''}`}>
          {loading ? (
            <SkeletonList />
          ) : visibleConversations.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-navy/20 rounded-sm bg-parchment/40">
              <p className="font-display text-lg text-navy mb-1">{copy.emptyTitle}</p>
              <p className="text-slate-muted text-sm">{emptyBody}</p>
            </div>
          ) : (
            <ul className="bg-white border border-navy/10 rounded-sm divide-y divide-navy/10 max-h-[32rem] overflow-y-auto shadow-card">
              {visibleConversations.map((c) => {
                const selected = activeId === c._id;
                const primary = isAdmin
                  ? `${c.inquirer?.name || 'Inquirer'} → ${c.owner?.name || 'Owner'}`
                  : c.property?.title || 'General inquiry';
                const secondary = isAdmin ? c.property?.title || 'General inquiry' : otherPartyName(c);
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
                      <Avatar
                        src={c.property?.media?.coverImage ? imageUrl(c.property.media.coverImage) : null}
                        label={c.property?.title}
                      />

                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-navy line-clamp-1">{primary}</span>
                        <span className="block text-xs text-slate-muted line-clamp-1">{secondary}</span>
                      </span>

                      <span className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-[11px] text-slate-muted">{timeAgo(c.lastMessageAt)}</span>
                        {!c.isActive && <span className="status-badge bg-navy/10 text-navy">Closed</span>}
                        {c.unread && <span className="inline-block w-2 h-2 rounded-full bg-brass" aria-label="unread" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {isAdmin && !loading && conversations.length > 0 && (
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

          {!isAdmin && !loading && hasMore && !searchInput.trim() && (
            <button
              type="button"
              onClick={() => setOwnLimit((n) => n + OWN_PAGE_SIZE)}
              className="btn-secondary text-xs w-full mt-3 py-2"
            >
              Load more
            </button>
          )}
        </div>

        {/* Thread pane — full width on mobile once a thread is open */}
        <div className={`md:col-span-2 ${activeId ? '' : 'hidden md:block'}`}>
          {!activeId ? (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card h-full min-h-[16rem] flex items-center justify-center">
              <p className="text-slate-muted text-sm px-6 text-center">Select a conversation to view messages</p>
            </div>
          ) : activeLoading || !active ? (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card h-full min-h-[16rem] flex items-center justify-center">
              <p className="text-slate-muted text-sm">Loading conversation...</p>
            </div>
          ) : (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card flex flex-col">
              {/* Thread header */}
              <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-navy/10">
                <div className="min-w-0 flex items-start gap-2">
                  <button
                    type="button"
                    onClick={closeThreadView}
                    aria-label="Back to conversation list"
                    className="md:hidden -ml-1 mt-0.5 text-slate-muted hover:text-navy flex-shrink-0"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <h2 className="font-display text-lg text-navy leading-tight line-clamp-1">
                      {active.property?.title || 'General inquiry'}
                    </h2>
                    <p className="text-xs text-slate-muted mt-0.5">
                      {isAdmin
                        ? `${active.inquirer?.name || 'Inquirer'} → ${active.owner?.name || 'Owner'}`
                        : `Conversation with ${otherPartyName(active)}`}
                    </p>
                  </div>
                </div>
                {active.isActive ? (
                  <button
                    type="button"
                    onClick={handleCloseConversation}
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
                className="max-h-[24rem] sm:max-h-[28rem] overflow-y-auto px-4 sm:px-5 py-4 space-y-3"
              >
                {(active.messages || []).map((m) => (
                  <MessageBubble key={m._id || `${m.side}-${m.createdAt}`} message={m} mine={m.side === viewerSide(active)} />
                ))}
              </div>

              {/* Reply / closed state */}
              {active.isActive ? (
                <form onSubmit={sendReply} className="flex items-end gap-2 px-4 sm:px-5 py-4 border-t border-navy/10">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={handleReplyKeyDown}
                    placeholder="Write a reply..."
                    aria-label="Write a reply"
                    className="input-field text-sm flex-1 resize-none leading-normal"
                  />
                  <button
                    type="submit"
                    disabled={sending || !reply.trim()}
                    className="btn-primary text-sm px-4 disabled:opacity-50 flex-shrink-0"
                  >
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-t border-navy/10">
                  <p className="text-sm text-slate-muted">This conversation was closed.</p>
                  {canReopen && (
                    <button
                      type="button"
                      onClick={handleReopenConversation}
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

export default Conversations;
