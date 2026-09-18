import React from "react";

// Previous/next controls. Always visible (never hover-only) so touch and
// keyboard users get the same navigation as mouse users.
const HeroControls = ({ onPrevious, onNext, label = "hero slides" }) => (
  <>
    <button
      type="button"
      onClick={onPrevious}
      aria-label={`Previous ${label}`}
      className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-navy-dark/60 text-ivory flex items-center justify-center hover:bg-navy-dark/85 focus-visible:outline-2 focus-visible:outline-brass transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    <button
      type="button"
      onClick={onNext}
      aria-label={`Next ${label}`}
      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-navy-dark/60 text-ivory flex items-center justify-center hover:bg-navy-dark/85 focus-visible:outline-2 focus-visible:outline-brass transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  </>
);

export default HeroControls;
