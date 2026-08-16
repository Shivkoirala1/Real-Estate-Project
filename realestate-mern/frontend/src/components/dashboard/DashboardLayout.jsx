import React from 'react';
import Sidebar from './Sidebar';

const DashboardLayout = ({ children }) => {
  return (
    <div className="max-w-7xl mx-auto px-5 md:px-8 py-10 flex flex-col md:flex-row gap-8">
      <Sidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
};

export default DashboardLayout;
