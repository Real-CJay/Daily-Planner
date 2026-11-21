import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Check,
  Dumbbell,
  Footprints,
  Plus,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { Button, CategoryBadge } from '@/design-system';
import { useAuth } from '@/modules/auth/AuthContext';
import {
  ACTIVITY_CATEGORY_LABELS,
  STRENGTH_FOCUS_LABELS,
  STRENGTH_FOCUS_LOAD,
  type ActivityCategory,
  type HabitLog,
  type RunningSession,
  type ScheduleBlock,
  type ScheduleCompletion,
  type StrengthFocus,
} from '@/types/domain';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { listRunningSessions } from '@/modules/running/repository';
import { computeWeeklyRunningStats, formatDistanceKm } from '@/modules/running/calculations';
import {
  createScheduleBlock,
  deleteScheduleCompletion,
  listScheduleBlocks,
  listScheduleCompletions,
  upsertScheduleCompletion,
} from '@/modules/calendar/repository';
import {
  addDaysIso,
  expandCalendarOccurrences,
} from '@/modules/calendar/scheduleEngine';
import { getWeekDatesIso } from '@/modules/calendar/timelineEngine';
import { listHabitLogs, toggleHabitLog } from '@/modules/habits/repository';
import { calculateHabitStreak, PORN_FREE_HABIT_KEY } from '@/modules/habits/streakEngine';

const WORKOUT_CATEGORIES: ActivityCategory[] = [
  'RUNNING',
  'KARATE',
  'STRENGTH',
  'VOCAL',
  'DRUMMING',
  'GUITAR',
  'KEYBOARD',
  'UNIVERSITY',
  'CUSTOM',
];

