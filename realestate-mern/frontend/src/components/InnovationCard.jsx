import React from 'react';
import { imageUrl, timeAgo } from '../utils/format';
import { formatInnovationCategory } from '../services/innovationService';

// Card structure mirrors PropertyCard (cover / title / excerpt / footer)
// without any property-specific fields or navigation. The parent opens
// InnovationDetailModal via onClick — there is no /innovations/:id route.
// Deliberately free of ownership/admin logic so homepage, public, owner
// and admin lists can all reuse it.
const InnovationCard = ({ innovation, onClick }) => {
  if (!innovation) return null;
  const images = innovation.images || [];
  const cover = images[0] || null;
  const author = innovation.submittedBy?.name || 'Community member';
  const raw = innovation.description || '';
  const excerpt = raw.length > 140 ? `${raw.slice(0, 140).trimEnd()}…` : raw;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group block w-full text-left bg-white rounded-sm overflow-hidden shadow-card hover:shadow-lifted transition-shadow duration-200"
    >
      <div className="relative h-52 overflow-hidden bg-parchment">
        <span className="absolute top-3 left-3 z-10 bg-navy/85 text-ivory text-xs font-medium px-2.5 py-1 rounded-sm">
          {formatInnovationCategory(innovation.category)}
        </span>
        <img
          src={imageUrl(cover)}
          alt={innovation.title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {innovation.videoUrl && (
          <span className="absolute bottom-3 right-3 z-10 bg-navy/85 text-ivory text-xs font-medium px-2.5 py-1 rounded-sm">
            ▶ Video
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="font-display text-lg text-navy leading-snug mb-1 line-clamp-1">{innovation.title}</p>
        <p className="text-sm text-slate-muted mb-3 line-clamp-2 leading-relaxed">{excerpt}</p>
        <div className="flex items-center justify-between text-xs text-slate-ink border-t border-navy/10 pt-3">
          <span className="truncate">{author}</span>
          {innovation.createdAt && <span className="flex-shrink-0 ml-2">{timeAgo(innovation.createdAt)}</span>}
        </div>
      </div>
    </button>
  );
};

export default InnovationCard;
