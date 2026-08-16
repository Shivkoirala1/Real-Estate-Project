import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-navy-dark text-ivory/80 mt-24">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div>
          <p className="font-display text-lg text-ivory mb-3">Ashland <span className="text-brass">Estates</span></p>
          <p className="text-sm leading-relaxed text-ivory/60">
            A dedicated platform for browsing quality property listings and connecting buyers with trusted agents.
          </p>
        </div>
        <div>
          <p className="eyebrow mb-4">Navigate</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/" className="hover:text-brass">Home</Link></li>
            <li><Link to="/properties" className="hover:text-brass">Properties</Link></li>
            <li><Link to="/land-converter" className="hover:text-brass">Land Converter</Link></li>
            <li><Link to="/about" className="hover:text-brass">About Us</Link></li>
            <li><Link to="/contact" className="hover:text-brass">Contact</Link></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">Contact</p>
          <ul className="space-y-2 text-sm text-ivory/70">
            <li>123 Market Street, Biratnagar, Nepal</li>
            <li>+977 1-4567890</li>
            <li>info@ashlandestates.com</li>
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-4">Follow</p>
          <ul className="space-y-2 text-sm text-ivory/70">
            <li><a href="#" className="hover:text-brass">Facebook</a></li>
            <li><a href="#" className="hover:text-brass">Instagram</a></li>
            <li><a href="#" className="hover:text-brass">LinkedIn</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ivory/10 py-5 text-center text-xs text-ivory/50">
        © {new Date().getFullYear()} Ashland Estates. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
