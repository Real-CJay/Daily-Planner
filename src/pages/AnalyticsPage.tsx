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
import { ArrowRight, Info } from 'lucide-react';
import { CategoryBadge } from '@/design-system';
import { formatDurationSeconds, getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listRunningSessions } from '@/modules/running/repository';
import { listScheduleBlocks } from '@/modules/calendar/repository';
import { formatPace } from '@/modules/running/calculations';
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
      ? formatPace(consistency.distanceLast28dM, consistency.durationLast28dS).replace(' /km', '')
      : null;

  return (
    <div className="space-y-7 pb-6">
      {/* Studio Header (Common Default Stride Blue) */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
          Understand your <em className="not-italic text-[var(--blue)]">progress.</em>
        </h1>

        <Link
          to="/runs"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[12.5px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-2)]"
        >
          <span>Open running log</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Clean 3-Column Studio Metric Strip */}
      <div className="grid grid-cols-1 divide-y divide-[var(--line)] rounded-[15px] border border-[var(--line)] bg-[var(--surface)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
            LAST 28 DAYS
          </span>
          <div className="mt-2 font-mono text-[32px] font-bold leading-none tracking-[-0.06em] text-[var(--blue)] tabular-nums">
            {loading ? '—' : (consistency.distanceLast28dM / 1000).toFixed(1)}
            <small className="ml-1.5 font-sans text-[14px] font-medium text-[var(--muted)]">
              km
            </small>
          </div>
          <span className="mt-1.5 block text-[11.5px] text-[var(--muted)]">
            {formatDurationSeconds(consistency.durationLast28dS)} running time
          </span>
        </div>

        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
            RUNS &amp; STREAK
          </span>
          <div className="mt-2 font-mono text-[32px] font-bold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums">
            {loading ? '—' : consistency.runsLast28d}
            <small className="ml-2 font-sans text-[14px] font-medium text-[var(--muted)]">
              · {consistency.currentWeekStreak} wk streak
            </small>
          </div>
          <span className="mt-1.5 block text-[11.5px] text-[var(--muted)]">
            {consistency.avgRunsPerWeek} runs / week average
          </span>
        </div>

        <div className="px-6 py-5">
          <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--muted)]">
            AVERAGE PACE
          </span>
          <div className="mt-2 font-mono text-[32px] font-bold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums">
            {loading ? '—' : avg28dPace ?? '—'}
            {avg28dPace && (
              <small className="ml-1.5 font-sans text-[14px] font-medium text-[var(--muted)]">
                /km
              </small>
            )}
          </div>
          <span className="mt-1.5 block text-[11.5px] text-[var(--muted)]">
            28-day aggregate pace
          </span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Weekly Distance */}
        <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                Weekly distance
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                Running kilometers · Monday to Sunday
              </p>
            </div>

            <div className="inline-flex rounded-[9px] border border-[var(--line)] p-0.5 text-[11.5px] font-semibold">
              {([4, 8, 12] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeeksWindow(w)}
                  className={`rounded-[7px] px-2.5 py-1 transition-colors ${
                    weeksWindow === w
                      ? 'bg-[var(--blue-lite)] font-bold text-[var(--blue-ink)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {w}w
                </button>
              ))}
            </div>
          </div>

          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklySeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis
                  dataKey="weekLabel"
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  axisLine={{ stroke: 'var(--line-strong)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                  unit=" km"
                />
                <Tooltip
                  formatter={(value: unknown) => [`${Number(value).toFixed(2)} km`, 'Distance']}
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid var(--line-strong)',
                    backgroundColor: 'var(--surface)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="distanceKm"
                  fill="var(--blue)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Pace Progression */}
        <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                Pace history
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                Higher points indicate faster average pace.
              </p>
            </div>

            <select
              aria-label="Filter pace chart by workout type"
              value={paceFilter}
              onChange={(e) => setPaceFilter(e.target.value as WorkoutType | 'ALL')}
              className="h-9 rounded-[8px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2.5 text-[12px] text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none"
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
            <div className="flex h-[250px] flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-8 items-end gap-1 -rotate-12" aria-hidden="true">
                <span className="h-3.5 w-2 rounded bg-[var(--line-strong)]" />
                <span className="h-6 w-2 rounded bg-[var(--blue)]" />
                <span className="h-4.5 w-2 rounded bg-[var(--line-strong)]" />
              </div>
              <h3 className="text-[15px] font-bold text-[var(--ink)]">No pace data yet.</h3>
              <p className="mt-1 text-[12px] text-[var(--muted)]">
                Record a run to start building your pace progression.
              </p>
            </div>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={paceSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    axisLine={{ stroke: 'var(--line-strong)' }}
                    tickLine={false}
                  />
                  <YAxis
                    reversed
                    domain={['dataMin - 15', 'dataMax + 15']}
                    tickFormatter={(v: number) => formatSecPerKm(v).replace(' /km', '')}
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [formatSecPerKm(Number(value)), 'Avg Pace']}
                    contentStyle={{
                      borderRadius: '10px',
                      border: '1px solid var(--line-strong)',
                      backgroundColor: 'var(--surface)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="paceSecPerKm"
                    stroke="var(--blue)"
                    strokeWidth={2.2}
                    dot={{ r: 4.5, fill: 'var(--blue)', stroke: 'var(--surface)', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Activity Separation Audit */}
      <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[19px] font-bold tracking-[-0.04em] text-[var(--ink)]">
              7-day activity separation
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Karate, music, strength, and recovery stay isolated from running mileage.
            </p>
          </div>
          <Link
            to="/personal-bests"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--blue)] hover:underline"
          >
            <span>Personal bests</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto border-t border-[var(--line)]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--faint)]">
                <th className="py-3 pr-4">Category</th>
                <th className="px-4 py-3">Sessions (7d)</th>
                <th className="px-4 py-3">Time</th>
                <th className="py-3 pl-4">Running km</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {separation.map((row) => (
                <tr key={row.category}>
                  <td className="py-3 pr-4">
                    <CategoryBadge category={row.category} />
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-[var(--ink)] tabular-nums">
                    {row.countLast7d}
                  </td>
                  <td className="px-4 py-3 font-mono text-[var(--muted)] tabular-nums">
                    {row.totalMinutesLast7d > 0 ? `${row.totalMinutesLast7d} min` : '—'}
                  </td>
                  <td className="py-3 pl-4 text-[12px]">
                    {row.contributesToRunningKm ? (
                      <span className="font-semibold text-[var(--blue)]">Running only</span>
                    ) : (
                      <span className="text-[var(--muted)]">Isolated</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-start gap-2.5 px-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>All charts are computed exclusively from verified Supabase running sessions.</p>
      </div>
    </div>
  );
}
