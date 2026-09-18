import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getSentContactForms } from '../../services/contactFormService';
import {
  getMyConversations,
  getConversationById,
  addMessageToConversation,
} from '../../services/conversationService';
import { useToast } from '../../context/ToastContext';
import { timeAgo } from '../../utils/format';

// Owner "My Inquiries" view, rebuilt on the live unified-lead module after
// the legacy /inquiries API was removed:
//
//   - Sent contact forms  -> GET /contact-forms/sent
//   - Message threads     -> GET /conversations/my-conversations
//
// Admins triage via LeadDashboard.jsx (kanban, assignment, inbox, convert),
// which is the canonical pipeline tool - this page is the owner's read +
// reply surface only.

const formStatusBadge = {
  new: 'bg-brass-light/25 text-brass-dark',
  read: 'bg-navy/10 text-navy',
  responded: 'bg-sage-light text-sage',
  converted: 'bg-navy text-ivory',
};

const formStatusLabel = {
  new: 'Awaiting reply',
  read: 'Seen by our team',
  responded: 'Responded',
  converted: 'In progress with our team',
};

const ThreadMessages = ({ threadId }) => {
  const [messages, setMessages] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let active = true;
    getConversationById(threadId)
      .then((data) => {
        if (active) setMessages(data.conversation?.messages || []);
      })
      .catch(() => {
        if (active) setMessages([]);
      });
    return () => {
      active = false;
    };
  }, [threadId]);

  const send = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      const data = await addMessageToConversation(threadId, reply.trim());
      setMessages(data.conversation?.messages || []);
      setReply('');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  if (messages === null) return <p className="text-sm text-slate-muted">Loading messages…</p>;

  return (
    <div>
      <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-slate-muted">No messages yet.</p>
        )}
        {messages.map((m) => (
          <div key={m._id || `${m.side}-${m.createdAt}`} className="bg-parchment rounded-sm px-3 py-2">
            <p className="text-[11px] text-slate-muted mb-0.5">
              {m.senderName || m.sender?.name || 'Team'} · {timeAgo(m.createdAt)}
            </p>
            <p className="text-sm text-slate-ink whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder="Write a follow-up message..."
          className="input-field flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button onClick={send} disabled={sending || !reply.trim()} className="btn-gold text-sm px-4 self-end">
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

const SentForms = () => {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hideHandled, setHideHandled] = useState(false);

  useEffect(() => {
    let active = true;
    getSentContactForms({ limit: 50 })
      .then((data) => {
        if (active) setForms(data.contactForms || []);
      })
      .catch(() => {
        if (active) setForms([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p className="text-slate-muted">Loading...</p>;

  // A converted form lives on as a lead/conversation elsewhere - hide those
  // rows on request so the same inquiry never reads as two open items.
  const visible = hideHandled ? forms.filter((f) => f.status !== 'converted') : forms;
  if (visible.length === 0) {
    return (
      <p className="text-slate-muted py-10 text-center border border-dashed border-navy/20 rounded-sm">
        {forms.length === 0
          ? "You haven't sent any inquiries yet. Reach out from any property's detail page."
          : 'No open inquiries - everything here has been picked up by our team.'}
      </p>
    );
  }

  return (
    <div>
      <label className="flex items-center gap-2 text-sm text-slate-muted mb-4 cursor-pointer">
        <input type="checkbox" checked={hideHandled} onChange={(e) => setHideHandled(e.target.checked)} />
        Hide inquiries already being handled
      </label>
      <div className="space-y-4">
        {visible.map((f) => (
          <div key={f._id} className="bg-white border border-navy/10 rounded-sm p-5">
            <div className="flex items-start justify-between mb-2 gap-3">
              <div>
                {f.property ? (
                  <Link to={`/properties/${f.property.slug || f.property._id}`} className="font-semibold text-navy hover:text-brass">
                    {f.property.title}
                  </Link>
                ) : (
                  <p className="font-semibold text-navy">{f.subject || 'General Inquiry'}</p>
                )}
                <p className="text-xs text-slate-muted mt-0.5">Sent {timeAgo(f.createdAt)}</p>
              </div>
              <span className={`status-badge flex-shrink-0 ${formStatusBadge[f.status] || formStatusBadge.new}`}>
                {formStatusLabel[f.status] || f.status}
              </span>
            </div>
            <p className="text-sm text-slate-ink mb-3">{f.message}</p>
            {f.response ? (
              <div className="bg-sage-light border-l-2 border-sage rounded-sm px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-sage mb-1">
                  Reply from {f.respondedBy?.name || 'our team'}
                </p>
                <p className="text-sm text-slate-ink">{f.response}</p>
              </div>
            ) : f.status === 'converted' ? (
              <p className="text-xs text-slate-muted italic">
                Picked up by our team — continue in <Link to="/my-conversations" className="text-brass hover:underline">My Conversations</Link>.
              </p>
            ) : (
              <p className="text-xs text-slate-muted italic">No reply yet — you'll get a notification the moment there's an update.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const MyThreads = () => {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyConversations({ limit: 50 });
      setThreads(data.conversations || []);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-slate-muted">Loading...</p>;
  if (threads.length === 0) {
    return (
      <p className="text-slate-muted py-10 text-center border border-dashed border-navy/20 rounded-sm">
        No conversations yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {threads.map((t) => (
        <div key={t._id} className="bg-white border border-navy/10 rounded-sm p-5">
          <div className="flex items-start justify-between mb-2 gap-3">
            <div>
              <p className="font-semibold text-navy">{t.property?.title || 'General conversation'}</p>
              <p className="text-xs text-slate-muted mt-0.5">Updated {timeAgo(t.lastMessageAt || t.updatedAt)}</p>
            </div>
            {!t.isActive && <span className="status-badge bg-parchment text-slate-muted flex-shrink-0">Closed</span>}
          </div>
          {openId === t._id ? (
            <>
              <ThreadMessages threadId={t._id} />
              <button onClick={() => setOpenId(null)} className="text-sm text-navy font-medium hover:underline mt-3">
                Hide conversation
              </button>
            </>
          ) : (
            <button onClick={() => setOpenId(t._id)} className="text-sm text-navy font-medium hover:underline mt-1">
              Open conversation & reply
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

const Inquiries = () => {
  const [tab, setTab] = useState('sent'); // 'sent' | 'threads'
  const tabBtn = (active) =>
    `px-4 py-2.5 text-sm font-medium rounded-sm transition-colors ${
      active ? 'bg-navy text-ivory' : 'text-slate-ink hover:bg-parchment'
    }`;

  return (
    <div>
      <p className="eyebrow mb-2">Messages</p>
      <h1 className="text-3xl mb-6">My Inquiries</h1>
      <div className="flex gap-2 mb-6 border-b border-navy/10 pb-4">
        <button onClick={() => setTab('sent')} className={tabBtn(tab === 'sent')}>Sent by Me</button>
        <button onClick={() => setTab('threads')} className={tabBtn(tab === 'threads')}>Conversations</button>
      </div>
      {tab === 'sent' ? <SentForms /> : <MyThreads />}
    </div>
  );
};

export default Inquiries;
