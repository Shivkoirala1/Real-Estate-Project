import React from 'react';
import { NavLink } from 'react-router-dom';

const linkClass = ({ isActive }) =>
  `block px-4 py-2.5 rounded-sm text-sm font-medium transition-colors ${
    isActive ? 'bg-brass text-navy' : 'text-ivory/80 hover:bg-navy-light hover:text-ivory'
  }`;

const Sidebar = () => {
  return (
    <aside className="w-full md:w-64 bg-navy rounded-sm p-4 flex-shrink-0 h-fit">
      <p className="eyebrow px-4 mb-3">Administrator Panel</p>
      <nav className="space-y-1">
        <NavLink to="/dashboard/admin" end className={linkClass}>Overview</NavLink>
        <NavLink to="/dashboard/admin/verifications" className={linkClass}>Verify Registrations</NavLink>
        <NavLink to="/dashboard/admin/properties" end className={linkClass}>All Properties</NavLink>
        <NavLink to="/dashboard/admin/properties/new" className={linkClass}>Add Property</NavLink>
        <NavLink to="/dashboard/admin/users" className={linkClass}>Manage Users</NavLink>
        <NavLink to="/dashboard/admin/categories" className={linkClass}>Categories</NavLink>
        <NavLink to="/dashboard/admin/inquiries" className={linkClass}>Inquiries</NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
