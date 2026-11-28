import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { DuoIcon, type DuoIconName } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, mapCategoryToDomain, type DomainId } from '@/design-system/v2Theme';
import { useFeedback } from '@/components/feedback/FeedbackContext';
import { OneStepCloserCard } from '@/components/v2/OneStepCloserCard';
import { MomentumHorizonCard } from '@/components/v2/MomentumHorizonCard';
import { WeeklyRhythmCard, type DomainRhythmStat } from '@/components/v2/WeeklyRhythmCard';
import { UrgeShieldOverlay } from '@/components/v2/UrgeShieldOverlay';
import { V2BlockModal } from '@/components/v2/V2BlockModal';
import { HabitHistoryModal } from '@/modules/habits/HabitHistoryModal';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { listRunningSessions } from '@/modules/running/repository';
import {
  createScheduleBlock,
  deleteScheduleBlock,
  deleteScheduleCompletion,
  listScheduleBlocks,
  listScheduleCompletions,
  updateScheduleBlock,
  upsertScheduleCompletion,
} from '@/modules/calendar/repository';
import { addDaysIso, getIsoWeekday } from '@/modules/calendar/scheduleEngine';
import { listHabitLogs, markHabitFailed, toggleHabitLog } from '@/modules/habits/repository';
import { calculateHabitStreak, PORN_FREE_HABIT_KEY } from '@/modules/habits/streakEngine';
import {
  loadRitualConfig,
  loadRitualDoneIds,
  saveRitualDoneIds,
} from '@/modules/rituals/ritualStorage';
import {
  STRENGTH_FOCUS_LOAD,
  type HabitLog,
  type RunningSession,
  type ScheduleBlock,
  type ScheduleBlockDraft,
  type ScheduleCompletion,
  type StrengthFocus,
} from '@/types/domain';

const STRENGTH_SLOTS: { focus: StrengthFocus; code: string; name: string }[] = [
  { focus: 'UPPER', code: '01', name: 'Upper' },
  { focus: 'CORE', code: '02', name: 'Core' },
  { focus: 'LOWER', code: '03', name: 'Lower' },
  { focus: 'FULL_BODY', code: '04', name: 'Full Body' },
  { focus: 'MOBILITY', code: '05', name: 'Mobility' },
  { focus: 'APP_REST', code: '06', name: 'Rest' },
];

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    dow: days[dt.getUTCDay()],
    letter: days[dt.getUTCDay()][0],
    dayNum: d,
    short: `${months[dt.getUTCMonth()]} ${d}`,
  };
}

