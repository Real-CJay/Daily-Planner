import { formatDurationSeconds, getMondayWeekStart } from '@/lib/datetime';
import { buildBenchmarkMatrix } from '@/modules/analytics/analyticsEngine';
import {
  addDaysIso,
  evaluateReadiness,
  expandCalendarOccurrences,
} from '@/modules/calendar/scheduleEngine';
import { computeTrainingPaceZones } from '@/modules/plan/planEngine';
import { formatDistanceKm, formatPace } from '@/modules/running/calculations';
import {
  TRAINING_PHASE_LABELS,
  WORKOUT_TYPE_LABELS,
  type PersonalBest,
  type PlannedWorkout,
  type ReadinessCheckIn,
  type RunningSession,
  type ScheduleBlock,
  type UserProfile,
} from '@/types/domain';

export interface CompactCoachContext {
  generatedAtDate: string;
  timezone: string;
  phase: string;
  goals: {
    immediate: string;
    firstMajor5k: string;
    longTerm5k: string;
  };
  privacyApplied: {
    shareNotes: boolean;
    shareRecovery: boolean;
    shareKarate: boolean;
    shareCommitments: boolean;
  };
  recentRuns: {
    date: string;
    distanceKm: number;
    duration: string;
    pace: string;
    type: string;
    rpe: number | null;
    painPresent: boolean;
    notes?: string | null;
  }[];
  benchmarks: {
    distance: string;
    confirmedPb: string | null;
    fastestLogged: string | null;
    estimatedRiegel: string | null;
  }[];
  upcomingPlan: {
    date: string;
    type: string;
    title: string;
    targetKm: number;
    status: string;
  }[];
  recovery?: {
    latestDate: string;
    score: number | null;
    band: string;
    sleepHours: number | null;
    painPresent: boolean;
    flags: string[];
  } | null;
  karateSchedule?: {
    date: string;
    title: string;
    physicalLoad: string;
  }[];
  otherCommitments?: {
    date: string;
    category: string;
    title: string;
  }[];
}

