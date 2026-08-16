import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { timeAgo } from '../utils/format';

const typeMeta = {
  inquiry_received: { label: 'New inquiry', tint: 'bg-brass-light/25 text-brass-dark' },
  inquiry_read: { label: 'Viewed', tint: 'bg-navy/10 text-navy' },
  inquiry_responded: { label: 'Response', tint: 'bg-sage-light text-sage' },
  inquiry_followup: { label: 'New reply', tint: 'bg-navy/10 text-navy' },
  property_sold: { label: 'Sold', tint: 'bg-brick-light text-brick' },
  system: { label: 'System', tint: 'bg-parchment text-slate-ink' },
};

const groupByDay = (items) => {
  const groups = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  items.forEach((n) => {
    const day = new Date(n.createdAt).toDateString();
    let label;
    if (day === today) label = 'Today';
    else if (day === yesterday) label = 'Yesterday';
    else label = new Date(n.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  });
  return groups;
};

const Notifications = () => {
  const { notifications, unreadCount, loading, fetchNotifications, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleClick = (n) => {
    if (!n.isRead) markAsRead(n._id);
    if (n.link) navigate(n.link);
  };

  const grouped = groupByDay(notifications);

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-10">
      <p className="eyebrow mb-2">Stay in the loop</p>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllAsRead} className="btn-secondary text-sm py-2 px-4">
            Mark all as read
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b border-navy/10 pb-4">
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors ${
              filter === tab.key ? 'bg-navy text-ivory' : 'text-slate-ink hover:bg-parchment'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && notifications.length === 0 ? (
        <p className="text-slate-muted text-center py-16">Loading your notifications...</p>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-navy/20 rounded-sm">
          <p className="text-slate-muted">
            {filter === 'unread' ? "You're all caught up — no unread notifications." : 'No notifications yet. Activity on your inquiries and listings will show up here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-muted mb-3">{day}</p>
              <div className="space-y-3">
                {items.map((n) => {
                  const meta = typeMeta[n.type] || typeMeta.system;
                  return (
                    <div
                      key={n._id}
                      className={`group flex items-start gap-4 bg-white border rounded-sm p-4 transition-colors ${
                        !n.isRead ? 'border-brass/40' : 'border-navy/10'
                      }`}
                    >
                      <button onClick={() => handleClick(n)} className="flex-1 flex items-start gap-4 text-left min-w-0">
                        <span className={`status-badge flex-shrink-0 ${meta.tint}`}>{meta.label}</span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm ${!n.isRead ? 'font-semibold text-navy' : 'font-medium text-slate-ink'}`}>
                              {n.title}
                            </span>
                            {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-brick" />}
                          </span>
                          <span className="block text-sm text-slate-ink mt-1">{n.message}</span>
                          <span className="block text-xs text-slate-muted mt-1.5">{timeAgo(n.createdAt)}</span>
                        </span>
                      </button>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {!n.isRead && (
                          <button
                            onClick={() => markAsRead(n._id)}
                            className="text-xs font-medium text-brass hover:underline whitespace-nowrap"
                          >
                            Mark as read
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotification(n._id)}
                          className="text-xs font-medium text-brick hover:underline whitespace-nowrap"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notifications;
