import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Briefcase,
  Crown,
  DollarSign,
  Eye,
  FileText,
  GitBranch,
  Home,
  Mail,
  Menu,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Dashboard',
    items: [{ to: '/admin', label: 'Overview', icon: TrendingUp, end: true }],
  },
  {
    title: 'Manage',
    items: [
      { to: '/admin/users', label: 'Users', icon: Users },
      { to: '/admin/listings', label: 'Listings', icon: Home },
      { to: '/admin/pending', label: 'Pending', icon: Eye },
      { to: '/admin/pipeline', label: 'Pipeline', icon: GitBranch },
      { to: '/admin/ai-intake', label: 'AI Intake', icon: Sparkles },
    ],
  },
  {
    title: 'Revenue',
    items: [
      { to: '/admin/subscriptions', label: 'Subscriptions', icon: Crown },
      { to: '/admin/sales', label: 'Sales', icon: DollarSign },
      { to: '/admin/concierge', label: 'Concierge', icon: Briefcase },
    ],
  },
  {
    title: 'Content',
    items: [
      { to: '/admin/content-management', label: 'Content Management', icon: FileText },
      { to: '/admin/digest', label: 'Digest', icon: Mail },
      { to: '/admin/digest-settings', label: 'Digest Settings', icon: Settings },
    ],
  },
  {
    title: 'Insights',
    items: [{ to: '/admin/analytics', label: 'Analytics', icon: BarChart3 }],
  },
];

function NavList({ pendingCount, onNavigate }: { pendingCount: number; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[#4E4B43] text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                  {to === '/admin/pending' && pendingCount > 0 && (
                    <span className="ml-auto px-1.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                      {pendingCount}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminSidebar({ pendingCount }: { pendingCount: number }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const currentLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    )?.label ?? 'Overview';

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-24 bg-white border border-gray-200 rounded-xl shadow-sm p-3 max-h-[calc(100vh-7rem)] overflow-y-auto">
          <NavList pendingCount={pendingCount} />
        </div>
      </aside>

      {/* Mobile trigger */}
      <div className="lg:hidden mb-4">
        <button
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Menu className="w-4 h-4" />
          {currentLabel}
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-[#4E4B43]">Admin Menu</p>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavList pendingCount={pendingCount} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
