import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import {
  Button,
  CATEGORY_COLORS,
  CATEGORY_SHORT_LABELS,
  CategoryMark,
  SPLIT_COLORS,
} from '@/design-system';
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
import { computeWeeklyRunningStats } from '@/modules/running/calculations';
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
import { PracticeDurationModal } from '@/modules/calendar/PracticeDurationModal';
import { listHabitLogs, toggleHabitLog, markHabitFailed } from '@/modules/habits/repository';
import { calculateHabitStreak, PORN_FREE_HABIT_KEY } from '@/modules/habits/streakEngine';
import { HabitHistoryModal } from '@/modules/habits/HabitHistoryModal';

const WORKOUT_CATEGORIES: ActivityCategory[] = [
  'RUNNING',
  'KARATE',
  'STRENGTH',
  'RECOVERY',
  'VOCAL',
  'DRUMMING',
  'GUITAR',
  'KEYBOARD',
  'UNIVERSITY',
  'CUSTOM',
];

const PRACTICE_DURATION_CATEGORIES = new Set<ActivityCategory>([
  'VOCAL',
  'DRUMMING',
  'GUITAR',
  'KEYBOARD',
]);

const STRENGTH_SPLITS: StrengthFocus[] = [
  'UPPER',
  'CORE',
  'LOWER',
  'FULL_BODY',
  'MOBILITY',
  'APP_REST',
];

