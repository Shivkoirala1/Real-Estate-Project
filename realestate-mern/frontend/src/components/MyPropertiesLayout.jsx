import React from 'react';
import { NavLink } from 'react-router-dom';

const tabClass = ({ isActive }) =>
  `px-4 py-2.5 text-sm font-medium rounded-sm transition-colors ${
    isActive ? 'bg-navy text-ivory' : 'text-slate-ink hover:bg-parchment'
  }`;

const MyPropertiesLayout = ({ children }) => {
  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-10">
      <p className="eyebrow mb-2">Your listings</p>
      <h1 className="text-3xl mb-6">My Properties</h1>
      <nav className="flex flex-wrap gap-2 mb-8 border-b border-navy/10 pb-4">
        <NavLink to="/my-properties" end className={tabClass}>All Listings</NavLink>
        <NavLink to="/my-properties/new" className={tabClass}>Post a Property</NavLink>
        <NavLink to="/my-properties/inquiries" className={tabClass}>My Inquiries</NavLink>
      </nav>
      {children}
    </div>
  );
};

export default MyPropertiesLayout;
