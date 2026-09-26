import React from 'react';
import { FaFacebookF, FaTiktok, FaInstagram, FaYoutube, FaWhatsapp } from 'react-icons/fa';
import { useSiteSettings } from '../hooks/useSiteSettings';

const SOCIAL_DEFS = [
  { key: 'facebook', label: 'Facebook', Icon: FaFacebookF, hoverClass: 'hover:bg-[#1877F2]' },
  { key: 'tiktok', label: 'TikTok', Icon: FaTiktok, hoverClass: 'hover:bg-black' },
  { key: 'instagram', label: 'Instagram', Icon: FaInstagram, hoverClass: 'hover:bg-[#E1306C]' },
  { key: 'youtube', label: 'YouTube', Icon: FaYoutube, hoverClass: 'hover:bg-[#FF0000]' },
  { key: 'whatsapp', label: 'WhatsApp', Icon: FaWhatsapp, hoverClass: 'hover:bg-[#25D366]' },
];

// Slim fixed social rail, vertically centered on the left viewport edge.
// Links are admin-editable (Site Settings); empties stay hidden so the rail
// can never point visitors at a wrong address.
const FloatingSocials = () => {
  const { settings } = useSiteSettings();
  const socials = SOCIAL_DEFS.filter(({ key }) => settings.socials?.[key]).map(
    ({ key, ...rest }) => ({ ...rest, href: settings.socials[key] }),
  );

  if (socials.length === 0) return null;
  return (
    <nav
      aria-label="Social media"
      className="fixed z-40 left-0 top-1/2 -translate-y-1/2 flex flex-col rounded-r-sm overflow-hidden shadow-lifted"
      style={{ marginTop: 'env(safe-area-inset-top)' }}
    >
      {socials.map(({ label, href, Icon, hoverClass }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 bg-navy text-ivory transition-colors ${hoverClass} hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brass`}
        >
          <Icon aria-hidden="true" className="text-[15px] sm:text-base" />
        </a>
      ))}
    </nav>
  );
};

export default FloatingSocials;
