import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';
import { timeAgo } from '../../utils/format';

const typeMeta = {
  inquiry_received: { label: 'New inquiry', tint: 'bg-brass-light/25 text-brass-dark' },
  inquiry_read: { label: 'Viewed', tint: 'bg-navy/10 text-navy' },
  inquiry_responded: { label: 'Response', tint: 'bg-sage-light text-sage' },
  inquiry_followup: { label: 'New reply', tint: 'bg-navy/10 text-navy' },
  contact_form_received: { label: 'New enquiry', tint: 'bg-brass-light/25 text-brass-dark' },
  contact_form_responded: { label: 'Response', tint: 'bg-sage-light text-sage' },
  property_sold: { label: 'Sold', tint: 'bg-brick-light text-brick' },
  visit_requested: { label: 'Visit requested', tint: 'bg-brass-light/25 text-brass-dark' },
  visit_confirmed: { label: 'Visit confirmed', tint: 'bg-sage-light text-sage' },
  visit_rejected: { label: 'Visit rejected', tint: 'bg-brick-light text-brick' },
  visit_cancelled: { label: 'Visit cancelled', tint: 'bg-brick-light text-brick' },
  visit_completed: { label: 'Visit completed', tint: 'bg-navy/10 text-navy' },
  visit_rescheduled: { label: 'Rescheduled', tint: 'bg-navy/10 text-navy' },
  lead_assigned: { label: 'Lead assigned', tint: 'bg-brass-light/25 text-brass-dark' },
  lead_created: { label: 'New lead', tint: 'bg-brass-light/25 text-brass-dark' },
  lead_stage_changed: { label: 'Stage changed', tint: 'bg-navy/10 text-navy' },
  sale_submitted: { label: 'Sale submitted', tint: 'bg-brass-light/25 text-brass-dark' },
  sale_verified: { label: 'Sale verified', tint: 'bg-sage-light text-sage' },
  sale_rejected: { label: 'Sale rejected', tint: 'bg-brick-light text-brick' },
  rental_submitted: { label: 'Rental submitted', tint: 'bg-brass-light/25 text-brass-dark' },
  rental_verified: { label: 'Rental verified', tint: 'bg-sage-light text-sage' },
  rental_rejected: { label: 'Rental rejected', tint: 'bg-brick-light text-brick' },
  commission_paid: { label: 'Commission', tint: 'bg-sage-light text-sage' },
  commission_phase1_paid: { label: 'Commission phase 1', tint: 'bg-brass-light/25 text-brass-dark' },
  emi_installment_due: { label: 'EMI due soon', tint: 'bg-navy/10 text-navy' },
  emi_installment_overdue: { label: 'EMI overdue', tint: 'bg-brick-light text-brick' },
  emi_plan_created: { label: 'EMI plan created', tint: 'bg-navy/10 text-navy' },
  emi_plan_pending: { label: 'EMI plan pending', tint: 'bg-brass-light/25 text-brass-dark' },
  emi_installment_updated: { label: 'EMI updated', tint: 'bg-navy/10 text-navy' },
  emi_plan_status_changed: { label: 'EMI status changed', tint: 'bg-navy/10 text-navy' },
  emi_verification_requested: { label: 'Verification requested', tint: 'bg-brass-light/25 text-brass-dark' },
  emi_verification_approved: { label: 'Payment verified', tint: 'bg-sage-light text-sage' },
  emi_verification_rejected: { label: 'Verification rejected', tint: 'bg-brick-light text-brick' },
  conversation_message: { label: 'Message', tint: 'bg-sage-light text-sage' },
  conversation_followup: { label: 'Follow-up', tint: 'bg-navy/10 text-navy' },
  review_posted: { label: 'New review', tint: 'bg-sage-light text-sage' },
  review_reply: { label: 'Review reply', tint: 'bg-navy/10 text-navy' },
  lead_followup_due: { label: 'Follow-up overdue', tint: 'bg-brick-light text-brick' },
  lead_closed: { label: 'Lead closed', tint: 'bg-navy text-ivory' },
  management_request_submitted: { label: 'Management request', tint: 'bg-brass-light/25 text-brass-dark' },
  management_request_accepted: { label: 'Request accepted', tint: 'bg-sage-light text-sage' },
  management_request_declined: { label: 'Request declined', tint: 'bg-brick-light text-brick' },
  management_terminated: { label: 'Terminated', tint: 'bg-brick-light text-brick' },
  management_termination_requested: { label: 'Termination requested', tint: 'bg-brass-light/25 text-brass-dark' },
  tenancy_end_requested: { label: 'End of tenancy requested', tint: 'bg-brass-light/25 text-brass-dark' },
  tenancy_end_approved: { label: 'Tenancy ended', tint: 'bg-sage-light text-sage' },
  tenancy_end_declined: { label: 'End of tenancy declined', tint: 'bg-brick-light text-brick' },
  system: { label: 'System', tint: 'bg-parchment text-slate-ink' },
};

// Category tabs (display order). `system` is backend-taxonomy only and is
// intentionally not rendered as a tab — those rows stay under All.
const CATEGORY_TABS = [
  { key: 'messages', label: 'Messages' },
  { key: 'visits', label: 'Visits' },
  { key: 'deals', label: 'Deals' },
  { key: 'management', label: 'Management' },
  { key: 'payments', label: 'Payments' },
];

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
  const { notifications, unreadCount, unreadByCategory, loading, fetchNotifications, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications(filter, category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, category]);

  const selectTab = (nextFilter, nextCategory) => {
    setFilter(nextFilter);
    setCategory(nextCategory);
  };

  const badge = (count) => (count > 0 ? ` (${count})` : '');

  const tabs = [
    { key: 'all', label: 'All', filter: 'all', category: 'all' },
    { key: 'unread', label: `Unread${badge(unreadCount)}`, filter: 'unread', category: 'all' },
    ...CATEGORY_TABS.map((tab) => ({
      key: tab.key,
      label: `${tab.label}${badge(unreadByCategory?.[tab.key] ?? 0)}`,
      filter: 'all',
      category: tab.key,
    })),
  ];

  const activeTab = filter === 'unread' ? 'unread' : category;

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

      <div className="flex gap-2 mb-6 border-b border-navy/10 pb-4 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => selectTab(tab.filter, tab.category)}
            className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors ${
              activeTab === tab.key ? 'bg-navy text-ivory' : 'text-slate-ink hover:bg-parchment'
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
            {filter === 'unread'
              ? "You're all caught up — no unread notifications."
              : category !== 'all'
                ? `No ${CATEGORY_TABS.find((t) => t.key === category)?.label.toLowerCase() ?? ''} notifications yet.`
                : 'No notifications yet. Activity on your inquiries and listings will show up here.'}
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
