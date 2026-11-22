import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Flame,
  HeartPulse,
  LayoutDashboard,
  Layers,
  LogOut,
  Moon,
  Music,
  Route,
  Settings,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { StrideBrand } from '@/design-system';
import { FloatingCoachWidget } from '@/components/coach/FloatingCoachWidget';
import { SessionReminderManager } from '@/components/reminders/SessionReminderManager';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { TRAINING_PHASE_LABELS } from '@/types/domain';

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  section: 'primary' | 'mode' | 'secondary';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard, section: 'primary' },
  { to: '/calendar', label: 'Calendar', shortLabel: 'Calendar', icon: CalendarDays, section: 'primary' },
  { to: '/plan', label: 'Plan', shortLabel: 'Plan', icon: ClipboardCheck, section: 'primary' },
  { to: '/modes', label: 'Modes', shortLabel: 'Modes', icon: Layers, section: 'primary' },
  { to: '/runs', label: 'Running', shortLabel: 'Running', icon: Route, section: 'mode' },
  { to: '/karate', label: 'Karate', shortLabel: 'Karate', icon: Flame, section: 'mode' },
  { to: '/music', label: 'Music', shortLabel: 'Music', icon: Music, section: 'mode' },
  { to: '/sleep', label: 'Sleep', shortLabel: 'Sleep', icon: Moon, section: 'mode' },
  { to: '/reading', label: 'Reading', shortLabel: 'Reading', icon: BookOpen, section: 'mode' },
  { to: '/health', label: 'Health', shortLabel: 'Health', icon: HeartPulse, section: 'mode' },
  { to: '/analytics', label: 'Analytics', shortLabel: 'Analytics', icon: BarChart3, section: 'secondary' },
  { to: '/coach', label: 'Coach', shortLabel: 'Coach', icon: Bot, section: 'secondary' },
  { to: '/personal-bests', label: 'Personal Bests', shortLabel: 'PBs', icon: Award, section: 'secondary' },
  { to: '/weekly-review', label: 'Weekly Review', shortLabel: 'Review', icon: Activity, section: 'secondary' },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings, section: 'secondary' },
];

