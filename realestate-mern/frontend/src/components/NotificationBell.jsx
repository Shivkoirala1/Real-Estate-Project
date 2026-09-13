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
  sale_submitted: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  sale_verified: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M8.5 12l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  sale_rejected: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  commission_paid: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  emi_installment_due: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  emi_installment_overdue: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  emi_plan_created: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  emi_plan_pending: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  emi_installment_updated: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 15l4-4 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  emi_plan_status_changed: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  emi_verification_requested: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 18v-4M12 11h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  emi_verification_approved: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 15l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  emi_verification_rejected: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 12l4 4m0-4l-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  visit_requested: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h18M8 2v4M16 2v4M12 13v4M10 15h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  visit_confirmed: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h18M8 2v4M16 2v4M9 15l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  visit_rescheduled: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h18M8 2v4M16 2v4M17 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  visit_rejected: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h18M8 2v4M16 2v4M10 13l4 4M14 13l-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  visit_cancelled: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h18M8 2v4M16 2v4M10 13l4 4M14 13l-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  visit_completed: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 9h18M8 2v4M16 2v4M9 15l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  conversation_message: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  conversation_followup: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
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
  sale_submitted: 'bg-brass-light/25 text-brass-dark',
  sale_verified: 'bg-sage-light text-sage',
  sale_rejected: 'bg-brick-light text-brick',
  commission_paid: 'bg-sage-light text-sage',
  emi_installment_due: 'bg-navy/10 text-navy',
  emi_installment_overdue: 'bg-brick-light text-brick',
  emi_plan_created: 'bg-navy/10 text-navy',
  emi_plan_pending: 'bg-brass-light/25 text-brass-dark',
  emi_installment_updated: 'bg-navy/10 text-navy',
  emi_plan_status_changed: 'bg-navy/10 text-navy',
  emi_verification_requested: 'bg-brass-light/25 text-brass-dark',
  emi_verification_approved: 'bg-sage-light text-sage',
  emi_verification_rejected: 'bg-brick-light text-brick',
  visit_requested: 'bg-brass-light/25 text-brass-dark',
  visit_confirmed: 'bg-sage-light text-sage',
  visit_rescheduled: 'bg-navy/10 text-navy',
  visit_rejected: 'bg-brick-light text-brick',
  visit_cancelled: 'bg-slate-muted/10 text-slate-muted',
  visit_completed: 'bg-sage-light text-sage',
  conversation_message: 'bg-sage-light text-sage',
  conversation_followup: 'bg-navy/10 text-navy',
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
