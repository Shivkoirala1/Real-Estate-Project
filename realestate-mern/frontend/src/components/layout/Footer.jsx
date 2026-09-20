import React from 'react';
import { Link } from 'react-router-dom';
import { FiHome, FiGrid, FiRepeat, FiInfo, FiMapPin, FiPhone, FiMail } from 'react-icons/fi';
import { FaFacebookF, FaTiktok } from 'react-icons/fa';
import MapView from '../MapView';

// Office location. Coordinates are the center of Plus Code 7MR9M77H+F5M
// (M77H+F5M, Itahari) — Itahari Ward No. 6, Koshi Province 56705.
const OFFICE = {
  address: 'Itahari Ward No. 6, Itahari, Koshi Province',
  phone: '+977 1-4567890',
  email: 'youthrealestate6@gmail.com',
  lat: 26.6637,
  lng: 87.2779,
};

const navigateLinks = [
  { to: '/', label: 'Home', icon: FiHome },
  { to: '/properties', label: 'Properties', icon: FiGrid },
  { to: '/land-converter', label: 'Land Converter', icon: FiRepeat },
  { to: '/about', label: 'About Us', icon: FiInfo },
];

const contactRows = [
  { icon: FiMapPin, text: OFFICE.address },
  { icon: FiPhone, text: OFFICE.phone },
  { icon: FiMail, text: OFFICE.email },
];

const socialLinks = [
  { href: 'https://www.facebook.com/share/1Er4dykkTo/', label: 'Facebook', icon: FaFacebookF },
  { href: 'https://www.tiktok.com/@youth_real_estate_5?_r=1&_t=ZS-99gxZruylGi', label: 'Tiktok', icon: FaTiktok },
];

const Footer = () => {
  return (
    <footer className="bg-navy-dark text-ivory/80 mt-24">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <p className="font-display text-lg text-ivory mb-3">Youth <span className="text-brass">Real Estate</span></p>
          <p className="text-sm leading-relaxed text-ivory/60">
            A dedicated platform for browsing quality property listings and connecting buyers with trusted agents.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="eyebrow mb-4">Navigate</p>
          <ul className="space-y-2 text-sm">
            {navigateLinks.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link to={to} className="inline-flex items-center gap-2 hover:text-brass">
                  <Icon size={14} aria-hidden="true" className="text-ivory/40" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="eyebrow mb-4">Contact</p>
          <ul className="space-y-2 text-sm text-ivory/70">
            {contactRows.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2">
                <Icon size={14} aria-hidden="true" className="mt-0.5 flex-shrink-0 text-ivory/40" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <p className="eyebrow mb-3 mt-6">Follow</p>
          <ul className="space-y-2 text-sm text-ivory/70">
            {socialLinks.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <a href={href} className="inline-flex items-center gap-2 hover:text-brass">
                  <Icon size={14} aria-hidden="true" className="text-ivory/40" />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="eyebrow mb-4">Visit Us</p>
          <MapView lat={OFFICE.lat} lng={OFFICE.lng} title="Youth Real Estate office" heightClass="h-44" />
          <p className="text-xs text-ivory/50 mt-2">{OFFICE.address}</p>
        </div>
      </div>
      <div className="border-t border-ivory/10 py-5 text-center text-xs text-ivory/50">
        © {new Date().getFullYear()} Youth Real Estate. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
