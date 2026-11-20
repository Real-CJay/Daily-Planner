import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Flame,
  HeartPulse,
  Plus,
  Target,
} from 'lucide-react';
import {
  Button,
  Card,
  CategoryBadge,
  PageHeader,
  ProvenanceBadge,
  StatTile,
} from '@/design-system';
import { useAuth } from '@/modules/auth/AuthContext';
import {
  TRAINING_PHASE_LABELS,
  WORKOUT_TYPE_LABELS,
  type ReadinessCheckIn,
  type RunningSession,
  type ScheduleBlock,
} from '@/types/domain';
import { formatDurationSeconds, getLocalDateString, getMondayWeekStart } from '@/lib/datetime';
import { listRunningSessions } from '@/modules/running/repository';
import {
  computeWeeklyRunningStats,
  extractFiveKBenchmarks,
  formatDistanceKm,
  formatPace,
} from '@/modules/running/calculations';
import { listReadinessCheckIns, listScheduleBlocks } from '@/modules/calendar/repository';
import {
  addDaysIso,
  evaluateReadiness,
  expandCalendarOccurrences,
} from '@/modules/calendar/scheduleEngine';

export function OverviewPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);
  const weekStart = getMondayWeekStart(today);

  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [checkIns, setCheckIns] = useState<ReadinessCheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    Promise.all([
      listRunningSessions(user.id),
      listScheduleBlocks(user.id).catch(() => [] as ScheduleBlock[]),
      listReadinessCheckIns(user.id, 7).catch(() => [] as ReadinessCheckIn[]),
    ])
      .then(([runRows, blockRows, checkInRows]) => {
        setSessions(runRows);
        setBlocks(blockRows);
        setCheckIns(checkInRows);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const weekly = useMemo(() => computeWeeklyRunningStats(sessions, today), [sessions, today]);
  const fiveK = useMemo(() => extractFiveKBenchmarks(sessions), [sessions]);
  const latestRun = sessions[0] ?? null;

  const latestCheckIn = checkIns[0] ?? null;
  const readiness = useMemo(() => evaluateReadiness(latestCheckIn), [latestCheckIn]);

  const upcomingSchedule = useMemo(() => {
    const end = addDaysIso(today, 3);
    return expandCalendarOccurrences(blocks, [], today, end).slice(0, 5);
  }, [blocks, today]);

  const recentComparablePace = useMemo(() => {
    if (!latestRun) return null;
    const sameTypeRecent = sessions
      .filter((s) => s.workout_type === latestRun.workout_type)
      .slice(0, 3);
    const totalDist = sameTypeRecent.reduce((a, b) => a + b.distance_m, 0);
    const totalDur = sameTypeRecent.reduce((a, b) => a + b.duration_s, 0);
    return {
      pace: formatPace(totalDist, totalDur),
      count: sameTypeRecent.length,
      typeLabel: WORKOUT_TYPE_LABELS[latestRun.workout_type],
    };
  }, [sessions, latestRun]);

  const sub20GoalS = profile?.first_major_5k_goal_s ?? 1200;
  const fastest5KS = fiveK.fastest5K?.recordedTimeS ?? null;
  const goalProgressPct = useMemo(() => {
    if (!fastest5KS) return 0;
    if (fastest5KS <= sub20GoalS) return 100;
    const baseline = 2400;
    const pct = ((baseline - fastest5KS) / Math.max(baseline - sub20GoalS, 1)) * 100;
    return Math.max(5, Math.min(99, Math.round(pct)));
  }, [fastest5KS, sub20GoalS]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training Overview"
        subtitle={`Week starting ${weekStart} (${tz}) · ${
          profile ? TRAINING_PHASE_LABELS[profile.current_phase] : 'Phase 1 — Rebuilding'
        }`}
        action={
          <div className="flex items-center gap-2">
            <Link to="/runs">
              <Button>
                <Plus className="h-4 w-4" />
                <span>Log Run</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Core Metric Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Weekly Running Distance"
          value={loading ? '...' : formatDistanceKm(weekly.totalDistanceM)}
          meta={
            weekly.previousWeekDistanceM > 0
              ? `${weekly.distanceDeltaM >= 0 ? '+' : ''}${(weekly.distanceDeltaM / 1000).toFixed(
                  2
                )} km vs. prior week`
              : 'Prior week: 0.00 km recorded'
          }
          origin="RECORDED"
        />
        <StatTile
          label="Running Frequency"
          value={loading ? '...' : `${weekly.runCount} ${weekly.runCount === 1 ? 'run' : 'runs'}`}
          meta={
            weekly.totalDurationS > 0
              ? `${formatDurationSeconds(weekly.totalDurationS)} total run time`
              : 'Completed runs this week'
          }
          origin="RECORDED"
        />
        <StatTile
          label="Recent Running Pace"
          value={recentComparablePace ? recentComparablePace.pace : 'Unavailable'}
          meta={
            recentComparablePace
              ? `Last ${recentComparablePace.count} ${recentComparablePace.typeLabel} run(s)`
              : 'Requires recorded running sessions'
          }
          origin={recentComparablePace ? 'CALCULATED' : 'MISSING'}
        />
        <StatTile
          label="Recovery Status"
          value={
            loading
              ? '...'
              : readiness.score !== null
              ? `${readiness.score}/100`
              : readiness.label
          }
          meta={
            latestCheckIn
              ? `${readiness.label} · ${latestCheckIn.checkin_date}`
              : 'Log a daily check-in on Calendar'
          }
          origin={latestCheckIn ? 'CALCULATED' : 'MISSING'}
        />
      </div>

      {/* Latest Run & 5K Progress */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-slate-900">Latest Recorded Run</h2>
              </div>
              <ProvenanceBadge origin={latestRun ? 'RECORDED' : 'MISSING'} />
            </div>

            {!latestRun ? (
              <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-600">
                No completed runs recorded yet. Open the{' '}
                <Link to="/runs" className="font-semibold text-blue-700 hover:underline">
                  Running Log
                </Link>{' '}
                to log a run manually or import your August 2026 benchmarks.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {latestRun.session_date}
                    </span>
                    <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                      {WORKOUT_TYPE_LABELS[latestRun.workout_type]}
                    </span>
                    {latestRun.is_historical_record && (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        Historical Benchmark
                      </span>
                    )}
                  </div>
                  {latestRun.rpe && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                      RPE {latestRun.rpe}/10
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 py-3 font-mono tabular-nums">
                  <div className="px-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">
                      Distance
                    </div>
                    <div className="mt-1 text-base font-bold text-slate-900">
                      {formatDistanceKm(latestRun.distance_m)}
                    </div>
                  </div>
                  <div className="px-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">
                      Duration
                    </div>
                    <div className="mt-1 text-base font-bold text-slate-900">
                      {formatDurationSeconds(latestRun.duration_s)}
                    </div>
                  </div>
                  <div className="px-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">
                      Avg Pace
                    </div>
                    <div className="mt-1 text-base font-bold text-blue-700">
                      {formatPace(latestRun.distance_m, latestRun.duration_s)}
                    </div>
                  </div>
                </div>

                {latestRun.notes && (
                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
                    {latestRun.notes}
                  </p>
                )}
              </div>
            )}
          </div>

          {latestRun && (
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="font-mono text-xs text-slate-400">
                {(latestRun.splits?.length ?? 0) > 0
                  ? `${latestRun.splits?.length} splits recorded`
                  : 'No splits recorded'}
              </span>
              <Link
                to={`/runs/${latestRun.id}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
              >
                <span>Inspect splits &amp; telemetry</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </Card>

        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-slate-900">5K Progress &amp; Targets</h2>
              </div>
              <ProvenanceBadge origin={fiveK.fastest5K ? 'RECORDED' : 'MISSING'} />
            </div>

            {fastest5KS && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-600">
                    Trajectory toward Sub-{formatDurationSeconds(sub20GoalS)} target
                  </span>
                  <span className="font-mono font-semibold text-slate-900">{goalProgressPct}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    style={{ width: `${goalProgressPct}%` }}
                    className="h-full rounded-full bg-blue-700 transition-all"
                  />
                </div>
              </div>
            )}

            <dl className="mt-3 divide-y divide-slate-100 text-sm">
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-slate-600">Fastest Known Recorded ~5K</dt>
                <dd className="font-mono text-xs font-semibold text-slate-900 tabular-nums sm:text-sm">
                  {fiveK.fastest5K
                    ? `${formatDurationSeconds(fiveK.fastest5K.recordedTimeS)} · ${formatDistanceKm(
                        fiveK.fastest5K.session.distance_m
                      )} (${fiveK.fastest5K.session.session_date})`
                    : 'Missing'}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-slate-600">Most Recent Recorded ~5K</dt>
                <dd className="font-mono text-xs font-semibold text-slate-900 tabular-nums sm:text-sm">
                  {fiveK.mostRecent5K
                    ? `${formatDurationSeconds(
                        fiveK.mostRecent5K.recordedTimeS
                      )} · ${formatDistanceKm(fiveK.mostRecent5K.session.distance_m)} (${
                        fiveK.mostRecent5K.session.session_date
                      })`
                    : 'Missing'}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-slate-600">First Major 5K Goal</dt>
                <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                  Sub-{formatDurationSeconds(sub20GoalS)}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <dt className="text-slate-600">Long-Term 5K Goal</dt>
                <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatDurationSeconds(profile?.long_term_5k_goal_s ?? 1050)}
                </dd>
              </div>
            </dl>
          </div>

          <p className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
            Fastest logged runs stay distinct from confirmed lifetime personal bests until you
            explicitly confirm them.
          </p>
        </Card>
      </div>

      {/* Activity Separation & Upcoming Schedule */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-emerald-700" />
              <h2 className="text-sm font-semibold text-slate-900">Activity Separation Model</h2>
            </div>
            <CategoryBadge category="RUNNING" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Running distance, pace, and benchmarks are strictly isolated from non-running
            commitments so training load and milestones never get polluted.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <CategoryBadge category="RUNNING" />
            <CategoryBadge category="KARATE" />
            <CategoryBadge category="RECOVERY" />
            <CategoryBadge category="VOCAL" />
            <CategoryBadge category="DRUMMING" />
            <CategoryBadge category="UNIVERSITY" />
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-700" />
                <h2 className="text-sm font-semibold text-slate-900">Upcoming Schedule (Next 4 Days)</h2>
              </div>
              <ProvenanceBadge origin={upcomingSchedule.length > 0 ? 'PLANNED' : 'MISSING'} />
            </div>

            {upcomingSchedule.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                No upcoming blocks scheduled yet. Open the{' '}
                <Link to="/calendar" className="font-semibold text-blue-700 hover:underline">
                  Calendar
                </Link>{' '}
                to seed recurring Karate, Vocal, Drumming, and Rest Day blocks.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {upcomingSchedule.map((item) => (
                  <li key={item.occurrenceKey} className="flex items-center justify-between py-2.5">
                    <div>
                      <div className="font-medium text-slate-900">{item.title}</div>
                      <div className="font-mono text-xs text-slate-500">
                        {item.date}
                        {item.startTime ? ` · ${item.startTime}` : ''}
                      </div>
                    </div>
                    <CategoryBadge category={item.category} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
            >
              <span>Open Unified Calendar</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}