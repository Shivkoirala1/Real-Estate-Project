import { isAdmin, isAgent } from "./permissions";

// Single source of truth for the account-menu links so the desktop dropdown
// and mobile drawer can't drift out of sync on which links exist per role.
export const getAccountNavItems = (user, counts = {}) => {
  const admin = isAdmin(user);
  const agent = isAgent(user);
  const isPlainUser = !admin && !agent;

  const items = [];

  if (admin) items.push({ id: "admin", to: "/dashboard/admin", label: "Admin Dashboard" });
  if (agent) items.push({ id: "agent", to: "/dashboard/agent", label: "Agent Dashboard" });

  items.push({ id: "profile", to: "/profile", label: "My Profile" });

  if (isPlainUser) {
    items.push({ id: "visits", to: "/my-visits", label: "My Visits" });
    items.push({
      id: "conversations",
      to: "/my-conversations",
      label: "My Conversations",
      badgeCount: counts.conversations,
      badgeVariant: "brass",
    });
  }

  items.push({
    id: "notifications",
    to: "/notifications",
    label: "Notifications",
    badgeCount: counts.notifications,
    badgeVariant: "brick",
  });

  if (isPlainUser) {
    items.push({ id: "properties", to: "/my-properties", label: "My Properties" });
    items.push({ id: "wallet", to: "/wallet", label: "My Wallet" });
    items.push({ id: "emi", to: "/my-emi", label: "My EMI" });
  }

  items.push({ id: "favorites", to: "/favorites", label: "Saved Properties" });

  return items;
};