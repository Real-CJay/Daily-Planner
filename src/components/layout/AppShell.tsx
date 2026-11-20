import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  Award,
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Route,
  Settings,
  X,
} from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';
import { TRAINING_PHASE_LABELS } from '@/types/domain';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/runs', label: 'Running Log', icon: Route },
  { to: '/plan', label: 'Training Plan', icon: ClipboardCheck },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/coach', label: 'Coach', icon: Bot },
  { to: '/personal-bests', label: 'Personal Bests', icon: Award },
  { to: '/weekly-review', label: 'Weekly Review', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const PRIMARY_NAV = NAV_ITEMS.slice(0, 6);
const SECONDARY_NAV = NAV_ITEMS.slice(6);

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentNavLabel =
    NAV_ITEMS.find((item) =>
      item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
    )?.label ?? 'Workspace';

  function renderNavList(onSelect?: () => void) {
    return (
      <div className="flex h-full flex-col justify-between px-3 py-4">
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Activity className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-slate-900">
                  Running Rebuild
                </div>
                <div className="font-mono text-[11px] text-slate-500">
                  {profile?.timezone ?? 'Asia/Colombo'}
                </div>
              </div>
            </div>
            {onSelect && (
              <button
                type="button"
                onClick={onSelect}
                aria-label="Close navigation"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Active Phase
            </div>
            <div className="mt-0.5 text-xs font-semibold text-slate-900">
              {profile ? TRAINING_PHASE_LABELS[profile.current_phase] : 'Phase 1 — Rebuilding'}
            </div>
          </div>

          <nav aria-label="Primary" className="space-y-1">
            <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Training
            </div>
            {PRIMARY_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onSelect}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-2.5">
                        <Icon
                          className={`h-4 w-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`}
                        />
                        <span>{item.label}</span>
                      </span>
                      {item.badge && (
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            isActive
                              ? 'bg-slate-800 text-slate-300'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <nav aria-label="System" className="space-y-1">
            <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Insights &amp; Account
            </div>
            {SECONDARY_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onSelect}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-2.5">
                        <Icon
                          className={`h-4 w-4 ${isActive ? 'text-blue-400' : 'text-slate-500'}`}
                        />
                        <span>{item.label}</span>
                      </span>
                      {item.badge && (
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            isActive
                              ? 'bg-slate-800 text-slate-300'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <div className="truncate px-2.5 text-xs font-medium text-slate-700">
            {profile?.display_name || user?.email || 'Athlete'}
          </div>
          {user?.email && profile?.display_name && (
            <div className="truncate px-2.5 text-[11px] text-slate-400">{user.email}</div>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-0 h-screen overflow-y-auto">{renderNavList()}</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[82vw] bg-white shadow-xl">
            {renderNavList(() => setMobileOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {currentNavLabel}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
            <span className="hidden rounded border border-slate-200 bg-slate-50 px-2 py-0.5 sm:inline-block">
              Mon–Sun · {profile?.timezone ?? 'Asia/Colombo'}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}