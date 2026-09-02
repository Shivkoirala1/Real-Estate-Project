
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';

import {
  isAdmin,
  isAgent,
} from '../../../utils/permissions';

const menuLinkClass =
  'block px-4 py-2 text-sm transition-colors hover:bg-parchment';

const UserMenu = ({ unreadCount = 0 }) => {
  const { user, logout } = useAuth();
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);

  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  const admin = isAdmin(user);
  const agent = isAgent(user);

  const avatarInitial =
    user?.name?.trim()?.charAt(0)?.toUpperCase() || '?';

  const closeMenu = () => {
    setOpen(false);
  };

  const toggleMenu = () => {
    setOpen((current) => !current);
  };

  /*
   * Close when clicking outside the menu.
   */
  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      );
    };
  }, [open]);

  /*
   * Close menu when Escape is pressed.
   */
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;

      closeMenu();
      triggerRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [open]);

  const handleLogout = async () => {
    closeMenu();

    const confirmed = await confirm({
      title: 'Sign out?',
      message:
        "You'll need to sign in again to access your account.",
      confirmLabel: 'Yes, sign out',
      cancelLabel: 'No, stay signed in',
    });

    if (!confirmed) return;

    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="relative"
    >
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 text-sm text-ivory/90 transition-colors hover:text-brass"
      >
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-brass font-semibold text-navy">
          {user.selfiePhoto ? (
            <img
              src={user.selfiePhoto}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            avatarInitial
          )}
        </span>

        <span className="max-w-32 truncate">
          {user.name?.split(' ')[0] || 'Account'}
        </span>

        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          <path
            d="m6 9 6 6 6-6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 mt-3 w-56 rounded-sm border border-navy/10 bg-white py-2 text-navy shadow-lifted"
        >
          {/* Admin */}
          {admin && (
            <Link
              to="/dashboard/admin"
              onClick={closeMenu}
              className={menuLinkClass}
              role="menuitem"
            >
              Admin Dashboard
            </Link>
          )}

          {/* Agent */}
          {agent && (
            <Link
              to="/dashboard/agent"
              onClick={closeMenu}
              className={menuLinkClass}
              role="menuitem"
            >
              Agent Dashboard
            </Link>
          )}

          {/* Non-admin account links */}
          {!admin && (
            <>
              <Link
                to="/my-properties"
                onClick={closeMenu}
                className={menuLinkClass}
                role="menuitem"
              >
                My Properties
              </Link>

              <Link
                to="/my-visits"
                onClick={closeMenu}
                className={menuLinkClass}
                role="menuitem"
              >
                My Visits
              </Link>
            </>
          )}

          {/* Common links */}
          <Link
            to="/profile"
            onClick={closeMenu}
            className={menuLinkClass}
            role="menuitem"
          >
            My Profile
          </Link>

          <Link
            to="/notifications"
            onClick={closeMenu}
            className="flex items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-parchment"
            role="menuitem"
          >
            <span>Notifications</span>

            {unreadCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brick px-1 text-[10px] font-bold leading-none text-ivory">
                {unreadCount > 99
                  ? '99+'
                  : unreadCount}
              </span>
            )}
          </Link>

          <Link
            to="/favorites"
            onClick={closeMenu}
            className={menuLinkClass}
            role="menuitem"
          >
            Saved Properties
          </Link>

          {/* Divider */}
          <div
            className="my-1 border-t border-navy/10"
            aria-hidden="true"
          />

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-4 py-2 text-left text-sm text-brick transition-colors hover:bg-brick-light"
            role="menuitem"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;