/* Builds a compact, verified JSON snapshot strictly honoring user privacy toggles. */
export function buildCompactCoachContext(params: {
  today: string;
  profile: Pick<
    UserProfile,
    | 'timezone'
    | 'current_phase'
    | 'immediate_goal'
    | 'first_major_5k_goal_s'
    | 'long_term_5k_goal_s'
    | 'ai_share_notes'
    | 'ai_share_recovery'
    | 'ai_share_karate'
    | 'ai_share_commitments'
  >;
  sessions: RunningSession[];
  personalBests: PersonalBest[];
  plannedWorkouts: PlannedWorkout[];
  blocks: ScheduleBlock[];
  checkIns: ReadinessCheckIn[];
}): CompactCoachContext {
  const { today, profile, sessions, personalBests, plannedWorkouts, blocks, checkIns } = params;

  const recordedRuns = sessions
    .filter((s) => s.data_origin === 'RECORDED')
    .slice()
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 8);

  const recentRuns = recordedRuns.map((r) => {
    const base = {
      date: r.session_date,
      distanceKm: Number((r.distance_m / 1000).toFixed(2)),
      duration: formatDurationSeconds(r.duration_s),
      pace: formatPace(r.distance_m, r.duration_s),
      type: WORKOUT_TYPE_LABELS[r.workout_type],
      rpe: r.rpe,
      painPresent: r.pain_present,
    };
    return profile.ai_share_notes ? { ...base, notes: r.notes } : base;
  });

  const benchmarks = buildBenchmarkMatrix(sessions, personalBests).map((row) => ({
    distance: row.distance,
    confirmedPb: row.confirmedPb ? formatDurationSeconds(row.confirmedPb.duration_s) : null,
    fastestLogged: row.fastestLogged ? formatDurationSeconds(row.fastestLogged.durationS) : null,
    estimatedRiegel: row.estimatedTimeS ? formatDurationSeconds(row.estimatedTimeS) : null,
  }));

  const upcomingPlan = plannedWorkouts
    .filter((w) => w.plan_date >= today)
    .slice()
    .sort((a, b) => a.plan_date.localeCompare(b.plan_date))
    .slice(0, 7)
    .map((w) => ({
      date: w.plan_date,
      type: WORKOUT_TYPE_LABELS[w.workout_type],
      title: w.title,
      targetKm: Number((w.target_distance_m / 1000).toFixed(2)),
      status: w.status,
    }));

  const context: CompactCoachContext = {
    generatedAtDate: today,
    timezone: profile.timezone,
    phase: TRAINING_PHASE_LABELS[profile.current_phase],
    goals: {
      immediate: profile.immediate_goal,
      firstMajor5k: formatDurationSeconds(profile.first_major_5k_goal_s),
      longTerm5k: formatDurationSeconds(profile.long_term_5k_goal_s),
    },
    privacyApplied: {
      shareNotes: profile.ai_share_notes,
      shareRecovery: profile.ai_share_recovery,
      shareKarate: profile.ai_share_karate,
      shareCommitments: profile.ai_share_commitments,
    },
    recentRuns,
    benchmarks,
    upcomingPlan,
  };

  if (profile.ai_share_recovery) {
    const latestCheckIn = checkIns
      .slice()
      .sort((a, b) => b.checkin_date.localeCompare(a.checkin_date))[0] ?? null;

    if (latestCheckIn) {
      const evalRes = evaluateReadiness(latestCheckIn);
      context.recovery = {
        latestDate: latestCheckIn.checkin_date,
        score: evalRes.score,
        band: evalRes.band,
        sleepHours: latestCheckIn.sleep_hours,
        painPresent: latestCheckIn.pain_present,
        flags: evalRes.flags,
      };
    } else {
      context.recovery = null;
    }
  }

  const next7End = addDaysIso(today, 6);
  const upcomingBlocks = expandCalendarOccurrences(blocks, [], today, next7End);

  if (profile.ai_share_karate) {
    context.karateSchedule = upcomingBlocks
      .filter((o) => o.category === 'KARATE')
      .map((o) => ({
        date: o.date,
        title: o.title,
        physicalLoad: o.physicalLoad,
      }));
  }

  if (profile.ai_share_commitments) {
    context.otherCommitments = upcomingBlocks
      .filter((o) => o.category !== 'RUNNING' && o.category !== 'KARATE')
      .map((o) => ({
        date: o.date,
        category: o.category,
        title: o.title,
      }));
  }

  return context;
}

export interface DeterministicWeeklyReview {
  weekStart: string; // Monday YYYY-MM-DD
  weekEnd: string; // Sunday YYYY-MM-DD
  runCount: number;
  totalDistanceM: number;
  totalDurationS: number;
  avgPaceSecPerKm: number | null;
  longestRunM: number;
  previousWeekDistanceM: number;
  distanceDeltaM: number;
  plannedRunsCount: number;
  completedPlannedCount: number;
  adherencePct: number | null;
  checkInCount: number;
  avgReadinessScore: number | null;
  painDaysCount: number;
  karateSessionsCount: number;
  karateMinutes: number;
  recoveryDaysCount: number;
  otherCommitmentsCount: number;
  highlights: string[];
  watchouts: string[];
}

