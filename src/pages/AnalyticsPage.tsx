import { useEffect, useMemo, useState } from 'react';
import { DuoIcon } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, mapCategoryToDomain, type DomainId } from '@/design-system/v2Theme';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTheme } from '@/modules/theme/ThemeContext';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { addDaysIso, getIsoWeekday } from '@/modules/calendar/scheduleEngine';
import { listScheduleBlocks, listScheduleCompletions } from '@/modules/calendar/repository';
import { listRunningSessions } from '@/modules/running/repository';
import { listHabitLogs } from '@/modules/habits/repository';
import { calculateHabitStreak, PORN_FREE_HABIT_KEY } from '@/modules/habits/streakEngine';
import { extractReadingEntries } from '@/modules/reading/readingLog';
import { evaluateMonkModeReport, loadDisciplineStore } from '@/modules/monk/monkEngine';
import type {
  HabitLog,
  RunningSession,
  ScheduleBlock,
  ScheduleCompletion,
} from '@/types/domain';

const ALL_DOMAINS: DomainId[] = [
  'running',
  'strength',
  'karate',
  'music',
  'recovery',
  'sleep',
  'reading',
  'health',
];

function occursOnDate(block: ScheduleBlock, dateIso: string): boolean {
  if (!block.is_recurring && !block.start_time) return false;
  if (block.is_recurring && block.recurrence_days.length > 0) {
    return block.recurrence_days.includes(getIsoWeekday(dateIso));
  }
  return block.block_date === dateIso;
}

