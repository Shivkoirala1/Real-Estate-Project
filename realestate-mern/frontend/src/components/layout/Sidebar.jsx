import React from 'react';
import { NavLink } from 'react-router-dom';
import { useConversations } from '../../context/ConversationContext';

const linkClass = ({ isActive }) =>
  `block rounded-sm px-4 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brass text-navy'
      : 'text-ivory/80 hover:bg-navy-light hover:text-ivory'
  }`;

const adminNavItems = [
  {
    label: 'Overview',
    to: '/dashboard/admin',
    end: true,
  },
  {
    label: 'Verify Registrations',
    to: '/dashboard/admin/verifications',
  },
  {
    label: 'All Properties',
    to: '/dashboard/admin/properties',
    end: true,
  },
  {
    label: 'Add Property',
    to: '/dashboard/admin/properties/new',
  },
  {
    label: 'Manage Visits',
    to: '/dashboard/admin/visits',
  },
  {
    label: 'Lead Pipeline',
    to: '/dashboard/admin/lead-management',
  },
  {
    label: 'Conversations',
    to: '/dashboard/admin/conversations',
  },
  {
    label: 'Sales Verification',
    to: '/dashboard/admin/sales',
  },
  {
    label: 'Commissions',
    to: '/dashboard/admin/commissions',
  },
  {
    label: 'Manage Agents',
    to: '/dashboard/admin/agents',
  },
  {
    label: 'Analytics',
    to: '/dashboard/admin/analytics',
  },
  {
    label: 'Manage Blogs',
    to: '/dashboard/admin/blogs',
    end: true,
  },
  {
    label: 'Manage Users',
    to: '/dashboard/admin/users',
  },
  {
    label: 'Categories',
    to: '/dashboard/admin/categories',
  },
  // {
  //  // legecy code for inquiries, not used anymore merged with lead management, but kept here for reference
  //   label: 'Inquiries',
  //   to: '/dashboard/admin/inquiries', 
  // },
];

const agentNavItems = [
  {
    label: 'Overview',
    to: '/dashboard/agent',
    end: true,
  },
  {
    label: 'My Leads',
    to: '/dashboard/agent/leads',
  },
  {
    label: 'My Sales',
    to: '/dashboard/agent/sales',
  },
  {
    label: 'My Commissions',
    to: '/dashboard/agent/commissions',
  },
  {
    label: 'My Conversations',
    to: '/my-conversations',
  },
  {
    label: 'EMI Plans',
    to: '/dashboard/agent/emi-plans',
  },
  {
    label: 'Analytics',
    to: '/dashboard/agent/analytics',
  },
  {
    label: 'All Properties',
    to: '/dashboard/agent/properties',
    end: true,
  },
  {
    label: 'Add Property',
    to: '/dashboard/agent/properties/new',
  },
  {
    label: 'Manage Visits',
    to: '/dashboard/agent/visits',
  },
  // {
  //   // legecy code for inquiries, not used anymore merged with lead management, but kept here for reference
  //   label: 'Inquiries',
  //   to: '/dashboard/agent/inquiries',
  // },
];

const Sidebar = () => {

  // check user role from localStorage/sessionStorage
  const user = JSON.parse(localStorage.getItem('user')) || JSON.parse(sessionStorage.getItem('user'));
  const role = user?.role;

  // Participant-scoped unread count - only meaningful for the agent's own threads
  const { unreadCount } = useConversations();
  
  const navItems =
    role === 'agent'
      ? agentNavItems
      : adminNavItems;

  const panelTitle =
    role === 'agent'
      ? 'Agent Panel'
      : 'Administrator Panel';

  return (
    <aside className="h-fit w-full flex-shrink-0 rounded-sm bg-navy p-4 md:w-64">
      <p className="eyebrow mb-3 px-4">
        {panelTitle}
      </p>

      <nav aria-label={`${panelTitle} navigation`} className="space-y-1">
        {navItems.map(({ label, to, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={linkClass}
          >
            <span className="flex items-center">
              {label}
              {to === '/my-conversations' && unreadCount > 0 && (
                <span className="ml-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-navy/20 bg-brass px-1 text-[10px] font-bold leading-none text-navy">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;