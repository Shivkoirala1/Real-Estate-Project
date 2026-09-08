
import { Link, NavLink } from 'react-router-dom';

import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useConversations } from '../../../context/ConversationContext';

import {
  isAdmin,
  isAgent,
} from '../../../utils/permissions';

const mobileNavLinkClass = ({ isActive }) =>
  `text-sm font-medium tracking-wide transition-colors ${
    isActive
      ? 'text-brass'
      : 'text-ivory/85 hover:text-brass'
  }`;

const mobileActionClass =
  'text-sm font-medium text-ivory/85 transition-colors hover:text-brass';

const MobileMenu = ({
  id,
  user,
  unreadCount = 0,
  publicNavItems,
  verified,
  propertyPostPath,
  onClose,
}) => {
  const { logout } = useAuth();
  const confirm = useConfirm();
  const { unreadCount: conversationUnreadCount } = useConversations();

  const admin = isAdmin(user);
  const agent = isAgent(user);

  const handleLogout = async () => {
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
      onClose();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <nav
      id={id}
      aria-label="Mobile navigation"
      className="flex flex-col gap-4 bg-navy-dark px-5 pb-5 md:hidden"
    >
      {/* Public navigation */}
      {publicNavItems.map(({ label, to, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={mobileNavLinkClass}
          onClick={onClose}
        >
          {label}
        </NavLink>
      ))}

      <hr className="border-ivory/10" />

      {/* Guest */}
      {!user ? (
        <>
          <Link
            to="/login"
            className={mobileActionClass}
            onClick={onClose}
          >
            Sign in
          </Link>

          <Link
            to="/register"
            className={mobileActionClass}
            onClick={onClose}
          >
            Register
          </Link>
        </>
      ) : (
        <>
          {/* Property posting */}
          {verified ? (
            <Link
              to={propertyPostPath}
              className={mobileActionClass}
              onClick={onClose}
            >
              + Post a Property
            </Link>
          ) : (
            <Link
              to="/profile"
              className={mobileActionClass}
              onClick={onClose}
            >
              Verification Pending
            </Link>
          )}

          {/* Role-specific links */}
          {admin && (
            <Link
              to="/dashboard/admin"
              className={mobileActionClass}
              onClick={onClose}
            >
              Admin Dashboard
            </Link>
          )}

          {agent && (
            <Link
              to="/dashboard/agent"
              className={mobileActionClass}
              onClick={onClose}
            >
              Agent Dashboard
            </Link>
          )}

          {/* Regular user links */}
          {!admin && (
            <>
              <Link
                to="/my-properties"
                className={mobileActionClass}
                onClick={onClose}
              >
                My Properties
              </Link>

              <Link
                to="/my-visits"
                className={mobileActionClass}
                onClick={onClose}
              >
                My Visits
              </Link>
            </>
          )}

          {/* Messaging - every signed-in role can be a conversation participant */}
          <Link
            to="/my-conversations"
            className={mobileActionClass}
            onClick={onClose}
          >
            <span className="flex items-center gap-2">
              My Conversations
              {conversationUnreadCount > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brass px-1 text-[10px] font-bold leading-none text-navy">
                  {conversationUnreadCount > 99 ? '99+' : conversationUnreadCount}
                </span>
              )}
            </span>
          </Link>

          {/* Common links */}
          <Link
            to="/profile"
            className={mobileActionClass}
            onClick={onClose}
          >
            My Profile
          </Link>

          <Link
            to="/notifications"
            className={mobileActionClass}
            onClick={onClose}
          >
            Notifications
            {unreadCount > 0 &&
              ` (${unreadCount > 99 ? '99+' : unreadCount})`}
          </Link>

          <Link
            to="/favorites"
            className={mobileActionClass}
            onClick={onClose}
          >
            Saved Properties
          </Link>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="text-left text-sm font-medium text-brass transition-colors hover:text-brass/80"
          >
            Sign out
          </button>
        </>
      )}
    </nav>
  );
};

export default MobileMenu;