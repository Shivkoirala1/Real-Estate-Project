// src/components/Navbar.jsx

import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { FiHome, FiGrid, FiRepeat, FiFileText, FiInfo, FiLogIn, FiZap } from 'react-icons/fi';

import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

import NotificationBell from '../NotificationBell';
import UserMenu from './navbar/UserMenu';
import MobileMenu from './navbar/MobileMenu';

import {
  canPostProperty,
  getPropertyPostPath,
} from '../../utils/permissions';

const publicNavItems = [
  {
    label: 'Home',
    to: '/',
    end: true,
    icon: FiHome,
  },
  {
    label: 'Properties',
    to: '/properties',
    icon: FiGrid,
  },
  {
    label: 'Land Converter',
    to: '/land-converter',
    icon: FiRepeat,
  },
  {
    label: 'Blog',
    to: '/blogs',
    icon: FiFileText,
  },
  {
    label: 'Innovations',
    to: '/innovations',
    icon: FiZap,
  },
  {
    label: 'About',
    to: '/about',
    icon: FiInfo,
  },
];

export const navLinkClass = ({ isActive }) =>
  `text-sm font-medium tracking-wide transition-colors ${
    isActive
      ? 'text-brass'
      : 'text-ivory/85 hover:text-brass'
  }`;

const simpleLinkClass =
  'text-sm font-medium text-ivory/85 transition-colors hover:text-brass';

const Navbar = () => {
  const { user } = useAuth();
  const { unreadCount = 0 } = useNotifications();

  const [mobileOpen, setMobileOpen] = useState(false);

  const verified = canPostProperty(user);
  const propertyPostPath = getPropertyPostPath(user);

  const closeMobileMenu = () => {
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-navy shadow-lifted">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">

        {/* Brand */}
        <Link
          to="/"
          className="font-display text-xl tracking-tight text-ivory"
          onClick={closeMobileMenu}
        >
   <div className="flex items-center gap-1">
          <img
            src="/logo.webp"
            alt="Youth Real Estate Logo"
            className="min-h-8 max-h-10 w-auto inline-block mr-2 rounded-full"
          />
          <div>
          <span>Youth</span>
          <span className="text-brass block">
           Real Estate Pvt. Ltd.
          </span>
          </div>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-8 md:flex"
        >
          {publicNavItems.map(({ label, to, end, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={navLinkClass}
            >
              <span className="inline-flex items-center gap-1.5">
                {Icon && <Icon size={15} aria-hidden="true" />}
                {label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-3 md:flex">
          {!user ? (
            <>
              <Link
                to="/login"
                className={simpleLinkClass}
              >
                <span className="inline-flex items-center gap-1.5">
                  <FiLogIn size={15} aria-hidden="true" />
                  Sign in
                </span>
              </Link>

              <Link
                to="/register"
                className="btn-gold px-4 py-2 text-sm"
              >
                Register
              </Link>
            </>
          ) : (
            <>
              {/* Property CTA */}
              {verified ? (
                <Link
                  to={propertyPostPath}
                  className="btn-gold px-4 py-2 text-sm"
                >
                  + Post a Property
                </Link>
              ) : (
                <Link
                  to="/profile"
                  className="rounded-sm border border-brass/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-brass transition-colors hover:bg-brass/10"
                >
                  Verification Pending
                </Link>
              )}

              {/* Notifications */}
              <NotificationBell />

              {/* User Menu */}
              <UserMenu unreadCount={unreadCount} />
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          aria-label={
            mobileOpen
              ? 'Close navigation menu'
              : 'Open navigation menu'
          }
          className="text-ivory md:hidden"
        >
          {mobileOpen ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d="M4 6h16M4 12h16M4 18h16"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Navigation */}
      {mobileOpen && (
        <MobileMenu
          id="mobile-navigation"
          user={user}
          unreadCount={unreadCount}
          publicNavItems={publicNavItems}
          verified={verified}
          propertyPostPath={propertyPostPath}
          onClose={closeMobileMenu}
        />
      )}
    </header>
  );
};

export default Navbar;