import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Edit3, Flame, Plus, Trash2 } from 'lucide-react';
import { CategoryMark } from '@/design-system';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  listScheduleBlocks,
  updateScheduleBlock,
} from '@/modules/calendar/repository';
import { addDaysIso } from '@/modules/calendar/scheduleEngine';
import { getWeekDatesIso } from '@/modules/calendar/timelineEngine';
import type { ScheduleBlock } from '@/types/domain';
import {
  KARATE_FOCUS_LABELS,
  toKarateSessionView,
  type KarateFocus,
  type KarateSessionView,
} from '@/modules/karate/karateLog';
import { KarateSessionModal } from '@/modules/karate/KarateSessionModal';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const FOCUS_FILTERS: (KarateFocus | 'ALL')[] = [
  'ALL',
  'KUMITE',
  'KATA',
  'KIHON',
  'CLASS',
  'CONDITIONING',
];

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function KaratePage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);
  const weekStart = getMondayWeekStart(today);
  const weekEnd = addDaysIso(weekStart, 6);
  const weekDates = useMemo(() => getWeekDatesIso(weekStart), [weekStart]);

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [focusFilter, setFocusFilter] = useState<KarateFocus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingSession, setEditingSession] = useState<KarateSessionView | null>(null);

  const loadKarateLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const allBlocks = await listScheduleBlocks(user.id);
      setBlocks(allBlocks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Karate sessions.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadKarateLogs();
  }, [loadKarateLogs]);

  const sessions = useMemo<KarateSessionView[]>(() => {
    return blocks
      .filter((b) => b.category === 'KARATE' && !b.is_recurring && b.status === 'COMPLETED')
      .map(toKarateSessionView)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [blocks]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (focusFilter !== 'ALL' && s.meta.focus !== focusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = [
          s.date,
          s.title,
          KARATE_FOCUS_LABELS[s.meta.focus],
          s.meta.katas.join(' '),
          s.meta.feel ?? '',
          s.meta.notes ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, focusFilter, searchQuery]);

  const stats = useMemo(() => {
    const thisWeek = sessions.filter((s) => s.date >= weekStart && s.date <= weekEnd);
    const weekMin = thisWeek.reduce((acc, s) => acc + s.durationMin, 0);
    const dateSet = new Set(sessions.map((s) => s.date));

    const kataCounts = new Map<string, number>();
    for (const s of sessions) {
      for (const k of s.meta.katas) {
        kataCounts.set(k, (kataCounts.get(k) ?? 0) + 1);
      }
    }
    const topKatas = Array.from(kataCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return {
      weekMin,
      weekCount: thisWeek.length,
      totalCount: sessions.length,
      kumiteCount: sessions.filter((s) => s.meta.focus === 'KUMITE').length,
      kataCount: sessions.filter((s) => s.meta.focus === 'KATA' || s.meta.katas.length > 0).length,
      dateSet,
      topKatas,
    };
  }, [sessions, weekStart, weekEnd]);

  async function handleDelete(session: KarateSessionView) {
    if (!user) return;
    if (!window.confirm(`Delete Karate session on ${session.date}?`)) return;
    await deleteScheduleBlock(user.id, session.id);
    await loadKarateLogs();
  }

  return (
    <div className="space-y-7 pb-6">
      {/* Studio Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
            Sharpen your <em className="not-italic text-[var(--karate)]">craft.</em>
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingSession(null);
            setShowModal(true);
          }}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[9px] bg-[var(--karate)] px-4 text-[12.5px] font-bold text-[var(--karate-btn-text)] transition-opacity hover:opacity-90 active:translate-y-px"
        >
          <Plus className="h-4 w-4 stroke-[2.4]" />
          <span>Log a session</span>
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Top 2 Feature Cards */}
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left: Weekly Minutes + 7-Day Dots */}
        <section
          className="flex min-h-[218px] flex-col rounded-[15px] border border-[var(--line)] p-6"
          style={{
            background: 'color-mix(in srgb, var(--karate) 4%, var(--surface))',
          }}
        >
          <div className="flex items-start justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--faint)]">
              THIS WEEK
            </span>
            <CategoryMark category="KARATE" />
          </div>

          <div className="mt-3 font-mono text-[54px] font-bold leading-none tracking-[-0.07em] text-[var(--ink)] tabular-nums">
            {stats.weekMin}
            <small className="ml-2 font-sans text-[17px] font-semibold tracking-normal text-[var(--muted)]">
              min
            </small>
          </div>
          <p className="mt-2 text-[12px] text-[var(--muted)]">
            {stats.weekCount} {stats.weekCount === 1 ? 'session' : 'sessions'} recorded
          </p>

          <div className="mt-auto border-t border-[var(--line)] pt-4">
            <div className="grid max-w-[340px] grid-cols-7 gap-1.5">
              {weekDates.map((d, i) => {
                const done = stats.dateSet.has(d);
                const isToday = d === today;
                return (
                  <div key={d} className="flex flex-col items-center gap-1.5">
                    <span
                      className={`text-[10px] font-semibold ${
                        isToday ? 'font-bold text-[var(--ink)]' : 'text-[var(--muted)]'
                      }`}
                    >
                      {DAY_LETTERS[i]}
                    </span>
                    <span
                      className={`h-2.5 w-2.5 rounded-full border ${
                        done
                          ? 'border-[var(--karate)] bg-[var(--karate)]'
                          : 'border-[var(--line-strong)] bg-[var(--surface-3)]'
                      }`}
                    />
                    <span className="font-mono text-[9.5px] text-[var(--faint)]">
                      {Number(d.slice(8))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right: At a Glance 3-Column Summary */}
        <section className="flex min-h-[218px] flex-col rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--faint)]">
            AT A GLANCE
          </span>

          <div className="my-auto grid grid-cols-3 divide-x divide-[var(--line)] py-5">
            <div className="pr-4">
              <strong className="block font-mono text-[30px] font-bold leading-none tracking-[-0.05em] text-[var(--ink)] tabular-nums">
                {stats.totalCount}
              </strong>
              <span className="mt-2 block text-[11px] text-[var(--muted)]">Total sessions</span>
            </div>
            <div className="px-4">
              <strong className="block font-mono text-[30px] font-bold leading-none tracking-[-0.05em] text-[var(--ink)] tabular-nums">
                {stats.kumiteCount}
              </strong>
              <span className="mt-2 block text-[11px] text-[var(--muted)]">Kumite</span>
            </div>
            <div className="pl-4">
              <strong className="block font-mono text-[30px] font-bold leading-none tracking-[-0.05em] text-[var(--ink)] tabular-nums">
                {stats.kataCount}
              </strong>
              <span className="mt-2 block text-[11px] text-[var(--muted)]">Kata</span>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-[11.5px] text-[var(--muted)]">
            <span>Karate stays separate from running distance.</span>
            <Link
              to="/calendar"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--karate)] hover:underline"
            >
              <span>See calendar</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </div>

      {/* Main Content Grid: Session History + Practice Notes */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.58fr)_minmax(270px,0.85fr)]">
        {/* Session History */}
        <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                Session history
              </h2>
              <span className="rounded-[6px] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-[var(--muted)]">
                {filteredSessions.length} recorded
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={focusFilter}
                onChange={(e) => setFocusFilter(e.target.value as KarateFocus | 'ALL')}
                aria-label="Filter karate sessions"
                className="h-9 rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2.5 text-[12px] text-[var(--ink)] focus:border-[var(--karate)] focus:outline-none"
              >
                {FOCUS_FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {f === 'ALL' ? 'All types' : KARATE_FOCUS_LABELS[f]}
                  </option>
                ))}
              </select>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions"
                aria-label="Search sessions"
                className="h-9 w-[170px] rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 text-[12px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--karate)] focus:outline-none"
              />
            </div>
          </div>

          {loading ? (
            <div className="border-t border-[var(--line)] py-10 text-center text-sm text-[var(--muted)]">
              Loading sessions...
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="flex min-h-[190px] flex-col items-center justify-center border-t border-[var(--line)] px-4 py-8 text-center">
              <div className="mb-4 flex h-8 items-end gap-1 -rotate-12" aria-hidden="true">
                <span className="h-3.5 w-2 rounded bg-[var(--line-strong)]" />
                <span className="h-6 w-2 rounded bg-[var(--karate)]" />
                <span className="h-4.5 w-2 rounded bg-[var(--line-strong)]" />
              </div>
              <h3 className="text-[16px] font-bold text-[var(--ink)]">
                {searchQuery || focusFilter !== 'ALL'
                  ? 'Nothing matches your filter.'
                  : 'Your journal starts here.'}
              </h3>
              <p className="mt-1.5 max-w-[290px] text-[12px] leading-relaxed text-[var(--muted)]">
                {searchQuery || focusFilter !== 'ALL'
                  ? 'Try another filter or search term.'
                  : 'Your logged Kumite, Kata, and class sessions will appear here.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingSession(null);
                  setShowModal(true);
                }}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--karate)]/35 bg-[var(--karate-lite)] px-3.5 text-[12px] font-bold text-[var(--karate-ink)] transition-opacity hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Log first session</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {filteredSessions.map((session) => {
                const subParts = [
                  formatShortDate(session.date),
                  KARATE_FOCUS_LABELS[session.meta.focus],
                  session.meta.rpe ? `Effort ${session.meta.rpe}/10` : null,
                  session.meta.feel ?? null,
                  session.meta.painPresent ? 'Pain noted' : null,
                  session.meta.notes ?? null,
                ].filter(Boolean);

                return (
                  <div key={session.id} className="flex items-center gap-3.5 py-3.5">
                    <CategoryMark category="KARATE" size="sm" />
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-[13px] font-bold text-[var(--ink)]">
                        {session.title}
                        {session.meta.katas.length > 0 && !session.title.includes(session.meta.katas[0])
                          ? ` · ${session.meta.katas.join(', ')}`
                          : ''}
                      </strong>
                      <span className="mt-0.5 block truncate text-[11.5px] text-[var(--muted)]">
                        {subParts.join(' · ')}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-[12.5px] font-bold text-[var(--ink)] tabular-nums">
                      {session.durationMin} min
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSession(session);
                          setShowModal(true);
                        }}
                        aria-label={`Edit ${session.title}`}
                        className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(session)}
                        aria-label={`Delete ${session.title}`}
                        className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Practice Notes & Kata Repertoire */}
        <aside className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
            Practice notes
          </h2>
          

          {stats.topKatas.length > 0 ? (
            <div className="mt-5">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--faint)]">
                MOST PRACTICED KATA
              </div>
              <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                {stats.topKatas.map(([name, count]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between py-3 text-[12.5px]"
                  >
                    <span className="text-[var(--ink)]">{name}</span>
                    <b className="font-mono text-[11.5px] text-[var(--karate)]">
                      {count} {count === 1 ? 'session' : 'sessions'}
                    </b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-2.5 pb-4">
              <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--karate-lite)] text-[var(--karate)]">
                <Flame className="h-4 w-4" />
              </div>
              <b className="block text-[13.5px] text-[var(--ink)]">
                Keep your practice together.
              </b>
              <p className="text-[12px] leading-relaxed text-[var(--muted)]">
                Log Kumite, Kata, or class training here. Each session syncs to your Calendar and
                informs your running recovery load.
              </p>
            </div>
          )}

          <div className="mt-3 border-t border-[var(--line)] pt-4">
            <Link
              to="/plan"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--karate)] hover:underline"
            >
              <span>Review training load</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </aside>
      </div>

      {showModal && user && (
        <KarateSessionModal
          initialSession={editingSession}
          defaultDate={today}
          onClose={() => {
            setShowModal(false);
            setEditingSession(null);
          }}
          onSave={async (draft) => {
            if (editingSession) {
              await updateScheduleBlock(user.id, editingSession.id, draft);
            } else {
              await createScheduleBlock(user.id, draft);
            }
            await loadKarateLogs();
          }}
        />
      )}
    </div>
  );
}
