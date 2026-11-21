import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  HeartPulse,
  Route,
  Sparkles,
} from 'lucide-react';
import { getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listRunningSessions } from '@/modules/running/repository';
import { formatPace } from '@/modules/running/calculations';
import { listPersonalBests } from '@/modules/analytics/repository';
import { listReadinessCheckIns, listScheduleBlocks } from '@/modules/calendar/repository';
import { addDaysIso } from '@/modules/calendar/scheduleEngine';
import { listPlannedWorkouts } from '@/modules/plan/repository';
import {
  buildCompactCoachContext,
  computeDeterministicWeeklyReview,
} from '@/modules/coach/coachEngine';
import {
  listWeeklyReviews,
  requestServerCoachReply,
  upsertWeeklyReview,
} from '@/modules/coach/repository';
import type {
  PersonalBest,
  PlannedWorkout,
  ReadinessCheckIn,
  RunningSession,
  ScheduleBlock,
  WeeklyReviewRecord,
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

export function WeeklyReviewPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [selectedWeekStart, setSelectedWeekStart] = useState(() => getMondayWeekStart(today));
  const selectedWeekEnd = useMemo(() => addDaysIso(selectedWeekStart, 6), [selectedWeekStart]);

  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [planned, setPlanned] = useState<PlannedWorkout[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [checkIns, setCheckIns] = useState<ReadinessCheckIn[]>([]);
  const [savedReviews, setSavedReviews] = useState<WeeklyReviewRecord[]>([]);

  const [reflection, setReflection] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [runRows, pbRows, planRows, blockRows, checkInRows, reviewRows] = await Promise.all([
        listRunningSessions(user.id),
        listPersonalBests(user.id).catch(() => [] as PersonalBest[]),
        listPlannedWorkouts(user.id, selectedWeekStart, selectedWeekEnd).catch(
          () => [] as PlannedWorkout[]
        ),
        listScheduleBlocks(user.id).catch(() => [] as ScheduleBlock[]),
        listReadinessCheckIns(user.id, 60).catch(() => [] as ReadinessCheckIn[]),
        listWeeklyReviews(user.id, 16).catch(() => [] as WeeklyReviewRecord[]),
      ]);
      setSessions(runRows);
      setPbs(pbRows);
      setPlanned(planRows);
      setBlocks(blockRows);
      setCheckIns(checkInRows);
      setSavedReviews(reviewRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load weekly review.');
    } finally {
      setLoading(false);
    }
  }, [user, selectedWeekStart, selectedWeekEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const review = useMemo(
    () =>
      computeDeterministicWeeklyReview({
        referenceDate: selectedWeekStart,
        sessions,
        plannedWorkouts: planned,
        blocks,
        checkIns,
      }),
    [selectedWeekStart, sessions, planned, blocks, checkIns]
  );

  const savedRecord = useMemo(
    () => savedReviews.find((r) => r.week_start === selectedWeekStart) ?? null,
    [savedReviews, selectedWeekStart]
  );

  useEffect(() => {
    setReflection(savedRecord?.user_reflection ?? '');
  }, [savedRecord, selectedWeekStart]);

  const canCallGemini = Boolean(profile?.ai_enabled && profile?.ai_privacy_consent_acknowledged);

  async function handleSaveReflection() {
    if (!user) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await upsertWeeklyReview(user.id, {
        week_start: review.weekStart,
        week_end: review.weekEnd,
        summary_snapshot: review as unknown as Record<string, unknown>,
        ai_narrative: savedRecord?.ai_narrative ?? null,
        ai_model: savedRecord?.ai_model ?? null,
        user_reflection: reflection.trim() ? reflection.trim() : null,
      });
      await loadData();
      setNotice(`Saved reflection for ${formatShortDate(review.weekStart)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save weekly review.');
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateAiNarrative() {
    if (!user) return;
    setGeneratingAi(true);
    setError(null);
    setNotice(null);

    try {
      const compactContext = buildCompactCoachContext({
        today,
        profile: {
          timezone: tz,
          current_phase: profile?.current_phase ?? 'REBUILDING',
          immediate_goal: profile?.immediate_goal ?? 'Rebuild consistent pain-free running',
          first_major_5k_goal_s: profile?.first_major_5k_goal_s ?? 1200,
          long_term_5k_goal_s: profile?.long_term_5k_goal_s ?? 1050,
          ai_share_notes: profile?.ai_share_notes ?? false,
          ai_share_recovery: profile?.ai_share_recovery ?? true,
          ai_share_karate: profile?.ai_share_karate ?? true,
          ai_share_commitments: profile?.ai_share_commitments ?? false,
        },
        sessions,
        personalBests: pbs,
        plannedWorkouts: planned,
        blocks,
        checkIns,
      });

      const res = await requestServerCoachReply({
        mode: 'WEEKLY_REVIEW',
        message: `Weekly review for ${review.weekStart} to ${review.weekEnd}`,
        context: compactContext,
        weeklySummary: review,
        preferredModel: profile?.ai_preferred_model || 'gemini-4-hydrogen',
      });

      await upsertWeeklyReview(user.id, {
        week_start: review.weekStart,
        week_end: review.weekEnd,
        summary_snapshot: review as unknown as Record<string, unknown>,
        ai_narrative: res.reply,
        ai_model: res.model,
        user_reflection: reflection.trim() ? reflection.trim() : null,
      });

      await loadData();
      setNotice(`Generated and cached AI summary for ${formatShortDate(review.weekStart)}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} (Deterministic summary remains complete.)`
          : 'Could not reach `/api/coach`.'
      );
    } finally {
      setGeneratingAi(false);
    }
  }

  return (
    <div className="space-y-7 pb-6">
      {/* Studio Header (Common Default Stride Blue) */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
          A look at your <em className="not-italic text-[var(--blue)]">week.</em>
        </h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedWeekStart((w) => addDaysIso(w, -7))}
            aria-label="Previous week"
            className="grid h-9 w-9 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:border-[var(--blue)]/40 hover:bg-[var(--blue-lite)] hover:text-[var(--blue)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedWeekStart(getMondayWeekStart(today))}
            className="h-9 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[12px] font-bold text-[var(--ink)] hover:bg-[var(--surface-2)]"
          >
            {formatShortDate(review.weekStart)} – {formatShortDate(review.weekEnd)}
          </button>
          <button
            type="button"
            onClick={() => setSelectedWeekStart((w) => addDaysIso(w, 7))}
            aria-label="Next week"
            className="grid h-9 w-9 place-items-center rounded-[8px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:border-[var(--blue)]/40 hover:bg-[var(--blue-lite)] hover:text-[var(--blue)]"
          >
            <ChevronRight className="h-4 w-4" />
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

      {/* Clean 3-Column Studio Metric Strip */}
      <div className="grid grid-cols-1 divide-y divide-[var(--line)] rounded-[15px] border border-[var(--line)] bg-[var(--surface)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
            RUNNING DISTANCE
          </span>
          <div className="mt-2 font-mono text-[32px] font-bold leading-none tracking-[-0.06em] text-[var(--blue)] tabular-nums">
            {loading ? '—' : (review.totalDistanceM / 1000).toFixed(1)}
            <small className="ml-1.5 font-sans text-[14px] font-medium text-[var(--muted)]">
              km
            </small>
          </div>
          <span className="mt-1.5 block text-[11.5px] text-[var(--muted)]">
            Previous week: {(review.previousWeekDistanceM / 1000).toFixed(1)} km
          </span>
        </div>

        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
            RUNS COMPLETED
          </span>
          <div className="mt-2 font-mono text-[32px] font-bold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums">
            {loading ? '—' : review.runCount}
          </div>
          <span className="mt-1.5 block text-[11.5px] text-[var(--muted)]">
            {review.runCount > 0
              ? `Average ${formatPace(review.totalDistanceM, review.totalDurationS)}`
              : 'No runs this week'}
          </span>
        </div>

        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
            READINESS &amp; ADHERENCE
          </span>
          <div className="mt-2 font-mono text-[32px] font-bold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums">
            {loading
              ? '—'
              : review.avgReadinessScore !== null
                ? `${review.avgReadinessScore}/100`
                : '—'}
          </div>
          <span className="mt-1.5 block text-[11.5px] text-[var(--muted)]">
            {review.adherencePct !== null
              ? `${review.adherencePct}% plan adherence`
              : `${review.checkInCount} check-in(s) logged`}
          </span>
        </div>
      </div>

      {/* Two-Column Overview */}
      <div className="grid items-start gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
            This week at a glance
          </h2>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Only your recorded activity is counted.
          </p>

          <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)] text-[12.5px] text-[var(--muted)]">
            <div className="flex items-start gap-3 py-3.5">
              <Route className="mt-0.5 h-4 w-4 shrink-0 text-[var(--blue)]" />
              <span>
                {review.runCount > 0
                  ? `You completed ${review.runCount} run(s) totalling ${(
                      review.totalDistanceM / 1000
                    ).toFixed(1)} km.`
                  : 'No completed runs were recorded for this week.'}
              </span>
            </div>
            <div className="flex items-start gap-3 py-3.5">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--blue)]" />
              <span>
                {review.plannedRunsCount > 0
                  ? `${review.completedPlannedCount} of ${review.plannedRunsCount} planned runs marked complete.`
                  : 'No running workouts were planned for this week.'}
              </span>
            </div>
            <div className="flex items-start gap-3 py-3.5">
              <HeartPulse className="mt-0.5 h-4 w-4 shrink-0 text-[var(--blue)]" />
              <span>
                {review.checkInCount > 0
                  ? `${review.checkInCount} readiness check-in(s) logged · ${review.painDaysCount} pain day(s).`
                  : 'No readiness check-ins recorded for this week.'}
              </span>
            </div>
            {review.watchouts.length > 0 && (
              <div className="flex items-start gap-3 py-3.5 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{review.watchouts.join(' · ')}</span>
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
            Outside running
          </h2>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Your other commitments matter too.
          </p>

          <div className="mt-4 divide-y divide-[var(--line)] border-t border-[var(--line)] text-[12.5px]">
            <div className="flex items-center justify-between py-3.5 text-[var(--muted)]">
              <span>Karate</span>
              <b className="font-mono text-[var(--ink)]">
                {review.karateSessionsCount} ({review.karateMinutes} min)
              </b>
            </div>
            <div className="flex items-center justify-between py-3.5 text-[var(--muted)]">
              <span>Recovery blocks</span>
              <b className="font-mono text-[var(--ink)]">{review.recoveryDaysCount}</b>
            </div>
            <div className="flex items-center justify-between py-3.5 text-[var(--muted)]">
              <span>Music &amp; university blocks</span>
              <b className="font-mono text-[var(--ink)]">{review.otherCommitmentsCount}</b>
            </div>
          </div>

          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--blue)] hover:underline"
            >
              <span>View your calendar</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </aside>
      </div>

      {/* Personal Reflection */}
      <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Your reflection
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              One small note can make next week better.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveReflection()}
            className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-[var(--blue)]/35 bg-[var(--blue-lite)] px-4 text-[12.5px] font-bold text-[var(--blue-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save reflection'}</span>
          </button>
        </div>

        <textarea
          rows={4}
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="How did you feel? What would you adjust next week?"
          className="w-full rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-[13px] leading-relaxed text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--blue)] focus:outline-none"
        />
      </section>

      {/* AI Narrative Summary */}
      <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              Summary for next week
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Optional AI narrative cached in Supabase from your recorded data.
            </p>
          </div>
          <button
            type="button"
            disabled={!canCallGemini || generatingAi}
            onClick={() => void handleGenerateAiNarrative()}
            className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-[var(--blue-btn-text)] transition-opacity hover:opacity-90 disabled:opacity-45"
          >
            <Sparkles className="h-4 w-4" />
            <span>
              {generatingAi
                ? 'Generating...'
                : savedRecord?.ai_narrative
                  ? 'Refresh summary'
                  : 'Generate summary'}
            </span>
          </button>
        </div>

        {savedRecord?.ai_narrative ? (
          <div className="space-y-2 border-t border-[var(--line)] pt-4">
            <div className="whitespace-pre-wrap text-[13px] leading-[1.8] text-[var(--ink)]">
              {savedRecord.ai_narrative}
            </div>
            <div className="font-mono text-[10.5px] text-[var(--faint)]">
              {savedRecord.ai_model ?? 'gemini'} · Saved {savedRecord.updated_at.slice(0, 10)}
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            {canCallGemini
              ? 'Generate a grounded summary when you are ready.'
              : 'Enable AI features in Settings to generate an optional weekly narrative.'}
          </p>
        )}
      </section>
    </div>
  );
}
