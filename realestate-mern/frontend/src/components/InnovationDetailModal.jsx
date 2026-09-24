import React, { useEffect } from 'react';
import ImageGallery from './ImageGallery';
import { timeAgo } from '../utils/format';
import { formatInnovationCategory } from '../services/innovationService';

// View-only detail overlay for an already-loaded idea (V1 has no public
// detail endpoint, so no fetch happens here). Shell follows the ad-hoc
// centered-modal convention (fixed inset-0 + bg-navy/60 + stopPropagation);
// scroll/Escape handling mirrors ContactModalHost. No likes, comments,
// contact, share or management controls — those live on the owner/admin
// pages.
const InnovationDetailModal = ({ innovation, onClose }) => {
  useEffect(() => {
    if (!innovation) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [innovation, onClose]);

  if (!innovation) return null;

  const images = innovation.images || [];
  const author = innovation.submittedBy?.name || 'Community member';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={innovation.title}
    >
      <div
        className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-sm shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white z-10 px-6 py-5 border-b border-navy/10 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-1">{formatInnovationCategory(innovation.category)}</p>
            <h2 className="text-xl leading-snug">{innovation.title}</h2>
            <p className="text-xs text-slate-muted mt-1.5">
              By {author}
              {innovation.createdAt ? ` · ${timeAgo(innovation.createdAt)}` : ''}
              {images.length > 0 ? ` · ${images.length} photo${images.length > 1 ? 's' : ''}` : ''}
              {innovation.videoUrl ? ' · Video' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="flex-shrink-0 w-8 h-8 rounded-full bg-navy/5 text-navy hover:bg-navy hover:text-ivory transition-colors text-lg leading-8"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {innovation.videoUrl && (
            <video
              src={innovation.videoUrl}
              poster={innovation.videoThumbnail || undefined}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-[420px] rounded-sm bg-navy-dark"
            />
          )}

          {images.length > 0 && <ImageGallery coverImage={images[0]} images={images} />}

          {!innovation.videoUrl && images.length === 0 && (
            <p className="text-sm text-slate-muted italic">No photos or video were attached to this idea.</p>
          )}

          <p className="text-sm text-slate-ink leading-relaxed whitespace-pre-wrap">{innovation.description}</p>
        </div>
      </div>
    </div>
  );
};

export default InnovationDetailModal;
