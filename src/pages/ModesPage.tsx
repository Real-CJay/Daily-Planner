import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Flame, HeartPulse, Moon, Music, Route } from 'lucide-react';

const MODE_CARDS = [
  {
    to: '/runs',
    title: 'Running',
    description: 'Log runs, pace splits, and track your Sub-20 5K progression.',
    icon: Route,
    accent: 'var(--run)',
    soft: 'var(--run-lite)',
  },
  {
    to: '/karate',
    title: 'Karate',
    description: 'Record Kumite, Kata repertoire, effort, and body load.',
    icon: Flame,
    accent: 'var(--karate)',
    soft: 'var(--karate-lite)',
  },
  {
    to: '/music',
    title: 'Music',
    description: 'Practice Vocal, Drumming, Guitar, and Keyboard with live timers and streaks.',
    icon: Music,
    accent: 'var(--music)',
    soft: 'var(--music-lite)',
  },
  {
    to: '/sleep',
    title: 'Sleep',
    description: 'Log bedtime, wake time, sleep stages, and upload tracker screenshots.',
    icon: Moon,
    accent: 'var(--sleep)',
    soft: 'var(--sleep-lite)',
  },
  {
    to: '/reading',
    title: 'Reading',
    description: 'Track books, pages read, reading timer, and your daily reading streak.',
    icon: BookOpen,
    accent: 'var(--reading)',
    soft: 'var(--reading-lite)',
  },
  {
    to: '/health',
    title: 'Health',
    description: 'Track sugar control, low-fat meals, hydration, and daily clean-living rules.',
    icon: HeartPulse,
    accent: 'var(--health)',
    soft: 'var(--health-lite)',
  },
];

export function ModesPage() {
  return (
    <div className="space-y-7 pb-6">
      <header>
        <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
          Choose your <em className="not-italic text-[var(--blue)]">mode.</em>
        </h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODE_CARDS.map((mode) => {
          const Icon = mode.icon;
          return (
            <Link
              key={mode.to}
              to={mode.to}
              className="group flex flex-col justify-between rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-6 transition-all hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]/50"
            >
              <div>
                <div
                  style={{ background: mode.soft, color: mode.accent }}
                  className="grid h-11 w-11 place-items-center rounded-[12px]"
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                  {mode.title}
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
                  {mode.description}
                </p>
              </div>

              <div
                style={{ color: mode.accent }}
                className="mt-6 inline-flex items-center gap-1.5 text-[12.5px] font-bold"
              >
                <span>Open {mode.title}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
