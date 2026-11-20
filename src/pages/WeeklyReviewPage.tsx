import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Save,
  Sparkles,
} from 'lucide-react';
import {
  Button,
  Card,
  CategoryBadge,
  PageHeader,
  ProvenanceBadge,
  StatTile,
} from '@/design-system';
import { formatDurationSeconds, getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listRunningSessions } from '@/modules/running/repository';
import { formatDistanceKm, formatPace } from '@/modules/running/calculations';
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
      setNotice(`Saved reflection and weekly snapshot for ${review.weekStart}.`);
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
        preferredModel: profile?.ai_preferred_model || 'gemini-2.5-flash',
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
      setNotice(`Generated and cached AI narrative review for ${review.weekStart}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} (Deterministic review below remains complete and authoritative.)`
          : 'Could not reach `/api/coach`.'
      );
    } finally {
      setGeneratingAi(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Training Review"
        subtitle={`Deterministic Monday–Sunday report (${tz}) with optional cached Gemini narrative and athlete reflection.`}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedWeekStart((w) => addDaysIso(w, -7))}
              aria-label="Previous week"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedWeekStart(getMondayWeekStart(today))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              {review.weekStart} → {review.weekEnd}
            </button>
            <button
              type="button"
              onClick={() => setSelectedWeekStart((w) => addDaysIso(w, 7))}
              aria-label="Next week"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
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

      {/* Deterministic Weekly KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Weekly Running Distance"
          value={loading ? '...' : formatDistanceKm(review.totalDistanceM)}
          meta={
            review.previousWeekDistanceM > 0
              ? `${review.distanceDeltaM >= 0 ? '+' : ''}${(review.distanceDeltaM / 1000).toFixed(
                  2
                )} km vs. prior week`
              : 'Prior week: 0.00 km'
          }
          origin="RECORDED"
        />
        <StatTile
          label="Runs & Aggregate Pace"
          value={
            loading
              ? '...'
              : review.runCount > 0
              ? `${review.runCount} (${formatPace(review.totalDistanceM, review.totalDurationS)})`
              : '0 runs'
          }
          meta={
            review.totalDurationS > 0
              ? `${formatDurationSeconds(review.totalDurationS)} total · Longest ${formatDistanceKm(
                  review.longestRunM
                )}`
              : 'No runs logged this week'
          }
          origin={review.runCount > 0 ? 'CALCULATED' : 'MISSING'}
        />
        <StatTile
          label="Plan Adherence"
          value={
            loading
              ? '...'
              : review.adherencePct !== null
              ? `${review.adherencePct}%`
              : 'No Plan'
          }
          meta={
            review.plannedRunsCount > 0
              ? `${review.completedPlannedCount}/${review.plannedRunsCount} planned runs done`
              : 'No planned runs in this window'
          }
          origin={review.adherencePct !== null ? 'CALCULATED' : 'MISSING'}
        />
        <StatTile
          label="Avg Readiness"
          value={
            loading
              ? '...'
              : review.avgReadinessScore !== null
              ? `${review.avgReadinessScore}/100`
              : 'Missing'
          }
          meta={`${review.checkInCount} check-in(s) · ${review.painDaysCount} pain day(s)`}
          origin={review.avgReadinessScore !== null ? 'CALCULATED' : 'MISSING'}
        />
      </div>

      {/* Highlights, Watchouts & Non-Running Load */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">Deterministic Audit</h2>
            <ProvenanceBadge origin="CALCULATED" />
          </div>

          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Highlights</span>
              </div>
              {review.highlights.length === 0 ? (
                <p className="mt-1.5 text-xs text-slate-500">No running highlights recorded yet.</p>
              ) : (
                <ul className="mt-1.5 space-y-1.5 text-xs text-slate-700">
                  {review.highlights.map((h, i) => (
                    <li key={i}>• {h}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Watchouts</span>
              </div>
              {review.watchouts.length === 0 ? (
                <p className="mt-1.5 text-xs text-slate-500">
                  No load spikes, pain flags, or recovery warnings detected.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1.5 text-xs text-slate-700">
                  {review.watchouts.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Non-Running Load (Isolated from Running km)
            </h2>
            <CategoryBadge category="KARATE" />
          </div>

          <dl className="mt-3 divide-y divide-slate-100 text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Karate Sessions</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                {review.karateSessionsCount} ({review.karateMinutes} min)
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Protected Rest / Recovery Days</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                {review.recoveryDaysCount}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-slate-600">Vocal, Drumming &amp; University Blocks</dt>
              <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                {review.otherCommitmentsCount}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Cached AI Narrative Review */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-700" />
            <h2 className="text-sm font-semibold text-slate-900">
              Optional Cached AI Narrative Review
            </h2>
            <ProvenanceBadge origin={savedRecord?.ai_narrative ? 'SUGGESTED' : 'MISSING'} />
          </div>
          <Button
            variant="secondary"
            disabled={!canCallGemini || generatingAi}
            onClick={() => void handleGenerateAiNarrative()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>
              {generatingAi
                ? 'Generating...'
                : savedRecord?.ai_narrative
                ? 'Refresh AI Review'
                : 'Generate AI Review'}
            </span>
          </Button>
        </div>

        {savedRecord?.ai_narrative ? (
          <div className="mt-4 space-y-2">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {savedRecord.ai_narrative}
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              Cached model: {savedRecord.ai_model ?? 'gemini'} · Saved{' '}
              {savedRecord.updated_at.slice(0, 10)}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            {canCallGemini
              ? 'No AI narrative cached for this week yet. Click "Generate AI Review" to create and cache one in Supabase.'
              : 'Enable AI coaching and acknowledge privacy settings on the Settings page to generate optional narrative reviews.'}
          </p>
        )}
      </Card>

      {/* Personal Reflection */}
      <Card className="p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-semibold text-slate-900">Athlete Weekly Reflection</h2>
          <ProvenanceBadge origin={savedRecord?.user_reflection ? 'RECORDED' : 'MISSING'} />
        </div>
        <textarea
          rows={4}
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="How did your legs feel after Karate? What worked well with sleep, pacing, or university scheduling this week?"
          className="mt-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={() => void handleSaveReflection()} disabled={saving}>
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Weekly Snapshot & Reflection'}</span>
          </Button>
        </div>
      </Card>
    </div>
  );
}