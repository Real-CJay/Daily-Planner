import { estimateRiegelTimeSeconds } from '@/modules/analytics/analyticsEngine';
import {
  addDaysIso,
  buildDateRange,
  evaluateReadiness,
  expandCalendarOccurrences,
  getIsoWeekday,
} from '@/modules/calendar/scheduleEngine';
import { formatDistanceKm } from '@/modules/running/calculations';
import {
  TRAINING_PHASE_LABELS,
  WORKOUT_TYPE_LABELS,
  type PlannedWorkout,
  type PlannedWorkoutDraft,
  type ReadinessCheckIn,
  type RunningSession,
  type ScheduleBlock,
  type TrainingPhase,
  type UserProfile,
  type WorkoutType,
} from '@/types/domain';

export interface PaceRange {
  minSecPerKm: number; // faster bound
  maxSecPerKm: number; // slower bound
}

export interface TrainingPaceZones {
  anchorRun: RunningSession | null;
  equivalent5kSec: number | null;
  easy: PaceRange | null;
  long: PaceRange | null;
  tempo: PaceRange | null;
  intervals: PaceRange | null;
  basisNote: string;
}

export interface PhaseReadinessReport {
  currentPhase: TrainingPhase;
  nextPhase: TrainingPhase | null;
  readyForNextPhase: boolean;
  runsPerWeek28d: number;
  weeklyAvgKm28d: number;
  targetWeeklyKm: number;
  criteria: { label: string; met: boolean }[];
}

export interface ProposedAdjustment {
  id: string;
  targetWorkoutId: string;
  planDate: string;
  severity: 'HIGH' | 'MODERATE';
  triggerCode: 'PAIN_FLAG' | 'LOW_READINESS' | 'KARATE_LOAD_CONFLICT';
  triggerReason: string;
  previousSummary: string;
  proposedSummary: string;
  updatedDraft: PlannedWorkoutDraft;
}

const PHASE_CONFIG: Record<
  TrainingPhase,
  {
    targetRunsPerWeek: number;
    floorKm: number;
    defaultKm: number;
    capKm: number;
    maxQualitySessions: number;
    nextPhase: TrainingPhase | null;
    promoteRunsPerWeek: number;
    promoteWeeklyKm: number;
  }
> = {
  REBUILDING: {
    targetRunsPerWeek: 3,
    floorKm: 10,
    defaultKm: 12,
    capKm: 22,
    maxQualitySessions: 0,
    nextPhase: 'BUILDING_CONSISTENCY',
    promoteRunsPerWeek: 3,
    promoteWeeklyKm: 14,
  },
  BUILDING_CONSISTENCY: {
    targetRunsPerWeek: 4,
    floorKm: 16,
    defaultKm: 20,
    capKm: 35,
    maxQualitySessions: 1,
    nextPhase: 'PERFORMANCE_DEVELOPMENT',
    promoteRunsPerWeek: 4,
    promoteWeeklyKm: 24,
  },
  PERFORMANCE_DEVELOPMENT: {
    targetRunsPerWeek: 4,
    floorKm: 24,
    defaultKm: 28,
    capKm: 50,
    maxQualitySessions: 2,
    nextPhase: 'GOAL_SPECIFIC_5K',
    promoteRunsPerWeek: 4,
    promoteWeeklyKm: 32,
  },
  GOAL_SPECIFIC_5K: {
    targetRunsPerWeek: 5,
    floorKm: 30,
    defaultKm: 35,
    capKm: 65,
    maxQualitySessions: 2,
    nextPhase: null,
    promoteRunsPerWeek: 5,
    promoteWeeklyKm: 40,
  },
};

