import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  RefreshCw,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Button,
  Card,
  CategoryBadge,
  EmptyState,
  PageHeader,
  ProvenanceBadge,
  StatTile,
} from '@/design-system';
import { formatDurationSeconds, getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listRunningSessions } from '@/modules/running/repository';
import { formatDistanceKm } from '@/modules/running/calculations';
import { listReadinessCheckIns, listScheduleBlocks } from '@/modules/calendar/repository';
import {
  ISO_WEEKDAYS,
  addDaysIso,
  buildDateRange,
  expandCalendarOccurrences,
  getIsoWeekday,
} from '@/modules/calendar/scheduleEngine';
import {
  computeTrainingPaceZones,
  detectPlanAdjustments,
  evaluatePhaseReadiness,
  formatPaceRange,
  generateRollingSevenDayPlan,
  type ProposedAdjustment,
} from '@/modules/plan/planEngine';
import {
  createPlanAdjustment,
  deletePlannedWorkout,
  listPlanAdjustments,
  listPlannedWorkouts,
  updatePlannedWorkoutStatus,
  upsertPlannedWorkouts,
} from '@/modules/plan/repository';
import {
  TRAINING_PHASE_LABELS,
  WORKOUT_TYPE_LABELS,
  type PlanAdjustment,
  type PlannedWorkout,
  type PlannedWorkoutStatus,
  type ReadinessCheckIn,
  type RunningSession,
  type ScheduleBlock,
} from '@/types/domain';

