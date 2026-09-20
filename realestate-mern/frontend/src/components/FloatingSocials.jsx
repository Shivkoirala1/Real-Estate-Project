import React from 'react';
import { FaFacebookF, FaTiktok, FaWhatsapp } from 'react-icons/fa';

// TODO: replace with the business WhatsApp link, e.g.
// 'https://wa.me/97798XXXXXXXX'. The icon stays hidden until this is set
// so it can never point visitors at a wrong number.
const WHATSAPP_URL = '';

const socials = [
  {
    label: 'Facebook',
    href: 'https://www.facebook.com/share/1Er4dykkTo/',
    Icon: FaFacebookF,
    hoverClass: 'hover:bg-[#1877F2]',
  },
  {
    label: 'TikTok',
    href: 'https://www.tiktok.com/@youth_real_estate_5?_r=1&_t=ZS-99gxZruylGi',
    Icon: FaTiktok,
    hoverClass: 'hover:bg-black',
  },
  ...(WHATSAPP_URL
    ? [
        {
          label: 'WhatsApp',
          href: WHATSAPP_URL,
          Icon: FaWhatsapp,
          hoverClass: 'hover:bg-[#25D366]',
        },
      ]
    : []),
];

// Slim fixed social rail, vertically centered on the left viewport edge.
// Icon-only with screen-reader labels; brand color fills on hover.
const FloatingSocials = () => {
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
