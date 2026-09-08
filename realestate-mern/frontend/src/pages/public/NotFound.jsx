import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="max-w-xl mx-auto px-5 py-32 text-center">
      <p className="font-display text-7xl text-brass mb-4">404</p>
      <h1 className="text-2xl mb-4">Page not found</h1>
      <p className="text-slate-muted mb-8">The page you're looking for doesn't exist or has been moved.</p>
      <Link to="/" className="btn-primary">Back to home</Link>
    </div>
  );
};

export default NotFound;