function fmtPace(secPerKm: number): string {
  if (!secPerKm || !Number.isFinite(secPerKm)) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function AnalyticsPage() {
  const { user, profile } = useAuth();
  const { resolvedTheme } = useTheme();
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
  const [habits, setHabits] = useState<HabitLog[]>([]);
  const [trendMode, setTrendMode] = useState<'pace' | 'monk'>('pace');

  useEffect(() => {
    if (!user) return;
    void Promise.all([
      listScheduleBlocks(user.id),
      listScheduleCompletions(user.id, weekStart, weekEnd),
      listRunningSessions(user.id),
      listHabitLogs(user.id, PORN_FREE_HABIT_KEY),
    ]).then(([b, c, r, h]) => {
      setBlocks(b);
      setCompletions(c);
      setRuns(r);
      setHabits(h);
    });
  }, [user, weekStart, weekEnd]);

  const completionMap = useMemo(() => {
    const m = new Map<string, ScheduleCompletion>();
    for (const c of completions) {
      m.set(`${c.block_id}__${c.occurrence_date}`, c);
    }
    return m;
  }, [completions]);

  const { totalScheduled, totalDone, domainHours } = useMemo(() => {
    let scheduled = 0;
    let done = 0;
    const minsByDom = new Map<DomainId, number>();

    for (const iso of weekDates) {
      for (const blk of blocks) {
        if (occursOnDate(blk, iso)) {
          scheduled++;
          const isDone = completionMap.get(`${blk.id}__${iso}`)?.status === 'COMPLETED';
          if (isDone) done++;
          const domId = mapCategoryToDomain(blk.category);
          minsByDom.set(domId, (minsByDom.get(domId) ?? 0) + (blk.duration_min ?? 30));
        }
      }
    }

    const weekRunMins = runs
      .filter((r) => r.session_date >= weekStart && r.session_date <= weekEnd)
      .reduce((acc, r) => acc + Math.round((r.duration_s || 0) / 60), 0);
    if (weekRunMins > (minsByDom.get('running') ?? 0)) {
      minsByDom.set('running', weekRunMins);
    }

    const list = ALL_DOMAINS.map((id) => ({
      id,
      hours: Number(((minsByDom.get(id) ?? 0) / 60).toFixed(1)),
    }))
      .filter((x) => x.hours > 0)
      .sort((a, b) => b.hours - a.hours);

    return { totalScheduled: scheduled, totalDone: done, domainHours: list };
  }, [blocks, weekDates, completionMap, runs, weekStart, weekEnd]);

  const pct = totalScheduled > 0 ? Math.round((totalDone / totalScheduled) * 100) : 0;
  const maxHours = Math.max(1, ...domainHours.map((x) => x.hours));

  const pornFree = useMemo(
    () => calculateHabitStreak(PORN_FREE_HABIT_KEY, habits, today),
    [habits, today]
  );

  const weeklyRunKm = useMemo(
    () =>
      runs
        .filter((r) => r.session_date >= weekStart && r.session_date <= weekEnd)
        .reduce((acc, r) => acc + (r.distance_m || 0) / 1000, 0),
    [runs, weekStart, weekEnd]
  );

  const strengthCount = useMemo(
    () => completions.filter((c) => c.status === 'COMPLETED' && c.strength_focus !== null).length,
    [completions]
  );

  const readingStreak = useMemo(() => {
    const entries = extractReadingEntries(blocks);
    const dates = new Set(entries.map((e) => e.date));
    let streak = 0;
    let cursor = dates.has(today) ? today : addDaysIso(today, -1);
    while (dates.has(cursor)) {
      streak++;
      cursor = addDaysIso(cursor, -1);
    }
    return streak;
  }, [blocks, today]);

  // Pace sparkline (last 8 runs chronologically)
  const pacePoints = useMemo(() => {
    const recent = runs
      .filter((r) => r.distance_m >= 1000 && r.duration_s > 0)
      .slice()
      .sort((a, b) => a.session_date.localeCompare(b.session_date))
      .slice(-8);
    return recent.map((r) => ({
      label: r.session_date.slice(5),
      paceSec: (r.duration_s / r.distance_m) * 1000,
    }));
  }, [runs]);

  // Monk compounding sparkline (active sprint or last 7 days)
  const monkPoints = useMemo(() => {
    const store = loadDisciplineStore(user?.id ?? 'guest');
    if (store.activeMonk) {
      const report = evaluateMonkModeReport(store.activeMonk, store.completionsByDate, today);
      const pts: { label: string; score: number }[] = [];
      let score = 1.0;
      const start = store.activeMonk.startDate;
      const total = Math.max(1, Math.min(14, report.elapsedDays));
      for (let i = 0; i < total; i++) {
        const d = addDaysIso(start, i);
        const doneIds = store.completionsByDate[d] ?? [];
        const nonNegIds = store.commitments
          .filter((c) => c.tier === 'NON_NEGOTIABLE')
          .map((c) => c.id);
        const allMet = nonNegIds.length > 0 && nonNegIds.every((id) => doneIds.includes(id));
        score = allMet ? score * 1.01 : score * 0.99;
        pts.push({ label: d.slice(5), score: Number(score.toFixed(3)) });
      }
      return pts;
    }
    return weekDates.map((d, idx) => ({
      label: d.slice(5),
      score: Number((1 + idx * 0.01).toFixed(2)),
    }));
  }, [user, today, weekDates]);

  const circ = 2 * Math.PI * 54;

  // Build clean SVG polyline for active trend
  const sparkData = useMemo(() => {
    if (trendMode === 'pace') {
      if (pacePoints.length < 2) return null;
      const minP = Math.min(...pacePoints.map((p) => p.paceSec));
      const maxP = Math.max(...pacePoints.map((p) => p.paceSec));
      const span = Math.max(10, maxP - minP);
      // Faster pace (lower seconds) sits higher on the chart
      const coords = pacePoints.map((p, i) => {
        const x = 24 + (i / (pacePoints.length - 1)) * 552;
        const y = 96 - ((maxP - p.paceSec) / span) * 68;
        return { x, y, label: p.label, display: fmtPace(p.paceSec) };
      });
      return {
        coords,
        color: '#2563EB',
        summary: `Latest ${fmtPace(pacePoints[pacePoints.length - 1].paceSec)} /km · Best ${fmtPace(minP)} /km`,
      };
    }

    if (monkPoints.length < 2) return null;
    const minS = Math.min(...monkPoints.map((p) => p.score));
    const maxS = Math.max(...monkPoints.map((p) => p.score));
    const span = Math.max(0.02, maxS - minS);
    const coords = monkPoints.map((p, i) => {
      const x = 24 + (i / (monkPoints.length - 1)) * 552;
      const y = 96 - ((p.score - minS) / span) * 68;
      return { x, y, label: p.label, display: `${p.score.toFixed(2)}×` };
    });
    return {
      coords,
      color: '#10B981',
      summary: `Current ${monkPoints[monkPoints.length - 1].score.toFixed(2)}× compounding`,
    };
  }, [trendMode, pacePoints, monkPoints]);

  return (
    <div className="animate-pop space-y-6">
      <h1 className={`font-display text-3xl font-extrabold tracking-tight ${T.text}`}>Analytics</h1>

      {/* Row 1: Weekly Completion Ring + Domain Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div
          className={`flex flex-col items-center justify-center gap-4 rounded-3xl border p-6 lg:col-span-4 ${T.card}`}
        >
          <span className={`text-xs font-extrabold uppercase tracking-wider ${T.muted}`}>
            WEEKLY COMPLETION
          </span>
          <div className="relative flex h-40 w-40 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 130 130">
              <circle
                cx="65"
                cy="65"
                r="54"
                stroke={isDark ? '#1D1D1D' : '#F1F5F9'}
                strokeWidth="13"
                fill="none"
              />
              <circle
                cx="65"
                cy="65"
                r="54"
                stroke="#2563EB"
                strokeWidth="13"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - pct / 100)}
              />
            </svg>
            <div className="absolute text-center">
              <span className={`font-display text-3xl font-extrabold tabular-nums ${T.text}`}>
                {pct}%
              </span>
              <span className={`block text-[11px] font-bold tabular-nums ${T.muted}`}>
                {totalDone}/{totalScheduled}
              </span>
            </div>
          </div>
        </div>

        <div className={`space-y-4 rounded-3xl border p-6 lg:col-span-8 ${T.card}`}>
          <h2 className={`font-display text-lg font-extrabold ${T.text}`}>Domain Distribution</h2>
          {domainHours.length === 0 ? (
            <div className={`rounded-2xl border border-dashed p-8 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
              Log or schedule blocks this week to see your time distribution
            </div>
          ) : (
            <div className="space-y-3">
              {domainHours.map((item) => {
                const d = getDom(item.id, isDark);
                return (
                  <div key={item.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-extrabold">
                      <span className={`flex items-center gap-2 ${T.text}`}>
                        <span className={d.text}>
                          <DuoIcon name={item.id} className="h-4 w-4" />
                        </span>
                        {d.label}
                      </span>
                      <span className={`tabular-nums ${T.muted}`}>{item.hours}h</span>
                    </div>
                    <div className={`h-2.5 w-full overflow-hidden rounded-full ${T.surface}`}>
                      <div
                        className={`h-full rounded-full ${d.bg}`}
                        style={{ width: `${(item.hours / maxHours) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: 4 Clean Stat Tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Clean Streak', val: `${pornFree.currentStreak}d`, icon: 'flame' as const, domId: 'reading' as DomainId },
          { label: 'Weekly Run', val: `${weeklyRunKm.toFixed(1)} km`, icon: 'running' as const, domId: 'running' as DomainId },
          { label: 'Strength', val: `${strengthCount}/4`, icon: 'strength' as const, domId: 'strength' as DomainId },
          { label: 'Reading Streak', val: `${readingStreak}d`, icon: 'reading' as const, domId: 'health' as DomainId },
        ].map((s) => {
          const d = getDom(s.domId, isDark);
          return (
            <div key={s.label} className={`space-y-2 rounded-3xl border p-5 ${T.card}`}>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${d.soft} ${d.text}`}>
                <DuoIcon name={s.icon} className="h-7 w-7" />
              </div>
              <span className={`block text-[11px] font-extrabold uppercase ${T.muted}`}>
                {s.label}
              </span>
              <span className={`block font-display text-2xl font-extrabold tabular-nums ${T.text}`}>
                {s.val}
              </span>
            </div>
          );
        })}
      </div>

      {/* Row 3: Subtle Trend Sparkline Strip */}
      <div className={`space-y-4 rounded-3xl border p-6 ${T.card}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className={`text-[10px] font-extrabold uppercase tracking-widest ${T.muted}`}>
              TREND
            </span>
            <h2 className={`font-display text-lg font-extrabold ${T.text}`}>
              {trendMode === 'pace' ? 'Pace Progression' : 'Monk Mode Compounding'}
            </h2>
          </div>
          <div className={`inline-flex rounded-2xl border p-1 ${T.cardSubtle}`}>
            <button
              type="button"
              onClick={() => setTrendMode('pace')}
              className={`cursor-pointer rounded-xl px-3 py-1 text-xs font-extrabold transition-all ${
                trendMode === 'pace'
                  ? isDark
                    ? 'bg-[#242424] text-[#F5F5F5]'
                    : 'bg-white text-[#0F172A] shadow-sm'
                  : T.muted
              }`}
            >
              5K Pace
            </button>
            <button
              type="button"
              onClick={() => setTrendMode('monk')}
              className={`cursor-pointer rounded-xl px-3 py-1 text-xs font-extrabold transition-all ${
                trendMode === 'monk'
                  ? isDark
                    ? 'bg-[#242424] text-[#F5F5F5]'
                    : 'bg-white text-[#0F172A] shadow-sm'
                  : T.muted
              }`}
            >
              Monk Curve
            </button>
          </div>
        </div>

        {!sparkData ? (
          <div className={`rounded-2xl border border-dashed p-6 text-center text-xs font-bold ${T.cardSubtle} ${T.muted}`}>
            Log at least 2 runs to plot your pace progression
          </div>
        ) : (
          <div className="space-y-2">
            <svg viewBox="0 0 600 120" className="h-32 w-full overflow-visible">
              <polyline
                fill="none"
                stroke={sparkData.color}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparkData.coords.map((c) => `${c.x},${c.y}`).join(' ')}
              />
              {sparkData.coords.map((c, idx) => (
                <g key={idx}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r="5"
                    fill={sparkData.color}
                    stroke={isDark ? '#101010' : '#FFFFFF'}
                    strokeWidth="2"
                  />
                  <text
                    x={c.x}
                    y="115"
                    textAnchor="middle"
                    fill={isDark ? '#8E8E8E' : '#64748B'}
                    fontSize="10"
                    fontWeight="700"
                  >
                    {c.label}
                  </text>
                </g>
              ))}
            </svg>
            <div className={`text-right text-xs font-extrabold tabular-nums ${T.muted}`}>
              {sparkData.summary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