/* Computes exact Mon–Sun weekly metrics with strict running vs. non-running separation. */
export function computeDeterministicWeeklyReview(params: {
  referenceDate: string;
  sessions: RunningSession[];
  plannedWorkouts: PlannedWorkout[];
  blocks: ScheduleBlock[];
  checkIns: ReadinessCheckIn[];
}): DeterministicWeeklyReview {
  const { referenceDate, sessions, plannedWorkouts, blocks, checkIns } = params;

  const weekStart = getMondayWeekStart(referenceDate);
  const weekEnd = addDaysIso(weekStart, 6);
  const prevWeekStart = addDaysIso(weekStart, -7);
  const prevWeekEnd = addDaysIso(weekStart, -1);

  const recorded = sessions.filter((s) => s.data_origin === 'RECORDED');
  const weekRuns = recorded.filter(
    (s) => s.session_date >= weekStart && s.session_date <= weekEnd
  );
  const prevRuns = recorded.filter(
    (s) => s.session_date >= prevWeekStart && s.session_date <= prevWeekEnd
  );

  const totalDistanceM = weekRuns.reduce((sum, r) => sum + r.distance_m, 0);
  const totalDurationS = weekRuns.reduce((sum, r) => sum + r.duration_s, 0);
  const longestRunM = weekRuns.reduce((max, r) => Math.max(max, r.distance_m), 0);
  const avgPaceSecPerKm =
    totalDistanceM > 0 && totalDurationS > 0
      ? Math.round((totalDurationS / totalDistanceM) * 1000)
      : null;

  const previousWeekDistanceM = prevRuns.reduce((sum, r) => sum + r.distance_m, 0);
  const distanceDeltaM = totalDistanceM - previousWeekDistanceM;

  const weekPlanned = plannedWorkouts.filter(
    (w) => w.plan_date >= weekStart && w.plan_date <= weekEnd
  );
  const plannedRunsCount = weekPlanned.length;
  const completedPlannedCount = weekPlanned.filter((w) => w.status === 'COMPLETED').length;
  const adherencePct =
    plannedRunsCount > 0 ? Math.round((completedPlannedCount / plannedRunsCount) * 100) : null;

  const weekCheckIns = checkIns.filter(
    (c) => c.checkin_date >= weekStart && c.checkin_date <= weekEnd
  );
  const scoredCheckIns = weekCheckIns
    .map((c) => evaluateReadiness(c).score)
    .filter((s): s is number => s !== null);
  const avgReadinessScore =
    scoredCheckIns.length > 0
      ? Math.round(scoredCheckIns.reduce((a, b) => a + b, 0) / scoredCheckIns.length)
      : null;

  const painDates = new Set<string>();
  for (const r of weekRuns) {
    if (r.pain_present) painDates.add(r.session_date);
  }
  for (const c of weekCheckIns) {
    if (c.pain_present) painDates.add(c.checkin_date);
  }

  const weekBlocks = expandCalendarOccurrences(blocks, [], weekStart, weekEnd);
  const karateEvents = weekBlocks.filter((b) => b.category === 'KARATE');
  const recoveryEvents = weekBlocks.filter((b) => b.category === 'RECOVERY');
  const otherEvents = weekBlocks.filter(
    (b) => b.category !== 'RUNNING' && b.category !== 'KARATE' && b.category !== 'RECOVERY'
  );

  const highlights: string[] = [];
  const watchouts: string[] = [];

  if (weekRuns.length > 0) {
    highlights.push(
      `Completed ${weekRuns.length} run(s) totaling ${formatDistanceKm(totalDistanceM)} (${formatDurationSeconds(
        totalDurationS
      )}).`
    );
  } else {
    watchouts.push('No completed running sessions recorded in this Monday–Sunday window.');
  }

  if (adherencePct !== null && adherencePct >= 75) {
    highlights.push(
      `Strong plan execution: ${completedPlannedCount}/${plannedRunsCount} planned sessions completed (${adherencePct}%).`
    );
  } else if (adherencePct !== null && adherencePct < 50) {
    watchouts.push(
      `Plan adherence was ${adherencePct}% (${completedPlannedCount}/${plannedRunsCount}); check if targets fit your weekly commitments.`
    );
  }

  if (previousWeekDistanceM > 0 && distanceDeltaM > previousWeekDistanceM * 0.15) {
    watchouts.push(
      `Weekly running distance jumped by +${(distanceDeltaM / 1000).toFixed(
        2
      )} km (>15% above prior week). Monitor soreness closely.`
    );
  } else if (distanceDeltaM > 0 && previousWeekDistanceM > 0) {
    highlights.push(
      `Controlled progression of +${(distanceDeltaM / 1000).toFixed(2)} km over the prior week.`
    );
  }

  if (painDates.size > 0) {
    watchouts.push(
      `Pain was flagged on ${painDates.size} day(s) this week — keep effort conservative and prioritize pain-free recovery.`
    );
  }

  if (avgReadinessScore !== null && avgReadinessScore < 60) {
    watchouts.push(
      `Average readiness score was ${avgReadinessScore}/100. Protect sleep and avoid stacking hard runs with Karate.`
    );
  } else if (avgReadinessScore !== null && avgReadinessScore >= 75) {
    highlights.push(`Solid average readiness score of ${avgReadinessScore}/100 across ${scoredCheckIns.length} check-in(s).`);
  }

  if (karateEvents.length > 0) {
    highlights.push(
      `${karateEvents.length} Karate session(s) tracked separately from running mileage to protect total load balance.`
    );
  }

  return {
    weekStart,
    weekEnd,
    runCount: weekRuns.length,
    totalDistanceM,
    totalDurationS,
    avgPaceSecPerKm,
    longestRunM,
    previousWeekDistanceM,
    distanceDeltaM,
    plannedRunsCount,
    completedPlannedCount,
    adherencePct,
    checkInCount: weekCheckIns.length,
    avgReadinessScore,
    painDaysCount: painDates.size,
    karateSessionsCount: karateEvents.length,
    karateMinutes: karateEvents.reduce((sum, e) => sum + (e.durationMin ?? 0), 0),
    recoveryDaysCount: recoveryEvents.length,
    otherCommitmentsCount: otherEvents.length,
    highlights,
    watchouts,
  };
}

