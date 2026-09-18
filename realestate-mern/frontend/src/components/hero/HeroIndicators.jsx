import React from "react";

// Dot indicators — one button per slide, keyboard accessible with visible
// active state (not color-only: active dot is wider).
const HeroIndicators = ({ count, activeIndex, onSelect }) => {
  if (count <= 1) return null;
  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1.5" role="tablist" aria-label="Choose slide">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-selected={i === activeIndex}
          aria-label={`Go to slide ${i + 1}`}
          onClick={() => onSelect(i)}
          className={`h-1.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-brass ${
            i === activeIndex ? "w-6 bg-brass-light" : "w-1.5 bg-ivory/50 hover:bg-ivory/80"
          }`}
        />
      ))}
    </div>
  );
};

export default HeroIndicators;
