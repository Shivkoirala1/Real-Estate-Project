import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../context/NotificationContext';
import { timeAgo } from '../utils/format';

const typeIcon = {
  inquiry_received: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16v14H8l-4 4V4z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  inquiry_read: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  inquiry_responded: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  inquiry_followup: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  property_sold: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.59 13.41L11 3.83A2 2 0 009.59 3.17L4 3a1 1 0 00-1 1l.17 5.59a2 2 0 00.66 1.41l9.58 9.58a2 2 0 002.83 0l4.35-4.35a2 2 0 000-2.82z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  ),
  system: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

const iconTint = {
  inquiry_received: 'bg-brass-light/25 text-brass-dark',
  inquiry_read: 'bg-navy/10 text-navy',
  inquiry_responded: 'bg-sage-light text-sage',
  inquiry_followup: 'bg-navy/10 text-navy',
  property_sold: 'bg-brick-light text-brick',
  system: 'bg-parchment text-slate-ink',
};

const NotificationBell = () => {
  const { notifications, unreadCount, loading, fetchNotifications, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) fetchNotifications('all');
  }, [open, fetchNotifications]);

  const handleItemClick = (n) => {
    if (!n.isRead) markAsRead(n._id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const recent = notifications.slice(0, 6);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex items-center justify-center w-9 h-9 rounded-full text-ivory/85 hover:text-brass hover:bg-ivory/5 transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brick text-ivory text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[22rem] max-w-[90vw] bg-white rounded-sm shadow-lifted border border-navy/10 text-navy overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-navy/10">
            <p className="font-semibold text-sm">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-xs font-medium text-brass hover:underline">
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && recent.length === 0 ? (
              <p className="text-sm text-slate-muted text-center py-8">Loading...</p>
            ) : recent.length === 0 ? (
              <div className="text-center py-10 px-6">
                <p className="text-sm text-slate-muted">You're all caught up. New inquiry activity will show up here.</p>
              </div>
            ) : (
              recent.map((n) => (
                <button
                  key={n._id}
                  onClick={() => handleItemClick(n)}
                  className={`w-full text-left flex gap-3 px-4 py-3 border-b border-navy/5 last:border-0 hover:bg-parchment transition-colors ${
                    !n.isRead ? 'bg-brass-light/10' : ''
                  }`}
                >
                  <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${iconTint[n.type] || iconTint.system}`}>
                    {typeIcon[n.type] || typeIcon.system}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className={`text-sm ${!n.isRead ? 'font-semibold text-navy' : 'font-medium text-slate-ink'}`}>
                        {n.title}
                      </span>
                      {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-brick flex-shrink-0" />}
                    </span>
                    <span className="block text-xs text-slate-muted mt-0.5 line-clamp-2">{n.message}</span>
                    <span className="block text-[11px] text-slate-muted/80 mt-1">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <button
            onClick={() => { setOpen(false); navigate('/notifications'); }}
            className="w-full text-center text-sm font-medium text-brass py-3 border-t border-navy/10 hover:bg-parchment transition-colors"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
