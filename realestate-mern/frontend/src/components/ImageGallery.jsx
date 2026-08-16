import React, { useEffect, useState } from 'react';
import { imageUrl } from '../utils/format';

const ImageGallery = ({ coverImage, images = [] }) => {
  // Dedupe: the cover image is often also the first entry in `images`
  // (e.g. when a poster didn't pick a separate cover), which previously
  // caused the same photo to appear twice in the slider.
  const rest = images.filter((img) => img && img !== coverImage);
  const all = [coverImage, ...rest].filter(Boolean);
  const [active, setActive] = useState(0);

  const goTo = (index) => {
    if (all.length === 0) return;
    setActive(((index % all.length) + all.length) % all.length);
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') goTo(active - 1);
      if (e.key === 'ArrowRight') goTo(active + 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, all.length]);

  if (all.length === 0) {
    return (
      <div className="h-96 bg-parchment rounded-sm flex items-center justify-center text-slate-muted">
        No images available
      </div>
    );
  }

  return (
    <div>
      <div className="relative h-[420px] rounded-sm overflow-hidden bg-parchment group">
        <img src={imageUrl(all[active])} alt="Property view" className="w-full h-full object-cover" />

        {all.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo(active - 1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-navy/70 text-ivory flex items-center justify-center hover:bg-navy transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goTo(active + 1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-navy/70 text-ivory flex items-center justify-center hover:bg-navy transition-colors"
            >
              ›
            </button>
            <div className="absolute bottom-3 right-3 bg-navy/70 text-ivory text-xs px-2.5 py-1 rounded-sm">
              {active + 1} / {all.length}
            </div>
          </>
        )}
      </div>

      {all.length > 1 && (
        <div className="flex gap-3 mt-3 overflow-x-auto pb-1">
          {all.map((img, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-24 h-20 flex-shrink-0 rounded-sm overflow-hidden border-2 transition-colors ${
                active === i ? 'border-brass' : 'border-transparent'
              }`}
            >
              <img src={imageUrl(img)} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ImageGallery;
