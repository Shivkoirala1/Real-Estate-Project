import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { timeAgo } from '../../utils/format';

const statusColors = {
  new: 'bg-brick-light text-brick',
  read: 'bg-parchment text-slate-ink',
  responded: 'bg-sage-light text-sage',
};

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
      <div className="space-y-3 mb-4">
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

// ----- Received inquiries: messages sent TO you about your listings (or, for admins, everyone's) -----
const ReceivedInquiries = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openThreadFor, setOpenThreadFor] = useState(null);
  const [sendingReplyFor, setSendingReplyFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/inquiries');
      setInquiries(data.inquiries);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/inquiries/${id}`, { status });
      showToast('Inquiry updated');
      load();
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
      await api.delete(`/inquiries/${id}`);
      showToast('Inquiry deleted');
      load();
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  const sendReply = async (id, message) => {
    setSendingReplyFor(id);
    try {
      await api.patch(`/inquiries/${id}/reply`, { message });
      showToast('Reply sent to the inquirer');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send reply', 'error');
    } finally {
      setSendingReplyFor(null);
    }
  };

  if (loading) return <p className="text-slate-muted">Loading...</p>;
  if (inquiries.length === 0) {
    return <p className="text-slate-muted py-10 text-center border border-dashed border-navy/20 rounded-sm">No inquiries yet.</p>;
  }

  return (
    <div className="space-y-4">
      {inquiries.map((inq) => (
        <div key={inq._id} className="bg-white border border-navy/10 rounded-sm p-5">
          <div className="flex items-start justify-between mb-2 gap-3">
            <div>
              <p className="font-semibold text-navy">{inq.name} <span className="text-slate-muted font-normal text-sm">— {inq.email}</span></p>
              {inq.phone && <p className="text-sm text-slate-muted">{inq.phone}</p>}
            </div>
            <span className={`status-badge flex-shrink-0 ${statusColors[inq.status]}`}>{inq.status}</span>
          </div>
          {inq.property && <p className="text-xs text-brass mb-2">Re: {inq.property.title}</p>}
          <p className="text-xs text-slate-muted mb-3">{timeAgo(inq.createdAt)}</p>

          {openThreadFor === inq._id ? (
            <MessageThread
              inquiry={inq}
              viewerSide="owner"
              sending={sendingReplyFor === inq._id}
              onReply={(message) => sendReply(inq._id, message)}
            />
          ) : (
            <p className="text-sm text-slate-ink mb-3">{inq.message}</p>
          )}

          <div className="flex flex-wrap gap-3 text-sm mt-3">
            <button onClick={() => setOpenThreadFor(openThreadFor === inq._id ? null : inq._id)} className="text-navy font-medium hover:underline">
              {openThreadFor === inq._id ? 'Hide conversation' : (inq.messages?.length > 1 ? 'View conversation' : 'Reply')}
            </button>
            {inq.status !== 'read' && <button onClick={() => updateStatus(inq._id, 'read')} className="text-brass hover:underline">Mark as Read</button>}
            {inq.status !== 'responded' && <button onClick={() => updateStatus(inq._id, 'responded')} className="text-sage hover:underline">Mark as Responded</button>}
            {user?.role === 'admin' && <button onClick={() => remove(inq._id)} className="text-brick hover:underline">Delete</button>}
          </div>
        </div>
      ))}
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
      const { data } = await api.get('/inquiries/sent');
      setInquiries(data.inquiries);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const sendFollowUp = async (id, message) => {
    setSendingReplyFor(id);
    try {
      await api.patch(`/inquiries/${id}/reply`, { message });
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
      {inquiries.map((inq) => (
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
            <span className={`status-badge flex-shrink-0 ${statusColors[inq.status]}`}>
              {inq.status === 'new' ? 'Awaiting reply' : inq.status === 'read' ? 'Seen by agent' : 'Responded'}
            </span>
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
      ))}
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
      <h1 className="text-3xl mb-6">{isAdmin ? 'Inquiries' : 'My Inquiries'}</h1>

      {isAdmin && (
        <div className="flex gap-2 mb-6 border-b border-navy/10 pb-4">
          <button onClick={() => switchTab('received')} className={tabBtnClass(tab === 'received')}>Inbox</button>
          <button onClick={() => switchTab('sent')} className={tabBtnClass(tab === 'sent')}>Sent by Me</button>
        </div>
      )}

      {tab === 'received' ? <ReceivedInquiries /> : <SentInquiries />}
    </div>
  );
};

export default Inquiries;
