import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicInnovations } from '../services/innovationService';
import InnovationCard from './InnovationCard';
import InnovationDetailModal from './InnovationDetailModal';

const SHOWCASE_LIMIT = 6;

// Latest visible ideas on the homepage. Self-contained fetch (AgentShowcase
// convention): any failure resolves to an empty list and the section renders
// nothing, so the rest of the homepage is never affected. View-only —
// management actions live on the owner/admin pages.
const InnovationShowcase = () => {
  const [ideas, setIdeas] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getPublicInnovations({ limit: SHOWCASE_LIMIT });
        if (!cancelled) setIdeas(data.innovations ?? []);
      } catch (err) {
        console.error('Failed to load innovation showcase:', err);
        if (!cancelled) setIdeas([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (ideas.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-5 md:px-8 mt-20">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow mb-2">Community ideas</p>
          <h2 className="text-3xl">Latest innovation ideas</h2>
        </div>
        <div className="flex flex-shrink-0 flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <Link to="/innovations" className="text-sm font-medium text-brass hover:underline whitespace-nowrap">See More →</Link>
          {/* Submission CTA for the user role: guests fall through to login
              via ProtectedRoute, unverified users hit PostGate. */}
          <Link to="/my-innovations/new" className="btn-gold text-sm px-4 py-2 whitespace-nowrap text-center">+ Share your idea</Link>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {ideas.map((idea) => (
          <InnovationCard key={idea._id} innovation={idea} onClick={() => setSelected(idea)} />
        ))}
      </div>
      <InnovationDetailModal innovation={selected} onClose={() => setSelected(null)} />
    </section>
  );
};

export default InnovationShowcase;
