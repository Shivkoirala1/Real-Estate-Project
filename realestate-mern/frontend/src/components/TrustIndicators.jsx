import React, { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// PLACEHOLDER DATA — static showcase metrics for a new platform.
// TODO: replace with live values from GET /api/public/stats once the backend
// endpoint exists (see trust-indicators plan). Keep labels identical so the
// swap is data-only: { value, suffix, decimals, label } per metric.
// ---------------------------------------------------------------------------
const FOUNDED_YEAR = 2022;

const PLACEHOLDER_STATS = [
  { key: 'listings', value: 500, suffix: '+', decimals: 0, label: 'Active listings' },
  { key: 'deals', value: 120, suffix: '+', decimals: 0, label: 'Verified deals closed' },
  { key: 'agents', value: 25, suffix: '+', decimals: 0, label: 'Expert agents' },
  { key: 'districts', value: 40, suffix: '+', decimals: 0, label: 'Districts served' },
  { key: 'rating', value: 4.8, suffix: '★', decimals: 1, label: 'Community rating' },
  { key: 'years', value: Math.max(new Date().getFullYear() - FOUNDED_YEAR, 1), suffix: '+', decimals: 0, label: 'Years of trust' },
];

const ANIMATION_MS = 1200;

// Eased count-up; honors prefers-reduced-motion by showing the final value.
const useCountUp = (target, started, decimals) => {
  const [display, setDisplay] = useState((0).toFixed(decimals));
  useEffect(() => {
    if (!started) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(target.toFixed(decimals));
      return undefined;
    }
    let frame;
    const t0 = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - t0) / ANIMATION_MS, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay((target * eased).toFixed(decimals));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, target, decimals]);
  return display;
};

const StatItem = ({ stat, started }) => {
  const display = useCountUp(stat.value, started, stat.decimals);
  return (
    <div className="text-center px-4 py-6">
      <p className="font-display text-3xl md:text-4xl text-brass-light leading-none mb-2">
        {display}
        {stat.suffix}
      </p>
      <p className="text-sm text-ivory/70">{stat.label}</p>
    </div>
  );
};

// Static trust strip: proof points above the "Why Youth Real Estate"
// explanation cards. Purely presentational (no fetch), so it can never
// break the homepage.
const TrustIndicators = () => {
  const sectionRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="mt-24 bg-navy-dark">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-14 md:py-16">
        <p className="eyebrow mb-2 text-center">Our track record</p>
        <h2 className="text-3xl text-white text-center mb-10">Numbers that build trust</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-y-4 divide-ivory/10 lg:divide-x">
          {PLACEHOLDER_STATS.map((stat) => (
            <StatItem key={stat.key} stat={stat} started={inView} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustIndicators;
