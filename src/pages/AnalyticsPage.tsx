import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, BarChart3, ShieldCheck } from 'lucide-react';
import {
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
import { listScheduleBlocks } from '@/modules/calendar/repository';
import { formatDistanceKm, formatPace } from '@/modules/running/calculations';
import {
  buildPaceProgressionSeries,
  buildWeeklyVolumeSeries,
  computeActivitySeparation,
  computeConsistencySummary,
} from '@/modules/analytics/analyticsEngine';
import {
  WORKOUT_TYPE_LABELS,
  type RunningSession,
  type ScheduleBlock,
  type WorkoutType,
} from '@/types/domain';

function formatSecPerKm(secPerKm: number): string {
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

export function AnalyticsPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeksWindow, setWeeksWindow] = useState<4 | 8 | 12>(8);
  const [paceFilter, setPaceFilter] = useState<WorkoutType | 'ALL'>('ALL');

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    Promise.all([
      listRunningSessions(user.id),
      listScheduleBlocks(user.id).catch(() => [] as ScheduleBlock[]),
    ])
      .then(([runRows, blockRows]) => {
        setSessions(runRows);
        setBlocks(blockRows);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const weeklySeries = useMemo(
    () => buildWeeklyVolumeSeries(sessions, today, weeksWindow),
    [sessions, today, weeksWindow]
  );

  const paceSeries = useMemo(
    () => buildPaceProgressionSeries(sessions, paceFilter),
    [sessions, paceFilter]
  );

  const consistency = useMemo(
    () => computeConsistencySummary(sessions, today),
    [sessions, today]
  );

  const separation = useMemo(
    () => computeActivitySeparation(blocks, sessions, today),
    [blocks, sessions, today]
  );

  const avg28dPace =
    consistency.distanceLast28dM > 0 && consistency.durationLast28dS > 0
      ? formatPace(consistency.distanceLast28dM, consistency.durationLast28dS)
      : 'Unavailable';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Analytics"
        subtitle={`Running volume, pace progression, consistency, and activity separation (${tz}).`}
      />

      {/* 28-Day Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="28-Day Running Volume"
          value={loading ? '...' : formatDistanceKm(consistency.distanceLast28dM)}
          meta={`${formatDurationSeconds(consistency.durationLast28dS)} total running time`}
          origin="RECORDED"
        />
        <StatTile
          label="28-Day Run Frequency"
          value={loading ? '...' : `${consistency.runsLast28d} runs`}
          meta={`${consistency.avgRunsPerWeek} runs / week average`}
          origin="CALCULATED"
        />
        <StatTile
          label="Active Week Streak"
          value={loading ? '...' : `${consistency.currentWeekStreak} wk`}
          meta="Consecutive Mon–Sun weeks with ≥1 run"
          origin="CALCULATED"
        />
        <StatTile
          label="28-Day Aggregate Pace"
          value={loading ? '...' : avg28dPace}
          meta="Strict running sessions only"
          origin={consistency.runsLast28d > 0 ? 'CALCULATED' : 'MISSING'}
        />
      </div>

      {!loading && sessions.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="No running data to chart yet"
          description="Log a run or import your August 2026 benchmarks on the Running Log to unlock weekly volume and pace progression charts."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Weekly Running Volume Chart */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Weekly Running Distance (Mon–Sun)
                </h2>
                <p className="text-xs text-slate-500">Recorded running kilometers only</p>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                {([4, 8, 12] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWeeksWindow(w)}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      weeksWindow === w
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {w}W
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklySeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="weekLabel"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    unit=" km"
                  />
                  <Tooltip
                    formatter={(value: unknown) => [`${Number(value).toFixed(2)} km`, 'Distance']}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="distanceKm" fill="#1d4ed8" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Pace Progression Chart */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Pace Progression (Faster = Higher)
                </h2>
                <p className="text-xs text-slate-500">Calculated exact average pace per session</p>
              </div>
              <select
                aria-label="Filter pace chart by workout type"
                value={paceFilter}
                onChange={(e) => setPaceFilter(e.target.value as WorkoutType | 'ALL')}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
              >
                <option value="ALL">All types</option>
                {Object.entries(WORKOUT_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {paceSeries.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-xs text-slate-500">
                No recorded runs match this workout filter.
              </div>
            ) : (
              <div className="mt-4 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={paceSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      reversed
                      domain={['dataMin - 15', 'dataMax + 15']}
                      tickFormatter={(v: number) => formatSecPerKm(v).replace(' /km', '')}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value: unknown) => [formatSecPerKm(Number(value)), 'Avg Pace']}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="paceSecPerKm"
                      stroke="#0f172a"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#1d4ed8', stroke: '#ffffff', strokeWidth: 1.5 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Activity Separation Audit (Last 7 Days) */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            <h2 className="text-sm font-semibold text-slate-900">
              7-Day Activity Separation Audit
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <ProvenanceBadge origin="CALCULATED" />
            <Link to="/personal-bests" className="text-xs font-semibold text-blue-700 hover:underline">
              View Personal Bests →
            </Link>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 px-4">Sessions (7d)</th>
                <th className="py-2 px-4">Scheduled / Logged Time</th>
                <th className="py-2 pl-4">Counts Toward Running km?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {separation.map((row) => (
                <tr key={row.category}>
                  <td className="py-2.5 pr-4">
                    <CategoryBadge category={row.category} />
                  </td>
                  <td className="py-2.5 px-4 font-mono tabular-nums">{row.countLast7d}</td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600">
                    {row.totalMinutesLast7d > 0 ? `${row.totalMinutesLast7d} min` : '—'}
                  </td>
                  <td className="py-2.5 pl-4 text-xs font-medium">
                    {row.contributesToRunningKm ? (
                      <span className="inline-flex items-center gap-1 text-blue-700">
                        <Activity className="h-3.5 w-3.5" />
                        Yes (Running Only)
                      </span>
                    ) : (
                      <span className="text-slate-500">No — Isolated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}