const PRIMARY_ORDER = ['/', '/calendar', '/plan', '/modes'];

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, profile, signOut } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const primaryNav = PRIMARY_ORDER.map((path) => NAV_ITEMS.find((i) => i.to === path)).filter(
    (i): i is NavItem => Boolean(i)
  );
  const modeNav = NAV_ITEMS.filter((i) => i.section === 'mode');
  const secondaryNav = NAV_ITEMS.filter((i) => i.section === 'secondary');

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const activePhase = profile?.current_phase ?? 'REBUILDING';
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Athlete';
  const initial = displayName.charAt(0).toUpperCase() || 'A';

  function isActive(to: string) {
    return to === '/' ? pathname === '/' : pathname.startsWith(to);
  }

  const isModeActive = isActive('/modes') || modeNav.some((item) => isActive(item.to));
  const isSecondaryActive = secondaryNav.some((item) => isActive(item.to));
  const isCalendar = pathname.startsWith('/calendar');
  const isCoach = pathname.startsWith('/coach');

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      {/* Stride Sticky Top Navigation Bar (76px Studio height) */}
      <header className="sticky top-0 z-30 h-[76px] border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="relative mx-auto flex h-full max-w-[1250px] items-center justify-between px-5 sm:px-8">
          <div className="flex h-full items-center gap-10 lg:gap-16">
            <Link
              to="/"
              aria-label="Go to Overview"
              className="focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]/50"
            >
              <StrideBrand />
            </Link>

            {/* Primary 4 Tabs (Overview, Calendar, Plan, Modes) + More */}
            <nav aria-label="Main navigation" className="hidden h-full items-center gap-8 md:flex">
              {primaryNav.map((item) => {
                const active = item.to === '/modes' ? isModeActive : isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`relative flex h-full items-center text-[14px] font-semibold transition-colors ${
                      active
                        ? 'text-[var(--ink)]'
                        : 'text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-[3px] bg-[var(--ink)]" />
                    )}
                  </Link>
                );
              })}

              {/* Secondary Tools Dropdown */}
              <div className="relative flex h-full items-center">
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen((v) => !v);
                    setProfileOpen(false);
                  }}
                  className={`relative flex h-full items-center gap-1 text-[14px] font-semibold transition-colors ${
                    isSecondaryActive
                      ? 'text-[var(--ink)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  <span>More</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-75" />
                  {isSecondaryActive && (
                    <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-[3px] bg-[var(--ink)]" />
                  )}
                </button>

                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                    <div className="absolute left-0 top-[68px] z-40 w-52 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow)]">
                      {secondaryNav.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.to);
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setMoreOpen(false)}
                            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
                              active
                                ? 'bg-[var(--blue-lite)] font-semibold text-[var(--blue-ink)]'
                                : 'text-[var(--ink)] hover:bg-[var(--surface-2)]'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0 opacity-80" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </nav>
          </div>

          {/* Right Utility Actions */}
          <div className="flex items-center gap-3">
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--faint)] lg:inline">
              {TRAINING_PHASE_LABELS[activePhase]}
            </span>

            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${resolvedTheme === 'light' ? 'dark' : 'light'} mode`}
              aria-label="Switch theme"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              {resolvedTheme === 'light' ? (
                <Moon className="h-[18px] w-[18px]" />
              ) : (
                <Sun className="h-[18px] w-[18px]" />
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setMoreOpen(false);
                }}
                title={displayName}
                aria-label="Open profile menu"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--blue-lite)] text-[13px] font-extrabold text-[var(--blue-ink)] transition-opacity hover:opacity-90"
              >
                {initial}
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 top-[54px] z-40 w-60 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
                    <div className="truncate text-[13px] font-bold text-[var(--ink)]">
                      {displayName}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[var(--muted)]">
                      {user?.email}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-2)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--muted)]">
                      {tz} · {TRAINING_PHASE_LABELS[activePhase]}
                    </div>

                    <div className="mt-3 space-y-0.5 border-t border-[var(--line)] pt-2.5 md:hidden">
                      {secondaryNav.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]"
                          >
                            <Icon className="h-3.5 w-3.5 text-[var(--muted)]" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--line)] pt-3">
                      <Link
                        to="/settings"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[12px] font-semibold text-[var(--ink)] hover:opacity-90"
                      >
                        <Settings className="h-3.5 w-3.5" />
                        <span>Settings</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          void signOut();
                        }}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content: Viewport-Locked ONLY for Calendar & Coach; Spacious Studio Padding for Others */}
      <main
        className={
          isCalendar
            ? 'flex h-[calc(100vh-76px)] w-full flex-col overflow-hidden pb-[72px] md:pb-0'
            : isCoach
              ? 'mx-auto flex h-[calc(100vh-76px)] w-full max-w-[1248px] flex-col overflow-hidden px-4 pb-[76px] pt-3 sm:px-6 md:pb-4'
              : 'mx-auto min-h-[calc(100vh-76px)] w-full max-w-[1248px] px-5 pb-28 pt-10 sm:px-8 sm:pt-12 md:pb-16'
        }
      >
        {children}
      </main>

      <SessionReminderManager />
      <FloatingCoachWidget />

      {/* Mobile Bottom Navigation (4 Primary Tabs) */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid h-[72px] grid-cols-4 border-t border-[var(--line)] bg-[var(--surface)] px-3 py-2 md:hidden"
      >
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const active = item.to === '/modes' ? isModeActive : isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors ${
                active
                  ? 'bg-[var(--blue-lite)] text-[var(--blue)]'
                  : 'text-[var(--faint)] hover:text-[var(--ink)]'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
