import { formatDurationSeconds, getMondayWeekStart } from '@/lib/datetime';
import type { RunningSession, RunningSplit } from '@/types/domain';

/* Parses "mm:ss" or "h:mm:ss" into total seconds. Returns null if invalid. */
export function parseDurationToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = nums;
    if (seconds >= 60) return null;
    const total = minutes * 60 + seconds;
    return total > 0 ? total : null;
  }

  const [hours, minutes, seconds] = nums;
  if (minutes >= 60 || seconds >= 60) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/* Calculates exact pace in seconds per kilometer. */
export function calculatePaceSecondsPerKm(
  distanceMeters: number,
  durationSeconds: number
): number | null {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) return null;
  if (distanceMeters <= 0 || durationSeconds <= 0) return null;
  return durationSeconds / (distanceMeters / 1000);
}

/* Formats pace as "m:ss /km" deterministically. */
export function formatPace(distanceMeters: number, durationSeconds: number): string {
  const secPerKm = calculatePaceSecondsPerKm(distanceMeters, durationSeconds);
  if (secPerKm === null) return '—';
  return `${formatDurationSeconds(Math.round(secPerKm))} /km`;
}

export function formatDistanceKm(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return '0.00 km';
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

export type PacingPattern =
  | 'INSUFFICIENT_SPLITS'
  | 'NEGATIVE_SPLIT'
  | 'POSITIVE_SPLIT'
  | 'EVEN_PACING'
  | 'PROGRESSIVE';

export interface SplitAnalysis {
  splitsWithPace: Array<RunningSplit & { paceSecPerKm: number; formattedPace: string }>;
  fastestSplit: (RunningSplit & { paceSecPerKm: number; formattedPace: string }) | null;
  slowestSplit: (RunningSplit & { paceSecPerKm: number; formattedPace: string }) | null;
  pattern: PacingPattern;
  patternSummary: string;
  paceSpreadSec: number | null;
  coefficientOfVariationPct: number | null;
}

export function analyzeSplits(splits: RunningSplit[]): SplitAnalysis {
  if (!splits || splits.length === 0) {
    return {
      splitsWithPace: [],
      fastestSplit: null,
      slowestSplit: null,
      pattern: 'INSUFFICIENT_SPLITS',
      patternSummary: 'No recorded kilometer splits available for this session.',
      paceSpreadSec: null,
      coefficientOfVariationPct: null,
    };
  }

  const ordered = [...splits].sort((a, b) => a.split_index - b.split_index);
  const splitsWithPace = ordered
    .map((s) => {
      const pace = calculatePaceSecondsPerKm(s.distance_m, s.duration_s);
      if (pace === null) return null;
      return {
        ...s,
        paceSecPerKm: pace,
        formattedPace: `${formatDurationSeconds(Math.round(pace))} /km`,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (splitsWithPace.length === 0) {
    return {
      splitsWithPace: [],
      fastestSplit: null,
      slowestSplit: null,
      pattern: 'INSUFFICIENT_SPLITS',
      patternSummary: 'Split measurements were incomplete.',
      paceSpreadSec: null,
      coefficientOfVariationPct: null,
    };
  }

  const candidateSplits =
    splitsWithPace.filter((s) => !s.is_partial && s.distance_m >= 800).length > 0
      ? splitsWithPace.filter((s) => !s.is_partial && s.distance_m >= 800)
      : splitsWithPace;

  let fastestSplit = candidateSplits[0];
  let slowestSplit = candidateSplits[0];
  for (const s of candidateSplits) {
    if (s.paceSecPerKm < fastestSplit.paceSecPerKm) fastestSplit = s;
    if (s.paceSecPerKm > slowestSplit.paceSecPerKm) slowestSplit = s;
  }

  const paceSpreadSec = Math.round(slowestSplit.paceSecPerKm - fastestSplit.paceSecPerKm);

  const mean =
    candidateSplits.reduce((acc, s) => acc + s.paceSecPerKm, 0) / candidateSplits.length;
  const variance =
    candidateSplits.reduce((acc, s) => acc + Math.pow(s.paceSecPerKm - mean, 2), 0) /
    candidateSplits.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariationPct =
    mean > 0 ? Number(((stdDev / mean) * 100).toFixed(1)) : null;

  if (splitsWithPace.length < 2) {
    return {
      splitsWithPace,
      fastestSplit,
      slowestSplit,
      pattern: 'INSUFFICIENT_SPLITS',
      patternSummary: 'Only one split recorded; pacing trend requires at least 2 splits.',
      paceSpreadSec,
      coefficientOfVariationPct,
    };
  }

  const mid = Math.floor(splitsWithPace.length / 2);
  const firstHalf = splitsWithPace.slice(0, mid);
  const secondHalf = splitsWithPace.slice(mid);

  const weightedPace = (arr: typeof splitsWithPace) => {
    const dist = arr.reduce((a, b) => a + b.distance_m, 0);
    const dur = arr.reduce((a, b) => a + b.duration_s, 0);
    return calculatePaceSecondsPerKm(dist, dur) ?? 0;
  };

  const firstPace = weightedPace(firstHalf);
  const secondPace = weightedPace(secondHalf);
  const delta = secondPace - firstPace;

  let progressiveSteps = 0;
  for (let i = 1; i < splitsWithPace.length; i++) {
    if (splitsWithPace[i].paceSecPerKm < splitsWithPace[i - 1].paceSecPerKm - 1) {
      progressiveSteps++;
    }
  }

  let pattern: PacingPattern = 'EVEN_PACING';
  let patternSummary = 'Even pacing across recorded splits.';

  if (splitsWithPace.length >= 3 && progressiveSteps === splitsWithPace.length - 1) {
    pattern = 'PROGRESSIVE';
    patternSummary = `Progressive pacing: each split got faster (${Math.abs(Math.round(delta))}s/km faster second half).`;
  } else if (delta <= -4) {
    pattern = 'NEGATIVE_SPLIT';
    patternSummary = `Negative split: second half averaged ${Math.abs(Math.round(delta))}s/km faster than the first half.`;
  } else if (delta >= 4) {
    pattern = 'POSITIVE_SPLIT';
    patternSummary = `Positive split: second half slowed by ${Math.round(delta)}s/km compared to the first half.`;
  }

  return {
    splitsWithPace,
    fastestSplit,
    slowestSplit,
    pattern,
    patternSummary,
    paceSpreadSec,
    coefficientOfVariationPct,
  };
}

export interface WeeklyRunningStats {
  weekStart: string;
  totalDistanceM: number;
  totalDurationS: number;
  runCount: number;
  previousWeekDistanceM: number;
  distanceDeltaM: number;
}

/* Computes weekly stats strictly from RECORDED sessions. */
export function computeWeeklyRunningStats(
  sessions: RunningSession[],
  referenceIsoDate: string
): WeeklyRunningStats {
  const recorded = sessions.filter((s) => s.data_origin === 'RECORDED');
  const currentWeekStart = getMondayWeekStart(referenceIsoDate);

  const [y, m, d] = currentWeekStart.split('-').map(Number);
  const prevMondayDate = new Date(Date.UTC(y, m - 1, d - 7));
  const prevWeekStart = prevMondayDate.toISOString().slice(0, 10);

  const currentRuns = recorded.filter(
    (s) => getMondayWeekStart(s.session_date) === currentWeekStart
  );
  const previousRuns = recorded.filter(
    (s) => getMondayWeekStart(s.session_date) === prevWeekStart
  );

  const totalDistanceM = currentRuns.reduce((sum, r) => sum + r.distance_m, 0);
  const totalDurationS = currentRuns.reduce((sum, r) => sum + r.duration_s, 0);
  const previousWeekDistanceM = previousRuns.reduce((sum, r) => sum + r.distance_m, 0);

  return {
    weekStart: currentWeekStart,
    totalDistanceM,
    totalDurationS,
    runCount: currentRuns.length,
    previousWeekDistanceM,
    distanceDeltaM: totalDistanceM - previousWeekDistanceM,
  };
}

/* Finds valid 5K benchmarks (distance between 4,950m and 5,250m). */
export function extractFiveKBenchmarks(sessions: RunningSession[]): {
  fastest5K: { session: RunningSession; recordedTimeS: number; isExact5K: boolean } | null;
  mostRecent5K: { session: RunningSession; recordedTimeS: number; isExact5K: boolean } | null;
} {
  const fiveKs = sessions
    .filter((s) => s.data_origin === 'RECORDED' && s.distance_m >= 4950 && s.distance_m <= 5250)
    .sort((a, b) => b.session_date.localeCompare(a.session_date));

  if (fiveKs.length === 0) {
    return { fastest5K: null, mostRecent5K: null };
  }

  const mostRecent = fiveKs[0];
  let fastest = fiveKs[0];

  for (const run of fiveKs) {
    const paceRun = run.duration_s / run.distance_m;
    const paceFastest = fastest.duration_s / fastest.distance_m;
    if (paceRun < paceFastest) {
      fastest = run;
    }
  }

  return {
    fastest5K: {
      session: fastest,
      recordedTimeS: fastest.duration_s,
      isExact5K: fastest.distance_m === 5000,
    },
    mostRecent5K: {
      session: mostRecent,
      recordedTimeS: mostRecent.duration_s,
      isExact5K: mostRecent.distance_m === 5000,
    },
  };
}

export interface RunComparisonResult {
  comparisonType: 'DIRECT' | 'APPROXIMATE';
  basisExplanation: string;
  distanceDiffM: number;
  durationDiffS: number;
  paceDiffSecPerKm: number | null;
}

export function compareTwoRuns(runA: RunningSession, runB: RunningSession): RunComparisonResult {
  const distanceDiffM = runB.distance_m - runA.distance_m;
  const durationDiffS = runB.duration_s - runA.duration_s;

  const paceA = calculatePaceSecondsPerKm(runA.distance_m, runA.duration_s);
  const paceB = calculatePaceSecondsPerKm(runB.distance_m, runB.duration_s);
  const paceDiffSecPerKm = paceA !== null && paceB !== null ? paceB - paceA : null;

  const relativeDistanceDiff = Math.abs(distanceDiffM) / Math.max(runA.distance_m, 1);
  const sameEnvironment = runA.is_indoor === runB.is_indoor;
  const compatibleType =
    runA.workout_type === runB.workout_type ||
    (['TIME_TRIAL', 'RACE'].includes(runA.workout_type) &&
      ['TIME_TRIAL', 'RACE'].includes(runB.workout_type));

  const isDirect = relativeDistanceDiff <= 0.05 && sameEnvironment && compatibleType;

  const reasons: string[] = [];
  if (relativeDistanceDiff > 0.05) {
    reasons.push(`distance differs by ${Math.abs(distanceDiffM)}m`);
  }
  if (!sameEnvironment) {
    reasons.push('indoor vs. outdoor conditions differ');
  }
  if (!compatibleType) {
    reasons.push(`workout types differ (${runA.workout_type} vs. ${runB.workout_type})`);
  }

  return {
    comparisonType: isDirect ? 'DIRECT' : 'APPROXIMATE',
    basisExplanation: isDirect
      ? 'Direct comparison: matching distance band, environment, and workout category.'
      : `Approximate comparison: ${reasons.join('; ')}.`,
    distanceDiffM,
    durationDiffS,
    paceDiffSecPerKm,
  };
}