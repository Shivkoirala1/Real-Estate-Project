import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyFavorites, getMyListings } from '../../../../services/propertyService';

// Account shortcuts (saved properties, listings, post/admin). Fetches its
// own counts and degrades safely — a stats failure never blocks the page.
const ProfileStats = ({ isAdmin, isVerified }) => {
  const [stats, setStats] = useState({ favorites: null, listings: null });

  useEffect(() => {
    let active = true;
    const loadStats = async () => {
      const [favRes, listRes] = await Promise.allSettled([
        getMyFavorites(),
        getMyListings(),
      ]);
      if (!active) return;
      setStats({
        favorites: favRes.status === 'fulfilled' ? (favRes.value.favorites || []).length : 0,
        listings: listRes.status === 'fulfilled' ? (listRes.value.count ?? (listRes.value.properties || []).length) : 0,
      });
    };
    loadStats();
    return () => { active = false; };
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <Link to="/favorites" className="group bg-white border border-navy/10 rounded-sm p-5 shadow-card hover:shadow-lifted hover:border-brass/40 transition-all">
        <p className="text-xs uppercase tracking-wide text-slate-muted mb-1.5">Saved Properties</p>
        <div className="flex items-center justify-between">
          <p className="font-display text-3xl text-navy" aria-live="polite">{stats.favorites ?? '—'}</p>
          <span className="text-brick text-xl" aria-hidden="true">♥</span>
        </div>
        <p className="text-xs text-brass mt-2 group-hover:underline">View favorites →</p>
      </Link>
      <Link to="/my-properties" className="group bg-white border border-navy/10 rounded-sm p-5 shadow-card hover:shadow-lifted hover:border-brass/40 transition-all">
        <p className="text-xs uppercase tracking-wide text-slate-muted mb-1.5">Your Listings</p>
        <div className="flex items-center justify-between">
          <p className="font-display text-3xl text-navy" aria-live="polite">{stats.listings ?? '—'}</p>
          <span className="text-sage text-xl" aria-hidden="true">⌂</span>
        </div>
        <p className="text-xs text-brass mt-2 group-hover:underline">Manage listings →</p>
      </Link>
      {isAdmin ? (
        <Link to="/dashboard/admin" className="group bg-navy rounded-sm p-5 shadow-card hover:shadow-lifted transition-all">
          <p className="text-xs uppercase tracking-wide text-ivory/50 mb-1.5">Admin</p>
          <p className="font-display text-lg text-ivory">Go to dashboard</p>
          <p className="text-xs text-brass mt-2 group-hover:underline">Open dashboard →</p>
        </Link>
      ) : isVerified ? (
        <Link to="/my-properties/new" className="group bg-brass rounded-sm p-5 shadow-card hover:shadow-lifted hover:bg-brass-dark transition-all">
          <p className="text-xs uppercase tracking-wide text-ivory/70 mb-1.5">Ready to sell?</p>
          <p className="font-display text-lg text-ivory">Post a property</p>
          <p className="text-xs text-ivory/80 mt-2 group-hover:underline">+ New listing →</p>
        </Link>
      ) : (
        <div className="bg-parchment/60 border border-dashed border-navy/15 rounded-sm p-5">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-1.5">Ready to sell?</p>
          <p className="text-sm text-slate-ink leading-relaxed">Complete verification below to unlock posting properties.</p>
        </div>
      )}
    </div>
  );
};

export default ProfileStats;
