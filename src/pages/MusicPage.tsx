import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Check, Clock, Edit3, Plus, Trash2 } from 'lucide-react';
import { CATEGORY_COLORS, CategoryMark } from '@/design-system';
import { getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  deleteScheduleCompletion,
  listScheduleBlocks,
  listScheduleCompletions,
  updateScheduleBlock,
  upsertScheduleCompletion,
} from '@/modules/calendar/repository';
import { addDaysIso } from '@/modules/calendar/scheduleEngine';
import { PracticeDurationModal } from '@/modules/calendar/PracticeDurationModal';
import {
  ALL_MUSIC_INSTRUMENTS,
  buildMusicBlockDraft,
  calculateInstrumentStats,
  extractMusicSessions,
  MUSIC_INSTRUMENT_CONFIG,
  type MusicInstrument,
  type MusicSessionEntry,
} from '@/modules/music/musicLog';
import type { ScheduleBlock, ScheduleCompletion } from '@/types/domain';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const PRESETS = [15, 30, 45, 60];

const INSTRUMENT_THEME: Record<MusicInstrument, { bg: string; fg: string }> = {
  VOCAL: { bg: 'var(--music-vocal)', fg: 'var(--music-vocal-fg)' },
  DRUMMING: { bg: 'var(--music-drumming)', fg: 'var(--music-drumming-fg)' },
  GUITAR: { bg: 'var(--music-guitar)', fg: 'var(--music-guitar-fg)' },
  KEYBOARD: { bg: 'var(--music-keyboard)', fg: 'var(--music-keyboard-fg)' },
};

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function MusicPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);
  const historyStart = addDaysIso(today, -365);

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completions, setCompletions] = useState<ScheduleCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [activeInstrument, setActiveInstrument] = useState<MusicInstrument>('VOCAL');
  const [historyScope, setHistoryScope] = useState<'SECTION' | 'ALL'>('SECTION');

  const [minutes, setMinutes] = useState<number>(MUSIC_INSTRUMENT_CONFIG.VOCAL.defaultMin);
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const [editingEntry, setEditingEntry] = useState<MusicSessionEntry | null>(null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  const loadMusicData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [blockRows, compRows] = await Promise.all([
        listScheduleBlocks(user.id),
        listScheduleCompletions(user.id, historyStart, addDaysIso(today, 1)).catch(
          () => [] as ScheduleCompletion[]
        ),
      ]);
      setBlocks(blockRows);
      setCompletions(compRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load music practice logs.');
    } finally {
      setLoading(false);
    }
  }, [user, historyStart, today]);

  useEffect(() => {
    void loadMusicData();
  }, [loadMusicData]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const allSessions = useMemo(
    () => extractMusicSessions(blocks, completions),
    [blocks, completions]
  );

  const statsByInstrument = useMemo(() => {
    return {
      VOCAL: calculateInstrumentStats('VOCAL', allSessions, today),
      DRUMMING: calculateInstrumentStats('DRUMMING', allSessions, today),
      GUITAR: calculateInstrumentStats('GUITAR', allSessions, today),
      KEYBOARD: calculateInstrumentStats('KEYBOARD', allSessions, today),
    };
  }, [allSessions, today]);

  const totalWeekMinutes = useMemo(
    () =>
      ALL_MUSIC_INSTRUMENTS.reduce(
        (sum, inst) => sum + statsByInstrument[inst].weekMinutes,
        0
      ),
    [statsByInstrument]
  );

  const visibleHistory = useMemo(() => {
    if (historyScope === 'ALL') return allSessions;
    return allSessions.filter((s) => s.instrument === activeInstrument);
  }, [allSessions, historyScope, activeInstrument]);

  const activeConfig = MUSIC_INSTRUMENT_CONFIG[activeInstrument];
  const activeStats = statsByInstrument[activeInstrument];
  const activeTheme = INSTRUMENT_THEME[activeInstrument];

  function handleSelectInstrument(inst: MusicInstrument) {
    setActiveInstrument(inst);
    setMinutes(MUSIC_INSTRUMENT_CONFIG[inst].defaultMin);
    setNotes('');
    setTimerRunning(false);
    setElapsedSec(0);
    setNotice(null);
  }

  function stepMinutes(delta: number) {
    setMinutes((prev) => Math.max(1, Math.min(300, prev + delta)));
  }

  function handleToggleTimer() {
    if (timerRunning) {
      setTimerRunning(false);
      if (elapsedSec >= 30) {
        setMinutes(Math.max(1, Math.round(elapsedSec / 60)));
      }
    } else {
      setTimerRunning(true);
    }
  }

  async function handleSaveSession(e?: FormEvent) {
    e?.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const draft = buildMusicBlockDraft({
        instrument: activeInstrument,
        date: today,
        durationMin: minutes,
        tags: [],
        notes: notes.trim() || null,
      });
      await createScheduleBlock(user.id, draft);
      setTimerRunning(false);
      setElapsedSec(0);
      setNotes('');
      await loadMusicData();
      setNotice(`Saved ${minutes} min of ${activeConfig.label.toLowerCase()} practice.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save practice session.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEntry(entry: MusicSessionEntry) {
    if (!user) return;
    if (
      !window.confirm(
        `Delete ${MUSIC_INSTRUMENT_CONFIG[entry.instrument].label} session (${entry.durationMin}m) on ${entry.date}?`
      )
    ) {
      return;
    }

    setBusyEntryId(entry.id);
    try {
      if (entry.source === 'BLOCK') {
        await deleteScheduleBlock(user.id, entry.blockId);
      } else {
        await deleteScheduleCompletion(user.id, entry.blockId, entry.date);
      }
      await loadMusicData();
    } finally {
      setBusyEntryId(null);
    }
  }

  const pageAccentStyle = {
    '--inst-bg': activeTheme.bg,
    '--inst-fg': activeTheme.fg,
    '--inst-soft': 'color-mix(in srgb, var(--inst-bg) 12%, var(--surface))',
    '--inst-ring': 'color-mix(in srgb, var(--inst-bg) 38%, var(--line))',
  } as CSSProperties;

  return (
    <div className="space-y-7 pb-6" style={pageAccentStyle}>
      {/* Studio Header — Two-Tone Title (no eyebrow or filler subtitle) */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
            Find your{' '}
            <em className="not-italic" style={{ color: 'var(--inst-bg)' }}>
              sound.
            </em>
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void handleSaveSession()}
          disabled={saving}
          style={{ backgroundColor: 'var(--inst-bg)', color: 'var(--inst-fg)' }}
          className="inline-flex h-[42px] shrink-0 items-center justify-center gap-2 rounded-[9px] px-4 text-[13px] font-bold transition-opacity hover:opacity-90 active:translate-y-px disabled:opacity-50"
        >
          <Plus className="h-4 w-4 stroke-[2.4]" />
          <span>Log practice</span>
        </button>
      </header>

      {notice && (
        <div
          style={{
            background: 'var(--inst-soft)',
            borderColor: 'var(--inst-ring)',
            color: 'var(--inst-bg)',
          }}
          className="rounded-xl border px-4 py-2.5 text-xs font-semibold"
        >
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 4 Studio Instrument Tabs (each keeps its own signature color) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ALL_MUSIC_INSTRUMENTS.map((inst) => {
          const cfg = MUSIC_INSTRUMENT_CONFIG[inst];
          const st = statsByInstrument[inst];
          const theme = INSTRUMENT_THEME[inst];
          const selected = activeInstrument === inst;

          return (
            <button
              key={inst}
              type="button"
              onClick={() => handleSelectInstrument(inst)}
              style={
                selected
                  ? {
                      borderColor: `color-mix(in srgb, ${theme.bg} 45%, var(--line))`,
                      background: `color-mix(in srgb, ${theme.bg} 9%, var(--surface))`,
                    }
                  : undefined
              }
              className={`flex min-h-[76px] items-center gap-3.5 rounded-[13px] border px-4 py-3.5 text-left transition-colors ${
                selected
                  ? ''
                  : 'border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <CategoryMark category={inst} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-[13.5px] font-bold text-[var(--ink)]">
                    {cfg.label}
                  </strong>
                  {st.currentStreak > 0 && (
                    <span
                      style={{ color: theme.bg }}
                      className="shrink-0 font-mono text-[10.5px] font-bold"
                    >
                      {st.currentStreak}d
                    </span>
                  )}
                </div>
                <small className="mt-0.5 block text-[11px] text-[var(--muted)]">
                  {st.weekMinutes} min this week
                </small>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main 2-Column Practice Room (stride-studio.html v7 layout) */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(290px,0.9fr)]">
        {/* Left: Today's Session Duration & Live Timer */}
        <form
          onSubmit={(e) => void handleSaveSession(e)}
          className="flex min-h-[360px] flex-col rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7"
        >
          <div>
            <h2 className="text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Today&apos;s {activeConfig.label.toLowerCase()} session
            </h2>
            
          </div>

          <div className="mt-6 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--faint)]">
            DURATION
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-baseline">
              <input
                type="number"
                min={1}
                max={300}
                aria-label={`${activeConfig.label} minutes`}
                value={minutes}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  if (!Number.isNaN(parsed)) {
                    setMinutes(Math.max(1, Math.min(300, parsed)));
                  }
                }}
                style={{ color: 'var(--inst-bg)' }}
                className="w-[126px] bg-transparent font-mono text-[72px] font-bold leading-none tracking-[-0.075em] tabular-nums focus:outline-none"
              />
              <small className="ml-1.5 text-[16px] font-semibold text-[var(--muted)]">
                minutes
              </small>
            </div>

            <div className="flex items-center gap-1.5">
              {[-5, -1, 1, 5].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => stepMinutes(delta)}
                  className="h-10 min-w-[44px] rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 font-mono text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
                >
                  {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {PRESETS.map((n) => {
              const active = minutes === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMinutes(n)}
                  style={
                    active
                      ? {
                          background: 'var(--inst-soft)',
                          borderColor: 'var(--inst-ring)',
                          color: 'var(--inst-bg)',
                        }
                      : undefined
                  }
                  className={`rounded-[7px] border px-3 py-1.5 font-mono text-[11.5px] font-semibold transition-colors ${
                    active
                      ? ''
                      : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {n} min
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional note..."
            className="mt-5 w-full rounded-[9px] border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2.5 text-[12.5px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--line-strong)] focus:outline-none"
          />

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
              <Clock className="h-4 w-4" />
              <strong className="font-mono text-[12.5px] tracking-wider text-[var(--ink)] tabular-nums">
                {formatHms(elapsedSec)}
              </strong>
              <button
                type="button"
                onClick={handleToggleTimer}
                style={{ color: 'var(--inst-bg)' }}
                className="px-1.5 font-bold hover:underline"
              >
                {timerRunning ? 'Pause' : 'Start'}
              </button>
              {elapsedSec > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTimerRunning(false);
                    setElapsedSec(0);
                  }}
                  className="px-1 font-medium text-[var(--muted)] hover:text-[var(--ink)]"
                >
                  Reset
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              style={{ backgroundColor: 'var(--inst-bg)', color: 'var(--inst-fg)' }}
              className="inline-flex h-[41px] items-center justify-center gap-2 rounded-[9px] px-4 text-[12.5px] font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-4 w-4 stroke-[2.5]" />
              <span>{saving ? 'Saving...' : `Save ${activeConfig.label} practice`}</span>
            </button>
          </div>
        </form>

        {/* Right: This Week Streak + 4 Multi-Color Balance Bars */}
        <aside className="flex min-h-[360px] flex-col rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
          <div>
            <h2 className="text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              This week
            </h2>
            
          </div>

          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <strong className="font-mono text-[40px] font-bold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums">
              {activeStats.weekMinutes}
              <small className="ml-1.5 font-sans text-[14px] font-medium text-[var(--muted)]">
                min
              </small>
            </strong>
            <span className="text-[11.5px] text-[var(--muted)]">
              {activeConfig.label} logged · {activeStats.currentStreak} day streak (best{' '}
              {activeStats.bestStreak}d)
            </span>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {activeStats.weekStatus.map((d, idx) => (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <span
                  className={`text-[10px] font-semibold ${
                    d.date === today ? 'font-bold text-[var(--ink)]' : 'text-[var(--muted)]'
                  }`}
                >
                  {DAY_LETTERS[idx]}
                </span>
                <span
                  title={`${d.date}: ${d.minutes}m`}
                  style={
                    d.completed
                      ? { backgroundColor: 'var(--inst-bg)', borderColor: 'var(--inst-bg)' }
                      : undefined
                  }
                  className={`h-2.5 w-2.5 rounded-full border ${
                    d.completed
                      ? ''
                      : 'border-[var(--line-strong)] bg-[var(--surface-3)]'
                  }`}
                />
                <span className="font-mono text-[9.5px] text-[var(--faint)]">
                  {Number(d.date.slice(8))}
                </span>
              </div>
            ))}
          </div>

          <div className="my-5 h-px bg-[var(--line)]" />

          <div className="mb-3.5 flex items-center justify-between text-[11.5px]">
            <span className="font-semibold text-[var(--ink)]">Your practice balance</span>
            <b className="font-mono text-[11.5px] text-[var(--muted)]">
              {totalWeekMinutes} min total
            </b>
          </div>

          <div className="space-y-3.5">
            {ALL_MUSIC_INSTRUMENTS.map((inst) => {
              const cfg = MUSIC_INSTRUMENT_CONFIG[inst];
              const val = statsByInstrument[inst].weekMinutes;
              const pct = totalWeekMinutes > 0 ? Math.min(100, (val / totalWeekMinutes) * 100) : 0;
              return (
                <div key={inst}>
                  <div className="flex items-center justify-between text-[11.5px] text-[var(--muted)]">
                    <span>{cfg.label}</span>
                    <b className="font-mono text-[11px] font-semibold text-[var(--muted)]">
                      {val} min
                    </b>
                  </div>
                  <div className="mt-2 h-[5px] w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <span
                      style={{
                        width: `${pct}%`,
                        backgroundColor: CATEGORY_COLORS[inst],
                      }}
                      className="block h-full rounded-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Full-Width Practice History */}
      <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Practice history
            </h2>
            <span className="rounded-[6px] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[10.5px] font-semibold text-[var(--muted)]">
              {visibleHistory.length} logged
            </span>
          </div>

          <div className="inline-flex rounded-[9px] border border-[var(--line)] p-0.5 text-[11.5px] font-semibold">
            <button
              type="button"
              onClick={() => setHistoryScope('SECTION')}
              style={
                historyScope === 'SECTION'
                  ? { background: 'var(--inst-soft)', color: 'var(--inst-bg)' }
                  : undefined
              }
              className={`rounded-[7px] px-3 py-1.5 transition-colors ${
                historyScope === 'SECTION' ? 'font-bold' : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              {activeConfig.label}
            </button>
            <button
              type="button"
              onClick={() => setHistoryScope('ALL')}
              style={
                historyScope === 'ALL'
                  ? { background: 'var(--inst-soft)', color: 'var(--inst-bg)' }
                  : undefined
              }
              className={`rounded-[7px] px-3 py-1.5 transition-colors ${
                historyScope === 'ALL' ? 'font-bold' : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              All
            </button>
          </div>
        </div>

        {loading ? (
          <div className="border-t border-[var(--line)] py-10 text-center text-sm text-[var(--muted)]">
            Loading practice history...
          </div>
        ) : visibleHistory.length === 0 ? (
          <div className="flex min-h-[175px] flex-col items-center justify-center border-t border-[var(--line)] px-4 py-8 text-center">
            <div className="mb-3.5 flex h-8 items-end gap-1 -rotate-12" aria-hidden="true">
              <span className="h-3.5 w-2 rounded bg-[var(--line-strong)]" />
              <span className="h-6 w-2 rounded" style={{ backgroundColor: 'var(--inst-bg)' }} />
              <span className="h-4.5 w-2 rounded bg-[var(--line-strong)]" />
            </div>
            <h3 className="text-[16px] font-bold text-[var(--ink)]">Nothing logged yet.</h3>
            <p className="mt-1 max-w-[290px] text-[12px] text-[var(--muted)]">
              Your completed {historyScope === 'ALL' ? 'music' : activeConfig.label.toLowerCase()}{' '}
              sessions will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {visibleHistory.slice(0, 30).map((entry) => {
              const isBusy = busyEntryId === entry.id;
              return (
                <div key={entry.id} className="flex items-center gap-3.5 py-3.5">
                  <CategoryMark category={entry.instrument} size="sm" />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-[13px] font-bold text-[var(--ink)]">
                      {entry.title}
                    </strong>
                    <span className="mt-0.5 block truncate text-[11.5px] text-[var(--muted)]">
                      {formatShortDate(entry.date)}
                      {entry.tags.length > 0 ? ` · ${entry.tags.join(', ')}` : ''}
                      {entry.notes ? ` · ${entry.notes}` : ''}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[12.5px] font-bold text-[var(--ink)] tabular-nums">
                    {entry.durationMin} min
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setEditingEntry(entry)}
                      aria-label={`Edit ${entry.title}`}
                      className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleDeleteEntry(entry)}
                      aria-label={`Delete ${entry.title}`}
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

      {editingEntry && user && (
        <PracticeDurationModal
          title={editingEntry.title}
          category={editingEntry.instrument}
          dateLabel={editingEntry.date}
          plannedMin={
            editingEntry.block?.duration_min ??
            MUSIC_INSTRUMENT_CONFIG[editingEntry.instrument].defaultMin
          }
          initialActualMin={editingEntry.durationMin}
          initialNotes={editingEntry.notes}
          isCompleted={true}
          saving={busyEntryId === editingEntry.id}
          onSave={async (actualMin, updatedNotes) => {
            setBusyEntryId(editingEntry.id);
            try {
              if (editingEntry.source === 'BLOCK' && editingEntry.block) {
                await updateScheduleBlock(
                  user.id,
                  editingEntry.blockId,
                  buildMusicBlockDraft({
                    instrument: editingEntry.instrument,
                    date: editingEntry.date,
                    durationMin: actualMin,
                    tags: editingEntry.tags,
                    notes: updatedNotes,
                    title: editingEntry.title,
                  })
                );
              } else {
                await upsertScheduleCompletion(user.id, {
                  block_id: editingEntry.blockId,
                  occurrence_date: editingEntry.date,
                  status: 'COMPLETED',
                  strength_focus: null,
                  duration_min: actualMin,
                  physical_load: editingEntry.instrument === 'DRUMMING' ? 'LOW' : 'NONE',
                  notes: updatedNotes,
                });
              }
              await loadMusicData();
            } finally {
              setBusyEntryId(null);
            }
          }}
          onUndo={async () => {
            await handleDeleteEntry(editingEntry);
          }}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
}