/* Deterministic local fallback when server-side Gemini API is unavailable or disabled. */
export function generateDeterministicCoachFallback(
  question: string,
  context: CompactCoachContext,
  sessions: RunningSession[]
): string {
  const lower = question.toLowerCase();
  const lines: string[] = [];
  const zones = computeTrainingPaceZones(sessions);

  lines.push(`Grounded Summary (${context.phase} · ${context.generatedAtDate}):`);

  if (context.recentRuns.length === 0) {
    lines.push(
      '- Recorded runs: None logged yet. Log at least one run ≥ 1.50 km to unlock calculated pace zones and Riegel estimates.'
    );
  } else {
    const latest = context.recentRuns[0];
    lines.push(
      `- Latest recorded run: ${latest.date} · ${latest.distanceKm.toFixed(2)} km in ${
        latest.duration
      } (${latest.pace}, ${latest.type}).`
    );
  }

  if (lower.includes('pace') || lower.includes('zone') || lower.includes('5k')) {
    if (zones.easy && zones.tempo) {
      lines.push(
        `- Estimated pace zones (from ${zones.anchorRun?.session_date}): Easy ${Math.floor(
          zones.easy.minSecPerKm / 60
        )}:${String(zones.easy.minSecPerKm % 60).padStart(2, '0')}–${Math.floor(
          zones.easy.maxSecPerKm / 60
        )}:${String(zones.easy.maxSecPerKm % 60).padStart(2, '0')} /km · Tempo ${Math.floor(
          zones.tempo.minSecPerKm / 60
        )}:${String(zones.tempo.minSecPerKm % 60).padStart(2, '0')}–${Math.floor(
          zones.tempo.maxSecPerKm / 60
        )}:${String(zones.tempo.maxSecPerKm % 60).padStart(2, '0')} /km.`
      );
    } else {
      lines.push(
        '- Pace zones: Unavailable until a ≥ 1.50 km run is recorded; guide runs by RPE 3–4 for easy days.'
      );
    }
  }

  if (context.recovery === undefined) {
    lines.push('- Recovery data: Not shared (disabled in Settings privacy controls).');
  } else if (context.recovery === null) {
    lines.push('- Recovery data: Missing (no daily readiness check-in logged yet).');
  } else {
    lines.push(
      `- Latest readiness (${context.recovery.latestDate}): ${
        context.recovery.score !== null ? `${context.recovery.score}/100` : 'Incomplete'
      } (${context.recovery.band})${
        context.recovery.painPresent ? ' — PAIN FLAGGED: prioritize pain-free rest/assessment.' : '.'
      }`
    );
  }

  if (context.upcomingPlan.length > 0) {
    const next = context.upcomingPlan[0];
    lines.push(
      `- Next planned session: ${next.date} · ${next.title} (${next.targetKm.toFixed(2)} km, ${
        next.type
      }).`
    );
  } else {
    lines.push('- Upcoming plan: No sessions scheduled yet on the Training Plan page.');
  }

  if (context.karateSchedule && context.karateSchedule.length > 0) {
    lines.push(
      `- Karate load protection: ${context.karateSchedule.length} upcoming Karate block(s) detected; keep hard running separated from Karate days.`
    );
  }

  lines.push(
    '\n(Deterministic local response — enable AI in Settings and deploy `/api/coach` with a server-side GEMINI_API_KEY for conversational Gemini coaching.)'
  );

  return lines.join('\n');
}