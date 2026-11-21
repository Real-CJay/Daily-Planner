import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  Monitor,
  Moon,
  Route,
  Settings,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme, type ThemePreference } from '@/modules/theme/ThemeContext';
import { TRAINING_PHASE_LABELS } from '@/types/domain';

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  section: 'training' | 'insights';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', shortLabel: 'Today', icon: LayoutDashboard, section: 'training' },
  { to: '/runs', label: 'Running Log', shortLabel: 'Runs', icon: Route, section: 'training' },
  { to: '/plan', label: 'Training Plan', shortLabel: 'Plan', icon: ClipboardCheck, section: 'training' },
  { to: '/calendar', label: 'Calendar', shortLabel: 'Schedule', icon: CalendarDays, section: 'training' },
  { to: '/analytics', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3, section: 'training' },
  { to: '/coach', label: 'Coach', shortLabel: 'Coach', icon: Bot, section: 'training' },
  { to: '/personal-bests', label: 'Personal Bests', shortLabel: 'PBs', icon: Award, section: 'insights' },
  { to: '/weekly-review', label: 'Weekly Review', shortLabel: 'Review', icon: Activity, section: 'insights' },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings, section: 'insights' },
];

const MOBILE_PRIMARY_PATHS = ['/', '/calendar', '/runs', '/plan', '/coach'];

function ThemeToggleControl() {
  const { theme, setTheme } = useTheme();

  const options: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
    { value: 'light', label: 'Light mode (Flomo)', icon: Sun },
    { value: 'dark', label: 'Dark mode (Morgen)', icon: Moon },
    { value: 'system', label: 'System theme', icon: Monitor },
  ];

  return (
    <div
      role="group"
      aria-label="Theme selector"
      className="inline-flex items-center rounded-lg border border-[#E5EAE7] bg-[#F7F9F8] p-0.5 dark:border-morgen-border dark:bg-morgen-surface"
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={() => setTheme(value)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              active
                ? 'bg-white text-[#176D3E] shadow-sm dark:bg-morgen-elevated dark:text-morgen-red'
                : 'text-[#747C84] hover:text-[#161C19] dark:text-morgen-muted dark:hover:text-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const activePhase = profile?.current_phase ?? 'REBUILDING';

  const currentNav =
    NAV_ITEMS.find((item) =>
      item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
    ) ?? NAV_ITEMS[0];

  const trainingNav = NAV_ITEMS.filter((i) => i.section === 'training');
  const insightsNav = NAV_ITEMS.filter((i) => i.section === 'insights');
  const mobileBarItems = NAV_ITEMS.filter((i) => MOBILE_PRIMARY_PATHS.includes(i.to));

  function isActive(to: string) {
    return to === '/' ? pathname === '/' : pathname.startsWith(to);
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white dark:bg-morgen-black">
      {/* Brand */}
      <div className="flex items-center justify-between border-b border-[#E5EAE7] px-4 py-4 dark:border-morgen-border">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setMobileMenuOpen(false)}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#176D3E] text-[#2CCC74] dark:bg-morgen-wine dark:text-morgen-red">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display text-sm font-bold tracking-tight text-[#161C19] dark:font-sans dark:text-white">
              Running Rebuild
            </div>
            <div className="font-mono text-[11px] text-flomo-slate dark:text-morgen-muted">{tz}</div>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation"
          className="rounded-lg p-1.5 text-[#747C84] hover:bg-[#F7F9F8] dark:text-morgen-muted dark:hover:bg-morgen-elevated lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Active Phase Card */}
      <div className="px-4 pt-4">
        <div className="rounded-lg border border-[#E5EAE7] bg-[#F7F9F8] px-3 py-2.5 dark:border-morgen-border dark:bg-morgen-surface">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-flomo-slate dark:text-morgen-muted">
              Active Phase
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-[#2CCC74] dark:bg-morgen-yellow" />
          </div>
          <div className="mt-0.5 text-xs font-semibold text-[#161C19] dark:text-white">
            {TRAINING_PHASE_LABELS[activePhase]}
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        <div>
          <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-flomo-slate/80 dark:text-morgen-muted">
            Training &amp; Daily
          </div>
          <div className="space-y-0.5">
            {trainingNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#176D3E] text-white dark:bg-morgen-elevated dark:text-white dark:ring-1 dark:ring-morgen-border'
                      : 'text-[#525C57] hover:bg-[#F7F9F8] hover:text-[#161C19] dark:text-morgen-body/80 dark:hover:bg-morgen-surface dark:hover:text-white'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? 'text-[#2CCC74] dark:text-morgen-red' : ''
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-flomo-slate/80 dark:text-morgen-muted">
            Insights &amp; Account
          </div>
          <div className="space-y-0.5">
            {insightsNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#176D3E] text-white dark:bg-morgen-elevated dark:text-white dark:ring-1 dark:ring-morgen-border'
                      : 'text-[#525C57] hover:bg-[#F7F9F8] hover:text-[#161C19] dark:text-morgen-body/80 dark:hover:bg-morgen-surface dark:hover:text-white'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? 'text-[#2CCC74] dark:text-morgen-red' : ''
                    }`}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Account Footer */}
      <div className="border-t border-[#E5EAE7] p-4 dark:border-morgen-border">
        <div className="truncate text-xs font-semibold text-[#161C19] dark:text-white">
          {profile?.display_name || user?.email?.split('@')[0] || 'Athlete'}
        </div>
        <div className="truncate text-[11px] text-flomo-slate dark:text-morgen-muted">
          {user?.email}
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-[#525C57] transition-colors hover:bg-[#F7F9F8] hover:text-[#161C19] dark:text-morgen-body/80 dark:hover:bg-morgen-surface dark:hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-white text-[#161C19] dark:bg-morgen-black dark:text-white">
      {/* Desktop Sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-[#E5EAE7] dark:border-morgen-border lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] border-r border-[#E5EAE7] shadow-xl dark:border-morgen-border">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#E5EAE7] bg-white/95 px-4 backdrop-blur dark:border-morgen-border dark:bg-morgen-black/95 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="rounded-lg border border-[#E5EAE7] p-1.5 text-[#161C19] hover:bg-[#F7F9F8] dark:border-morgen-border dark:text-morgen-body dark:hover:bg-morgen-surface lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-flomo-slate dark:text-morgen-muted">
              {currentNav.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-md border border-[#E5EAE7] bg-[#F7F9F8] px-2.5 py-1 font-mono text-[11px] font-medium text-[#525C57] dark:border-morgen-border dark:bg-morgen-surface dark:text-morgen-body sm:inline-flex">
              Mon–Sun · {tz}
            </span>
            <ThemeToggleControl />
          </div>
        </header>

        <main className={`mx-auto w-full flex-1 ${pathname.startsWith('/calendar') ? 'flex h-[calc(100vh-3.5rem)] max-w-none flex-col overflow-hidden p-0 pb-20 lg:pb-0' : 'max-w-[1280px] px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-10'}`}>
          {children}
        </main>
      </div>

      {/* Mobile Floating Bottom Navigation */}
      <nav
        aria-label="Mobile quick navigation"
        className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border border-[#E5EAE7] bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur dark:border-morgen-border dark:bg-morgen-surface/95 lg:hidden"
      >
        {mobileBarItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-[10px] font-medium transition-colors ${
                active
                  ? 'text-[#176D3E] dark:text-morgen-red'
                  : 'text-flomo-slate hover:text-[#161C19] dark:text-morgen-muted dark:hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
