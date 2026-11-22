import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  Edit3,
  Lock,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_SHORT_LABELS } from '@/design-system';
import { getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listRunningSessions } from '@/modules/running/repository';
import { formatDistanceKm } from '@/modules/running/calculations';
import {
  createScheduleBlock,
  listReadinessCheckIns,
  listScheduleBlocks,
  updateScheduleBlock,
} from '@/modules/calendar/repository';
import {
  ISO_WEEKDAYS,
  addDaysIso,
  buildDateRange,
  expandCalendarOccurrences,
  getIsoWeekday,
} from '@/modules/calendar/scheduleEngine';
import { ScheduleBlockModal } from '@/modules/calendar/ScheduleBlockModal';
import {
  computeTrainingPaceZones,
  generateRollingSevenDayPlan,
} from '@/modules/plan/planEngine';
import {
  deletePlannedWorkout,
  listPlannedWorkouts,
  upsertPlannedWorkouts,
} from '@/modules/plan/repository';
import { PlannedWorkoutModal } from '@/modules/plan/PlannedWorkoutModal';
import {
  createMonkModeSession,
  evaluateMonkModeReport,
  isCommitmentLocked,
  loadDisciplineStore,
  saveDisciplineStore,
  type CommitmentTier,
  type MonkModeReport,
  type PlannerDisciplineStore,
} from '@/modules/monk/monkEngine';
import {
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type PlannedWorkout,
  type PlannedWorkoutDraft,
  type ReadinessCheckIn,
  type RunningSession,
  type ScheduleBlock,
} from '@/types/domain';