export function formatSecPerKmShort(secPerKm: number): string {
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatPaceRange(minS: number | null, maxS: number | null): string {
  if (!minS || !maxS) return 'RPE-guided (no pace anchor yet)';
  return `${formatSecPerKmShort(minS)}–${formatSecPerKmShort(maxS)} /km`;
}

/* Part 1A: Compute deterministic training pace zones strictly from a recorded >=1.5km anchor run. */
export function computeTrainingPaceZones(sessions: RunningSession[]): TrainingPaceZones {
  const candidates = sessions.filter(
    (s) => s.data_origin === 'RECORDED' && s.distance_m >= 1500 && s.duration_s > 0
  );

  let anchorRun: RunningSession | null = null;
  let bestEq5kS = Infinity;

  for (const run of candidates) {
    const eq5k = estimateRiegelTimeSeconds(run.distance_m, run.duration_s, 5000);
    if (eq5k > 0 && eq5k < bestEq5kS) {
      bestEq5kS = eq5k;
      anchorRun = run;
    }
  }

  if (!anchorRun || !Number.isFinite(bestEq5kS)) {
    return {
      anchorRun: null,
      equivalent5kSec: null,
      easy: null,
      long: null,
      tempo: null,
      intervals: null,
      basisNote: 'No recorded run ≥ 1.50 km yet. Guidance defaults to RPE until a run is logged.',
    };
  }

  const eq5kPace = Math.round(bestEq5kS / 5);

  return {
    anchorRun,
    equivalent5kSec: bestEq5kS,
    easy: { minSecPerKm: eq5kPace + 55, maxSecPerKm: eq5kPace + 90 },
    long: { minSecPerKm: eq5kPace + 50, maxSecPerKm: eq5kPace + 85 },
    tempo: { minSecPerKm: eq5kPace + 15, maxSecPerKm: eq5kPace + 28 },
    intervals: { minSecPerKm: Math.max(150, eq5kPace - 5), maxSecPerKm: eq5kPace + 5 },
    basisNote: `Estimated from recorded ${(anchorRun.distance_m / 1000).toFixed(2)} km run on ${
      anchorRun.session_date
    }.`,
  };
}

/* Part 1B: Evaluate phase progression readiness & safe weekly volume target (+10% max rule). */
export function evaluatePhaseReadiness(
  phase: TrainingPhase,
  sessions: RunningSession[],
  checkIns: ReadinessCheckIn[],
  referenceDate: string
): PhaseReadinessReport {
  const cfg = PHASE_CONFIG[phase];
  const windowStart = addDaysIso(referenceDate, -27);

  const recentRuns = sessions.filter(
    (s) =>
      s.data_origin === 'RECORDED' &&
      s.session_date >= windowStart &&
      s.session_date <= referenceDate
  );

  const totalDistKm28d = recentRuns.reduce((sum, r) => sum + r.distance_m, 0) / 1000;
  const weeklyAvgKm28d = Number((totalDistKm28d / 4).toFixed(2));
  const runsPerWeek28d = Number((recentRuns.length / 4).toFixed(1));

  const recentPain =
    recentRuns.some((r) => r.pain_present) ||
    checkIns.some(
      (c) =>
        c.checkin_date >= addDaysIso(referenceDate, -13) &&
        c.checkin_date <= referenceDate &&
        c.pain_present
    );

  // Safe weekly volume target: <= 10% above 28-day weekly average, clamped to phase bounds
  const rawTargetKm =
    weeklyAvgKm28d > 0
      ? Math.min(cfg.capKm, Math.max(cfg.floorKm, Number((weeklyAvgKm28d * 1.1).toFixed(1))))
      : cfg.defaultKm;
  const targetWeeklyKm = recentPain ? Math.max(cfg.floorKm * 0.75, Number((rawTargetKm * 0.8).toFixed(1))) : rawTargetKm;

  const criteria = [
    {
      label: `Average ≥ ${cfg.promoteRunsPerWeek} runs/week over 28 days (current: ${runsPerWeek28d})`,
      met: runsPerWeek28d >= cfg.promoteRunsPerWeek,
    },
    {
      label: `Average ≥ ${cfg.promoteWeeklyKm} km/week over 28 days (current: ${weeklyAvgKm28d} km)`,
      met: weeklyAvgKm28d >= cfg.promoteWeeklyKm,
    },
    {
      label: 'No pain flags recorded in the last 14 days',
      met: !recentPain,
    },
  ];

  return {
    currentPhase: phase,
    nextPhase: cfg.nextPhase,
    readyForNextPhase: Boolean(cfg.nextPhase) && criteria.every((c) => c.met),
    runsPerWeek28d,
    weeklyAvgKm28d,
    targetWeeklyKm,
    criteria,
  };
}

function roundToNearest250m(meters: number): number {
  return Math.max(2500, Math.round(meters / 250) * 250);
}

function estimateDurationFromRange(distanceM: number, range: PaceRange | null): number | null {
  if (!range || distanceM <= 0) return null;
  const midPace = (range.minSecPerKm + range.maxSecPerKm) / 2;
  return Math.round((distanceM / 1000) * midPace);
}

/* Part 2: Generate a commitment-aware rolling 7-day plan (today through today + 6). */
export function generateRollingSevenDayPlan(params: {
  referenceDate: string;
  profile: Pick<UserProfile, 'current_phase' | 'preferred_run_days'>;
  sessions: RunningSession[];
  blocks: ScheduleBlock[];
  checkIns: ReadinessCheckIn[];
}): PlannedWorkoutDraft[] {
  const { referenceDate, profile, sessions, blocks, checkIns } = params;
  const phase = profile.current_phase;
  const cfg = PHASE_CONFIG[phase];

  const dates = buildDateRange(referenceDate, addDaysIso(referenceDate, 6));
  const occurrences = expandCalendarOccurrences(blocks, [], dates[0], dates[dates.length - 1]);
  const zones = computeTrainingPaceZones(sessions);
  const readinessReport = evaluatePhaseReadiness(phase, sessions, checkIns, referenceDate);

  const dayMeta = dates.map((date) => {
    const dayEvents = occurrences.filter((o) => o.date === date);
    const isProtectedRest = dayEvents.some((o) => o.category === 'RECOVERY');
    const hasHighLoad = dayEvents.some((o) => o.physicalLoad === 'HIGH');
    const isoDay = getIsoWeekday(date);
    const isPreferred = profile.preferred_run_days.includes(isoDay);
    return { date, isoDay, isProtectedRest, hasHighLoad, isPreferred, dayEvents };
  });

  // Select run days: never schedule on protected RECOVERY days.
  // Priority 1: preferred run days without HIGH load; Priority 2: other non-HIGH-load days; Priority 3: remaining non-rest days.
  const eligible = dayMeta.filter((d) => !d.isProtectedRest);
  const scored = eligible
    .map((d) => ({
      ...d,
      priority: (d.isPreferred ? 10 : 0) + (d.hasHighLoad ? -6 : 4),
    }))
    .sort((a, b) => b.priority - a.priority || a.date.localeCompare(b.date));

  const selectedDates = scored
    .slice(0, Math.min(cfg.targetRunsPerWeek, scored.length))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (selectedDates.length === 0) return [];

  // Assign workout roles: never place quality or long runs on a HIGH physical-load day (e.g., Karate).
  const cleanDays = selectedDates.filter((d) => !d.hasHighLoad);
  const longRunDate =
    cleanDays.length > 0 ? cleanDays[cleanDays.length - 1].date : null;

  let qualityDate: string | null = null;
  if (cfg.maxQualitySessions >= 1) {
    const qualityCandidate = cleanDays.find((d) => d.date !== longRunDate);
    qualityDate = qualityCandidate?.date ?? null;
  }

  let secondQualityDate: string | null = null;
  if (cfg.maxQualitySessions >= 2 && qualityDate) {
    const secondCandidate = cleanDays.find(
      (d) => d.date !== longRunDate && d.date !== qualityDate
    );
    secondQualityDate = secondCandidate?.date ?? null;
  }

  // Distribute target weekly distance across selected runs
  const totalTargetM = Math.round(readinessReport.targetWeeklyKm * 1000);
  const weights = selectedDates.map((d) => {
    if (d.date === longRunDate) return phase === 'REBUILDING' ? 1.25 : 1.4;
    if (d.date === qualityDate || d.date === secondQualityDate) return 1.05;
    return 1.0;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  return selectedDates.map((day, idx) => {
    const rawDistM = (totalTargetM * weights[idx]) / totalWeight;
    const distanceM = roundToNearest250m(rawDistM);

    let workoutType: WorkoutType = 'EASY';
    let title = 'Easy Aerobic Run';
    let paceRange: PaceRange | null = zones.easy;
    let targetRpe = 'RPE 3–4 (conversational)';
    let rationale = `${TRAINING_PHASE_LABELS[phase]}: aerobic base building at controlled effort.`;

    if (day.date === longRunDate) {
      workoutType = phase === 'REBUILDING' ? 'EASY' : 'LONG';
      title = phase === 'REBUILDING' ? 'Steady Aerobic Anchor Run' : 'Weekly Long Run';
      paceRange = phase === 'REBUILDING' ? zones.easy : zones.long;
      targetRpe = 'RPE 4–5 (steady, relaxed)';
      rationale =
        phase === 'REBUILDING'
          ? 'Longest controlled aerobic run of the week on a non-high-load day to build durability safely.'
          : 'Builds aerobic endurance on a clean day separated from high-load Karate sessions.';
    } else if (day.date === qualityDate) {
      workoutType = phase === 'GOAL_SPECIFIC_5K' ? 'INTERVALS' : 'TEMPO';
      title =
        phase === 'GOAL_SPECIFIC_5K'
          ? '5K-Specific Intervals (e.g. 5×800m w/ easy jog)'
          : 'Threshold / Tempo Run';
      paceRange = phase === 'GOAL_SPECIFIC_5K' ? zones.intervals : zones.tempo;
      targetRpe = phase === 'GOAL_SPECIFIC_5K' ? 'RPE 7–8 (controlled hard)' : 'RPE 6–7 (comfortably hard)';
      rationale =
        phase === 'GOAL_SPECIFIC_5K'
          ? 'Develops 5K race pace economy with full warm-up and cool-down.'
          : 'Raises lactate threshold while staying separated from Karate load.';
    } else if (day.date === secondQualityDate) {
      workoutType = 'PROGRESSION';
      title = 'Aerobic Progression Run';
      paceRange = zones.easy;
      targetRpe = 'RPE 4 → 6 (smooth finish)';
      rationale = 'Starts strictly easy and finishes smoothly at controlled tempo effort.';
    } else if (day.hasHighLoad) {
      workoutType = 'RECOVERY';
      title = 'Light Recovery Jog (High-Load Day)';
      paceRange = zones.easy;
      targetRpe = 'RPE 2–3 (very easy)';
      rationale = 'Kept short and strictly easy due to overlapping high physical load (e.g. Karate).';
    }

    return {
      plan_date: day.date,
      workout_type: workoutType,
      title,
      target_distance_m: distanceM,
      target_duration_s: estimateDurationFromRange(distanceM, paceRange),
      target_pace_min_s: paceRange?.minSecPerKm ?? null,
      target_pace_max_s: paceRange?.maxSecPerKm ?? null,
      target_rpe_range: targetRpe,
      phase,
      rationale,
      status: 'PLANNED',
      linked_session_id: null,
      data_origin: 'SUGGESTED',
    };
  });
}

/* Part 3: Non-silent adaptation detector — never silently modifies plans; returns explicit proposals. */
export function detectPlanAdjustments(params: {
  today: string;
  plannedWorkouts: PlannedWorkout[];
  sessions: RunningSession[];
  blocks: ScheduleBlock[];
  checkIns: ReadinessCheckIn[];
}): ProposedAdjustment[] {
  const { today, plannedWorkouts, sessions, blocks, checkIns } = params;

  const upcoming = plannedWorkouts
    .filter((w) => w.status === 'PLANNED' && w.plan_date >= today)
    .sort((a, b) => a.plan_date.localeCompare(b.plan_date));

  const nextWorkout = upcoming[0];
  if (!nextWorkout) return [];

  const proposals: ProposedAdjustment[] = [];
  const zones = computeTrainingPaceZones(sessions);

  const recentCheckIn = checkIns.find(
    (c) => c.checkin_date >= addDaysIso(today, -1) && c.checkin_date <= today
  ) ?? null;
  const readiness = evaluateReadiness(recentCheckIn);

  const recentPainRun = sessions.find(
    (s) =>
      s.data_origin === 'RECORDED' &&
      s.session_date >= addDaysIso(today, -3) &&
      s.session_date <= today &&
      s.pain_present
  );

  const prevSummary = `${WORKOUT_TYPE_LABELS[nextWorkout.workout_type]} · ${formatDistanceKm(
    nextWorkout.target_distance_m
  )} (${nextWorkout.title})`;

  // Rule 1: Pain flag takes top priority
  if (recentCheckIn?.pain_present || recentPainRun) {
    const detail = recentCheckIn?.pain_details || recentPainRun?.pain_details || 'Pain flagged';
    const proposedDraft: PlannedWorkoutDraft = {
      plan_date: nextWorkout.plan_date,
      workout_type: 'RECOVERY',
      title: 'Protected Rest / Mobility Assessment',
      target_distance_m: 0,
      target_duration_s: 1200,
      target_pace_min_s: null,
      target_pace_max_s: null,
      target_rpe_range: 'RPE 1–2 (pain-free mobility only)',
      phase: nextWorkout.phase,
      rationale: `Adapted due to pain report (${detail}). Pause impact loading until pain-free.`,
      status: 'ADJUSTED',
      linked_session_id: null,
      data_origin: 'PLANNED',
    };

    proposals.push({
      id: `adj-pain-${nextWorkout.id}`,
      targetWorkoutId: nextWorkout.id,
      planDate: nextWorkout.plan_date,
      severity: 'HIGH',
      triggerCode: 'PAIN_FLAG',
      triggerReason: `Recent pain signal detected (${detail}).`,
      previousSummary: prevSummary,
      proposedSummary: 'Recovery · 0.00 km (Protected Rest / Mobility Assessment)',
      updatedDraft: proposedDraft,
    });
    return proposals;
  }

  // Rule 2: Low readiness (CAUTION band)
  if (readiness.band === 'CAUTION' && nextWorkout.workout_type !== 'RECOVERY') {
    const reducedM = Math.max(2000, Math.round((nextWorkout.target_distance_m * 0.7) / 250) * 250);
    const proposedDraft: PlannedWorkoutDraft = {
      plan_date: nextWorkout.plan_date,
      workout_type: 'RECOVERY',
      title: 'Reduced Recovery Jog',
      target_distance_m: reducedM,
      target_duration_s: estimateDurationFromRange(reducedM, zones.easy),
      target_pace_min_s: zones.easy?.minSecPerKm ?? null,
      target_pace_max_s: zones.easy?.maxSecPerKm ?? null,
      target_rpe_range: 'RPE 2–3 (strictly easy)',
      phase: nextWorkout.phase,
      rationale: `Readiness score is ${readiness.score ?? 'low'}/100 (${readiness.flags.join(', ') || 'recovery priority'}). Reduced distance by ~30% and removed intensity.`,
      status: 'ADJUSTED',
      linked_session_id: null,
      data_origin: 'PLANNED',
    };

    proposals.push({
      id: `adj-readiness-${nextWorkout.id}`,
      targetWorkoutId: nextWorkout.id,
      planDate: nextWorkout.plan_date,
      severity: 'MODERATE',
      triggerCode: 'LOW_READINESS',
      triggerReason: `Readiness is in Recovery Priority (${readiness.score ?? 'low'}/100)${
        readiness.flags.length ? `: ${readiness.flags.join('; ')}` : ''
      }.`,
      previousSummary: prevSummary,
      proposedSummary: `Recovery · ${formatDistanceKm(reducedM)} (Reduced Recovery Jog)`,
      updatedDraft: proposedDraft,
    });
    return proposals;
  }

  // Rule 3: High-load Karate stacking on or right before a hard/long run
  const isDemandingRun =
    nextWorkout.workout_type === 'TEMPO' ||
    nextWorkout.workout_type === 'INTERVALS' ||
    nextWorkout.workout_type === 'LONG';

  if (isDemandingRun) {
    const dayBefore = addDaysIso(nextWorkout.plan_date, -1);
    const surrounding = expandCalendarOccurrences(blocks, [], dayBefore, nextWorkout.plan_date);
    const highLoadBlock = surrounding.find(
      (o) => o.sourceType === 'SCHEDULE_BLOCK' && o.physicalLoad === 'HIGH'
    );

    if (highLoadBlock) {
      const trimmedM = Math.max(
        2500,
        Math.round((nextWorkout.target_distance_m * 0.85) / 250) * 250
      );
      const proposedDraft: PlannedWorkoutDraft = {
        plan_date: nextWorkout.plan_date,
        workout_type: 'EASY',
        title: 'Easy Aerobic Swap (Load Protection)',
        target_distance_m: trimmedM,
        target_duration_s: estimateDurationFromRange(trimmedM, zones.easy),
        target_pace_min_s: zones.easy?.minSecPerKm ?? null,
        target_pace_max_s: zones.easy?.maxSecPerKm ?? null,
        target_rpe_range: 'RPE 3–4 (conversational)',
        phase: nextWorkout.phase,
        rationale: `Swapped to Easy aerobic effort to avoid stacking hard running onto ${highLoadBlock.title} (${highLoadBlock.date}).`,
        status: 'ADJUSTED',
        linked_session_id: null,
        data_origin: 'PLANNED',
      };

      proposals.push({
        id: `adj-load-${nextWorkout.id}`,
        targetWorkoutId: nextWorkout.id,
        planDate: nextWorkout.plan_date,
        severity: 'MODERATE',
        triggerCode: 'KARATE_LOAD_CONFLICT',
        triggerReason: `${highLoadBlock.title} (HIGH physical load) is scheduled on ${highLoadBlock.date}.`,
        previousSummary: prevSummary,
        proposedSummary: `Easy · ${formatDistanceKm(trimmedM)} (Easy Aerobic Swap)`,
        updatedDraft: proposedDraft,
      });
    }
  }

  return proposals;
}