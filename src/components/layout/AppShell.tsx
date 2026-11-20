import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bot,
  Calendar,
  ClipboardList,
  Compass,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Trophy,
  X,
} from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, mobilePrimary: true },
  { to: '/runs', label: 'Running Log', icon: ClipboardList, mobilePrimary: true },
  { to: '/plan', label: 'Training Plan', icon: Compass, mobilePrimary: true },
  { to: '/calendar', label: 'Calendar', icon: Calendar, mobilePrimary: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, mobilePrimary: false },
  { to: '/coach', label: 'AI Coach', icon: Bot, mobilePrimary: false },
  { to: '/personal-bests', label: 'Personal Bests', icon: Trophy, mobilePrimary: false },
  { to: '/weekly-review', label: 'Weekly Review', icon: FileText, mobilePrimary: false },
  { to: '/settings', label: 'Settings', icon: Settings, mobilePrimary: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-run text-white">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900">
              Running Rebuild
            </div>
            <div className="text-[11px] text-slate-500">
              {profile?.timezone ?? 'Asia/Colombo'}
            </div>
          </div>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-brand-run'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 truncate px-3 text-xs text-slate-500">
            {profile?.display_name ?? user?.email}
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-run text-white">
            <Activity className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-slate-900">Running Rebuild</span>
        </div>
        <button
          type="button"
          aria-label="Toggle navigation menu"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Mobile Full Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-14 z-40 overflow-y-auto bg-white p-4 lg:hidden">
          <nav className="space-y-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[48px] items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                    isActive ? 'bg-blue-50 text-brand-run' : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mt-6 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="pb-20 lg:pb-10 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white lg:hidden"
      >
        {NAV_ITEMS.filter((item) => item.mobilePrimary).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                isActive ? 'text-brand-run' : 'text-slate-500'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}