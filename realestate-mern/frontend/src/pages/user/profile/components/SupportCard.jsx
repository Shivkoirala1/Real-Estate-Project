import React from 'react';
import { Link } from 'react-router-dom';

// Secondary card: route to support. Deliberately quiet next to account and
// security actions.
const SupportCard = () => (
  <div className="bg-parchment/60 border border-navy/10 rounded-sm p-6">
    <p className="font-semibold text-navy text-sm mb-2">Need help?</p>
    <p className="text-sm text-slate-muted leading-relaxed mb-3">
      Questions about your account or a listing? Our team is happy to help.
    </p>
    <Link to="/contact" className="text-sm text-brass hover:underline font-medium">Contact support →</Link>
  </div>
);

export default SupportCard;