const MONK_PRESET_DAYS = [7, 14, 21, 30, 60, 90];

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
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

  // Non-Negotiables + Monk Mode store
  const [discipline, setDiscipline] = useState<PlannerDisciplineStore>({
    commitments: [],
    completionsByDate: {},
    activeMonk: null,
    pastMonkSessions: [],
  });
  const [newCommitTitle, setNewCommitTitle] = useState('');
  const [newCommitCategory, setNewCommitCategory] = useState<ActivityCategory>('VOCAL');
  const [newCommitTier, setNewCommitTier] = useState<CommitmentTier>('NON_NEGOTIABLE');
  const [newCommitMin, setNewCommitMin] = useState('30');

  // Monk Mode Modals
  const [showStartMonkModal, setShowStartMonkModal] = useState(false);
  const [monkTitle, setMonkTitle] = useState('30-Day Monk Mode');
  const [monkDays, setMonkDays] = useState(30);
  const [showEndMonkModal, setShowEndMonkModal] = useState(false);
  const [earlyExitReason, setEarlyExitReason] = useState('');
  const [viewingReport, setViewingReport] = useState<MonkModeReport | null>(null);

  // Activity & Run Modals
  const [showRunModal, setShowRunModal] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<PlannedWorkout | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [modalDefaultDate, setModalDefaultDate] = useState(today);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setDiscipline(loadDisciplineStore(user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load weekly planner.');
    } finally {
      setLoading(false);
    }
  }, [user, today, windowEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function updateDiscipline(next: PlannerDisciplineStore) {
    if (!user) return;
    setDiscipline(next);
    saveDisciplineStore(user.id, next);
  }

  const activePhase = profile?.current_phase ?? 'REBUILDING';
  const preferredDays = profile?.preferred_run_days?.length
    ? profile.preferred_run_days
    : [1, 3, 5, 6];
  const paceZones = useMemo(() => computeTrainingPaceZones(sessions), [sessions]);

  const weekOccurrences = useMemo(
    () => expandCalendarOccurrences(blocks, [], today, windowEnd),
    [blocks, today, windowEnd]
  );

  const nonNegotiables = useMemo(
    () => discipline.commitments.filter((c) => c.tier === 'NON_NEGOTIABLE'),
    [discipline.commitments]
  );
  const negotiables = useMemo(
    () => discipline.commitments.filter((c) => c.tier === 'NEGOTIABLE'),
    [discipline.commitments]
  );

  const activeMonkReport = useMemo(() => {
    if (!discipline.activeMonk) return null;
    return evaluateMonkModeReport(discipline.activeMonk, discipline.completionsByDate, today);
  }, [discipline.activeMonk, discipline.completionsByDate, today]);

  const todayDoneCommitIds = useMemo(
    () => new Set(discipline.completionsByDate[today] ?? []),
    [discipline.completionsByDate, today]
  );

  function toggleCommitmentToday(id: string) {
    const set = new Set(discipline.completionsByDate[today] ?? []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    updateDiscipline({
      ...discipline,
      completionsByDate: { ...discipline.completionsByDate, [today]: Array.from(set) },
    });
  }

  function handleAddCommitment(e: FormEvent) {
    e.preventDefault();
    if (!newCommitTitle.trim()) return;
    if (discipline.activeMonk && newCommitTier === 'NON_NEGOTIABLE') {
      setError('Non-Negotiables are locked while Monk Mode is active.');
      return;
    }
    const item = {
      id: `cm-${Date.now()}`,
      title: newCommitTitle.trim(),
      category: newCommitCategory,
      tier: newCommitTier,
      targetMinutes: newCommitMin.trim() ? Number(newCommitMin) : null,
      createdAt: today,
    };
    updateDiscipline({ ...discipline, commitments: [...discipline.commitments, item] });
    setNewCommitTitle('');
    setError(null);
  }

  function handleRemoveCommitment(id: string) {
    const target = discipline.commitments.find((c) => c.id === id);
    if (!target) return;
    if (isCommitmentLocked(target, discipline.activeMonk)) {
      setError('Cannot remove a locked Non-Negotiable during Monk Mode.');
      return;
    }
    updateDiscipline({
      ...discipline,
      commitments: discipline.commitments.filter((c) => c.id !== id),
    });
  }

  function handleStartMonkMode(e: FormEvent) {
    e.preventDefault();
    if (nonNegotiables.length === 0) {
      setError('Add at least one Non-Negotiable before starting Monk Mode.');
      return;
    }
    const session = createMonkModeSession({
      title: monkTitle,
      startDate: today,
      plannedDays: monkDays,
      nonNegotiables,
    });
    updateDiscipline({ ...discipline, activeMonk: session });
    setShowStartMonkModal(false);
    setNotice(`Monk Mode activated for ${session.plannedDays} days. Non-Negotiables are now locked.`);
  }

  function handleCompleteOrEndMonkEarly(e: FormEvent) {
    e.preventDefault();
    if (!discipline.activeMonk) return;
    if (!earlyExitReason.trim()) {
      setError('You must state a reason to end Monk Mode early.');
      return;
    }
    const ended = {
      ...discipline.activeMonk,
      status: 'ENDED_EARLY' as const,
      endedAtDate: today,
      earlyExitReason: earlyExitReason.trim(),
    };
    const report = evaluateMonkModeReport(ended, discipline.completionsByDate, today);
    updateDiscipline({
      ...discipline,
      activeMonk: null,
      pastMonkSessions: [ended, ...discipline.pastMonkSessions],
    });
    setEarlyExitReason('');
    setShowEndMonkModal(false);
    setViewingReport(report);
  }

  function handleFinishCompletedMonk() {
    if (!discipline.activeMonk) return;
    const finished = {
      ...discipline.activeMonk,
      status: 'COMPLETED' as const,
      endedAtDate: discipline.activeMonk.endDate,
    };
    const report = evaluateMonkModeReport(finished, discipline.completionsByDate, today);
    updateDiscipline({
      ...discipline,
      activeMonk: null,
      pastMonkSessions: [finished, ...discipline.pastMonkSessions],
    });
    setViewingReport(report);
  }

  async function handleGenerateRunDraft() {
    if (!user) return;
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const drafts = generateRollingSevenDayPlan({
        referenceDate: today,
        profile: { current_phase: activePhase, preferred_run_days: preferredDays },
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
      await upsertPlannedWorkouts(
        user.id,
        drafts.filter((d) => !completedDates.has(d.plan_date))
      );
      await loadData();
      setNotice('Drafted adaptive running sessions for the next 7 days.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveManualWorkout(
    draft: PlannedWorkoutDraft,
    previousId?: string,
    previousDate?: string
  ) {
    if (!user) return;
    if (previousId && previousDate && previousDate !== draft.plan_date) {
      await deletePlannedWorkout(user.id, previousId);
    }
    await upsertPlannedWorkouts(user.id, [draft]);
    await loadData();
  }

  return (
    <div className="space-y-7 pb-6">
      {/* Studio Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
          Plan your <em className="not-italic text-[var(--blue)]">week.</em>
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {!discipline.activeMonk ? (
            <button
              type="button"
              onClick={() => setShowStartMonkModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 text-[12.5px] font-bold text-[var(--ink)] transition-colors hover:border-[var(--blue)] hover:text-[var(--blue)]"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Start Monk Mode</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (activeMonkReport) setViewingReport(activeMonkReport);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[var(--blue)]/40 bg-[var(--blue-lite)] px-3.5 text-[12.5px] font-bold text-[var(--blue-ink)]"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>
                Monk Mode · {activeMonkReport?.finalScore.toFixed(2)}×
              </span>
            </button>
          )}

          <button
            type="button"
            disabled={generating}
            onClick={() => void handleGenerateRunDraft()}
            className="inline-flex h-10 items-center gap-1.5 rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 text-[12.5px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--blue)]" />
            <span>{generating ? 'Drafting...' : 'Draft runs'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingBlock(null);
              setModalDefaultDate(today);
              setShowBlockModal(true);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-[var(--blue-btn-text)] transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4 stroke-[2.4]" />
            <span>Plan activity</span>
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

      {/* Active Monk Mode Status Strip */}
      {discipline.activeMonk && activeMonkReport && (
        <section
          className="rounded-[15px] border border-[var(--blue)]/35 p-5 sm:p-6"
          style={{ background: 'color-mix(in srgb, var(--blue) 6%, var(--surface))' }}
        >
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--blue)] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[var(--blue-btn-text)]">
                  <Lock className="h-3 w-3" />
                  MONK MODE ACTIVE
                </span>
                <strong className="text-[16px] font-bold text-[var(--ink)]">
                  {discipline.activeMonk.title}
                </strong>
                <span className="font-mono text-[11.5px] text-[var(--muted)]">
                  {formatShortDate(discipline.activeMonk.startDate)} →{' '}
                  {formatShortDate(discipline.activeMonk.endDate)}
                </span>
              </div>
              <p className="text-[12.5px] text-[var(--muted)]">
                Day {activeMonkReport.elapsedDays} of {activeMonkReport.plannedDays} ·{' '}
                <strong className="text-[var(--ink)]">
                  {activeMonkReport.finalScore.toFixed(3)}×
                </strong>{' '}
                compounding score (1.01/0.99 curve) · {activeMonkReport.brokenDays} break(s)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {today >= discipline.activeMonk.endDate ? (
                <button
                  type="button"
                  onClick={handleFinishCompletedMonk}
                  className="h-9 rounded-[8px] bg-[var(--blue)] px-4 text-[12px] font-bold text-[var(--blue-btn-text)]"
                >
                  Finish &amp; View Report
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEndMonkModal(true)}
                  className="h-9 rounded-[8px] border border-red-400/40 bg-red-500/10 px-3.5 text-[12px] font-bold text-red-700 hover:bg-red-500/20 dark:text-red-300"
                >
                  End early (penalty)
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Non-Negotiables vs. Negotiables Section */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Non-Negotiables */}
        <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                  Non-Negotiables
                </h2>
                {discipline.activeMonk && (
                  <span className="inline-flex items-center gap-1 rounded bg-[var(--blue-lite)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--blue-ink)]">
                    <Lock className="h-3 w-3" />
                    LOCKED
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                Fixed daily standards. Every full day compounds by ×1.01.
              </p>
            </div>
          </div>

          <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {nonNegotiables.length === 0 ? (
              <p className="py-6 text-xs text-[var(--muted)]">
                No Non-Negotiables set yet. Add one below (e.g., 30 min Vocal every day).
              </p>
            ) : (
              nonNegotiables.map((item) => {
                const done = todayDoneCommitIds.has(item.id);
                const locked = isCommitmentLocked(item, discipline.activeMonk);
                return (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleCommitmentToday(item.id)}
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors ${
                        done
                          ? 'border-[var(--blue)] bg-[var(--blue)] text-[var(--blue-btn-text)]'
                          : 'border-[var(--line-strong)] bg-[var(--surface)] text-transparent hover:border-[var(--blue)]'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5 stroke-[2.8]" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <strong
                        className={`block truncate text-[13px] font-bold ${
                          done ? 'text-[var(--faint)] line-through' : 'text-[var(--ink)]'
                        }`}
                      >
                        {item.title}
                      </strong>
                      <span className="text-[11px] text-[var(--muted)]">
                        {CATEGORY_SHORT_LABELS[item.category]}
                        {item.targetMinutes ? ` · ${item.targetMinutes}m daily` : ' · Daily'}
                      </span>
                    </div>
                    {locked ? (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemoveCommitment(item.id)}
                        aria-label={`Remove ${item.title}`}
                        className="rounded p-1.5 text-[var(--faint)] hover:bg-red-500/10 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Negotiables + Add Form */}
        <section className="flex flex-col justify-between rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <div>
            <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Negotiables
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Flexible targets you can skip occasionally without breaking Monk Mode.
            </p>

            <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
              {negotiables.length === 0 ? (
                <p className="py-5 text-xs text-[var(--muted)]">
                  No flexible negotiables added yet.
                </p>
              ) : (
                negotiables.map((item) => {
                  const done = todayDoneCommitIds.has(item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-3">
                      <button
                        type="button"
                        onClick={() => toggleCommitmentToday(item.id)}
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors ${
                          done
                            ? 'border-[var(--blue)] bg-[var(--blue)] text-[var(--blue-btn-text)]'
                            : 'border-[var(--line-strong)] bg-[var(--surface)] text-transparent hover:border-[var(--blue)]'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[2.8]" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <strong
                          className={`block truncate text-[13px] font-bold ${
                            done ? 'text-[var(--faint)] line-through' : 'text-[var(--ink)]'
                          }`}
                        >
                          {item.title}
                        </strong>
                        <span className="text-[11px] text-[var(--muted)]">
                          {CATEGORY_SHORT_LABELS[item.category]}
                          {item.targetMinutes ? ` · ${item.targetMinutes}m` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCommitment(item.id)}
                        aria-label={`Remove ${item.title}`}
                        className="rounded p-1.5 text-[var(--faint)] hover:bg-red-500/10 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <form
            onSubmit={handleAddCommitment}
            className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4"
          >
            <input
              type="text"
              value={newCommitTitle}
              onChange={(e) => setNewCommitTitle(e.target.value)}
              placeholder="Add commitment (e.g. 30m Vocal, Read 20p)..."
              className="min-w-[160px] flex-1 rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-1.5 text-[12px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--blue)] focus:outline-none"
            />
            <select
              value={newCommitTier}
              onChange={(e) => setNewCommitTier(e.target.value as CommitmentTier)}
              className="rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2 py-1.5 text-[11.5px] font-semibold text-[var(--ink)]"
            >
              <option value="NON_NEGOTIABLE" disabled={Boolean(discipline.activeMonk)}>
                Non-Negotiable
              </option>
              <option value="NEGOTIABLE">Negotiable</option>
            </select>
            <select
              value={newCommitCategory}
              onChange={(e) => setNewCommitCategory(e.target.value as ActivityCategory)}
              className="rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2 py-1.5 text-[11.5px] text-[var(--ink)]"
            >
              {Object.entries(ACTIVITY_CATEGORY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={5}
              max={240}
              value={newCommitMin}
              onChange={(e) => setNewCommitMin(e.target.value)}
              placeholder="min"
              className="w-16 rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2 py-1.5 font-mono text-[11.5px] text-[var(--ink)]"
            />
            <button
              type="submit"
              className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-[var(--blue)] px-3 text-[11.5px] font-bold text-[var(--blue-btn-text)]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </form>
        </section>
      </div>

      {/* All-Activity 7-Day Weekly Planner Board */}
      <section className="overflow-hidden rounded-[15px] border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-5">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              7-day schedule
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              {formatShortDate(today)} – {formatShortDate(windowEnd)} · Runs, Karate, Music, Study &amp; Health
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingWorkout(null);
              setModalDefaultDate(today);
              setShowRunModal(true);
            }}
            className="text-[12px] font-semibold text-[var(--blue)] hover:underline"
          >
            + Add running workout
          </button>
        </div>

        {loading ? (
          <div className="border-t border-[var(--line)] py-12 text-center text-sm text-[var(--muted)]">
            Loading 7-day planner...
          </div>
        ) : (
          <div className="grid grid-cols-1 divide-y divide-[var(--line)] border-t border-[var(--line)] md:grid-cols-7 md:divide-x md:divide-y-0">
            {rollingDates.map((date) => {
              const iso = getIsoWeekday(date);
              const weekdayLabel = ISO_WEEKDAYS.find((d) => d.iso === iso)?.short ?? '';
              const workout = plannedWorkouts.find((w) => w.plan_date === date) ?? null;
              const dayBlocks = weekOccurrences.filter((o) => o.date === date);
              const isToday = date === today;

              return (
                <div
                  key={date}
                  style={
                    isToday
                      ? { background: 'color-mix(in srgb, var(--blue) 4%, var(--surface))' }
                      : undefined
                  }
                  className="flex min-h-[220px] flex-col p-3.5"
                >
                  <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
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
                  </div>

                  <div className="flex flex-1 flex-col gap-2 pt-3">
                    {workout && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingWorkout(workout);
                          setModalDefaultDate(workout.plan_date);
                          setShowRunModal(true);
                        }}
                        className="rounded-lg border border-[var(--blue)]/30 bg-[var(--blue-lite)]/65 p-2 text-left transition-colors hover:border-[var(--blue)]"
                      >
                        <div className="truncate text-[11.5px] font-bold text-[var(--ink)]">
                          {workout.title}
                        </div>
                        <div className="font-mono text-[10px] text-[var(--blue-ink)]">
                          {formatDistanceKm(workout.target_distance_m)}
                        </div>
                      </button>
                    )}

                    {dayBlocks.slice(0, 4).map((occ) => (
                      <button
                        key={occ.occurrenceKey}
                        type="button"
                        onClick={() => {
                          const found = blocks.find((b) => b.id === occ.sourceId) ?? null;
                          setEditingBlock(found);
                          setModalDefaultDate(date);
                          setShowBlockModal(true);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-left transition-colors hover:border-[var(--line-strong)]"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[occ.category] }}
                        />
                        <span className="truncate text-[11px] font-semibold text-[var(--ink)]">
                          {occ.title}
                        </span>
                      </button>
                    ))}

                    {!workout && dayBlocks.length === 0 && (
                      <span className="my-auto text-center text-[11px] text-[var(--faint)]">
                        Open day
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingBlock(null);
                      setModalDefaultDate(date);
                      setShowBlockModal(true);
                    }}
                    className="mt-3 w-full rounded-[7px] border border-[var(--blue)]/25 bg-[var(--blue-lite)]/55 py-1.5 text-[10.5px] font-bold text-[var(--blue-ink)] transition-colors hover:bg-[var(--blue)] hover:text-[var(--blue-btn-text)]"
                  >
                    + Plan
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Past Monk Mode Reports */}
      {discipline.pastMonkSessions.length > 0 && (
        <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
            Past Monk Mode reports
          </h2>
          <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {discipline.pastMonkSessions.map((s) => {
              const rep = evaluateMonkModeReport(s, discipline.completionsByDate, today);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                  <div>
                    <strong className="text-[13.5px] font-bold text-[var(--ink)]">{s.title}</strong>
                    <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">
                      {formatShortDate(s.startDate)} → {formatShortDate(s.endedAtDate ?? s.endDate)} ·{' '}
                      {rep.compliancePct}% compliance · {rep.brokenDays} break(s)
                      {s.status === 'ENDED_EARLY' ? ' · Ended early' : ' · Completed'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[14px] font-bold text-[var(--blue)]">
                      {rep.finalScore.toFixed(3)}×
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewingReport(rep)}
                      className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--line)] px-3 text-[11.5px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>Report</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Start Monk Mode Modal */}
      {showStartMonkModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowStartMonkModal(false);
          }}
        >
          <div className="w-full max-w-[460px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5">
              <h2 className="text-[20px] font-bold tracking-[-0.04em]">Activate Monk Mode</h2>
              <button
                type="button"
                onClick={() => setShowStartMonkModal(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleStartMonkMode} className="mt-4 space-y-4">
              <label className="block text-[12px] font-semibold text-[var(--muted)]">
                Sprint name
                <input
                  type="text"
                  value={monkTitle}
                  onChange={(e) => setMonkTitle(e.target.value)}
                  className="mt-1.5 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--ink)]"
                />
              </label>
              <div>
                <span className="block text-[12px] font-semibold text-[var(--muted)]">
                  Duration (days)
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MONK_PRESET_DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setMonkDays(d);
                        setMonkTitle(`${d}-Day Monk Mode`);
                      }}
                      className={`rounded-lg border px-3 py-1.5 font-mono text-[12px] font-bold ${
                        monkDays === d
                          ? 'border-[var(--blue)] bg-[var(--blue-lite)] text-[var(--blue-ink)]'
                          : 'border-[var(--line)] bg-[var(--bg)] text-[var(--muted)]'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3.5 text-[12px] text-[var(--muted)]">
                <strong className="block text-[var(--ink)]">
                  Locking {nonNegotiables.length} Non-Negotiable(s):
                </strong>
                <ul className="mt-1.5 list-disc space-y-1 pl-4">
                  {nonNegotiables.map((c) => (
                    <li key={c.id}>{c.title}</li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setShowStartMonkModal(false)}
                  className="h-9 rounded-[9px] border border-[var(--line-strong)] px-4 text-[12.5px] font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-[var(--blue-btn-text)]"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Lock &amp; Start</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* End Monk Mode Early Modal (Requires Reason + Shows Penalty) */}
      {showEndMonkModal && activeMonkReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowEndMonkModal(false);
          }}
        >
          <div className="w-full max-w-[460px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
              <h2 className="text-[19px] font-bold">End Monk Mode early?</h2>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
              You still have <strong className="text-[var(--ink)]">{activeMonkReport.remainingDays} days</strong> left.
              Ending early records your reason permanently in the report and applies a proportional
              score penalty.
            </p>
            <form onSubmit={handleCompleteOrEndMonkEarly} className="mt-4 space-y-4">
              <label className="block text-[12px] font-semibold text-[var(--muted)]">
                State your honest reason *
                <textarea
                  rows={3}
                  required
                  value={earlyExitReason}
                  onChange={(e) => setEarlyExitReason(e.target.value)}
                  placeholder="Why are you ending Monk Mode before the target date?"
                  className="mt-1.5 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] p-3 text-[13px] text-[var(--ink)]"
                />
              </label>
              <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setShowEndMonkModal(false)}
                  className="h-9 rounded-[9px] border border-[var(--line-strong)] px-4 text-[12.5px] font-semibold"
                >
                  Stay locked in
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-[9px] bg-red-600 px-4 text-[12.5px] font-bold text-white hover:bg-red-700"
                >
                  End with penalty
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Monk Mode Report Modal */}
      {viewingReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setViewingReport(null);
          }}
        >
          <div className="w-full max-w-[520px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--faint)]">
                  MONK MODE REPORT
                </div>
                <h2 className="mt-0.5 text-[21px] font-bold tracking-[-0.04em]">
                  {viewingReport.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setViewingReport(null)}
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--bg)] py-4 text-center">
              <div>
                <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Score</span>
                <strong className="mt-1 block font-mono text-[22px] font-bold text-[var(--blue)]">
                  {viewingReport.finalScore.toFixed(3)}×
                </strong>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-[var(--muted)]">
                  Compliance
                </span>
                <strong className="mt-1 block font-mono text-[22px] font-bold text-[var(--ink)]">
                  {viewingReport.compliancePct}%
                </strong>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-[var(--muted)]">Breaks</span>
                <strong className="mt-1 block font-mono text-[22px] font-bold text-[var(--ink)]">
                  {viewingReport.brokenDays}
                </strong>
              </div>
            </div>

            {viewingReport.earlyExitPenalty > 0 && (
              <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3.5 text-[12px] text-red-700 dark:text-red-300">
                <strong>Early Exit Penalty: −{viewingReport.earlyExitPenalty.toFixed(3)}×</strong>{' '}
                ({viewingReport.remainingDays} of {viewingReport.plannedDays} days left).
                {viewingReport.earlyExitReason && (
                  <p className="mt-1 italic">&ldquo;{viewingReport.earlyExitReason}&rdquo;</p>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingReport(null)}
                className="h-9 rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-[var(--blue-btn-text)]"
              >
                Close report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Any Activity Modal */}
      {showBlockModal && user && (
        <ScheduleBlockModal
          initialBlock={editingBlock}
          defaultDate={modalDefaultDate}
          onClose={() => {
            setShowBlockModal(false);
            setEditingBlock(null);
          }}
          onSave={async (draft) => {
            if (editingBlock) {
              await updateScheduleBlock(user.id, editingBlock.id, draft);
            } else {
              await createScheduleBlock(user.id, draft);
            }
            await loadData();
          }}
        />
      )}

      {/* Plan / Edit Running Workout Modal */}
      {showRunModal && user && (
        <PlannedWorkoutModal
          initialWorkout={editingWorkout}
          defaultDate={modalDefaultDate}
          activePhase={activePhase}
          paceZones={paceZones}
          onClose={() => {
            setShowRunModal(false);
            setEditingWorkout(null);
          }}
          onSave={handleSaveManualWorkout}
        />
      )}
    </div>
  );
}
