import React from "react";
import { Link } from "react-router-dom";
import HeroMedia from "./HeroMedia";

// Text layout + CTA rendering for one slide. The media fills the frame
// behind a legibility gradient; CTA destinations come from the slide config.
const HeroSlide = ({ slide, isActive }) => {
  const cta = slide.cta || {};
  const showCta = cta.enabled && cta.label && cta.actionType !== "none" && cta.actionValue;

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-hidden={!isActive}
      aria-label={slide.title}
      className="absolute inset-0 transition-opacity duration-700"
      style={{ opacity: isActive ? 1 : 0, pointerEvents: isActive ? "auto" : "none" }}
    >
      <HeroMedia media={slide.media} title={slide.title} />
      <div className="absolute inset-0 bg-gradient-to-t from-navy-dark/85 via-navy-dark/25 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
        {slide.subtitle && (
          <p className="eyebrow mb-1 hero-text-shadow !text-[11px]">{slide.subtitle}</p>
        )}
        <h3 className="text-ivory font-display text-lg md:text-2xl leading-tight hero-text-shadow">
          {slide.title}
        </h3>
        {slide.description && (
          <p className="text-ivory/80 text-xs md:text-sm mt-1 line-clamp-2 hero-text-shadow">
            {slide.description}
          </p>
        )}
        {showCta &&
          (cta.actionType === "property" ? (
            <Link
              to={`/properties/${cta.actionValue}`}
              tabIndex={isActive ? 0 : -1}
              className="inline-block mt-3 btn-gold text-xs py-2 px-4"
            >
              {cta.label}
            </Link>
          ) : (
            <a
              href={cta.actionValue}
              target="_blank"
              rel="noopener noreferrer"
              tabIndex={isActive ? 0 : -1}
              className="inline-block mt-3 btn-gold text-xs py-2 px-4"
            >
              {cta.label}
            </a>
          ))}
      </div>
    </div>
  );
};

export default HeroSlide;
