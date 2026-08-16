import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const copy = {
  pending: {
    title: 'Verification in progress',
    body: "You'll be able to post a property as soon as an administrator approves your registration documents. This usually takes less than a day.",
  },
  rejected: {
    title: 'Verification not approved',
    body: 'Your identity documents were not approved, so posting is currently disabled on your account. Please contact support.',
  },
};

// Wraps posting-related pages (new/edit listing) and blocks access until the
// user's identity has been verified by an admin.
const PostGate = ({ children }) => {
  const { user } = useAuth();

  if (user?.role === 'admin' || user?.verificationStatus === 'verified') {
    return children;
  }

  const info = copy[user?.verificationStatus] || copy.pending;

  return (
    <div className="max-w-lg mx-auto text-center py-10">
      <div className="w-14 h-14 rounded-full bg-brass/15 text-brass-dark flex items-center justify-center mx-auto mb-5 font-display text-2xl">
        !
      </div>
      <h1 className="text-2xl mb-3">{info.title}</h1>
      <p className="text-slate-muted leading-relaxed mb-6">{info.body}</p>
      <Link to="/profile" className="btn-secondary">Back to my profile</Link>
    </div>
  );
};

export default PostGate;
