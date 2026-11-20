import { getMondayWeekStart } from '@/lib/datetime';
import { addDaysIso, expandCalendarOccurrences } from '@/modules/calendar/scheduleEngine';
import {
  BENCHMARK_DISTANCES,
  type ActivityCategory,
  type BenchmarkDistance,
  type PersonalBest,
  type RunningSession,
  type ScheduleBlock,
  type WorkoutType,
} from '@/types/domain';

export interface WeeklyVolumePoint {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekLabel: string; // e.g. "Nov 16"
  distanceKm: number;
  runCount: number;
  durationS: number;
  avgPaceSecPerKm: number | null;
}

export interface PaceProgressionPoint {
  sessionId: string;
  date: string;
  distanceKm: number;
  durationS: number;
  paceSecPerKm: number;
  workoutType: WorkoutType;
  rpe: number | null;
}

export interface ConsistencySummary {
  runsLast28d: number;
  distanceLast28dM: number;
  durationLast28dS: number;
  avgRunsPerWeek: number;
  currentWeekStreak: number;
  workoutTypeCounts: Record<WorkoutType, number>;
}

export interface ActivitySeparationRow {
  category: ActivityCategory;
  countLast7d: number;
  totalMinutesLast7d: number;
  contributesToRunningKm: boolean;
}

export interface BenchmarkRow {
  distance: BenchmarkDistance;
  targetMeters: number;
  confirmedPb: PersonalBest | null;
  fastestLogged: {
    session: RunningSession;
    durationS: number;
    distanceM: number;
  } | null;
  estimatedTimeS: number | null;
  estimatedBasis: string | null;
}

function formatShortMonthDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/* Builds an ordered Mon–Sun weekly running volume series for the last `weeks` weeks. */
export function buildWeeklyVolumeSeries(
  sessions: RunningSession[],
  referenceDate: string,
  weeks = 8
): WeeklyVolumePoint[] {
  const recorded = sessions.filter((s) => s.data_origin === 'RECORDED');
  const currentMonday = getMondayWeekStart(referenceDate);

  const buckets = new Map<string, { distM: number; durS: number; count: number }>();
  const orderedMondays: string[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDaysIso(currentMonday, -i * 7);
    orderedMondays.push(monday);
    buckets.set(monday, { distM: 0, durS: 0, count: 0 });
  }

  for (const run of recorded) {
    const runMonday = getMondayWeekStart(run.session_date);
    const bucket = buckets.get(runMonday);
    if (!bucket) continue;
    bucket.distM += run.distance_m;
    bucket.durS += run.duration_s;
    bucket.count += 1;
  }

  return orderedMondays.map((weekStart) => {
    const b = buckets.get(weekStart)!;
    const avgPaceSecPerKm =
      b.distM > 0 && b.durS > 0 ? Math.round((b.durS / b.distM) * 1000) : null;
    return {
      weekStart,
      weekLabel: formatShortMonthDay(weekStart),
      distanceKm: Number((b.distM / 1000).toFixed(2)),
      runCount: b.count,
      durationS: b.durS,
      avgPaceSecPerKm,
    };
  });
}

/* Builds chronological pace progression points from verified RECORDED runs. */
export function buildPaceProgressionSeries(
  sessions: RunningSession[],
  workoutFilter: WorkoutType | 'ALL' = 'ALL'
): PaceProgressionPoint[] {
  return sessions
    .filter((s) => s.data_origin === 'RECORDED' && s.distance_m > 0 && s.duration_s > 0)
    .filter((s) => workoutFilter === 'ALL' || s.workout_type === workoutFilter)
    .slice()
    .sort((a, b) => a.session_date.localeCompare(b.session_date))
    .map((s) => ({
      sessionId: s.id,
      date: s.session_date,
      distanceKm: Number((s.distance_m / 1000).toFixed(2)),
      durationS: s.duration_s,
      paceSecPerKm: Math.round((s.duration_s / s.distance_m) * 1000),
      workoutType: s.workout_type,
      rpe: s.rpe,
    }));
}

