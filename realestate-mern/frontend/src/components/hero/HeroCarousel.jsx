import React, { useState, useEffect, useRef, useCallback } from "react";
import HeroSlide from "./HeroSlide";
import HeroControls from "./HeroControls";
import HeroIndicators from "./HeroIndicators";

// Owns active-slide state, per-slide-duration auto rotation, manual
// navigation and pause behavior. `layout="card"` renders the compact
// desktop overlay; `layout="full"` renders the mobile replacement hero.
const HeroCarousel = ({ slides = [], layout = "full" }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  const count = slides.length;
  const isCard = layout === "card";

  const goTo = useCallback(
    (index) => {
      if (count === 0) return;
      setActiveIndex(((index % count) + count) % count);
    },
    [count]
  );

  const goNext = useCallback(() => goTo(activeIndex + 1), [goTo, activeIndex]);
  const goPrevious = useCallback(() => goTo(activeIndex - 1), [goTo, activeIndex]);

  // Auto-advance on the active slide's own duration; paused on hover/focus.
  useEffect(() => {
    if (count <= 1 || paused) return;
    const durationSeconds = slides[activeIndex]?.duration ?? 5;
    timerRef.current = setTimeout(goNext, durationSeconds * 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeIndex, paused, count, slides, goNext]);

  // Keep the index valid if the slide list changes underneath us.
  useEffect(() => {
    if (activeIndex >= count) setActiveIndex(0);
  }, [count, activeIndex]);

  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured stories"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`relative overflow-hidden rounded-sm ${
        isCard ? "h-64 lg:h-72 shadow-lifted" : "h-80"
      }`}
    >
      {slides.map((slide, i) => (
        <HeroSlide key={slide._id} slide={slide} isActive={i === activeIndex} />
      ))}
      {count > 1 && (
        <>
          <HeroControls onPrevious={goPrevious} onNext={goNext} />
          <HeroIndicators count={count} activeIndex={activeIndex} onSelect={goTo} />
        </>
      )}
    </div>
  );
};

export default HeroCarousel;
