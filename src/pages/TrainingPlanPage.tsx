import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Edit3,
  Info,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { CategoryMark } from '@/design-system';
import { getLocalDateString } from '@/lib/datetime';
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
  listPlannedWorkouts,
  updatePlannedWorkoutStatus,
  upsertPlannedWorkouts,
} from '@/modules/plan/repository';
import { PlannedWorkoutModal } from '@/modules/plan/PlannedWorkoutModal';
import {
  TRAINING_PHASE_LABELS,
  WORKOUT_TYPE_LABELS,
  type PlannedWorkout,
  type PlannedWorkoutDraft,
  type PlannedWorkoutStatus,
  type ReadinessCheckIn,
  type RunningSession,
  type ScheduleBlock,
} from '@/types/domain';

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

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
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<PlannedWorkout | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState(today);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [runRows, blockRows, checkInRows, planRows] = await Promise.all([
        listRunningSessions(user.id),
        listScheduleBlocks(user.id).catch(() => [] as ScheduleBlock[]),
        listReadinessCheckIns(user.id, 14).catch(() => [] as ReadinessCheckIn[]),
        listPlannedWorkouts(user.id, today, windowEnd),
      ]);
      setSessions(runRows);
      setBlocks(blockRows);
      setCheckIns(checkInRows);
      setPlannedWorkouts(planRows);
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

  const activeWorkouts = useMemo(
    () => plannedWorkouts.filter((w) => w.status !== 'SKIPPED'),
    [plannedWorkouts]
  );

  const plannedTotalM = useMemo(
    () => activeWorkouts.reduce((sum, w) => sum + w.target_distance_m, 0),
    [activeWorkouts]
  );

  function openAddWorkout(dateIso: string) {
    setEditingWorkout(null);
    setModalDefaultDate(dateIso);
    setShowWorkoutModal(true);
  }

  function openEditWorkout(workout: PlannedWorkout) {
    setEditingWorkout(workout);
    setModalDefaultDate(workout.plan_date);
    setShowWorkoutModal(true);
  }

  async function handleSaveManualWorkout(
    draft: PlannedWorkoutDraft,
    previousId?: string,
    previousDate?: string
  ) {
    if (!user) return;
    setError(null);
    setNotice(null);
    if (previousId && previousDate && previousDate !== draft.plan_date) {
      await deletePlannedWorkout(user.id, previousId);
    }
    await upsertPlannedWorkouts(user.id, [draft]);
    await loadData();
    setNotice(
      previousId
        ? `Updated workout for ${formatShortDate(draft.plan_date)}.`
        : `Added ${draft.title} on ${formatShortDate(draft.plan_date)}.`
    );
  }

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
        setError('No eligible running days found in the next 7 days.');
        return;
      }

      const completedDates = new Set(
        plannedWorkouts.filter((w) => w.status === 'COMPLETED').map((w) => w.plan_date)
      );
      const toSave = drafts.filter((d) => !completedDates.has(d.plan_date));

      await upsertPlannedWorkouts(user.id, toSave);
      setDismissedIds([]);
      await loadData();
      setNotice(`Drafted ${toSave.length} session(s) for the next 7 days.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate training plan.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleAcceptAdjustment(proposal: ProposedAdjustment) {
    if (!user) return;
    setActingId(proposal.id);
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
      await loadData();
      setNotice(`Applied adjustment for ${formatShortDate(proposal.planDate)}.`);
    } finally {
      setActingId(null);
    }
  }

  async function handleDismissAdjustment(proposal: ProposedAdjustment) {
    if (!user) return;
    setActingId(proposal.id);
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
      await loadData();
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

  const phaseParts = TRAINING_PHASE_LABELS[activePhase].split(' — ');
  const metCount = phaseReport.criteria.filter((c) => c.met).length;
  const progressPct =
    phaseReport.criteria.length > 0
      ? Math.round((metCount / phaseReport.criteria.length) * 100)
      : 0;

  return (
    <div className="space-y-7 pb-6">
      {/* Studio Header (Common Default Stride Blue) */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
            Plan your <em className="not-italic text-[var(--blue)]">week.</em>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={generating}
            onClick={() => void handleGeneratePlan()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] border border-[var(--blue)]/35 bg-[var(--blue-lite)] px-4 text-[12.5px] font-bold text-[var(--blue-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{generating ? 'Drafting...' : 'Draft a week'}</span>
          </button>
          <button
            type="button"
            onClick={() => openAddWorkout(today)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-[var(--blue-btn-text)] transition-opacity hover:opacity-90 active:translate-y-px"
          >
            <Plus className="h-4 w-4 stroke-[2.4]" />
            <span>Add a run</span>
          </button>
        </div>
      </header>

      {notice && (
        <div className="rounded-xl border border-[var(--blue)]/30 bg-[var(--blue-lite)] px-4 py-2.5 text-xs font-semibold text-[var(--blue-ink)]">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Clean 3-Column Metric Strip */}
      <div className="grid grid-cols-1 divide-y divide-[var(--line)] rounded-[15px] border border-[var(--line)] bg-[var(--surface)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
            SCHEDULED RUNNING
          </span>
          <div className="mt-2 font-mono text-[32px] font-bold leading-none tracking-[-0.06em] text-[var(--blue)] tabular-nums">
            {loading ? '—' : (plannedTotalM / 1000).toFixed(1)}
            <small className="ml-1.5 font-sans text-[14px] font-medium text-[var(--muted)]">
              km
            </small>
          </div>
          <span className="mt-1.5 block text-[11.5px] text-[var(--muted)]">
            {activeWorkouts.length} planned {activeWorkouts.length === 1 ? 'session' : 'sessions'}
          </span>
        </div>

        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
            CURRENT PHASE
          </span>
          <div className="mt-2 font-mono text-[32px] font-bold leading-none tracking-[-0.06em] text-[var(--ink)]">
            {phaseParts[0].replace('Phase ', '0')}
          </div>
          <span className="mt-1.5 block text-[11.5px] text-[var(--muted)]">
            {phaseParts[1] ?? activePhase}
          </span>
        </div>

        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
            EASY PACE ZONE
          </span>
          <div className="mt-2 font-mono text-[26px] font-bold leading-tight tracking-[-0.05em] text-[var(--ink)] tabular-nums">
            {paceZones.easy
              ? formatPaceRange(paceZones.easy.minSecPerKm, paceZones.easy.maxSecPerKm)
              : 'RPE 3–4'}
          </div>
          <span className="mt-1 block text-[11.5px] text-[var(--muted)]">
            Safe cap: {phaseReport.targetWeeklyKm.toFixed(1)} km / wk
          </span>
        </div>
      </div>

      {/* Proposed Adaptive Adjustments (shown only when triggered) */}
      {proposals.length > 0 && (
        <div className="space-y-2.5">
          {proposals.map((prop) => (
            <section
              key={prop.id}
              className="flex flex-col justify-between gap-3 rounded-[15px] border border-[var(--line-strong)] bg-[var(--surface)] p-5 lg:flex-row lg:items-center"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--ink)]">
                  {prop.severity === 'HIGH' ? (
                    <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                  )}
                  <span>Suggested adjustment for {formatShortDate(prop.planDate)}</span>
                </div>
                <p className="text-[12px] text-[var(--muted)]">
                  {prop.triggerReason} —{' '}
                  <span className="line-through">{prop.previousSummary}</span> →{' '}
                  <strong className="text-[var(--ink)]">{prop.proposedSummary}</strong>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={actingId === prop.id}
                  onClick={() => void handleDismissAdjustment(prop)}
                  className="h-9 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={actingId === prop.id}
                  onClick={() => void handleAcceptAdjustment(prop)}
                  className="h-9 rounded-[8px] bg-[var(--blue)] px-3.5 text-[12px] font-bold text-[var(--blue-btn-text)] hover:opacity-90"
                >
                  Accept
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Clean 7-Day Schedule Builder */}
      <section className="overflow-hidden rounded-[15px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-5">
          <div>
            <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Your week
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              {formatShortDate(today)} – {formatShortDate(windowEnd)}
            </p>
          </div>
          <span className="text-[11.5px] text-[var(--muted)]">
            All entries are planned, not recorded.
          </span>
        </div>

        <div className="grid grid-cols-1 divide-y divide-[var(--line)] border-t border-[var(--line)] md:grid-cols-7 md:divide-x md:divide-y-0">
          {rollingDates.map((date) => {
            const iso = getIsoWeekday(date);
            const weekdayLabel = ISO_WEEKDAYS.find((d) => d.iso === iso)?.short ?? '';
            const workout = plannedWorkouts.find((w) => w.plan_date === date) ?? null;
            const karateCount = nonRunningOccurrences.filter(
              (o) => o.date === date && o.category === 'KARATE'
            ).length;
            const otherCount = nonRunningOccurrences.filter(
              (o) => o.date === date && o.category !== 'KARATE'
            ).length;
            const isToday = date === today;

            return (
              <div
                key={date}
                style={
                  isToday
                    ? { background: 'color-mix(in srgb, var(--blue) 4%, var(--surface))' }
                    : undefined
                }
                className="flex min-h-[200px] flex-col p-3.5"
              >
                <button
                  type="button"
                  onClick={() => (workout ? openEditWorkout(workout) : openAddWorkout(date))}
                  className="flex w-full items-center justify-between border-b border-[var(--line)] pb-2.5 text-left"
                >
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
                    {weekdayLabel}
                  </span>
                  <b
                    className={`font-mono text-[14px] ${
                      isToday ? 'text-[var(--blue)]' : 'text-[var(--ink)]'
                    }`}
                  >
                    {Number(date.slice(8))}
                  </b>
                </button>

                <div className="flex flex-1 flex-col justify-between gap-3 pt-3.5">
                  {workout ? (
                    <div className="space-y-1.5">
                      <span className="block h-1 w-8 rounded-full bg-[var(--blue)]" />
                      <strong
                        className={`block text-[12px] font-bold leading-snug text-[var(--ink)] ${
                          workout.status === 'COMPLETED' ? 'line-through opacity-60' : ''
                        }`}
                      >
                        {workout.title}
                      </strong>
                      <small className="block font-mono text-[10.5px] text-[var(--muted)]">
                        {formatDistanceKm(workout.target_distance_m)} ·{' '}
                        {workout.status.toLowerCase()}
                      </small>
                    </div>
                  ) : (
                    <div className="my-auto text-center text-[11.5px] text-[var(--faint)]">
                      Open day
                    </div>
                  )}

                  <div className="space-y-2">
                    {(karateCount > 0 || otherCount > 0) && (
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              karateCount > 0 ? 'var(--karate)' : 'var(--line-strong)',
                          }}
                        />
                        <span className="truncate">
                          {karateCount > 0
                            ? `${karateCount} karate`
                            : `${otherCount} other`}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => (workout ? openEditWorkout(workout) : openAddWorkout(date))}
                      className="w-full rounded-[7px] border border-[var(--blue)]/30 bg-[var(--blue-lite)]/65 py-1.5 text-[10.5px] font-bold text-[var(--blue-ink)] transition-colors hover:bg-[var(--blue)] hover:text-[var(--blue-btn-text)]"
                    >
                      {workout ? 'Edit workout' : '+ Plan run'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Clean Lower 2-Column Section */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(290px,0.9fr)]">
        {/* Planned Workouts List */}
        <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
            Planned workouts
          </h2>

          {plannedWorkouts.length === 0 ? (
            <div className="mt-4 flex min-h-[150px] flex-col items-center justify-center border-t border-[var(--line)] px-4 py-6 text-center">
              <div className="mb-3 flex h-8 items-end gap-1 -rotate-12" aria-hidden="true">
                <span className="h-3.5 w-2 rounded bg-[var(--line-strong)]" />
                <span className="h-6 w-2 rounded bg-[var(--blue)]" />
                <span className="h-4.5 w-2 rounded bg-[var(--line-strong)]" />
              </div>
              <h3 className="text-[15px] font-bold text-[var(--ink)]">No runs scheduled.</h3>
              <p className="mt-1 text-[12px] text-[var(--muted)]">
                Use a day above to add your first planned workout.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {plannedWorkouts.map((w) => (
                <div key={w.id} className="flex items-center gap-3 py-3.5">
                  <CategoryMark category="RUNNING" size="sm" />
                  <div className="min-w-0 flex-1">
                    <strong
                      className={`block truncate text-[13px] font-bold text-[var(--ink)] ${
                        w.status === 'COMPLETED' ? 'line-through opacity-55' : ''
                      }`}
                    >
                      {w.title}
                    </strong>
                    <span className="mt-0.5 block truncate text-[11.5px] text-[var(--muted)]">
                      {formatShortDate(w.plan_date)} · {WORKOUT_TYPE_LABELS[w.workout_type]} ·{' '}
                      {w.status.toLowerCase()}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[12.5px] font-bold text-[var(--ink)] tabular-nums">
                    {formatDistanceKm(w.target_distance_m)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={actingId === w.id}
                      onClick={() =>
                        void handleStatusChange(
                          w,
                          w.status === 'COMPLETED' ? 'PLANNED' : 'COMPLETED'
                        )
                      }
                      aria-label={w.status === 'COMPLETED' ? 'Undo completion' : 'Mark done'}
                      className={`grid h-8 w-8 place-items-center rounded-[8px] border transition-colors ${
                        w.status === 'COMPLETED'
                          ? 'border-[var(--blue)] bg-[var(--blue)] text-[var(--blue-btn-text)]'
                          : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditWorkout(w)}
                      aria-label={`Edit ${w.title}`}
                      className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={actingId === w.id}
                      onClick={() => void handleRemoveWorkout(w)}
                      aria-label={`Delete ${w.title}`}
                      className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quiet Phase Readiness Panel */}
        <aside className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
            {phaseParts[1] ?? 'Rebuilding phase'}
          </h2>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Only increase load when your recent training supports it.
          </p>

          <div className="my-4 h-[5px] w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <span
              style={{ width: `${progressPct}%` }}
              className="block h-full rounded-full bg-[var(--blue)]"
            />
          </div>

          <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {phaseReport.criteria.map((c, idx) => (
              <div key={idx} className="flex items-center gap-2.5 py-3 text-[12px] text-[var(--muted)]">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full border ${
                    c.met
                      ? 'border-[#4F846E] bg-[#4F846E]'
                      : 'border-[var(--line-strong)] bg-[var(--surface-3)]'
                  }`}
                />
                <span>{c.label}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-4">
            <Link
              to="/runs"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--blue)] hover:underline"
            >
              <span>Open running journal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </aside>
      </div>

      <div className="flex items-start gap-2.5 px-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          A planned run is not a completed run. Log finished runs in your Running journal so
          mileage, pace zones, and phase readiness stay grounded in recorded data.
        </p>
      </div>

      {showWorkoutModal && user && (
        <PlannedWorkoutModal
          initialWorkout={editingWorkout}
          defaultDate={modalDefaultDate}
          activePhase={activePhase}
          paceZones={paceZones}
          onClose={() => {
            setShowWorkoutModal(false);
            setEditingWorkout(null);
          }}
          onSave={handleSaveManualWorkout}
        />
      )}
    </div>
  );
}