const SHORT_SPLIT_LABELS: Record<StrengthFocus, string> = {
  UPPER: 'Upper',
  CORE: 'Core',
  LOWER: 'Lower',
  FULL_BODY: 'Full body',
  MOBILITY: 'Mobility',
  APP_REST: 'Rest',
};

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatPrettyTime(timeStr: string | null | undefined): string {
  if (!timeStr) return 'Anytime';
  const [hh, mm] = timeStr.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

function GoalPathArt() {
  return (
    <svg
      className="pointer-events-none absolute -top-2.5 right-1 h-[120px] w-[170px]"
      viewBox="0 0 220 155"
      aria-hidden="true"
    >
      <circle cx="165" cy="42" r="24" fill="var(--yellow)" />
      <path
        d="M21 126 C65 128,79 77,119 88 S174 120,199 87"
        stroke="var(--art-blue)"
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="37" cy="117" r="11" fill="var(--art-blue)" />
      <circle cx="110" cy="87" r="11" fill="var(--art-blue)" />
      <circle cx="192" cy="91" r="11" fill="var(--art-blue)" />
      <path
        d="M42 44h41m-20-18v36M150 126h38"
        stroke="var(--line-strong)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
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

  const [togglingHabitDate, setTogglingHabitDate] = useState<string | null>(null);
  const [showHabitHistory, setShowHabitHistory] = useState(false);
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

  useEffect(() => {
    if (!showAddModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showAddModal]);

  // 1. Porn-Free Streak Summary
  const pornFree = useMemo(
    () => calculateHabitStreak(PORN_FREE_HABIT_KEY, habitLogs, today),
    [habitLogs, today]
  );

  const habitCompletedSet = useMemo(
    () => new Set(habitLogs.filter((l) => l.completed).map((l) => l.log_date)),
    [habitLogs]
  );

  const habitFailedSet = useMemo(
    () => new Set(habitLogs.filter((l) => !l.completed).map((l) => l.log_date)),
    [habitLogs]
  );

  const failedPornFreeToday = habitFailedSet.has(today);

  async function handleFailPornFree() {
    if (!user || togglingHabitDate) return;
    if (!window.confirm('Mark today as failed and reset your Porn-Free streak to 0?')) return;
    setTogglingHabitDate(today);
    try {
      await markHabitFailed(user.id, PORN_FREE_HABIT_KEY, today);
      const updated = await listHabitLogs(user.id, PORN_FREE_HABIT_KEY);
      setHabitLogs(updated);
    } finally {
      setTogglingHabitDate(null);
    }
  }

  async function handleTogglePornFreeDate(dateIso: string) {
    if (!user || togglingHabitDate || dateIso > today || habitFailedSet.has(dateIso)) return;
    setTogglingHabitDate(dateIso);
    const nextValue = !habitCompletedSet.has(dateIso);
    try {
      await toggleHabitLog(user.id, PORN_FREE_HABIT_KEY, dateIso, nextValue);
      const updated = await listHabitLogs(user.id, PORN_FREE_HABIT_KEY);
      setHabitLogs(updated);
    } finally {
      setTogglingHabitDate(null);
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

  const [practiceOcc, setPracticeOcc] = useState<(typeof todayChecklist)[number] | null>(null);

  const todayDoneCount = useMemo(
    () =>
      todayChecklist.filter(
        (o) => completionMap.get(`${o.sourceId}:${o.date}`)?.status === 'COMPLETED'
      ).length,
    [todayChecklist, completionMap]
  );

  async function handleToggleChecklistItem(occ: (typeof todayChecklist)[number]) {
    if (!user || busyCompletionId) return;
    if (PRACTICE_DURATION_CATEGORIES.has(occ.category)) {
      setPracticeOcc(occ);
      return;
    }

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

  // 3. Strength Counter & 6-Step Rotating Split Log
  const weeklyStrengthCompletions = useMemo(() => {
    return completions.filter((c) => {
      if (c.status !== 'COMPLETED') return false;
      if (c.strength_focus && c.strength_focus !== 'APP_REST') return true;
      const blk = blocks.find((b) => b.id === c.block_id);
      return blk?.category === 'STRENGTH';
    });
  }, [completions, blocks]);

  const loggedSplitSet = useMemo(() => {
    return new Set(
      completions
        .filter((c) => c.strength_focus)
        .map((c) => c.strength_focus as StrengthFocus)
    );
  }, [completions]);

  useEffect(() => {
    const lastFocus =
      weeklyStrengthCompletions[weeklyStrengthCompletions.length - 1]?.strength_focus;
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

      const currentIdx = STRENGTH_SPLITS.indexOf(selectedSplit);
      if (currentIdx >= 0) {
        setSelectedSplit(STRENGTH_SPLITS[(currentIdx + 1) % STRENGTH_SPLITS.length]);
      }
    } finally {
      setLoggingSplit(false);
    }
  }

  // 4. Weekly Summary Metrics (Mon-Sun)
  const weeklyRunning = useMemo(
    () => computeWeeklyRunningStats(sessions, today),
    [sessions, today]
  );

  const weekRecordedRunCount = useMemo(
    () =>
      sessions.filter((s) => s.session_date >= weekStart && s.session_date <= weekEnd)
        .length,
    [sessions, weekStart, weekEnd]
  );

  const weekSummaryDays = useMemo(() => {
    const dates = getWeekDatesIso(weekStart);
    return dates.map((date, idx) => {
      const dayOccs = weekOccurrences.filter((o) => o.date === date);
      const completedCount = dayOccs.filter(
        (o) => completionMap.get(`${o.sourceId}:${date}`)?.status === 'COMPLETED'
      ).length;

      return {
        date,
        dayInitial: DAY_SHORT[idx].slice(0, 1),
        dayNum: Number(date.slice(-2)),
        totalPlanned: dayOccs.length,
        completedCount,
        isToday: date === today,
      };
    });
  }, [weekStart, weekOccurrences, completionMap, today]);

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

  const selectedSplitIdx = Math.max(0, STRENGTH_SPLITS.indexOf(selectedSplit));
  const cycleHits = STRENGTH_SPLITS.filter((s) => loggedSplitSet.has(s)).length;
  const cleanDaysThisWeek = pornFree.weekStatus.filter((d) => d.completed).length;

  const activePracticeCompletion = practiceOcc
    ? completionMap.get(`${practiceOcc.sourceId}:${practiceOcc.date}`)
    : undefined;

  return (
    <div className="space-y-7">
      {/* Stride Compact Editorial Page Heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
            A little better, <em className="not-italic text-[var(--blue)]">every day.</em>
          </h1>
        </div>

        <div className="shrink-0">
          <Button type="button" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            <span>Quick add</span>
          </Button>
        </div>
      </div>

      {/* Section Label */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.12em] text-[var(--ink)]">
            YOUR DAILY ANCHORS
          </span>
          
        </div>

        {/* Row 1: Two Daily Anchor Cards */}
        <div className="grid gap-[18px] lg:grid-cols-[0.93fr_1.07fr]">
          {/* 01 / Porn-Free Streak Card */}
          <article className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 pb-3.5 pt-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-[var(--muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#e4ad42]" />
                01 / PORN-FREE STREAK
              </span>
              <div className="flex items-center gap-2"><button type="button" onClick={() => setShowHabitHistory(true)} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)]">Past days</button><span
                className="grid h-[30px] w-[30px] place-items-center rounded-[10px] border text-[#b98529]"
                style={{
                  background: 'color-mix(in srgb, #eac566 17%, var(--surface))',
                  borderColor: 'color-mix(in srgb, #eac566 28%, var(--line))',
                }}
              >
                <Sparkles className="h-4 w-4" />
              </span></div>
            </div>

            <div className="flex flex-1 items-center justify-between gap-4 py-2">
              <div>
                <div className="font-mono text-[48px] font-extrabold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums sm:text-[54px]">
                  {pornFree.currentStreak}
                  <span className="ml-2 font-sans text-[19px] font-semibold tracking-[-0.04em] text-[var(--muted)]">
                    days
                  </span>
                </div>
                <h2 className="mt-2 text-[18px] font-bold tracking-[-0.035em] text-[var(--ink)]">
                  Stay consistent.
                </h2>
                <p className="mt-1 max-w-[250px] text-[12.5px] leading-relaxed text-[var(--muted)]">
                  Best streak: <strong className="text-[var(--ink)]">{pornFree.bestStreak}d</strong> ·{' '}
                  {cleanDaysThisWeek}/7 clean days this week.
                </p>
              </div>

              {/* Geometric Sun Orbit Graphic */}
              <div className="hidden shrink-0 place-items-center sm:grid" aria-hidden="true">
                <div className="stride-sun-orbit">
                  <span className="stride-sun-circle" />
                  <i className="absolute left-2.5 top-2 h-2 w-2 rounded-full bg-[var(--ink)]" />
                  <i className="absolute bottom-2 right-3.5 h-2 w-2 rounded-full bg-[var(--blue)]" />
                  <i className="absolute -right-1 top-10 h-1.5 w-1.5 rounded-full bg-[var(--yellow)]" />
                </div>
              </div>
            </div>

                        {/* Quick Clickable 7-Day Strip (Fix Past Days / Accidental Clicks) */}
            <div className="mb-3 grid grid-cols-7 gap-1.5">
              {pornFree.weekStatus.map((day, idx) => {
                const isFuture = day.date > today;
                const isToday = day.date === today;
                const isFailed = habitFailedSet.has(day.date);
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={isFuture || isFailed || togglingHabitDate === day.date}
                    onClick={() => void handleTogglePornFreeDate(day.date)}
                    title={
                      isFuture
                        ? day.date
                        : isFailed
                          ? `${day.date} — Failed (locked)`
                          : `${day.date} — ${day.completed ? 'Checked (tap to undo)' : 'Tap to check in'}`
                    }
                    className={`flex flex-col items-center gap-1 rounded-lg border py-1.5 text-[10px] font-semibold transition-colors ${
                      isFuture
                        ? 'cursor-not-allowed border-transparent text-[var(--faint)] opacity-40'
                        : isFailed
                          ? 'cursor-not-allowed border-red-400/50 bg-red-500/12 text-red-700 dark:text-red-300'
                          : day.completed
                            ? 'border-[#e4ad42]/55 bg-[#e4ad42]/16 text-[var(--ink)] hover:bg-[#e4ad42]/26'
                            : isToday
                              ? 'border-[var(--blue)]/50 bg-[var(--blue-lite)]/50 text-[var(--blue-ink)]'
                              : 'border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]'
                    }`}
                  >
                    <span>{DAY_SHORT[idx].slice(0, 1)}</span>
                    <span className="font-mono text-[10px] font-bold">
                      {isFailed ? '×' : day.completed ? '✓' : Number(day.date.slice(8))}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
              <span className="inline-flex items-center gap-2 text-[12px] text-[var(--muted)]">
                <span
                  className={`h-[7px] w-[7px] rounded-full ${
                    failedPornFreeToday ? 'bg-red-500' : pornFree.checkedToday ? 'bg-[#4e9c78]' : 'bg-[#d4a348]'
                  }`}
                />
                {pornFree.checkedToday ? 'Checked in today' : failedPornFreeToday ? 'Streak reset today' : "Today's check-in pending"}
              </span>
              {failedPornFreeToday ? (
                <span className="inline-flex h-[36px] items-center gap-1.5 rounded-[9px] border border-red-400/35 bg-red-500/10 px-3 text-[12px] font-bold text-red-700 dark:text-red-300">
                  <X className="h-3.5 w-3.5" />
                  <span>Failed today</span>
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={togglingHabitDate === today}
                    onClick={() => void handleFailPornFree()}
                    className="inline-flex h-[36px] items-center justify-center rounded-[9px] border border-red-400/40 bg-red-500/10 px-3 text-[12px] font-bold text-red-700 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-300"
                  >
                    I Failed
                  </button>
                  <Button
                    type="button"
                    variant={pornFree.checkedToday ? 'secondary' : 'primary'}
                    disabled={togglingHabitDate === today}
                    onClick={() => void handleTogglePornFreeDate(today)}
                    className="!min-h-[36px] !px-3.5 !py-1.5 !text-[12px]"
                  >
                    {pornFree.checkedToday ? (
                      <>
                        <X className="h-3.5 w-3.5" />
                        <span>Undo</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>{togglingHabitDate === today ? 'Saving...' : 'Check in'}</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </article>

          {/* 02 / Strength Rotation Card (6-Step Cycle) */}
          <article className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 pb-3.5 pt-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-[var(--muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#9363d3]" />
                02 / STRENGTH ROTATION
              </span>
              <span
                className="rounded-[7px] px-2.5 py-1 font-mono text-[11px] font-bold text-[var(--ink)]"
                style={{
                  background: 'color-mix(in srgb, #9363d3 11%, var(--surface))',
                }}
              >
                {weeklyStrengthCompletions.length} / 4 this week
              </span>
            </div>

            <div className="my-2.5 flex items-end justify-between gap-4">
              <div>
                
                <h2 className="mt-1 text-[28px] font-bold leading-none tracking-[-0.055em] text-[var(--ink)]">
                  <span
                    className="font-mono font-extrabold"
                    style={{ color: SPLIT_COLORS[selectedSplit] }}
                  >
                    {String(selectedSplitIdx + 1).padStart(2, '0')}
                  </span>{' '}
                  <span className="text-[22px] font-semibold">
                    {SHORT_SPLIT_LABELS[selectedSplit]}
                  </span>
                </h2>
              </div>
              <div className="mb-0.5 whitespace-nowrap font-mono text-[18px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                {cycleHits}
                <span className="ml-1 font-sans text-[11px] font-medium tracking-normal text-[var(--muted)]">
                  / 6 in cycle
                </span>
              </div>
            </div>

            {/* 6-Step Selectable Split Grid */}
            <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {STRENGTH_SPLITS.map((split, idx) => {
                const isSelected = selectedSplit === split;
                const isLogged = loggedSplitSet.has(split);
                return (
                  <button
                    key={split}
                    type="button"
                    onClick={() => setSelectedSplit(split)}
                    style={{ '--split-color': SPLIT_COLORS[split] } as CSSProperties}
                    className={`stride-split-cell flex min-h-[34px] items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[12px] font-semibold ${
                      isSelected ? 'selected font-bold' : ''
                    }`}
                  >
                    <span className="stride-split-index grid h-[22px] min-w-[24px] shrink-0 place-items-center rounded-[6px] px-1 font-mono text-[10px] font-extrabold">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate">{SHORT_SPLIT_LABELS[split]}</span>
                    {isSelected ? (
                      <Check
                        className="ml-auto h-3.5 w-3.5 shrink-0"
                        style={{ color: SPLIT_COLORS[split] }}
                      />
                    ) : isLogged ? (
                      <span
                        title="Logged this week"
                        className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: SPLIT_COLORS[split] }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
              <span />
              <Button
                type="button"
                disabled={loggingSplit}
                onClick={() => void handleLogStrengthSplit()}
                className="!min-h-[36px] !px-3.5 !py-1.5 !text-[12px]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{loggingSplit ? 'Saving...' : 'Log session'}</span>
              </Button>
            </div>
          </article>
        </div>
      </div>

      {/* Row 2: Today's Plan + Weekly & 5K Goal Sidebar */}
      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1.68fr)_minmax(290px,0.92fr)]">
        {/* Left: Today's 1-Tap Plan */}
        <section className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 pb-3.5 pt-4 sm:px-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold tracking-[0.12em] text-[var(--muted)]">
                YOUR SCHEDULE
              </div>
              <h2 className="mt-1.5 text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                Today&apos;s plan
                <span className="ml-2.5 align-middle text-[12px] font-medium tracking-normal text-[var(--faint)]">
                  {todayDoneCount} of {todayChecklist.length} done
                </span>
              </h2>
            </div>

            <Link
              to="/calendar"
              className="inline-flex items-center gap-1.5 py-1 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:text-[var(--blue)]"
            >
              <span>Open calendar</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="flex-1 border-t border-[var(--line)]">
            {loading ? (
              <div className="py-10 text-sm text-[var(--muted)]">Loading today&apos;s plan...</div>
            ) : todayChecklist.length === 0 ? (
              <div className="py-10">
                <p className="text-sm text-[var(--muted)]">
                  Nothing scheduled yet. Your day is a clean slate.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ink)] hover:text-[var(--blue)]"
                >
                  <span>Add your first block</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              todayChecklist.map((occ) => {
                const key = `${occ.sourceId}:${occ.date}`;
                const completion = completionMap.get(key);
                const isDone = completion?.status === 'COMPLETED';
                const isBusy = busyCompletionId === key;
                const catColor = CATEGORY_COLORS[occ.category];
                const isPractice = PRACTICE_DURATION_CATEGORIES.has(occ.category);
                const loggedMin = completion?.duration_min ?? null;

                return (
                  <div
                    key={occ.occurrenceKey}
                    style={{ '--cat-color': catColor } as CSSProperties}
                    className="grid min-h-[54px] grid-cols-[22px_72px_30px_minmax(0,1fr)_22px] items-center gap-3 border-b border-[var(--line)] transition-colors hover:bg-[var(--surface-2)]/40"
                  >
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleToggleChecklistItem(occ)}
                      aria-label={
                        isPractice
                          ? `Log duration for ${occ.title}`
                          : `Mark ${occ.title} ${isDone ? 'incomplete' : 'complete'}`
                      }
                      className={`grid h-5 w-5 place-items-center rounded-[6px] border-[1.5px] transition-colors ${
                        isDone
                          ? 'border-[var(--blue)] bg-[var(--blue)] text-white'
                          : 'border-[var(--line-strong)] bg-[var(--surface)] text-transparent hover:border-[var(--blue)]'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5 stroke-[2.8]" />
                    </button>

                    <div className="whitespace-nowrap font-mono text-[11.5px] font-medium text-[var(--muted)]">
                      {formatPrettyTime(occ.startTime)}
                    </div>

                    <CategoryMark category={occ.category} />

                    <button
                      type="button"
                      onClick={() => void handleToggleChecklistItem(occ)}
                      className="min-w-0 py-2 text-left"
                    >
                      <strong
                        className={`block truncate text-[13.5px] font-semibold ${
                          isDone ? 'text-[var(--faint)] line-through' : 'text-[var(--ink)]'
                        }`}
                      >
                        {occ.title}
                      </strong>
                      <span className="mt-0.5 block truncate text-[11.5px] text-[var(--muted)]">
                        <span className="stride-cat-label font-bold">
                          {CATEGORY_SHORT_LABELS[occ.category]}
                        </span>
                        {isDone && isPractice && loggedMin !== null
                          ? ` · ${loggedMin} min logged${
                              occ.durationMin && loggedMin !== occ.durationMin
                                ? ` (planned ${occ.durationMin}m)`
                                : ''
                            }`
                          : occ.durationMin
                            ? ` · ${occ.durationMin} min`
                            : ''}
                      </span>
                    </button>

                    <Link
                      to="/calendar"
                      title="Open in Calendar"
                      aria-label={`View ${occ.title} in Calendar`}
                      className="grid place-items-center text-[var(--faint)] transition-colors hover:text-[var(--ink)]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-auto flex items-center justify-between pt-3">
            <span />
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              aria-label="Add activity for today"
              className="grid h-[30px] w-[30px] place-items-center rounded-[9px] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] transition-colors hover:border-[var(--line-strong)]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Right Sidebar: Your Week + The Long Game */}
        <aside className="flex flex-col gap-[18px]">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="text-[11px] font-bold tracking-[0.12em] text-[var(--muted)]">
              AT A GLANCE
            </div>
            <h2 className="mt-1.5 text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Your week
            </h2>

            <div className="mt-3.5 grid grid-cols-7 gap-1.5">
              {weekSummaryDays.map((day) => {
                const allDone =
                  day.totalPlanned > 0 && day.completedCount >= day.totalPlanned;
                const hasPlanned = day.totalPlanned > 0;
                return (
                  <div
                    key={day.date}
                    className="flex flex-col items-center gap-2 text-[11px]"
                  >
                    <span className="font-semibold text-[var(--faint)]">
                      {day.dayInitial}
                    </span>
                    <span
                      className={`grid h-[30px] w-[28px] place-items-center rounded-[8px] font-mono text-[12px] font-semibold ${
                        day.isToday
                          ? 'bg-[var(--blue)] font-bold text-white'
                          : allDone
                            ? 'bg-[var(--blue-lite)] text-[var(--blue)]'
                            : hasPlanned
                              ? 'border border-[var(--line)] text-[var(--muted)]'
                              : 'text-[var(--muted)]'
                      }`}
                    >
                      {allDone && !day.isToday ? (
                        <Check className="h-3 w-3 stroke-[2.5]" />
                      ) : (
                        day.dayNum
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="my-3.5 h-px bg-[var(--line)]" />

            <div className="flex items-end justify-between gap-2">
              <div>
                <span className="text-[11.5px] text-[var(--muted)]">Running this week</span>
                <strong className="mt-1 block font-mono text-[28px] font-bold leading-none tracking-[-0.055em] text-[var(--ink)]">
                  {(weeklyRunning.totalDistanceM / 1000).toFixed(1)}{' '}
                  <small className="font-sans text-[14px] font-semibold tracking-normal text-[var(--muted)]">
                    km
                  </small>
                </strong>
              </div>
              <span className="pb-1 text-[11.5px] text-[var(--muted)]">
                {weekRecordedRunCount} recorded run{weekRecordedRunCount === 1 ? '' : 's'}
              </span>
            </div>

            <Link
              to="/runs"
              className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:text-[var(--blue)]"
            >
              <span>View running log</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </section>

          <section className="relative flex-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--blue-lite)] px-5 pb-4 pt-0">
            <div className="relative h-[68px] overflow-hidden">
              <GoalPathArt />
            </div>
            <div className="text-[11px] font-bold tracking-[0.12em] text-[var(--muted)]">
              THE LONG GAME
            </div>
            <h2 className="mt-1.5 text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              One step closer.
            </h2>
            <p className="mt-1.5 max-w-[290px] text-[12.5px] leading-relaxed text-[var(--muted)]">
              First, a sub-20 minute 5K. Then, 17:30. Build consistency before speed.
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-4">
              <Link
                to="/runs"
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:text-[var(--blue)]"
              >
                <span>Your running goals</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </aside>
      </div>

      {/* Big Tactile Practice Duration Modal (Vocal / Drumming / Guitar / Keyboard) */}
      {practiceOcc && user && (
        <PracticeDurationModal
          title={practiceOcc.title}
          category={practiceOcc.category}
          dateLabel={practiceOcc.date}
          plannedMin={practiceOcc.durationMin ?? 30}
          initialActualMin={activePracticeCompletion?.duration_min}
          initialNotes={activePracticeCompletion?.notes}
          isCompleted={activePracticeCompletion?.status === 'COMPLETED'}
          saving={busyCompletionId === `${practiceOcc.sourceId}:${practiceOcc.date}`}
          onSave={async (actualMin, notes) => {
            const key = `${practiceOcc.sourceId}:${practiceOcc.date}`;
            setBusyCompletionId(key);
            try {
              await upsertScheduleCompletion(user.id, {
                block_id: practiceOcc.sourceId,
                occurrence_date: practiceOcc.date,
                status: 'COMPLETED',
                strength_focus: null,
                duration_min: actualMin,
                physical_load: practiceOcc.physicalLoad,
                notes,
              });
              const fresh = await listScheduleCompletions(user.id, weekStart, weekEnd);
              setCompletions(fresh);
            } finally {
              setBusyCompletionId(null);
            }
          }}
          onUndo={
            activePracticeCompletion?.status === 'COMPLETED'
              ? async () => {
                  const key = `${practiceOcc.sourceId}:${practiceOcc.date}`;
                  setBusyCompletionId(key);
                  try {
                    await deleteScheduleCompletion(user.id, practiceOcc.sourceId, practiceOcc.date);
                    const fresh = await listScheduleCompletions(user.id, weekStart, weekEnd);
                    setCompletions(fresh);
                  } finally {
                    setBusyCompletionId(null);
                  }
                }
              : undefined
          }
          onClose={() => setPracticeOcc(null)}
        />
      )}

      {/* Past Days Habit History Modal */}
      {showHabitHistory && (
        <HabitHistoryModal
          title="Porn-Free Streak History"
          todayIso={today}
          completedDates={habitCompletedSet}
          failedDates={habitFailedSet}
          currentStreak={pornFree.currentStreak}
          bestStreak={pornFree.bestStreak}
          busyDate={togglingHabitDate}
          onToggleDate={handleTogglePornFreeDate}
          onClose={() => setShowHabitHistory(false)}
        />
      )}

      {/* Stride Quick Add Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add activity for today"
            className="w-full max-w-[520px] rounded-[17px] border border-[var(--line)] bg-[var(--surface)] p-7 text-[var(--ink)] shadow-2xl"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <div className="text-[11px] font-bold tracking-[0.12em] text-[var(--muted)]">
                  ADD TO TODAY
                </div>
                <h3 className="mt-2 text-[26px] font-bold tracking-[-0.045em] text-[var(--ink)]">
                  Schedule a block
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="grid gap-4">
              <label className="flex flex-col gap-2 text-[12px] font-semibold">
                <span>Title</span>
                <input
                  type="text"
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={`e.g. ${ACTIVITY_CATEGORY_LABELS[newCategory]} session`}
                  className="w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[13px] font-normal text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none"
                />
              </label>

              <div>
                <span className="block text-[12px] font-semibold">Activity</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {WORKOUT_CATEGORIES.map((cat) => {
                    const active = newCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setNewCategory(cat)}
                        style={{ '--cat-color': CATEGORY_COLORS[cat] } as CSSProperties}
                        className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                          active
                            ? 'stride-cat-mark border-[var(--cat-color)] font-bold'
                            : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]'
                        }`}
                      >
                        {CATEGORY_SHORT_LABELS[cat]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <label className="flex flex-col gap-2 text-[12px] font-semibold">
                  <span>Start time</span>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2.5 font-mono text-[13px] font-medium text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-2 text-[12px] font-semibold">
                  <span>Duration (minutes)</span>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    step={5}
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value) || 30)}
                    className="w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2.5 font-mono text-[13px] font-medium text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none"
                  />
                </label>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2.5 border-t border-[var(--line)] pt-5">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={savingNew}>
                  <span>{savingNew ? 'Saving...' : 'Save block'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
