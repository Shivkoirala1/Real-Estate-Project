import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useConversations } from '../../context/ConversationContext';

// ------------------------------------------------------------
// Shared styles
// ------------------------------------------------------------

const linkClass = ({ isActive }) =>
  `group flex items-center justify-between rounded-sm px-4 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-brass text-navy'
      : 'text-ivory/75 hover:bg-navy-light hover:text-ivory'
  }`;

const sectionButtonClass =
  'flex w-full items-center justify-between rounded-sm px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ivory/45 transition-colors hover:text-ivory/80';

// ------------------------------------------------------------
// Admin navigation
// ------------------------------------------------------------

const adminNavGroups = [
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        label: 'Registration Verification',
        to: '/dashboard/admin/verifications',
      },
      {
        label: 'Lead Management',
        to: '/dashboard/admin/lead-management',
      },
      {
        label: 'Visit Management',
        to: '/dashboard/admin/visits',
      },
      {
        label: 'Conversations',
        to: '/dashboard/admin/conversations',
      },
      {
        label: 'Property Management',
        to: '/dashboard/admin/properties',
        end: true,
      },
    ],
  },

  {
    id: 'sales-finance',
    label: 'Sales & Finance',
    items: [
      {
        label: 'Sales Verification',
        to: '/dashboard/admin/sales',
      },
      {
        label: 'Commission Management',
        to: '/dashboard/admin/commissions',
      },
      {
        label: 'EMI Management',
        to: '/dashboard/admin/emi-plans',
      },
    ],
  },

  {
    id: 'people',
    label: 'People',
    items: [
      {
        label: 'Agent Management',
        to: '/dashboard/admin/agents',
      },
      {
        label: 'User Management',
        to: '/dashboard/admin/users',
      },
    ],
  },

  {
    id: 'insights',
    label: 'Insights',
    items: [
      {
        label: 'Analytics',
        to: '/dashboard/admin/analytics',
      },
    ],
  },

  {
    id: 'content',
    label: 'Content & Configuration',
    items: [
      {
        label: 'Blog Management',
        to: '/dashboard/admin/blogs',
        end: true,
      },
      {
        label: 'Property Categories',
        to: '/dashboard/admin/categories',
      },
    ],
  },
];

// ------------------------------------------------------------
// Agent navigation
// ------------------------------------------------------------

const agentNavGroups = [
  {
    id: 'sales',
    label: 'Sales & Leads',
    items: [
      {
        label: 'My Leads',
        to: '/dashboard/agent/leads',
      },
      {
        label: 'My Conversations',
        to: '/my-conversations',
        conversationLink: true,
      },
      {
        label: 'Visit Management',
        to: '/dashboard/agent/visits',
      },
      {
        label: 'My Sales',
        to: '/dashboard/agent/sales',
      },
    ],
  },

  {
    id: 'properties',
    label: 'Properties',
    items: [
      {
        label: 'Property Listings',
        to: '/dashboard/agent/properties',
        end: true,
      },
      {
        label: 'Add Property',
        to: '/dashboard/agent/properties/new',
      },
    ],
  },

  {
    id: 'finance',
    label: 'Finance',
    items: [
      {
        label: 'My Commissions',
        to: '/dashboard/agent/commissions',
      },
      {
        label: 'EMI Plans',
        to: '/dashboard/agent/emi-plans',
      },
    ],
  },

  {
    id: 'insights',
    label: 'Insights',
    items: [
      {
        label: 'Analytics',
        to: '/dashboard/agent/analytics',
      },
    ],
  },
];

// ------------------------------------------------------------
// Chevron
// ------------------------------------------------------------

const Chevron = ({ open }) => (
  <svg
    className={`h-4 w-4 transition-transform duration-200 ${
      open ? 'rotate-180' : ''
    }`}
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M5 7.5L10 12.5L15 7.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ------------------------------------------------------------
// Sidebar
// ------------------------------------------------------------

const Sidebar = () => {
  const location = useLocation();

  const user =
    JSON.parse(localStorage.getItem('user')) ||
    JSON.parse(sessionStorage.getItem('user'));

  const role = user?.role;

  const { unreadCount } = useConversations();

  const isAgent = role === 'agent';

  const navGroups = isAgent ? agentNavGroups : adminNavGroups;

  const panelTitle = isAgent
    ? 'Agent Panel'
    : 'Administrator Panel';

  // Find groups containing the current route
  const getActiveGroups = () => {
    return navGroups
      .filter((group) =>
        group.items.some((item) => {
          if (item.end) {
            return location.pathname === item.to;
          }

          return (
            location.pathname === item.to ||
            location.pathname.startsWith(`${item.to}/`)
          );
        })
      )
      .map((group) => group.id);
  };

  const [openGroups, setOpenGroups] = useState(getActiveGroups);

  // Automatically open the group containing the active page
  useEffect(() => {
    const activeGroups = getActiveGroups();

    if (activeGroups.length > 0) {
      setOpenGroups((current) => [
        ...new Set([...current, ...activeGroups]),
      ]);
    }
  }, [location.pathname]);

  const toggleGroup = (groupId) => {
    setOpenGroups((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
    );
  };

  return (
    <aside className="h-fit w-full flex-shrink-0 rounded-sm bg-navy p-3 md:w-64">

      {/* Header */}
      <div className="mb-4 border-b border-ivory/10 px-3 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ivory/40">
          Dashboard
        </p>

        <p className="mt-1 text-sm font-semibold text-ivory">
          {panelTitle}
        </p>
      </div>

      <nav
        aria-label={`${panelTitle} navigation`}
        className="space-y-1"
      >
        {/* Overview */}
        <NavLink
          to={isAgent ? '/dashboard/agent' : '/dashboard/admin'}
          end
          className={linkClass}
        >
          <span>Overview</span>
        </NavLink>

        {/* Navigation groups */}
        <div className="mt-3 space-y-1">
          {navGroups.map((group) => {
            const isOpen = openGroups.includes(group.id);

            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={sectionButtonClass}
                  aria-expanded={isOpen}
                >
                  <span>{group.label}</span>

                  <Chevron open={isOpen} />
                </button>

                {isOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={linkClass}
                      >
                        <span>{item.label}</span>

                        {item.conversationLink &&
                          unreadCount > 0 && (
                            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-navy/20 bg-brass px-1 text-[10px] font-bold leading-none text-navy">
                              {unreadCount > 99
                                ? '99+'
                                : unreadCount}
                            </span>
                          )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
