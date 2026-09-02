import React from 'react';
import { NavLink } from 'react-router-dom';

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
  {
    label: 'Inquiries',
    to: '/dashboard/admin/inquiries',
  },
];

const agentNavItems = [
  {
    label: 'Overview',
    to: '/dashboard/agent',
    end: true,
  },
  {
    label: 'My Properties',
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
  {
    label: 'Inquiries',
    to: '/dashboard/agent/inquiries',
  },
];

const Sidebar = () => {

  // check user role from localStorage/sessionStorage
  const user = JSON.parse(localStorage.getItem('user')) || JSON.parse(sessionStorage.getItem('user'));
  const role = user?.role;
  
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
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;