const STRENGTH_SPLITS: StrengthFocus[] = [
  'UPPER',
  'CORE',
  'LOWER',
  'FULL_BODY',
  'MOBILITY',
  'APP_REST',
];

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatHumanDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function OverviewPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);
  const weekStart = getMondayWeekStart(today);
  const weekEnd = addDaysIso(weekStart, 6);

  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completions, setCompletions] = useState<ScheduleCompletion[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [togglingHabit, setTogglingHabit] = useState(false);
  const [busyCompletionId, setBusyCompletionId] = useState<string | null>(null);
  const [selectedSplit, setSelectedSplit] = useState<StrengthFocus>('UPPER');
  const [loggingSplit, setLoggingSplit] = useState(false);

  // Quick Add Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<ActivityCategory>('RUNNING');
  const [newTime, setNewTime] = useState('07:00');
  const [newDuration, setNewDuration] = useState(45);
  const [savingNew, setSavingNew] = useState(false);

  const loadWorkspace = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const [runRows, blockRows, compRows, habitRows] = await Promise.all([
        listRunningSessions(user.id).catch(() => [] as RunningSession[]),
        listScheduleBlocks(user.id).catch(() => [] as ScheduleBlock[]),
        listScheduleCompletions(user.id, weekStart, weekEnd).catch(
          () => [] as ScheduleCompletion[]
        ),
        listHabitLogs(user.id, PORN_FREE_HABIT_KEY).catch(() => [] as HabitLog[]),
      ]);
      setSessions(runRows);
      setBlocks(blockRows);
      setCompletions(compRows);
      setHabitLogs(habitRows);
    } finally {
      setLoading(false);
    }
  }, [user, weekStart, weekEnd]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  // 1. Porn-Free Streak Summary
  const pornFree = useMemo(
    () => calculateHabitStreak(PORN_FREE_HABIT_KEY, habitLogs, today),
    [habitLogs, today]
  );

  async function handleTogglePornFree() {
    if (!user || togglingHabit) return;
    setTogglingHabit(true);
    const nextValue = !pornFree.checkedToday;
    try {
      await toggleHabitLog(user.id, PORN_FREE_HABIT_KEY, today, nextValue);
      const updated = await listHabitLogs(user.id, PORN_FREE_HABIT_KEY);
      setHabitLogs(updated);
    } finally {
      setTogglingHabit(false);
    }
  }

  // 2. Week Occurrences & Completion Lookup
  const weekOccurrences = useMemo(
    () => expandCalendarOccurrences(blocks, [], weekStart, weekEnd),
    [blocks, weekStart, weekEnd]
  );

  const completionMap = useMemo(() => {
    const map = new Map<string, ScheduleCompletion>();
    for (const c of completions) {
      map.set(`${c.block_id}:${c.occurrence_date}`, c);
    }
    return map;
  }, [completions]);

  const todayChecklist = useMemo(() => {
    return weekOccurrences
      .filter((occ) => occ.date === today)
      .sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'));
  }, [weekOccurrences, today]);

  async function handleToggleChecklistItem(occ: (typeof todayChecklist)[number]) {
    if (!user || busyCompletionId) return;
    const key = `${occ.sourceId}:${occ.date}`;
    setBusyCompletionId(key);
    try {
      const existing = completionMap.get(key);
      if (existing && existing.status === 'COMPLETED') {
        await deleteScheduleCompletion(user.id, occ.sourceId, occ.date);
      } else {
        await upsertScheduleCompletion(user.id, {
          block_id: occ.sourceId,
          occurrence_date: occ.date,
          status: 'COMPLETED',
          strength_focus: occ.category === 'STRENGTH' ? selectedSplit : null,
          duration_min: occ.durationMin ?? 45,
          physical_load: occ.physicalLoad,
          notes: null,
        });
      }
      const fresh = await listScheduleCompletions(user.id, weekStart, weekEnd);
      setCompletions(fresh);
    } finally {
      setBusyCompletionId(null);
    }
  }

  // 3. Strength Counter & Quick Split Log
  const weeklyStrengthCompletions = useMemo(() => {
    return completions.filter((c) => {
      if (c.status !== 'COMPLETED') return false;
      if (c.strength_focus && c.strength_focus !== 'APP_REST') return true;
      const blk = blocks.find((b) => b.id === c.block_id);
      return blk?.category === 'STRENGTH';
    });
  }, [completions, blocks]);

  // Suggest next split in rotation automatically
  useEffect(() => {
    const lastFocus = weeklyStrengthCompletions[weeklyStrengthCompletions.length - 1]?.strength_focus;
    if (!lastFocus) return;
    const idx = STRENGTH_SPLITS.indexOf(lastFocus);
    if (idx >= 0) {
      setSelectedSplit(STRENGTH_SPLITS[(idx + 1) % STRENGTH_SPLITS.length]);
    }
  }, [weeklyStrengthCompletions]);

  async function handleLogStrengthSplit() {
    if (!user || loggingSplit) return;
    setLoggingSplit(true);
    try {
      let strengthBlock = blocks.find((b) => b.category === 'STRENGTH');
      if (!strengthBlock) {
        strengthBlock = await createScheduleBlock(user.id, {
          title: 'Strength Workout',
          category: 'STRENGTH',
          block_date: today,
          start_time: '07:00',
          end_time: '07:45',
          duration_min: 45,
          is_recurring: false,
          recurrence_days: [],
          status: 'PLANNED',
          physical_load: STRENGTH_FOCUS_LOAD[selectedSplit],
          notes: null,
        });
        setBlocks((prev) => [...prev, strengthBlock!]);
      }

      await upsertScheduleCompletion(user.id, {
        block_id: strengthBlock.id,
        occurrence_date: today,
        status: selectedSplit === 'APP_REST' ? 'REST_DAY' : 'COMPLETED',
        strength_focus: selectedSplit,
        duration_min: 40,
        physical_load: STRENGTH_FOCUS_LOAD[selectedSplit],
        notes: STRENGTH_FOCUS_LABELS[selectedSplit],
      });

      const fresh = await listScheduleCompletions(user.id, weekStart, weekEnd);
      setCompletions(fresh);
    } finally {
      setLoggingSplit(false);
    }
  }

  // 4. Weekly Summary Metrics (Mon-Sun)
  const weeklyRunning = useMemo(
    () => computeWeeklyRunningStats(sessions, today),
    [sessions, today]
  );

  const weekSummaryDays = useMemo(() => {
    const dates = getWeekDatesIso(weekStart);
    return dates.map((date, idx) => {
      const dayOccs = weekOccurrences.filter((o) => o.date === date);
      const completedCount = dayOccs.filter(
        (o) => completionMap.get(`${o.sourceId}:${date}`)?.status === 'COMPLETED'
      ).length;
      const runKm = sessions
        .filter((s) => s.session_date === date)
        .reduce((acc, s) => acc + s.distance_m / 1000, 0);

      return {
        date,
        dayLabel: DAY_SHORT[idx],
        dayNum: Number(date.slice(-2)),
        totalPlanned: dayOccs.length,
        completedCount,
        runKm,
        isToday: date === today,
        categories: Array.from(new Set(dayOccs.map((o) => o.category))),
      };
    });
  }, [weekStart, weekOccurrences, completionMap, sessions, today]);

  const totalWeekCompleted = useMemo(
    () => completions.filter((c) => c.status === 'COMPLETED').length,
    [completions]
  );

  async function handleQuickAdd(e: FormEvent) {
    e.preventDefault();
    if (!user || savingNew) return;
    setSavingNew(true);
    try {
      const title = newTitle.trim() || ACTIVITY_CATEGORY_LABELS[newCategory];
      const [hh, mm] = newTime.split(':').map(Number);
      const endTotal = (hh || 7) * 60 + (mm || 0) + newDuration;
      const endH = String(Math.floor(endTotal / 60) % 24).padStart(2, '0');
      const endM = String(endTotal % 60).padStart(2, '0');

      const created = await createScheduleBlock(user.id, {
        title,
        category: newCategory,
        block_date: today,
        start_time: newTime,
        end_time: `${endH}:${endM}`,
        duration_min: newDuration,
        is_recurring: false,
        recurrence_days: [],
        status: 'PLANNED',
        physical_load:
          newCategory === 'RUNNING' || newCategory === 'KARATE' ? 'HIGH' : 'LOW',
        notes: null,
      });

      setBlocks((prev) => [...prev, created]);
      setNewTitle('');
      setShowAddModal(false);
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Top Spacious Header */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Daily War Room
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            {formatHumanDate(today)}
          </h1>
          <p className="mt-1.5 text-base text-[var(--text-secondary)]">
            {profile?.display_name ? `Welcome back, ${profile.display_name}.` : 'Keep your streaks alive and check off today’s sessions.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="h-12 rounded-2xl px-5 text-base font-bold"
          >
            <Plus className="h-5 w-5" />
            Add Activity
          </Button>
          <Link
            to="/calendar"
            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-5 text-base font-semibold text-[var(--text-primary)] transition hover:border-slate-400 dark:hover:border-slate-600"
          >
            <Calendar className="h-5 w-5" />
            Planner
          </Link>
        </div>
      </div>

      {/* Row 1: Porn-Free Streak Card & Strength Counter Card */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Porn-Free Habit Counter */}
        <section className="flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/12 px-3 py-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                Porn-Free Discipline
              </span>
              <div className="mt-4 flex items-baseline gap-3">
                <span className="font-mono text-5xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  {pornFree.currentStreak}
                </span>
                <span className="text-xl font-bold text-[var(--text-secondary)]">
                  day streak 🔥
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-[var(--text-secondary)]">
                Best streak: <span className="font-mono font-bold text-[var(--text-primary)]">{pornFree.bestStreak} days</span> • Total clean days: <span className="font-mono font-bold text-[var(--text-primary)]">{pornFree.totalDays}</span>
              </p>
            </div>

            <button
              type="button"
              disabled={togglingHabit}
              onClick={() => void handleTogglePornFree()}
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 transition ${
                pornFree.checkedToday
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-300 bg-[var(--bg-app)] text-slate-400 hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-700'
              }`}
              title={pornFree.checkedToday ? 'Checked off for today' : 'Tick today as porn-free'}
            >
              <Check className="h-8 w-8 stroke-[3]" />
            </button>
          </div>

          <div className="mt-6">
            <button
              type="button"
              disabled={togglingHabit}
              onClick={() => void handleTogglePornFree()}
              className={`w-full rounded-2xl px-5 py-4 text-left text-base font-bold transition ${
                pornFree.checkedToday
                  ? 'bg-emerald-600 text-white'
                  : 'border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)] hover:border-emerald-500'
              }`}
            >
              {pornFree.checkedToday
                ? '✓ Today is locked in — Porn-Free!'
                : 'Tap to check off today as Porn-Free'}
            </button>

            {/* Mon - Sun Streak Strip */}
            <div className="mt-5 grid grid-cols-7 gap-2">
              {pornFree.weekStatus.map((day, i) => (
                <div
                  key={day.date}
                  className={`flex flex-col items-center rounded-xl py-2 text-xs font-bold ${
                    day.completed
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-[var(--bg-app)] text-[var(--text-secondary)]'
                  }`}
                >
                  <span>{DAY_SHORT[i]}</span>
                  <span className="mt-1 text-sm">{day.completed ? '🔥' : '·'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Strength Counter & Rotating Split Card */}
        <section className="flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 px-3 py-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
                  <Dumbbell className="h-4 w-4" />
                  Strength Counter
                </span>
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="font-mono text-5xl font-extrabold tracking-tight text-[var(--text-primary)]">
                    {weeklyStrengthCompletions.length}
                  </span>
                  <span className="text-xl font-bold text-[var(--text-secondary)]">
                    / 4 this week
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium text-[var(--text-secondary)]">
                  Next split in rotation:{' '}
                  <span className="font-bold text-[var(--text-primary)]">
                    {STRENGTH_FOCUS_LABELS[selectedSplit]}
                  </span>
                </p>
              </div>

              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <Trophy className="h-7 w-7" />
              </div>
            </div>

            {/* 6-Step Rotating Split Cycle Progress */}
            {(() => {
              const completedSplits = new Set(
                weeklyStrengthCompletions
                  .map((c) => c.strength_focus)
                  .filter((f): f is StrengthFocus => Boolean(f))
              );
              const cycleHits = STRENGTH_SPLITS.filter((s) => completedSplits.has(s)).length;

              return (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="uppercase tracking-wider text-[var(--text-secondary)]">
                      6-Step Split Cycle
                    </span>
                    <span className="font-mono text-[var(--text-primary)]">
                      {cycleHits} / {STRENGTH_SPLITS.length} logged
                    </span>
                  </div>

                  {/* Flat 6-Segment Progress Bar */}
                  <div className="grid grid-cols-6 gap-1.5">
                    {STRENGTH_SPLITS.map((split) => {
                      const isDone = completedSplits.has(split);
                      const isActive = selectedSplit === split;
                      return (
                        <div
                          key={`bar-${split}`}
                          className={`h-2 rounded-full transition-colors ${
                            isDone
                              ? 'bg-amber-500'
                              : isActive
                                ? 'bg-slate-900 dark:bg-white'
                                : 'bg-[var(--border-subtle)]'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Numbered 6-Step Split Grid */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {STRENGTH_SPLITS.map((split, idx) => {
                      const active = selectedSplit === split;
                      const isDone = completedSplits.has(split);
                      return (
                        <button
                          key={split}
                          type="button"
                          onClick={() => setSelectedSplit(split)}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${
                            active
                              ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950'
                              : isDone
                                ? 'border-amber-500/40 bg-amber-500/10 text-[var(--text-primary)]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="font-mono text-[10px] opacity-65">
                              0{idx + 1}
                            </span>
                            <span className="truncate">
                              {STRENGTH_FOCUS_LABELS[split]}
                            </span>
                          </span>
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              isDone
                                ? active
                                  ? 'bg-amber-400'
                                  : 'bg-amber-500'
                                : active
                                  ? 'bg-white/60 dark:bg-slate-900/60'
                                  : 'bg-[var(--border-subtle)]'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="mt-6">
            <button
              type="button"
              disabled={loggingSplit}
              onClick={() => void handleLogStrengthSplit()}
              className="w-full rounded-2xl bg-amber-500 px-5 py-4 text-base font-extrabold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
            >
              {loggingSplit
                ? 'Saving...'
                : `+ Log ${STRENGTH_FOCUS_LABELS[selectedSplit]} Session`}
            </button>
          </div>
        </section>
      </div>

      {/* Row 2: Today's 1-Tap To-Do Checklist */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-[var(--text-primary)]">
              Today’s To-Do Checklist
            </h2>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              Tap the circle when you finish a workout or practice session.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-[var(--bg-app)] px-4 py-2 font-mono text-base font-bold text-[var(--text-primary)]">
              {
                todayChecklist.filter(
                  (o) => completionMap.get(`${o.sourceId}:${o.date}`)?.status === 'COMPLETED'
                ).length
              }{' '}
              / {todayChecklist.length} Done
            </span>
            <Link
              to="/runs"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              <Footprints className="h-4 w-4" />
              Log a Run
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="mt-6 text-base text-[var(--text-secondary)]">Loading today’s checklist...</p>
        ) : todayChecklist.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-app)] p-8 text-center">
            <p className="text-lg font-bold text-[var(--text-primary)]">
              Nothing scheduled for today yet
            </p>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              Add Running, Karate, Strength, Vocal, Drums, Guitar, or Keyboard blocks to build today’s checklist.
            </p>
            <Button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="mt-4 h-11 rounded-2xl px-5 text-base font-bold"
            >
              <Plus className="h-5 w-5" />
              Add Today’s First Workout
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-3.5">
            {todayChecklist.map((occ) => {
              const key = `${occ.sourceId}:${occ.date}`;
              const isDone = completionMap.get(key)?.status === 'COMPLETED';
              const isBusy = busyCompletionId === key;

              return (
                <div
                  key={occ.occurrenceKey}
                  onClick={() => void handleToggleChecklistItem(occ)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void handleToggleChecklistItem(occ);
                    }
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 transition ${
                    isDone
                      ? 'border-emerald-500/40 bg-emerald-500/8'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-app)] hover:border-slate-400 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      disabled={isBusy}
                      aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition ${
                        isDone
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-[var(--bg-surface)] text-transparent hover:border-emerald-500 dark:border-slate-600'
                      }`}
                    >
                      <Check className="h-6 w-6 stroke-[3]" />
                    </button>

                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          className={`text-lg font-extrabold ${
                            isDone
                              ? 'text-[var(--text-secondary)] line-through'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {occ.title}
                        </span>
                        <CategoryBadge category={occ.category} />
                      </div>
                      <p className="mt-1 font-mono text-sm font-medium text-[var(--text-secondary)]">
                        {occ.startTime ? `${occ.startTime}${occ.endTime ? ` – ${occ.endTime}` : ''}` : 'Anytime today'}
                        {occ.durationMin ? ` • ${occ.durationMin} min` : ''}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`hidden rounded-xl px-3.5 py-1.5 text-sm font-bold sm:inline-block ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {isDone ? 'DONE' : 'TAP TO FINISH'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Row 3: This Week's Summary (Mon - Sun) */}
      <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-[var(--text-primary)]">
              This Week’s Summary
            </h2>
            <p className="mt-1 text-base text-[var(--text-secondary)]">
              {formatDistanceKm(weeklyRunning.totalDistanceM)} running • {totalWeekCompleted} sessions checked off • {pornFree.weekStatus.filter((d) => d.completed).length}/7 clean days
            </p>
          </div>

          <Link
            to="/coach"
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-slate-400"
          >
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Ask AI Coach
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {weekSummaryDays.map((day) => (
            <div
              key={day.date}
              className={`flex flex-col justify-between rounded-2xl border p-4 ${
                day.isToday
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm font-bold ${
                    day.isToday
                      ? 'text-slate-300 dark:text-slate-600'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {day.dayLabel}
                </span>
                <span className="font-mono text-lg font-extrabold">{day.dayNum}</span>
              </div>

              <div className="mt-4 space-y-1.5">
                <p className="font-mono text-base font-extrabold">
                  {day.completedCount}/{day.totalPlanned}
                  <span className="ml-1 text-xs font-semibold opacity-75">done</span>
                </p>
                {day.runKm > 0 && (
                  <p className="font-mono text-xs font-bold text-blue-500 dark:text-blue-400">
                    🏃 {day.runKm.toFixed(1)} km
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Add Workout / Activity Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl font-extrabold text-[var(--text-primary)]">
                Add Activity for Today
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-xl p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-app)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)]">
                  Discipline
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WORKOUT_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCategory(cat)}
                      className={`rounded-xl px-3.5 py-2 text-sm font-bold transition ${
                        newCategory === cat
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                          : 'bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {ACTIVITY_CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)]">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={`e.g. ${ACTIVITY_CATEGORY_LABELS[newCategory]} Session`}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3 text-base font-medium text-[var(--text-primary)] focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)]">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3 font-mono text-base font-bold text-[var(--text-primary)] focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)]">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    step={5}
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value) || 30)}
                    className="mt-1.5 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3 font-mono text-base font-bold text-[var(--text-primary)] focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-2xl border border-[var(--border-subtle)] px-5 py-3 text-base font-bold text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={savingNew}
                  className="rounded-2xl px-6 py-3 text-base font-bold"
                >
                  {savingNew ? 'Adding...' : 'Add to Today'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
