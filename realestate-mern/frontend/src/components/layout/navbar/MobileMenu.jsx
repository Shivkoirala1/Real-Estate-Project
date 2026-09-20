import { Link, NavLink } from "react-router-dom";

import { useConversations } from "../../../context/ConversationContext";
import { useLogoutHandler } from "../../../hooks/useLogoutHandler";
import { getAccountNavItems } from "../../../utils/accountNav";
import CountBadge from "../../CountBadge";

const mobileNavLinkClass = ({ isActive }) =>
  `text-sm font-medium tracking-wide transition-colors ${
    isActive ? "text-brass" : "text-ivory/85 hover:text-brass"
  }`;

const mobileActionClass =
  "text-sm font-medium text-ivory/85 transition-colors hover:text-brass";

const MobileMenu = ({
  id,
  user,
  unreadCount = 0,
  publicNavItems,
  verified,
  propertyPostPath,
  onClose,
}) => {
  const { unreadCount: conversationUnreadCount } = useConversations();
  const handleLogout = useLogoutHandler(onClose);

  const navItems = user
    ? getAccountNavItems(user, {
        conversations: conversationUnreadCount,
        notifications: unreadCount,
      })
    : [];

  return (
    <nav id={id} aria-label="Mobile navigation" className="flex flex-col gap-4 bg-navy-dark px-5 pb-5 md:hidden">
      {publicNavItems.map(({ label, to, end }) => (
        <NavLink key={to} to={to} end={end} className={mobileNavLinkClass} onClick={onClose}>
          {label}
        </NavLink>
      ))}

      <hr className="border-ivory/10" />

      {!user ? (
        <>
          <Link to="/login" className={mobileActionClass} onClick={onClose}>Sign in</Link>
          <Link to="/register" className={mobileActionClass} onClick={onClose}>Register</Link>
        </>
      ) : (
        <>
          <Link to="/profile" className="flex items-center gap-3" onClick={onClose}>
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brass font-semibold text-navy">
              {(user.avatar || user.selfiePhoto) ? (
                <img src={user.avatar || user.selfiePhoto} alt="" className="h-full w-full object-cover" />
              ) : (
                user.name?.trim()?.charAt(0)?.toUpperCase() || "?"
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ivory/85">{user.name}</span>
              <span className="block truncate text-xs text-ivory/50">{user.email}</span>
            </span>
          </Link>
          {verified ? (
            <Link to={propertyPostPath} className={mobileActionClass} onClick={onClose}>
              + Post a Property
            </Link>
          ) : (
            <Link to="/profile" className={mobileActionClass} onClick={onClose}>
              Verification Pending
            </Link>
          )}

          {navItems.map(({ id: itemId, to, label, badgeCount, badgeVariant }) => (
            <Link key={itemId} to={to} className={mobileActionClass} onClick={onClose}>
              <span className="flex items-center gap-2">
                {label}
                <CountBadge count={badgeCount} variant={badgeVariant} />
              </span>
            </Link>
          ))}

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