export function TrainingPlanPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);
  const windowEnd = addDaysIso(today, 6);
  const rollingDates = useMemo(() => buildDateRange(today, windowEnd), [today, windowEnd]);

  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [checkIns, setCheckIns] = useState<ReadinessCheckIn[]>([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([]);
  const [adjustments, setAdjustments] = useState<PlanAdjustment[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [runRows, blockRows, checkInRows, planRows, adjRows] = await Promise.all([
        listRunningSessions(user.id),
        listScheduleBlocks(user.id).catch(() => [] as ScheduleBlock[]),
        listReadinessCheckIns(user.id, 14).catch(() => [] as ReadinessCheckIn[]),
        listPlannedWorkouts(user.id, today, windowEnd),
        listPlanAdjustments(user.id, 15).catch(() => [] as PlanAdjustment[]),
      ]);
      setSessions(runRows);
      setBlocks(blockRows);
      setCheckIns(checkInRows);
      setPlannedWorkouts(planRows);
      setAdjustments(adjRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load training plan.');
    } finally {
      setLoading(false);
    }
  }, [user, today, windowEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activePhase = profile?.current_phase ?? 'REBUILDING';
  const preferredDays = profile?.preferred_run_days?.length
    ? profile.preferred_run_days
    : [1, 3, 5, 6];

  const paceZones = useMemo(() => computeTrainingPaceZones(sessions), [sessions]);

  const phaseReport = useMemo(
    () => evaluatePhaseReadiness(activePhase, sessions, checkIns, today),
    [activePhase, sessions, checkIns, today]
  );

  const nonRunningOccurrences = useMemo(() => {
    return expandCalendarOccurrences(blocks, [], today, windowEnd).filter(
      (o) => o.category !== 'RUNNING'
    );
  }, [blocks, today, windowEnd]);

  const proposals = useMemo(() => {
    const raw = detectPlanAdjustments({
      today,
      plannedWorkouts,
      sessions,
      blocks,
      checkIns,
    });
    return raw.filter((p) => !dismissedIds.includes(p.id));
  }, [today, plannedWorkouts, sessions, blocks, checkIns, dismissedIds]);

  const nextRun = useMemo(() => {
    return (
      plannedWorkouts.find(
        (w) => (w.status === 'PLANNED' || w.status === 'ADJUSTED') && w.plan_date >= today
      ) ?? null
    );
  }, [plannedWorkouts, today]);

  const plannedTotalM = useMemo(
    () =>
      plannedWorkouts
        .filter((w) => w.status !== 'SKIPPED')
        .reduce((sum, w) => sum + w.target_distance_m, 0),
    [plannedWorkouts]
  );

  async function handleGeneratePlan() {
    if (!user) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const drafts = generateRollingSevenDayPlan({
        referenceDate: today,
        profile: {
          current_phase: activePhase,
          preferred_run_days: preferredDays,
        },
        sessions,
        blocks,
        checkIns,
      });

      if (drafts.length === 0) {
        setError(
          'No eligible running days found in the next 7 days (all days are marked as protected Rest/Recovery).'
        );
        return;
      }

      // Preserve any already-completed workouts in the current window
      const completedDates = new Set(
        plannedWorkouts.filter((w) => w.status === 'COMPLETED').map((w) => w.plan_date)
      );
      const toSave = drafts.filter((d) => !completedDates.has(d.plan_date));

      await upsertPlannedWorkouts(user.id, toSave);
      setDismissedIds([]);
      await loadData();
      setNotice(
        `Generated ${toSave.length} rolling workout(s) for ${today} → ${windowEnd}, respecting protected Rest and high-load commitments.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate training plan.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleAcceptAdjustment(proposal: ProposedAdjustment) {
    if (!user) return;
    setActingId(proposal.id);
    setError(null);
    try {
      await upsertPlannedWorkouts(user.id, [proposal.updatedDraft]);
      await createPlanAdjustment(user.id, {
        adjustment_date: proposal.planDate,
        trigger_code: proposal.triggerCode,
        trigger_reason: proposal.triggerReason,
        previous_summary: proposal.previousSummary,
        proposed_summary: proposal.proposedSummary,
        decision: 'ACCEPTED',
      });
      setNotice(`Adjustment accepted for ${proposal.planDate} and logged transparently.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply adjustment.');
    } finally {
      setActingId(null);
    }
  }

  async function handleDismissAdjustment(proposal: ProposedAdjustment) {
    if (!user) return;
    setActingId(proposal.id);
    setError(null);
    try {
      await createPlanAdjustment(user.id, {
        adjustment_date: proposal.planDate,
        trigger_code: proposal.triggerCode,
        trigger_reason: proposal.triggerReason,
        previous_summary: proposal.previousSummary,
        proposed_summary: proposal.proposedSummary,
        decision: 'DISMISSED',
      });
      setDismissedIds((prev) => [...prev, proposal.id]);
      setNotice(`Adjustment dismissed for ${proposal.planDate}; original workout retained.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log dismissal.');
    } finally {
      setActingId(null);
    }
  }

  async function handleStatusChange(workout: PlannedWorkout, nextStatus: PlannedWorkoutStatus) {
    if (!user) return;
    setActingId(workout.id);
    try {
      await updatePlannedWorkoutStatus(user.id, workout.id, nextStatus);
      await loadData();
    } finally {
      setActingId(null);
    }
  }

  async function handleRemoveWorkout(workout: PlannedWorkout) {
    if (!user) return;
    if (!window.confirm(`Remove planned workout on ${workout.plan_date}?`)) return;
    setActingId(workout.id);
    try {
      await deletePlannedWorkout(user.id, workout.id);
      await loadData();
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Adaptive Training Plan"
        subtitle={`Rolling 7-day plan (${today} → ${windowEnd}, ${tz}) grounded in your recorded runs, readiness, and non-running commitments.`}
        action={
          <Button onClick={() => void handleGeneratePlan()} disabled={generating}>
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            <span>
              {generating
                ? 'Generating...'
                : plannedWorkouts.length > 0
                ? 'Regenerate 7-Day Plan'
                : 'Generate 7-Day Plan'}
            </span>
          </Button>
        }
      />

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {error}
        </div>
      )}

      {/* Top KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active Phase"
          value={TRAINING_PHASE_LABELS[activePhase].split(' — ')[0]}
          meta={TRAINING_PHASE_LABELS[activePhase].split(' — ')[1] ?? activePhase}
          origin="PLANNED"
        />
        <StatTile
          label="Safe 7-Day Volume Target"
          value={`${phaseReport.targetWeeklyKm.toFixed(1)} km`}
          meta={`28d avg: ${phaseReport.weeklyAvgKm28d.toFixed(1)} km/wk (≤10% cap)`}
          origin="CALCULATED"
        />
        <StatTile
          label="Scheduled Next 7 Days"
          value={loading ? '...' : formatDistanceKm(plannedTotalM)}
          meta={`${plannedWorkouts.filter((w) => w.status !== 'SKIPPED').length} active session(s)`}
          origin={plannedWorkouts.length > 0 ? 'PLANNED' : 'MISSING'}
        />
        <StatTile
          label="Easy Pace Zone"
          value={paceZones.easy ? formatPaceRange(paceZones.easy.minSecPerKm, paceZones.easy.maxSecPerKm) : 'RPE 3–4'}
          meta={paceZones.anchorRun ? `From ${paceZones.anchorRun.session_date}` : 'No ≥1.5 km anchor yet'}
          origin={paceZones.easy ? 'ESTIMATED' : 'MISSING'}
        />
      </div>

      {/* Non-Silent Proposed Adjustments */}
      {proposals.length > 0 && (
        <div className="space-y-3">
          {proposals.map((prop) => (
            <Card
              key={prop.id}
              className={`p-5 ${
                prop.severity === 'HIGH'
                  ? 'border-red-300 bg-red-50/60'
                  : 'border-amber-300 bg-amber-50/60'
              }`}
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {prop.severity === 'HIGH' ? (
                      <ShieldAlert className="h-4 w-4 text-red-700" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-700" />
                    )}
                    <span className="text-sm font-bold text-slate-900">
                      Proposed Plan Adjustment ({prop.planDate})
                    </span>
                    <ProvenanceBadge origin="SUGGESTED" />
                  </div>
                  <p className="text-xs font-medium text-slate-700">{prop.triggerReason}</p>
                  <div className="grid gap-2 pt-1 text-xs sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Current Plan
                      </span>
                      <div className="mt-0.5 font-medium text-slate-700 line-through">
                        {prop.previousSummary}
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-white px-3 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                        Proposed Change
                      </span>
                      <div className="mt-0.5 font-semibold text-slate-900">
                        {prop.proposedSummary}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    disabled={actingId === prop.id}
                    onClick={() => void handleDismissAdjustment(prop)}
                    className="bg-white"
                  >
                    Dismiss
                  </Button>
                  <Button
                    disabled={actingId === prop.id}
                    onClick={() => void handleAcceptAdjustment(prop)}
                  >
                    Accept Adjustment
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Next Run Focus + Pace Zones & Phase Criteria */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-slate-900">Next Recommended Run</h2>
              </div>
              <ProvenanceBadge origin={nextRun ? nextRun.data_origin : 'MISSING'} />
            </div>

            {!nextRun ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-600">
                No upcoming run scheduled in the next 7 days. Click{' '}
                <span className="font-semibold text-slate-900">Generate 7-Day Plan</span> above to
                build a schedule matched to your current phase and commitments.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {nextRun.plan_date}
                  </span>
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                    {WORKOUT_TYPE_LABELS[nextRun.workout_type]}
                  </span>
                  {nextRun.status === 'ADJUSTED' && (
                    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      Adapted
                    </span>
                  )}
                </div>

                <div className="text-base font-bold text-slate-900">{nextRun.title}</div>

                <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 py-2.5 font-mono text-xs tabular-nums">
                  <div className="px-3">
                    <div className="text-[10px] uppercase text-slate-500">Target Dist</div>
                    <div className="mt-0.5 text-sm font-bold text-slate-900">
                      {formatDistanceKm(nextRun.target_distance_m)}
                    </div>
                  </div>
                  <div className="px-3">
                    <div className="text-[10px] uppercase text-slate-500">Target Pace</div>
                    <div className="mt-0.5 text-sm font-bold text-blue-700">
                      {nextRun.target_pace_min_s && nextRun.target_pace_max_s
                        ? formatPaceRange(nextRun.target_pace_min_s, nextRun.target_pace_max_s)
                        : 'RPE only'}
                    </div>
                  </div>
                  <div className="px-3">
                    <div className="text-[10px] uppercase text-slate-500">Est. Time</div>
                    <div className="mt-0.5 text-sm font-bold text-slate-900">
                      {nextRun.target_duration_s
                        ? formatDurationSeconds(nextRun.target_duration_s)
                        : '—'}
                    </div>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-slate-600">{nextRun.rationale}</p>
                {nextRun.target_rpe_range && (
                  <div className="text-xs font-medium text-slate-700">
                    Effort cue: {nextRun.target_rpe_range}
                  </div>
                )}
              </div>
            )}
          </div>

          {nextRun && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <Link to="/runs" className="text-xs font-semibold text-blue-700 hover:underline">
                Log completed run in Running Log →
              </Link>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={actingId === nextRun.id}
                  onClick={() => void handleStatusChange(nextRun, 'SKIPPED')}
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span>Skip</span>
                </Button>
                <Button
                  disabled={actingId === nextRun.id}
                  onClick={() => void handleStatusChange(nextRun, 'COMPLETED')}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Mark Done</span>
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-700" />
              <h2 className="text-sm font-semibold text-slate-900">
                Pace Zones &amp; Phase Progression
              </h2>
            </div>
            <ProvenanceBadge origin={paceZones.anchorRun ? 'ESTIMATED' : 'MISSING'} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-slate-500">Easy / Recovery</div>
              <div className="mt-0.5 font-mono font-bold text-slate-900">
                {paceZones.easy
                  ? formatPaceRange(paceZones.easy.minSecPerKm, paceZones.easy.maxSecPerKm)
                  : 'RPE 3–4'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-slate-500">Long Run</div>
              <div className="mt-0.5 font-mono font-bold text-slate-900">
                {paceZones.long
                  ? formatPaceRange(paceZones.long.minSecPerKm, paceZones.long.maxSecPerKm)
                  : 'RPE 4–5'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-slate-500">Tempo / Threshold</div>
              <div className="mt-0.5 font-mono font-bold text-slate-900">
                {paceZones.tempo
                  ? formatPaceRange(paceZones.tempo.minSecPerKm, paceZones.tempo.maxSecPerKm)
                  : 'RPE 6–7'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-slate-500">5K Intervals</div>
              <div className="mt-0.5 font-mono font-bold text-slate-900">
                {paceZones.intervals
                  ? formatPaceRange(
                      paceZones.intervals.minSecPerKm,
                      paceZones.intervals.maxSecPerKm
                    )
                  : 'RPE 7–8'}
              </div>
            </div>
          </div>

          <p className="mt-2.5 text-[11px] text-slate-500">{paceZones.basisNote}</p>

          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>
                {phaseReport.nextPhase
                  ? `Readiness for ${TRAINING_PHASE_LABELS[phaseReport.nextPhase]}`
                  : 'Peak Phase Maintenance Criteria'}
              </span>
              {phaseReport.readyForNextPhase && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Criteria Met
                </span>
              )}
            </div>
            <ul className="mt-2 space-y-1.5 text-xs">
              {phaseReport.criteria.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-slate-600">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      c.met ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  />
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* Rolling 7-Day Schedule */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Rolling 7-Day Schedule</h2>
          <span className="font-mono text-xs text-slate-500">
            Preferred run days:{' '}
            {preferredDays
              .map((d) => ISO_WEEKDAYS.find((w) => w.iso === d)?.short)
              .filter(Boolean)
              .join(', ')}
          </span>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
            Loading rolling plan...
          </div>
        ) : plannedWorkouts.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="No rolling 7-day plan generated yet"
            description="Generate your personalized 7-day running plan automatically aligned around your Karate, Rest Days, and current phase."
            action={
              <Button onClick={() => void handleGeneratePlan()} disabled={generating}>
                <RefreshCw className="h-4 w-4" />
                <span>Generate 7-Day Plan</span>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-7">
            {rollingDates.map((date) => {
              const iso = getIsoWeekday(date);
              const weekdayLabel = ISO_WEEKDAYS.find((d) => d.iso === iso)?.short ?? '';
              const workout = plannedWorkouts.find((w) => w.plan_date === date) ?? null;
              const dayCommitments = nonRunningOccurrences.filter((o) => o.date === date);
              const isToday = date === today;

              return (
                <Card
                  key={date}
                  className={`flex min-h-[220px] flex-col justify-between p-3 ${
                    isToday ? 'border-blue-600 ring-1 ring-blue-600' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-semibold text-slate-500">{weekdayLabel}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
                          isToday ? 'bg-blue-700 text-white' : 'text-slate-900'
                        }`}
                      >
                        {date.slice(8)}
                      </span>
                    </div>

                    {workout ? (
                      <div
                        className={`mt-2.5 rounded-lg border p-2.5 text-xs ${
                          workout.status === 'COMPLETED'
                            ? 'border-emerald-200 bg-emerald-50/70'
                            : workout.status === 'SKIPPED'
                            ? 'border-slate-200 bg-slate-100/70 opacity-65'
                            : workout.status === 'ADJUSTED'
                            ? 'border-amber-200 bg-amber-50/70'
                            : 'border-blue-200 bg-blue-50/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[10px] font-bold uppercase text-blue-800">
                            {WORKOUT_TYPE_LABELS[workout.workout_type]}
                          </span>
                          <span className="rounded bg-white px-1 py-0.5 font-mono text-[9px] font-semibold text-slate-600">
                            {workout.status}
                          </span>
                        </div>
                        <div className="mt-1 font-semibold text-slate-900">{workout.title}</div>
                        <div className="mt-1 font-mono text-xs font-bold text-slate-800">
                          {formatDistanceKm(workout.target_distance_m)}
                        </div>
                        {workout.target_pace_min_s && workout.target_pace_max_s && (
                          <div className="mt-0.5 font-mono text-[10px] text-slate-600">
                            {formatPaceRange(workout.target_pace_min_s, workout.target_pace_max_s)}
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between border-t border-slate-200/70 pt-1.5">
                          <button
                            type="button"
                            disabled={actingId === workout.id}
                            onClick={() =>
                              void handleStatusChange(
                                workout,
                                workout.status === 'COMPLETED' ? 'PLANNED' : 'COMPLETED'
                              )
                            }
                            className="text-[10px] font-semibold text-blue-700 hover:underline"
                          >
                            {workout.status === 'COMPLETED' ? 'Undo' : 'Done'}
                          </button>
                          <button
                            type="button"
                            disabled={actingId === workout.id}
                            onClick={() => void handleRemoveWorkout(workout)}
                            aria-label={`Remove workout on ${date}`}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 text-center text-[11px] font-medium text-slate-400">
                        No Run Planned
                      </div>
                    )}
                  </div>

                  {dayCommitments.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-slate-100 pt-2">
                      {dayCommitments.map((c) => (
                        <div key={c.occurrenceKey} className="flex items-center justify-between gap-1">
                          <span className="truncate text-[10px] text-slate-600" title={c.title}>
                            {c.title}
                          </span>
                          <CategoryBadge category={c.category} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Non-Silent Adjustment Audit Log */}
      {adjustments.length > 0 && (
        <Card className="p-5">
          <h2 className="border-b border-slate-100 pb-3 text-sm font-semibold text-slate-900">
            Recent Plan Adjustment Log
          </h2>
          <div className="mt-3 divide-y divide-slate-100 text-xs">
            {adjustments.map((adj) => (
              <div
                key={adj.id}
                className="flex flex-col justify-between gap-2 py-2.5 sm:flex-row sm:items-center"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">
                      {adj.adjustment_date}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                        adj.decision === 'ACCEPTED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {adj.decision}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-700">{adj.trigger_reason}</div>
                  <div className="mt-0.5 text-slate-500">
                    {adj.previous_summary} → <span className="font-medium text-slate-800">{adj.proposed_summary}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}