function fmtTime12(hhmm: string | null): string {
  if (!hhmm) return 'Anytime';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function occursOnDate(block: ScheduleBlock, dateIso: string): boolean {
  if (block.is_recurring && block.recurrence_days.length > 0) {
    return block.recurrence_days.includes(getIsoWeekday(dateIso));
  }
  if (!block.start_time && !block.is_recurring) return false;
  return block.block_date === dateIso;
}

export function OverviewPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { triggerConfetti, pushToast } = useFeedback();

  const isDark = resolvedTheme === 'dark';
  const T = useMemo(() => getV2Theme(isDark), [isDark]);

  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = useMemo(() => getLocalDateString(new Date(), tz), [tz]);
  const weekStart = useMemo(() => getMondayWeekStart(today), [today]);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart]
  );
  const weekEnd = weekDates[6];

  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [completions, setCompletions] = useState<ScheduleCompletion[]>([]);
  const [runs, setRuns] = useState<RunningSession[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [togglingHabitDate, setTogglingHabitDate] = useState<string | null>(null);
  const [showHabitHistory, setShowHabitHistory] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);

  const [selectedSlotIdx, setSelectedSlotIdx] = useState(0);
  const [loggingStrength, setLoggingStrength] = useState(false);
  const [togglingBlockId, setTogglingBlockId] = useState<string | null>(null);

  const [blockModal, setBlockModal] = useState<{ open: boolean; block: ScheduleBlock | null }>({
    open: false,
    block: null,
  });
  const [savingBlock, setSavingBlock] = useState(false);

  const shieldStorageKey = user ? `stride_urge_deflected_${user.id}` : 'stride_urge_deflected';
  const [urgesDeflected, setUrgesDeflected] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(shieldStorageKey) || '0') || 0;
    } catch {
      return 0;
    }
  });

  const ritualConfig = useMemo(() => loadRitualConfig(user?.id ?? 'guest'), [user?.id]);
  const [ritualDoneIds, setRitualDoneIds] = useState<string[]>(() =>
    loadRitualDoneIds(user?.id ?? 'guest', today)
  );

  useEffect(() => {
    setRitualDoneIds(loadRitualDoneIds(user?.id ?? 'guest', today));
  }, [user?.id, today]);

  const rituals = useMemo(
    () => ({
      morning: ritualConfig.morning.map((item) => ({
        ...item,
        done: ritualDoneIds.includes(item.id),
      })),
      evening: ritualConfig.evening.map((item) => ({
        ...item,
        done: ritualDoneIds.includes(item.id),
      })),
    }),
    [ritualConfig, ritualDoneIds]
  );

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [blks, comps, runList, habits] = await Promise.all([
        listScheduleBlocks(user.id),
        listScheduleCompletions(user.id, weekStart, weekEnd),
        listRunningSessions(user.id),
        listHabitLogs(user.id, PORN_FREE_HABIT_KEY),
      ]);
      setBlocks(blks);
      setCompletions(comps);
      setRuns(runList);
      setHabitLogs(habits);
    } finally {
      setLoading(false);
    }
  }, [user, weekStart, weekEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Clean Streak telemetry
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

  const failedToday = habitFailedSet.has(today);
  const cleanThisWeek = weekDates.filter((d) => habitCompletedSet.has(d)).length;

  // Strength completions this week
  const strengthCompletions = useMemo(
    () => completions.filter((c) => c.status === 'COMPLETED' && c.strength_focus !== null),
    [completions]
  );

  const loggedFocusSet = useMemo(
    () => new Set(strengthCompletions.map((c) => c.strength_focus).filter(Boolean) as StrengthFocus[]),
    [strengthCompletions]
  );

  const strengthGoal = 4;
  const activeSlot = STRENGTH_SLOTS[selectedSlotIdx] ?? STRENGTH_SLOTS[0];

  // Completion lookup: `${blockId}__${dateIso}`
  const completionMap = useMemo(() => {
    const map = new Map<string, ScheduleCompletion>();
    for (const c of completions) {
      map.set(`${c.block_id}__${c.occurrence_date}`, c);
    }
    return map;
  }, [completions]);

  // Today's blocks
  const todayBlocks = useMemo(() => {
    return blocks
      .filter((b) => occursOnDate(b, today))
      .sort((a, b) => (a.start_time ?? '23:59').localeCompare(b.start_time ?? '23:59'));
  }, [blocks, today]);

  const doneTodayCount = useMemo(
    () =>
      todayBlocks.filter((b) => completionMap.get(`${b.id}__${today}`)?.status === 'COMPLETED')
        .length,
    [todayBlocks, completionMap, today]
  );

  // Running stats
  const weeklyRunKm = useMemo(() => {
    return runs
      .filter((r) => r.session_date >= weekStart && r.session_date <= weekEnd)
      .reduce((acc, r) => acc + (r.distance_m || 0) / 1000, 0);
  }, [runs, weekStart, weekEnd]);

  const currentFiveKSec = useMemo(() => {
    const fiveKs = runs.filter((r) => r.distance_m >= 4800 && r.distance_m <= 5300 && r.duration_s > 0);
    if (fiveKs.length > 0) {
      return Math.min(...fiveKs.map((r) => Math.round((r.duration_s / r.distance_m) * 5000)));
    }
    const valid = runs.filter((r) => r.distance_m >= 1000 && r.duration_s > 0);
    if (valid.length > 0) {
      const bestPace = Math.min(...valid.map((r) => (r.duration_s / r.distance_m) * 1000));
      return Math.round(bestPace * 5);
    }
    return null;
  }, [runs]);

  // Weekly rhythm domain stats
  const rhythmStats: DomainRhythmStat[] = useMemo(() => {
    const domains: DomainId[] = ['running', 'strength', 'karate', 'music'];
    return domains.map((dom) => {
      let total = 0;
      let done = 0;
      for (const iso of weekDates) {
        for (const blk of blocks) {
          if (mapCategoryToDomain(blk.category) === dom && occursOnDate(blk, iso)) {
            total++;
            if (completionMap.get(`${blk.id}__${iso}`)?.status === 'COMPLETED') {
              done++;
            }
          }
        }
      }
      if (dom === 'running') {
        const weekRuns = runs.filter((r) => r.session_date >= weekStart && r.session_date <= weekEnd).length;
        done = Math.max(done, weekRuns);
        total = Math.max(total, weekRuns, 3);
      }
      if (dom === 'strength') {
        done = Math.max(done, strengthCompletions.length);
        total = Math.max(total, strengthGoal);
      }
      return { id: dom, done, total };
    });
  }, [blocks, weekDates, completionMap, runs, weekStart, weekEnd, strengthCompletions.length]);

  // Handlers
  async function handleTogglePornFreeDate(dateIso: string, e?: MouseEvent) {
    if (!user || togglingHabitDate || dateIso > today || habitFailedSet.has(dateIso)) return;
    setTogglingHabitDate(dateIso);
    const nextVal = !habitCompletedSet.has(dateIso);
    try {
      await toggleHabitLog(user.id, PORN_FREE_HABIT_KEY, dateIso, nextVal);
      const updated = await listHabitLogs(user.id, PORN_FREE_HABIT_KEY);
      setHabitLogs(updated);
      if (nextVal) {
        triggerConfetti(e?.clientX, e?.clientY);
        pushToast('Clean day locked in!', '#10B981');
      }
    } finally {
      setTogglingHabitDate(null);
    }
  }

  async function handleFailPornFree() {
    if (!user || togglingHabitDate) return;
    if (!window.confirm('Mark today as failed and reset your Clean Streak to 0?')) return;
    setTogglingHabitDate(today);
    try {
      await markHabitFailed(user.id, PORN_FREE_HABIT_KEY, today);
      const updated = await listHabitLogs(user.id, PORN_FREE_HABIT_KEY);
      setHabitLogs(updated);
      pushToast('Reset logged · Fresh start', '#E11D48');
    } finally {
      setTogglingHabitDate(null);
    }
  }

  function handleUrgeDeflected() {
    const next = urgesDeflected + 1;
    setUrgesDeflected(next);
    try {
      localStorage.setItem(shieldStorageKey, String(next));
    } catch {
      // ignore
    }
    setShieldOpen(false);
    triggerConfetti();
    pushToast('Urge deflected · Streak protected', '#10B981');
  }

  async function handleLogStrength(e: MouseEvent) {
    if (!user || loggingStrength) return;
    setLoggingStrength(true);
    try {
      let targetBlock = blocks.find((b) => b.category === 'STRENGTH');
      if (!targetBlock) {
        targetBlock = await createScheduleBlock(user.id, {
          title: 'Home Strength',
          category: 'STRENGTH',
          block_date: today,
          start_time: '06:45',
          end_time: '07:15',
          duration_min: 30,
          is_recurring: true,
          recurrence_days: [1, 2, 4, 6],
          status: 'PLANNED',
          physical_load: 'MODERATE',
          notes: null,
        });
      }

      await upsertScheduleCompletion(user.id, {
        block_id: targetBlock.id,
        occurrence_date: today,
        status: 'COMPLETED',
        strength_focus: activeSlot.focus,
        duration_min: targetBlock.duration_min ?? 30,
        physical_load: STRENGTH_FOCUS_LOAD[activeSlot.focus],
        notes: `${activeSlot.code} ${activeSlot.name}`,
      });

      triggerConfetti(e.clientX, e.clientY);
      pushToast(`${activeSlot.code} ${activeSlot.name} logged!`, '#7C3AED');
      setSelectedSlotIdx((idx) => (idx + 1) % STRENGTH_SLOTS.length);
      await loadData();
    } finally {
      setLoggingStrength(false);
    }
  }

  function handleToggleRitual(id: string, e: MouseEvent) {
    setRitualDoneIds((prev) => {
      const already = prev.includes(id);
      if (!already) triggerConfetti(e.clientX, e.clientY);
      const next = already ? prev.filter((x) => x !== id) : [...prev, id];
      saveRitualDoneIds(user?.id ?? 'guest', today, next);
      return next;
    });
  }

  async function handleToggleTodayBlock(block: ScheduleBlock, e: MouseEvent) {
    if (!user || togglingBlockId) return;
    setTogglingBlockId(block.id);
    const existing = completionMap.get(`${block.id}__${today}`);
    try {
      if (existing?.status === 'COMPLETED') {
        await deleteScheduleCompletion(user.id, block.id, today);
      } else {
        await upsertScheduleCompletion(user.id, {
          block_id: block.id,
          occurrence_date: today,
          status: 'COMPLETED',
          strength_focus: block.category === 'STRENGTH' ? activeSlot.focus : null,
          duration_min: block.duration_min ?? 30,
          physical_load: block.physical_load,
          notes: null,
        });
        triggerConfetti(e.clientX, e.clientY);
        pushToast(`${block.title} completed!`, '#10B981');
      }
      const freshComps = await listScheduleCompletions(user.id, weekStart, weekEnd);
      setCompletions(freshComps);
    } finally {
      setTogglingBlockId(null);
    }
  }

  async function handleSaveBlock(draft: ScheduleBlockDraft, existingId: string | null) {
    if (!user) return;
    setSavingBlock(true);
    try {
      if (existingId) {
        await updateScheduleBlock(user.id, existingId, draft);
        pushToast('Block updated', '#2563EB');
      } else {
        await createScheduleBlock(user.id, draft);
        pushToast('Block added', '#2563EB');
      }
      setBlockModal({ open: false, block: null });
      await loadData();
    } finally {
      setSavingBlock(false);
    }
  }

  async function handleDeleteBlock(blockId: string) {
    if (!user) return;
    setSavingBlock(true);
    try {
      await deleteScheduleBlock(user.id, blockId);
      setBlockModal({ open: false, block: null });
      pushToast('Block deleted', '#DB2777');
      await loadData();
    } finally {
      setSavingBlock(false);
    }
  }

  const todayFmt = fmtDate(today);
  const circ = 2 * Math.PI * 38;
  const ringRatio = Math.min(1, Math.max(0.12, cleanThisWeek / 7));
  const readDom = getDom('reading', isDark);
  const runDom = getDom('running', isDark);
  const strDom = getDom('strength', isDark);

  return (
    <div className="animate-pop space-y-6 sm:space-y-8">
      {/* Hero Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span
            className={`mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider ${T.card} ${T.muted}`}
          >
            <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
            {todayFmt.dow} · {todayFmt.short}
          </span>
          <h1
            className={`font-display text-3xl font-extrabold leading-none tracking-tight sm:text-4xl ${T.text}`}
          >
            A little better,{' '}
            <span className={isDark ? 'text-[#60A5FA]' : 'text-[#2563EB]'}>every day.</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setBlockModal({ open: true, block: null })}
          className={`inline-flex cursor-pointer items-center gap-2 self-start rounded-xl px-5 py-2.5 font-display text-sm font-bold sm:self-auto ${T.btnPrimary}`}
        >
          <span className="text-base leading-none">+</span> Quick add
        </button>
      </div>

      {/* YOUR DAILY ANCHORS (2-Column Grid) */}
      <section className="space-y-3">
        <span className={`text-[11px] font-extrabold uppercase tracking-widest ${T.muted}`}>
          YOUR DAILY ANCHORS
        </span>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Card 1 — 01 / CLEAN STREAK */}
          <div className={`flex flex-col justify-between gap-5 rounded-3xl border p-6 ${T.card}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span
                  className={`text-[11px] font-extrabold uppercase tracking-widest ${
                    isDark ? 'text-[#34D399]' : 'text-[#059669]'
                  }`}
                >
                  01 / CLEAN STREAK
                </span>
                <div className="mt-2 flex items-baseline gap-2.5">
                  <span
                    className={`font-display text-5xl font-extrabold tracking-tight tabular-nums ${T.text}`}
                  >
                    {pornFree.currentStreak}
                  </span>
                  <span className={`font-display text-xl font-bold ${T.muted}`}>
                    {pornFree.currentStreak === 1 ? 'day' : 'days'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-xl border px-2.5 py-1 text-xs font-extrabold tabular-nums ${readDom.soft} ${readDom.border} ${readDom.text}`}
                  >
                    Best: {pornFree.bestStreak}d · {cleanThisWeek}/7 wk
                  </span>
                  {urgesDeflected > 0 && (
                    <span
                      className={`rounded-xl border px-2.5 py-1 text-xs font-extrabold tabular-nums ${runDom.soft} ${runDom.border} ${runDom.text}`}
                    >
                      Shielded: {urgesDeflected}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowHabitHistory(true)}
                    className={`cursor-pointer rounded-xl px-2.5 py-1 text-xs font-bold ${T.btnNeutral}`}
                  >
                    Past days
                  </button>
                </div>
              </div>

              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 92 92">
                  <circle
                    cx="46"
                    cy="46"
                    r="38"
                    stroke={T.ringTrack}
                    strokeWidth="9"
                    fill={isDark ? '#0B0B0B' : '#F0FDF4'}
                  />
                  <circle
                    cx="46"
                    cy="46"
                    r="38"
                    stroke={T.ringFill}
                    strokeWidth="9"
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - ringRatio)}
                    className="transition-all duration-300"
                  />
                </svg>
                <div className={`absolute ${isDark ? 'text-[#34D399]' : 'text-[#059669]'}`}>
                  <DuoIcon name="flame" className="h-11 w-11" />
                </div>
              </div>
            </div>

            {/* 7-Day Interactive Status Pills */}
            <div className="grid grid-cols-7 gap-1.5">
              {weekDates.map((iso) => {
                const f = fmtDate(iso);
                const isFuture = iso > today;
                const isToday = iso === today;
                const isFailed = habitFailedSet.has(iso);
                const isClean = !isFailed && habitCompletedSet.has(iso);

                let pillStyle = `${T.cardSubtle} ${T.muted}`;
                let mark = (
                  <span
                    className={`h-2 w-2 rounded-full ${isDark ? 'bg-[#333333]' : 'bg-[#CBD5E1]'}`}
                  />
                );

                if (isClean) {
                  pillStyle = isDark
                    ? 'bg-[#10B981]/15 border-[#34D399]/35 text-[#34D399]'
                    : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#059669]';
                  mark = <span className="text-xs font-extrabold">✓</span>;
                } else if (isFailed) {
                  pillStyle = isDark
                    ? 'bg-[#E11D48]/15 border-[#FB7185]/35 text-[#FB7185] cursor-not-allowed'
                    : 'bg-[#FFF1F2] border-[#FECDD3] text-[#E11D48] cursor-not-allowed';
                  mark = <span className="text-xs font-extrabold">✕</span>;
                } else if (isToday) {
                  pillStyle = isDark
                    ? 'bg-[#2563EB]/20 border-[#60A5FA] text-[#60A5FA]'
                    : 'bg-[#EFF6FF] border-[#2563EB] text-[#2563EB]';
                  mark = <span className="h-2.5 w-2.5 rounded-full bg-[#2563EB]" />;
                } else if (isFuture) {
                  pillStyle = `${T.cardSubtle} ${T.muted} opacity-45 cursor-not-allowed`;
                }

                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={isFuture || isFailed || togglingHabitDate === iso}
                    onClick={(e) => void handleTogglePornFreeDate(iso, e)}
                    title={
                      isFuture
                        ? `${iso} (future)`
                        : isFailed
                          ? `${iso} — Failed (locked)`
                          : `${iso} — ${isClean ? 'Checked (tap to undo)' : 'Tap to check in'}`
                    }
                    className={`flex flex-col items-center rounded-2xl border py-2.5 transition-all active:scale-[0.97] ${
                      isFuture || isFailed ? '' : 'cursor-pointer'
                    } ${pillStyle}`}
                  >
                    <span className="text-[10px] font-extrabold uppercase">{f.letter}</span>
                    <span className="mt-0.5 font-display text-sm font-extrabold tabular-nums">
                      {f.dayNum}
                    </span>
                    <span className="mt-1 flex h-4 items-center justify-center">{mark}</span>
                  </button>
                );
              })}
            </div>

            {/* Bottom Action Bar */}
            <div className={`flex flex-wrap items-center justify-between gap-2 border-t pt-3 ${T.divider}`}>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-extrabold ${
                  pornFree.checkedToday
                    ? isDark
                      ? 'text-[#34D399]'
                      : 'text-[#059669]'
                    : failedToday
                      ? isDark
                        ? 'text-[#FB7185]'
                        : 'text-[#E11D48]'
                      : isDark
                        ? 'text-[#FB923C]'
                        : 'text-[#EA580C]'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    pornFree.checkedToday
                      ? 'bg-[#10B981]'
                      : failedToday
                        ? 'bg-[#E11D48]'
                        : 'bg-[#EA580C]'
                  }`}
                />
                {pornFree.checkedToday ? 'Checked in' : failedToday ? 'Reset today' : 'Pending'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShieldOpen(true)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 font-display text-xs font-bold transition-all active:scale-[0.98] sm:text-sm ${
                    isDark
                      ? 'border border-[#3B82F6]/30 bg-[#2563EB]/15 text-[#60A5FA] hover:bg-[#2563EB]/25'
                      : 'border border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE]'
                  }`}
                >
                  <DuoIcon name="shield" className="h-4 w-4" />
                  <span>Shield</span>
                </button>

                {failedToday ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-xl border px-3.5 py-2 font-display text-xs font-bold sm:text-sm ${
                      isDark
                        ? 'border-[#FB7185]/30 bg-[#E11D48]/15 text-[#FB7185]'
                        : 'border-[#FECDD3] bg-[#FFF1F2] text-[#E11D48]'
                    }`}
                  >
                    ✕ Failed today
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={togglingHabitDate === today}
                      onClick={() => void handleFailPornFree()}
                      className={`cursor-pointer rounded-xl px-3.5 py-2 font-display text-xs font-bold disabled:opacity-50 sm:text-sm ${T.btnDangerSoft}`}
                    >
                      Failed
                    </button>
                    <button
                      type="button"
                      disabled={togglingHabitDate === today}
                      onClick={(e) => void handleTogglePornFreeDate(today, e)}
                      className={`cursor-pointer rounded-xl px-4 py-2 font-display text-xs font-bold disabled:opacity-50 sm:text-sm ${
                        pornFree.checkedToday ? T.btnNeutral : T.btnSuccess
                      }`}
                    >
                      {togglingHabitDate === today
                        ? 'Saving...'
                        : pornFree.checkedToday
                          ? 'Undo'
                          : '✓ Check in'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Card 2 — 02 / STRENGTH ROTATION */}
          <div className={`flex flex-col justify-between gap-5 rounded-3xl border p-6 ${T.card}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] font-extrabold uppercase tracking-widest ${strDom.text}`}>
                    02 / STRENGTH ROTATION
                  </span>
                  <span
                    className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-extrabold tabular-nums ${strDom.soft} ${strDom.border} ${strDom.text}`}
                  >
                    {strengthCompletions.length} / {strengthGoal} WK
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-2.5">
                  <span className="rounded-xl bg-[#7C3AED] px-2.5 py-1 font-display text-base font-extrabold text-white tabular-nums">
                    {activeSlot.code}
                  </span>
                  <span className={`font-display text-3xl font-extrabold tracking-tight ${T.text}`}>
                    {activeSlot.name}
                  </span>
                </div>
              </div>

              <div
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border ${strDom.soft} ${strDom.border} ${strDom.text}`}
              >
                <DuoIcon name="strength" className="h-11 w-11" />
              </div>
            </div>

            {/* 2x3 Split Selector Grid */}
            <div className="grid grid-cols-3 gap-2">
              {STRENGTH_SLOTS.map((slot, idx) => {
                const isActive = idx === selectedSlotIdx;
                const isDone = loggedFocusSet.has(slot.focus);
                return (
                  <button
                    key={slot.focus}
                    type="button"
                    onClick={() => setSelectedSlotIdx(idx)}
                    className={`flex cursor-pointer items-center justify-between gap-1 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
                      isActive
                        ? isDark
                          ? 'border-[#A78BFA] bg-[#7C3AED]/20'
                          : 'border-[#7C3AED] bg-[#F5F3FF]'
                        : isDone
                          ? isDark
                            ? 'border-[#34D399]/30 bg-[#10B981]/15'
                            : 'border-[#A7F3D0] bg-[#ECFDF5]'
                          : `${T.cardSubtle} ${T.surfaceHover}`
                    }`}
                  >
                    <div className="min-w-0">
                      <span
                        className={`block text-[10px] font-extrabold tabular-nums ${
                          isActive ? strDom.text : T.muted
                        }`}
                      >
                        {slot.code}
                      </span>
                      <span className={`block truncate font-display text-xs font-bold sm:text-sm ${T.text}`}>
                        {slot.name}
                      </span>
                    </div>
                    {isDone && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#059669] text-[10px] font-extrabold text-white">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className={`flex items-center justify-between gap-2 border-t pt-3 ${T.divider}`}>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: strengthGoal }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-6 rounded-full ${
                      i < strengthCompletions.length
                        ? 'bg-[#7C3AED]'
                        : isDark
                          ? 'bg-[#262626]'
                          : 'bg-[#E5E7EB]'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                disabled={loggingStrength}
                onClick={(e) => void handleLogStrength(e)}
                className={`cursor-pointer rounded-xl px-4 py-2 font-display text-xs font-bold disabled:opacity-50 sm:text-sm ${T.btnViolet}`}
              >
                {loggingStrength ? 'Saving...' : '+ Log session'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* DAILY RITUALS (MORNING LAUNCH & EVENING SHUTDOWN) */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {(
          [
            { key: 'morning' as const, kicker: 'MORNING LAUNCH', title: 'Start clean', domId: 'karate' as DomainId, icon: 'sun' as DuoIconName },
            { key: 'evening' as const, kicker: 'EVENING SHUTDOWN', title: 'Lock tomorrow', domId: 'sleep' as DomainId, icon: 'moon' as DuoIconName },
          ]
        ).map((grp) => {
          const items = rituals[grp.key];
          const doneN = items.filter((i) => i.done).length;
          const d = getDom(grp.domId, isDark);
          return (
            <div key={grp.key} className={`space-y-3.5 rounded-3xl border p-5 ${T.card}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border ${d.soft} ${d.border} ${d.text}`}
                  >
                    <DuoIcon name={grp.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <span className={`block text-[10px] font-extrabold uppercase tracking-widest ${d.text}`}>
                      {grp.kicker}
                    </span>
                    <h3 className={`font-display text-base font-extrabold leading-tight ${T.text}`}>
                      {grp.title}
                    </h3>
                  </div>
                </div>
                <span
                  className={`rounded-xl border px-2.5 py-0.5 text-xs font-extrabold tabular-nums ${T.cardSubtle} ${T.text}`}
                >
                  {doneN}/{items.length}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(e) => handleToggleRitual(item.id, e)}
                    className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-all active:scale-[0.98] ${
                      item.done
                        ? isDark
                          ? 'border-[#34D399]/35 bg-[#10B981]/15 text-[#34D399]'
                          : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]'
                        : `${T.cardSubtle} ${T.muted} ${T.surfaceHover}`
                    }`}
                  >
                    <DuoIcon name={item.icon} className="h-6 w-6" />
                    <span
                      className={`font-display text-xs font-bold ${
                        item.done ? (isDark ? 'text-[#F5F5F5]' : 'text-[#0F172A]') : T.text
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* LOWER 2-COLUMN WORKSPACE */}
      <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left Column (8 cols) */}
        <div className="space-y-6 lg:col-span-8">
          <div className={`space-y-5 rounded-3xl border p-6 ${T.card}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className={`text-[10px] font-extrabold uppercase tracking-widest ${T.muted}`}>
                  YOUR SCHEDULE
                </span>
                <div className="mt-0.5 flex items-center gap-2.5">
                  <h2 className={`font-display text-xl font-extrabold ${T.text}`}>Today's Plan</h2>
                  <span
                    className={`rounded-xl border px-2.5 py-0.5 text-xs font-extrabold tabular-nums ${T.cardSubtle} ${T.text}`}
                  >
                    {doneTodayCount} / {todayBlocks.length} done
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBlockModal({ open: true, block: null })}
                  className={`cursor-pointer rounded-xl px-3.5 py-1.5 text-xs font-extrabold ${T.btnNeutral}`}
                >
                  + Add block
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/calendar')}
                  className={`cursor-pointer text-xs font-extrabold sm:text-sm ${
                    isDark ? 'text-[#60A5FA] hover:text-white' : 'text-[#2563EB] hover:underline'
                  }`}
                >
                  Calendar →
                </button>
              </div>
            </div>

            {loading ? (
              <div className={`rounded-2xl border p-6 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
                Loading schedule...
              </div>
            ) : todayBlocks.length === 0 ? (
              <div
                className={`rounded-2xl border border-dashed p-8 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}
              >
                Open schedule today · Tap + Add block
              </div>
            ) : (
              <div className="space-y-3">
                {todayBlocks.map((blk) => {
                  const domId = mapCategoryToDomain(blk.category);
                  const d = getDom(domId, isDark);
                  const completed = completionMap.get(`${blk.id}__${today}`)?.status === 'COMPLETED';
                  const busy = togglingBlockId === blk.id;
                  return (
                    <div
                      key={blk.id}
                      className={`flex items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                        completed
                          ? isDark
                            ? 'border-[#34D399]/30 bg-[#10B981]/10'
                            : 'border-[#A7F3D0] bg-[#ECFDF5]/60'
                          : `${T.card} ${T.surfaceHover}`
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setBlockModal({ open: true, block: blk })}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 text-left"
                      >
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border p-2.5 ${d.soft} ${d.border} ${d.text}`}
                        >
                          <DuoIcon name={domId} className="h-8 w-8" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-lg border px-2.5 py-0.5 text-xs font-extrabold tabular-nums ${T.cardSubtle} ${T.text}`}
                            >
                              {fmtTime12(blk.start_time)}
                            </span>
                            {blk.duration_min && (
                              <span
                                className={`rounded-lg px-2 py-0.5 text-xs font-extrabold tabular-nums ${d.soft} ${d.text}`}
                              >
                                {blk.duration_min}m
                              </span>
                            )}
                          </div>
                          <h3
                            className={`mt-1 truncate font-display text-base font-extrabold ${
                              completed ? `line-through ${T.muted}` : T.text
                            }`}
                          >
                            {blk.title}
                          </h3>
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => void handleToggleTodayBlock(blk, e)}
                        className={`shrink-0 cursor-pointer rounded-xl px-3.5 py-2 font-display text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50 ${
                          completed ? T.btnSuccess : T.btnNeutral
                        }`}
                      >
                        {completed ? '✓ Done' : 'Done'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <WeeklyRhythmCard
            isDark={isDark}
            stats={rhythmStats}
            onOpenAnalytics={() => navigate('/analytics')}
          />
        </div>

        {/* Right Column (4 cols) */}
        <div className="space-y-5 lg:col-span-4">
          <div className={`space-y-4 rounded-3xl border p-6 ${T.card}`}>
            <div className="flex items-center justify-between">
              <div>
                <span className={`text-[10px] font-extrabold uppercase tracking-widest ${T.muted}`}>
                  AT A GLANCE
                </span>
                <h2 className={`font-display text-lg font-extrabold ${T.text}`}>Your Week</h2>
              </div>
              <span className={`text-xs font-extrabold tabular-nums ${T.muted}`}>
                {fmtDate(weekDates[0]).short}–{fmtDate(weekDates[6]).dayNum}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {weekDates.map((iso) => {
                const f = fmtDate(iso);
                const isToday = iso === today;
                const dayBlocks = blocks.filter((b) => occursOnDate(b, iso));
                const doneN = dayBlocks.filter(
                  (b) => completionMap.get(`${b.id}__${iso}`)?.status === 'COMPLETED'
                ).length;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => navigate(`/calendar?date=${iso}&view=day`)}
                    className={`flex cursor-pointer flex-col items-center rounded-xl border py-2 transition-all active:scale-[0.97] ${
                      isToday
                        ? 'border-transparent bg-[#2563EB] text-white'
                        : `${T.cardSubtle} ${T.text} ${T.surfaceHover}`
                    }`}
                  >
                    <span className={`text-[10px] font-bold ${isToday ? 'text-blue-100' : T.muted}`}>
                      {f.letter}
                    </span>
                    <span className="mt-0.5 font-display text-xs font-extrabold tabular-nums">
                      {f.dayNum}
                    </span>
                    <span
                      className={`mt-1 h-1.5 w-1.5 rounded-full ${
                        isToday
                          ? 'bg-white'
                          : doneN > 0
                            ? 'bg-[#10B981]'
                            : isDark
                              ? 'bg-[#333333]'
                              : 'bg-[#CBD5E1]'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <OneStepCloserCard
            isDark={isDark}
            weeklyRunKm={weeklyRunKm}
            currentFiveKSec={currentFiveKSec}
            firstGoalSec={profile?.first_major_5k_goal_s}
            longTermGoalSec={profile?.long_term_5k_goal_s}
            onOpenRunning={() => navigate('/runs')}
          />

          <MomentumHorizonCard isDark={isDark} streakDays={pornFree.currentStreak} />
        </div>
      </section>

      {/* Modals & Overlays */}
      {showHabitHistory && (
        <HabitHistoryModal
          title="Clean Streak History"
          todayIso={today}
          completedDates={habitCompletedSet}
          failedDates={habitFailedSet}
          currentStreak={pornFree.currentStreak}
          bestStreak={pornFree.bestStreak}
          busyDate={togglingHabitDate}
          onToggleDate={(dateIso) => handleTogglePornFreeDate(dateIso)}
          onClose={() => setShowHabitHistory(false)}
        />
      )}

      {shieldOpen && (
        <UrgeShieldOverlay
          isDark={isDark}
          deflectedCount={urgesDeflected}
          onClose={() => setShieldOpen(false)}
          onDeflect={handleUrgeDeflected}
        />
      )}

      {blockModal.open && (
        <V2BlockModal
          isDark={isDark}
          block={blockModal.block}
          defaultDate={today}
          saving={savingBlock}
          onClose={() => setBlockModal({ open: false, block: null })}
          onSave={handleSaveBlock}
          onDelete={handleDeleteBlock}
        />
      )}
    </div>
  );
}
