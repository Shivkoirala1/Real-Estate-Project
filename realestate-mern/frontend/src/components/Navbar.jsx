import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useNotifications } from '../context/NotificationContext';
import NotificationBell from './NotificationBell';

const navLinkClass = ({ isActive }) =>
  `text-sm font-medium tracking-wide transition-colors ${
    isActive ? 'text-brass' : 'text-ivory/85 hover:text-brass'
  }`;

const Navbar = () => {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const { unreadCount } = useNotifications() || {};
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    setOpen(false);
    const confirmed = await confirm({
      title: 'Sign out?',
      message: "You'll need to sign in again to access your account.",
      confirmLabel: 'Yes, sign out',
      cancelLabel: 'No, stay signed in',
    });
    if (!confirmed) return;
    logout();
    navigate('/');
  };

  const isAdmin = user?.role === 'admin';
  const isVerified = isAdmin || user?.verificationStatus === 'verified';
  const postLink = isAdmin ? '/dashboard/admin/properties/new' : '/my-properties/new';

  return (
    <header className="bg-navy sticky top-0 z-40 shadow-lifted">
      <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="font-display text-xl text-ivory tracking-tight">
          Ashland <span className="text-brass">Estates</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/" end className={navLinkClass}>Home</NavLink>
          <NavLink to="/properties" className={navLinkClass}>Properties</NavLink>
          <NavLink to="/land-converter" className={navLinkClass}>Land Converter</NavLink>
          <NavLink to="/about" className={navLinkClass}>About</NavLink>
          <NavLink to="/contact" className={navLinkClass}>Contact</NavLink>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {!user && (
            <>
              <Link to="/login" className="text-sm font-medium text-ivory/85 hover:text-brass transition-colors">
                Sign in
              </Link>
              <Link to="/register" className="btn-gold text-sm py-2 px-4">Register</Link>
            </>
          )}
          {user && (
            <>
              {isVerified ? (
                <Link to={postLink} className="btn-gold text-sm py-2 px-4">+ Post a Property</Link>
              ) : (
                <Link to="/profile" className="text-xs font-semibold uppercase tracking-wide text-brass border border-brass/40 rounded-sm px-3 py-2 hover:bg-brass/10 transition-colors">
                  Verification Pending
                </Link>
              )}
              <NotificationBell />
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-2 text-sm text-ivory/90 hover:text-brass transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-brass text-navy flex items-center justify-center font-semibold overflow-hidden">
                    {user.selfiePhoto ? (
                      <img src={user.selfiePhoto} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      user.name?.charAt(0).toUpperCase()
                    )}
                  </span>
                  {user.name?.split(' ')[0]}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-3 w-52 bg-white rounded-sm shadow-lifted border border-navy/10 py-2 text-navy">
                    {isAdmin && (
                      <Link to="/dashboard/admin" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm hover:bg-parchment">
                        Admin Dashboard
                      </Link>
                    )}
                    {!isAdmin && (
                      <Link to="/my-properties" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm hover:bg-parchment">
                        My Properties
                      </Link>
                    )}
                    <Link to="/profile" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm hover:bg-parchment">
                      My Profile
                    </Link>
                    <Link to="/notifications" onClick={() => setMenuOpen(false)} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-parchment">
                      <span>Notifications</span>
                      {unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brick text-ivory text-[10px] font-bold flex items-center justify-center leading-none">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </Link>
                    <Link to="/favorites" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm hover:bg-parchment">
                      Saved Properties
                    </Link>
                    <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-brick hover:bg-brick-light">
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <button className="md:hidden text-ivory" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="md:hidden bg-navy-dark px-5 pb-5 flex flex-col gap-4">
          <NavLink to="/" end className={navLinkClass} onClick={() => setOpen(false)}>Home</NavLink>
          <NavLink to="/properties" className={navLinkClass} onClick={() => setOpen(false)}>Properties</NavLink>
          <NavLink to="/land-converter" className={navLinkClass} onClick={() => setOpen(false)}>Land Converter</NavLink>
          <NavLink to="/about" className={navLinkClass} onClick={() => setOpen(false)}>About</NavLink>
          <NavLink to="/contact" className={navLinkClass} onClick={() => setOpen(false)}>Contact</NavLink>
          <hr className="border-ivory/10" />
          {!user ? (
            <>
              <Link to="/login" className={navLinkClass({ isActive: false })} onClick={() => setOpen(false)}>Sign in</Link>
              <Link to="/register" className={navLinkClass({ isActive: false })} onClick={() => setOpen(false)}>Register</Link>
            </>
          ) : (
            <>
              {isVerified ? (
                <Link to={postLink} className={navLinkClass({ isActive: false })} onClick={() => setOpen(false)}>+ Post a Property</Link>
              ) : (
                <Link to="/profile" className={navLinkClass({ isActive: false })} onClick={() => setOpen(false)}>Verification Pending</Link>
              )}
              {isAdmin ? (
                <Link to="/dashboard/admin" className={navLinkClass({ isActive: false })} onClick={() => setOpen(false)}>Admin Dashboard</Link>
              ) : (
                <Link to="/my-properties" className={navLinkClass({ isActive: false })} onClick={() => setOpen(false)}>My Properties</Link>
              )}
              <Link to="/profile" className={navLinkClass({ isActive: false })} onClick={() => setOpen(false)}>My Profile</Link>
              <Link to="/notifications" className={navLinkClass({ isActive: false })} onClick={() => setOpen(false)}>
                Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
              </Link>
              <Link to="/favorites" className={navLinkClass({ isActive: false })} onClick={() => setOpen(false)}>Saved Properties</Link>
              <button onClick={handleLogout} className="text-left text-sm text-brass">Sign out</button>
            </>
          )}
        </div>
      )}
    </header>
  );
};

export default Navbar;