/* Computes 28-day consistency and consecutive active-week streak (Mon–Sun). */
export function computeConsistencySummary(
  sessions: RunningSession[],
  referenceDate: string
): ConsistencySummary {
  const recorded = sessions.filter((s) => s.data_origin === 'RECORDED');
  const windowStart = addDaysIso(referenceDate, -27);
  const recent = recorded.filter(
    (s) => s.session_date >= windowStart && s.session_date <= referenceDate
  );

  const workoutTypeCounts = {} as Record<WorkoutType, number>;
  let distanceLast28dM = 0;
  let durationLast28dS = 0;

  for (const r of recent) {
    distanceLast28dM += r.distance_m;
    durationLast28dS += r.duration_s;
    workoutTypeCounts[r.workout_type] = (workoutTypeCounts[r.workout_type] ?? 0) + 1;
  }

  const weeksWithRuns = new Set(recorded.map((s) => getMondayWeekStart(s.session_date)));
  const currentMonday = getMondayWeekStart(referenceDate);
  let streak = 0;
  let cursor = weeksWithRuns.has(currentMonday)
    ? currentMonday
    : addDaysIso(currentMonday, -7);

  while (weeksWithRuns.has(cursor) && streak < 260) {
    streak += 1;
    cursor = addDaysIso(cursor, -7);
  }

  return {
    runsLast28d: recent.length,
    distanceLast28dM,
    durationLast28dS,
    avgRunsPerWeek: Number((recent.length / 4).toFixed(1)),
    currentWeekStreak: streak,
    workoutTypeCounts,
  };
}

/* Summarizes last 7 days by activity category, keeping running strictly isolated. */
export function computeActivitySeparation(
  blocks: ScheduleBlock[],
  sessions: RunningSession[],
  referenceDate: string
): ActivitySeparationRow[] {
  const start = addDaysIso(referenceDate, -6);
  const occurrences = expandCalendarOccurrences(blocks, sessions, start, referenceDate);

  const categories: ActivityCategory[] = [
    'RUNNING',
    'KARATE',
    'STRENGTH',
    'RECOVERY',
    'VOCAL',
    'DRUMMING',
    'UNIVERSITY',
    'CUSTOM',
  ];

  return categories.map((cat) => {
    const items = occurrences.filter((o) => o.category === cat);
    const totalMinutes = items.reduce((acc, o) => acc + (o.durationMin ?? 0), 0);
    return {
      category: cat,
      countLast7d: items.length,
      totalMinutesLast7d: totalMinutes,
      contributesToRunningKm: cat === 'RUNNING',
    };
  });
}

/* Riegel formula: T2 = T1 * (D2 / D1)^1.06. Always labeled ESTIMATED. */
export function estimateRiegelTimeSeconds(
  anchorDistanceM: number,
  anchorDurationS: number,
  targetDistanceM: number
): number {
  if (anchorDistanceM <= 0 || anchorDurationS <= 0 || targetDistanceM <= 0) return 0;
  return Math.round(anchorDurationS * Math.pow(targetDistanceM / anchorDistanceM, 1.06));
}

/* Builds the 1K / 3K / 5K / 10K benchmark matrix with strict provenance separation. */
export function buildBenchmarkMatrix(
  sessions: RunningSession[],
  personalBests: PersonalBest[]
): BenchmarkRow[] {
  const recorded = sessions.filter((s) => s.data_origin === 'RECORDED' && s.distance_m > 0);
  const pbByDistance = new Map<BenchmarkDistance, PersonalBest>();
  for (const pb of personalBests) {
    pbByDistance.set(pb.distance_label, pb);
  }

  // Pick the strongest recorded run >= 1500m (preferring ~5K or fastest equivalent 5K) as Riegel anchor
  const anchorCandidates = recorded.filter((s) => s.distance_m >= 1500 && s.duration_s > 0);
  let anchorRun: RunningSession | null = null;
  let bestAnchor5kEst = Infinity;

  for (const run of anchorCandidates) {
    const est5k = estimateRiegelTimeSeconds(run.distance_m, run.duration_s, 5000);
    if (est5k < bestAnchor5kEst) {
      bestAnchor5kEst = est5k;
      anchorRun = run;
    }
  }

  const order: BenchmarkDistance[] = ['1K', '3K', '5K', '10K'];

  return order.map((dist) => {
    const spec = BENCHMARK_DISTANCES[dist];
    const matching = recorded
      .filter((s) => s.distance_m >= spec.minMatchM && s.distance_m <= spec.maxMatchM)
      .sort((a, b) => a.duration_s - b.duration_s);

    const fastest = matching[0] ?? null;

    const estimatedTimeS = anchorRun
      ? estimateRiegelTimeSeconds(anchorRun.distance_m, anchorRun.duration_s, spec.meters)
      : null;

    const estimatedBasis = anchorRun
      ? `Riegel (1.06) from ${(anchorRun.distance_m / 1000).toFixed(2)} km on ${
          anchorRun.session_date
        }`
      : null;

    return {
      distance: dist,
      targetMeters: spec.meters,
      confirmedPb: pbByDistance.get(dist) ?? null,
      fastestLogged: fastest
        ? {
            session: fastest,
            durationS: fastest.duration_s,
            distanceM: fastest.distance_m,
          }
        : null,
      estimatedTimeS,
      estimatedBasis,
    };
  });
}