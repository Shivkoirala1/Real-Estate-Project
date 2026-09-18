import React from "react";

// Chooses the element by media type. Videos play muted/inline/looped with
// the uploaded thumbnail as poster; images render covering their frame.
const HeroMedia = ({ media, title, className = "" }) => {
  if (!media) return null;
  if (media.type === "video") {
    return (
      <video
        src={media.url}
        poster={media.thumbnailUrl || undefined}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        aria-label={media.altText || title}
        className={`w-full h-full object-cover ${className}`}
      />
    );
  }
  return (
    <img
      src={media.thumbnailUrl || media.url}
      alt={media.altText || title}
      loading="lazy"
      className={`w-full h-full object-cover ${className}`}
    />
  );
};

export default HeroMedia;
