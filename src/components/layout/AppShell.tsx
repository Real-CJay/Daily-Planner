import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
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
  type LucideIcon,
} from 'lucide-react';
import '@/styles/v2-tokens.css';
import { DuoIcon, type DuoIconName } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, type DomainId } from '@/design-system/v2Theme';
import { FeedbackProvider, useFeedback } from '@/components/feedback/FeedbackContext';
import { MonkFocusOverlay } from '@/components/monk/MonkFocusOverlay';
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

const SECONDARY_VISUALS: Record<string, { icon: DuoIconName; domId: DomainId }> = {
  '/analytics': { icon: 'running', domId: 'running' },
  '/coach': { icon: 'spark', domId: 'strength' },
  '/personal-bests': { icon: 'trophy', domId: 'karate' },
  '/weekly-review': { icon: 'reading', domId: 'reading' },
  '/settings': { icon: 'recovery', domId: 'health' },
};

function AppShellInner({
  isDark,
  monkOpen,
  setMonkOpen,
  children,
}: {
  isDark: boolean;
  monkOpen: boolean;
  setMonkOpen: (v: boolean) => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const { user, profile, signOut } = useAuth();
  const { toggleTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const T = getV2Theme(isDark);

  useEffect(() => {
    if (!document.getElementById('stride-google-fonts')) {
      const link = document.createElement('link');
      link.id = 'stride-google-fonts';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap';
      document.head.appendChild(link);
    }
  }, []);

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
    <div
      className={`min-h-screen overflow-x-hidden transition-colors duration-200 selection:bg-[#2563EB]/20 selection:text-[#2563EB] ${T.pageBg}`}
    >
      {/* V2 Top Navigation Bar */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors duration-200 ${T.headerBg}`}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-3">
            {/* Left: stride. Brand Mark */}
            <Link
              to="/"
              aria-label="Go to Overview"
              className="group flex shrink-0 items-center gap-2.5 transition-transform active:scale-[0.98]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2563EB] transition-colors group-hover:bg-[#1D4ED8]">
                <DuoIcon name="brand" className="h-5 w-5" />
              </div>
              <span className={`font-display text-xl font-extrabold tracking-tight ${T.text}`}>
                stride<span className="text-[#2563EB]">.</span>
              </span>
            </Link>

            {/* Center: Pill Navigation + More Dropdown */}
            <nav
              aria-label="Main navigation"
              className={`hidden items-center gap-1 rounded-2xl border p-1 md:flex ${T.cardSubtle}`}
            >
              {primaryNav.map((item) => {
                const active = item.to === '/modes' ? isModeActive : isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => {
                      setMoreOpen(false);
                      setProfileOpen(false);
                    }}
                    className={`rounded-xl px-4 py-1.5 text-sm font-bold transition-all active:scale-[0.98] ${
                      active
                        ? isDark
                          ? 'bg-[#242424] text-[#F5F5F5]'
                          : 'bg-white text-[#0F172A] shadow-sm'
                        : `${T.muted} hover:${T.text}`
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              {/* More ▾ Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen((v) => !v);
                    setProfileOpen(false);
                  }}
                  className={`flex cursor-pointer items-center gap-1 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all active:scale-[0.98] ${
                    isSecondaryActive
                      ? isDark
                        ? 'bg-[#242424] text-[#60A5FA]'
                        : 'bg-white text-[#2563EB] shadow-sm'
                      : `${T.muted} hover:${T.text}`
                  }`}
                >
                  <span>More</span>
                  <span className="text-xs">▾</span>
                </button>

                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                    <div
                      className={`animate-pop absolute right-0 z-40 mt-2.5 w-52 rounded-2xl border p-1.5 shadow-xl ${T.card}`}
                    >
                      {secondaryNav.map((item) => {
                        const vis = SECONDARY_VISUALS[item.to] ?? {
                          icon: 'spark' as DuoIconName,
                          domId: 'running' as DomainId,
                        };
                        const d = getDom(vis.domId, isDark);
                        const active = isActive(item.to);
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setMoreOpen(false)}
                            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors active:scale-[0.98] ${
                              active
                                ? isDark
                                  ? 'bg-[#2563EB]/20 text-[#60A5FA]'
                                  : 'bg-[#EFF6FF] text-[#2563EB]'
                                : `${T.text} ${T.surfaceHover}`
                            }`}
                          >
                            <span
                              className={`flex h-7 w-7 items-center justify-center rounded-lg ${d.soft} ${d.text}`}
                            >
                              <DuoIcon name={vis.icon} className="h-4 w-4" />
                            </span>
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </nav>

            {/* Right: Phase Pill, Monk Focus, Theme Switch, Profile */}
            <div className="relative flex shrink-0 items-center gap-2">
              <Link
                to="/settings"
                className={`hidden items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold tracking-wide lg:inline-flex ${T.btnNeutral}`}
              >
                <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
                {TRAINING_PHASE_LABELS[activePhase]}
              </Link>

              <button
                type="button"
                onClick={() => setMonkOpen(true)}
                title="Monk Focus Timer"
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition-all active:scale-[0.98] ${
                  isDark
                    ? 'border border-[#818CF8]/30 bg-[#4F46E5]/15 text-[#818CF8] hover:bg-[#4F46E5]/25'
                    : 'border border-[#C7D2FE] bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#E0E7FF]'
                }`}
              >
                <DuoIcon name="monk" className="h-4 w-4" />
                <span className="hidden sm:inline">Monk</span>
              </button>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl ${T.btnWhite}`}
              >
                <DuoIcon
                  name={isDark ? 'sun' : 'moon'}
                  className={`h-4 w-4 ${isDark ? 'text-[#FBBF24]' : 'text-[#4F46E5]'}`}
                />
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
                  className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl font-display text-xs font-extrabold transition-all active:scale-[0.98] ${
                    isDark
                      ? 'border border-[#3B82F6]/30 bg-[#2563EB]/20 text-[#60A5FA]'
                      : 'border border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]'
                  }`}
                >
                  {initial}
                </button>

                {profileOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
                    <div
                      className={`animate-pop absolute right-0 top-12 z-40 w-64 rounded-2xl border p-4 shadow-xl ${T.card}`}
                    >
                      <div className={`truncate font-display text-sm font-extrabold ${T.text}`}>
                        {displayName}
                      </div>
                      <div className={`mt-0.5 truncate text-xs font-medium ${T.muted}`}>
                        {user?.email}
                      </div>
                      <div
                        className={`mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-extrabold ${T.cardSubtle} ${T.muted}`}
                      >
                        {tz} · {TRAINING_PHASE_LABELS[activePhase]}
                      </div>

                      <div className={`mt-3 space-y-0.5 border-t pt-2.5 md:hidden ${T.divider}`}>
                        {secondaryNav.map((item) => {
                          const Icon = item.icon;
                          return (
                            <Link
                              key={item.to}
                              to={item.to}
                              onClick={() => setProfileOpen(false)}
                              className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold ${T.text} ${T.surfaceHover}`}
                            >
                              <Icon className="h-3.5 w-3.5 opacity-70" />
                              <span>{item.label}</span>
                            </Link>
                          );
                        })}
                      </div>

                      <div className={`mt-3 flex flex-col gap-1.5 border-t pt-3 ${T.divider}`}>
                        <Link
                          to="/settings"
                          onClick={() => setProfileOpen(false)}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${T.btnNeutral}`}
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
                          className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold ${T.btnDangerSoft}`}
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
        </div>
      </header>

      {/* Main Content */}
      <main
        className={
          isCalendar
            ? 'mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-7xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:px-8'
            : isCoach
              ? 'mx-auto flex h-[calc(100vh-64px)] w-full max-w-7xl flex-col overflow-hidden px-4 pb-[76px] pt-4 sm:px-6 md:pb-6 lg:px-8'
              : 'mx-auto min-h-[calc(100vh-64px)] w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8'
        }
      >
        {children}
      </main>

      <SessionReminderManager />
      <FloatingCoachWidget />

      {monkOpen && (
        <MonkFocusOverlay
          isDark={isDark}
          onClose={() => setMonkOpen(false)}
          onFinish={(label) => {
            triggerConfetti();
            pushToast(`${label} session complete!`, '#10B981');
          }}
        />
      )}

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile navigation"
        className={`fixed inset-x-0 bottom-0 z-30 grid h-[70px] grid-cols-4 border-t px-3 py-2 backdrop-blur-md md:hidden ${T.headerBg}`}
      >
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const active = item.to === '/modes' ? isModeActive : isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-extrabold transition-colors ${
                active
                  ? isDark
                    ? 'bg-[#2563EB]/20 text-[#60A5FA]'
                    : 'bg-[#EFF6FF] text-[#2563EB]'
                  : T.muted
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

export function AppShell({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [monkOpen, setMonkOpen] = useState(false);

  return (
    <FeedbackProvider isDark={isDark} onOpenMonkFocus={() => setMonkOpen(true)}>
      <AppShellInner isDark={isDark} monkOpen={monkOpen} setMonkOpen={setMonkOpen}>
        {children}
      </AppShellInner>
    </FeedbackProvider>
  );
}
