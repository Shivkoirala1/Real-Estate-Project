import { Link } from "react-router-dom";

import { useAuth } from "../../../context/AuthContext";
import { useConversations } from "../../../context/ConversationContext";
import { useDismissableMenu } from "../../../hooks/useDismissableMenu";
import { useLogoutHandler } from "../../../hooks/useLogoutHandler";
import { getAccountNavItems } from "../../../utils/accountNav";
import CountBadge from "../../CountBadge";

const menuLinkClass =
  "flex items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-parchment";

const UserMenu = ({ unreadCount = 0 }) => {
  const { user } = useAuth();
  const { unreadCount: conversationUnreadCount } = useConversations();
  const { open, menuRef, triggerRef, close, toggle } = useDismissableMenu();
  const handleLogout = useLogoutHandler(close);

  if (!user) return null;

  const avatarInitial = user.name?.trim()?.charAt(0)?.toUpperCase() || "?";
  // Profile photo first, identity selfie as fallback, initial as last resort.
  const avatarSrc = user.avatar || user.selfiePhoto;
  const navItems = getAccountNavItems(user, {
    conversations: conversationUnreadCount,
    notifications: unreadCount,
  });

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="flex items-center gap-2 text-sm text-ivory/90 transition-colors hover:text-brass"
      >
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-brass font-semibold text-navy">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            avatarInitial
          )}
        </span>
        <span className="max-w-32 truncate">{user.name?.split(" ")[0] || "Account"}</span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 mt-3 w-64 rounded-sm border border-navy/10 bg-white py-2 text-navy shadow-lifted"
        >
          <Link to="/profile" onClick={close} role="menuitem" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-parchment">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brass font-semibold text-navy">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                avatarInitial
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{user.name}</span>
              <span className="block truncate text-xs text-slate-muted">{user.email}</span>
            </span>
          </Link>

          <div className="my-1 border-t border-navy/10" aria-hidden="true" />

          {navItems.map(({ id, to, label, badgeCount, badgeVariant }) => (
            <Link key={id} to={to} onClick={close} className={menuLinkClass} role="menuitem">
              <span>{label}</span>
              <CountBadge count={badgeCount} variant={badgeVariant} />
            </Link>
          ))}

          <div className="my-1 border-t border-navy/10" aria-hidden="true" />

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