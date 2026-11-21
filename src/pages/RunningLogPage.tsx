import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Camera,
  ChevronRight,
  GitCompare,
  History,
  Info,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button, CategoryMark, ProvenanceBadge } from '@/design-system';
import { formatDurationSeconds } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { formatDistanceKm, formatPace } from '@/modules/running/calculations';
import {
  createRunningSession,
  deleteRunningSession,
  importHistoricalAugust2026Records,
  listRunningSessions,
} from '@/modules/running/repository';
import { RunFormModal } from '@/modules/running/RunFormModal';
import { RunComparisonModal } from '@/components/running/RunComparisonModal';
import { ScreenshotImportModal } from '@/modules/screenshot/ScreenshotImportModal';
import { WORKOUT_TYPE_LABELS, type RunningSession, type WorkoutType } from '@/types/domain';

export function RunningLogPage() {
  const { user, profile } = useAuth();
  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showScreenshotModal, setShowScreenshotModal] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [importingHistory, setImportingHistory] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<WorkoutType | 'ALL'>('ALL');
  const [environmentFilter, setEnvironmentFilter] = useState<'ALL' | 'OUTDOOR' | 'INDOOR'>('ALL');
  const [minDistanceKm, setMinDistanceKm] = useState('');
  const [minRpe, setMinRpe] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listRunningSessions(user.id);
      setSessions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load running sessions.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (typeFilter !== 'ALL' && s.workout_type !== typeFilter) return false;
      if (environmentFilter === 'OUTDOOR' && s.is_indoor) return false;
      if (environmentFilter === 'INDOOR' && !s.is_indoor) return false;
      if (minDistanceKm && s.distance_m < Math.round(Number(minDistanceKm) * 1000)) return false;
      if (minRpe && (!s.rpe || s.rpe < Number(minRpe))) return false;
      if (dateFrom && s.session_date < dateFrom) return false;
      if (dateTo && s.session_date > dateTo) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const haystack = [
          s.session_date,
          WORKOUT_TYPE_LABELS[s.workout_type],
          s.notes ?? '',
          s.conditions ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, typeFilter, environmentFilter, minDistanceKm, minRpe, dateFrom, dateTo, searchQuery]);

  const filteredSummary = useMemo(() => {
    const totalDistM = filteredSessions.reduce((acc, s) => acc + s.distance_m, 0);
    const totalDurS = filteredSessions.reduce((acc, s) => acc + s.duration_s, 0);
    return {
      count: filteredSessions.length,
      totalDistKm: (totalDistM / 1000).toFixed(1),
      totalDurStr: formatDurationSeconds(totalDurS),
      avgPace: totalDistM > 0 && totalDurS > 0 ? formatPace(totalDistM, totalDurS) : '—',
    };
  }, [filteredSessions]);

  const hasHistoricalAug2026 = useMemo(
    () => sessions.some((s) => s.is_historical_record),
    [sessions]
  );

  const hasActiveFilters = Boolean(
    searchQuery ||
      typeFilter !== 'ALL' ||
      environmentFilter !== 'ALL' ||
      minDistanceKm ||
      minRpe ||
      dateFrom ||
      dateTo
  );

  async function handleImportAugust2026() {
    if (!user) return;
    setImportingHistory(true);
    setError(null);
    setNotice(null);
    try {
      const count = await importHistoricalAugust2026Records(user.id);
      await loadSessions();
      setNotice(
        count > 0
          ? `Imported ${count} historical August 2026 benchmark record(s) without inventing splits or heart rate.`
          : 'August 2026 historical benchmark records are already in your log.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Historical import failed.');
    } finally {
      setImportingHistory(false);
    }
  }

  function toggleCompareSelection(sessionId: string) {
    setSelectedForCompare((prev) => {
      if (prev.includes(sessionId)) return prev.filter((id) => id !== sessionId);
      if (prev.length >= 2) return [prev[1], sessionId];
      return [...prev, sessionId];
    });
  }

  async function handleDelete(sessionId: string) {
    if (!user) return;
    if (!window.confirm('Delete this run? Weekly totals and benchmarks will recalculate.')) return;
    await deleteRunningSession(user.id, sessionId);
    setSelectedForCompare((prev) => prev.filter((id) => id !== sessionId));
    await loadSessions();
  }

  const compareRuns = useMemo(() => {
    if (selectedForCompare.length !== 2) return null;
    const a = sessions.find((s) => s.id === selectedForCompare[0]);
    const b = sessions.find((s) => s.id === selectedForCompare[1]);
    return a && b ? ([a, b] as const) : null;
  }, [selectedForCompare, sessions]);

  return (
    <div className="space-y-7">
      {/* Stride Editorial Page Heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
            Find your <em className="not-italic text-[var(--run)]">rhythm.</em>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:pb-1">
          {selectedForCompare.length === 2 && (
            <Button variant="secondary" onClick={() => setShowCompareModal(true)}>
              <GitCompare className="h-4 w-4" />
              <span>Compare (2)</span>
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowScreenshotModal(true)}>
            <Camera className="h-4 w-4" />
            <span>Import Screenshot</span>
          </Button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-[var(--run)] px-4 text-[13px] font-bold text-[var(--run-btn-text)] transition-opacity hover:opacity-90 active:translate-y-px"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Log a run</span>
          </button>
        </div>
      </div>

      {/* Stride 3-Column Stats Strip */}
      <div className="grid grid-cols-1 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--surface)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-3.5">
          <span className="text-[10.5px] font-bold tracking-[0.12em] text-[var(--muted)]">
            {hasActiveFilters ? 'FILTERED DISTANCE' : 'TOTAL DISTANCE'}
          </span>
          <strong className="mt-2 block font-mono text-[28px] font-bold leading-none tracking-[-0.06em] text-[var(--run)] tabular-nums">
            {filteredSummary.totalDistKm}{' '}
            <small className="font-sans text-[15px] font-semibold tracking-normal text-[var(--muted)]">
              km
            </small>
          </strong>
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">
            {filteredSummary.totalDurStr} total time
          </p>
        </div>

        <div className="px-5 py-3.5">
          <span className="text-[10.5px] font-bold tracking-[0.12em] text-[var(--muted)]">
            SESSIONS
          </span>
          <strong className="mt-2 block font-mono text-[28px] font-bold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums">
            {filteredSummary.count}
          </strong>
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">Recorded runs</p>
        </div>

        <div className="px-5 py-3.5">
          <span className="text-[10.5px] font-bold tracking-[0.12em] text-[var(--muted)]">
            AVERAGE PACE
          </span>
          <strong className="mt-2 block font-mono text-[28px] font-bold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums">
            {filteredSummary.avgPace}
          </strong>
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">Recorded sessions only</p>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--run-lite)] px-4 py-3 text-xs font-semibold text-[var(--run-ink)]">
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300/60 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Stride 2-Column Running Workspace */}
      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1.68fr)_minmax(270px,0.92fr)]">
        {/* Left: Filters + Run Log Panel */}
        <div className="space-y-7">
          {/* Compact Stride Filter Bar */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="relative sm:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--faint)]" />
                <input
                  type="text"
                  placeholder="Search notes, conditions, date..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] py-2 pl-9 pr-3 text-[13px] text-[var(--ink)] focus:border-[var(--run)] focus:outline-none"
                />
              </div>

              <select
                aria-label="Filter by workout type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as WorkoutType | 'ALL')}
                className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[12.5px] text-[var(--ink)] focus:border-[var(--run)] focus:outline-none"
              >
                <option value="ALL">All types</option>
                {Object.entries(WORKOUT_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by environment"
                value={environmentFilter}
                onChange={(e) => setEnvironmentFilter(e.target.value as 'ALL' | 'OUTDOOR' | 'INDOOR')}
                className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[12.5px] text-[var(--ink)] focus:border-[var(--run)] focus:outline-none"
              >
                <option value="ALL">Outdoor &amp; Indoor</option>
                <option value="OUTDOOR">Outdoor only</option>
                <option value="INDOOR">Indoor / Treadmill</option>
              </select>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--line)] pt-3 text-[11.5px] text-[var(--muted)]">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="Min km"
                  aria-label="Minimum distance km"
                  value={minDistanceKm}
                  onChange={(e) => setMinDistanceKm(e.target.value)}
                  className="w-20 rounded-[7px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2 py-1 font-mono text-[11.5px] text-[var(--ink)] focus:border-[var(--run)] focus:outline-none"
                />
                <input
                  type="number"
                  min="1"
                  max="10"
                  placeholder="Min RPE"
                  aria-label="Minimum RPE"
                  value={minRpe}
                  onChange={(e) => setMinRpe(e.target.value)}
                  className="w-20 rounded-[7px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2 py-1 font-mono text-[11.5px] text-[var(--ink)] focus:border-[var(--run)] focus:outline-none"
                />
                <input
                  type="date"
                  aria-label="From date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-[7px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2 py-1 text-[11.5px] text-[var(--ink)]"
                />
                <input
                  type="date"
                  aria-label="To date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-[7px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2 py-1 text-[11.5px] text-[var(--ink)]"
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[var(--faint)]">Tick 2 runs to compare</span>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setTypeFilter('ALL');
                      setEnvironmentFilter('ALL');
                      setMinDistanceKm('');
                      setMinRpe('');
                      setDateFrom('');
                      setDateTo('');
                    }}
                    className="font-semibold text-[var(--run)] hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Run List Panel */}
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold tracking-[0.12em] text-[var(--muted)]">
                  YOUR HISTORY
                </div>
                <h2 className="mt-1.5 text-[23px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                  Run log
                </h2>
              </div>
              <span className="rounded-[6px] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[10.5px] font-semibold text-[var(--muted)]">
                {sessions.length} recorded
              </span>
            </div>

            {loading ? (
              <div className="border-t border-[var(--line)] py-8 text-center text-sm text-[var(--muted)]">
                Loading running history...
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center border-t border-[var(--line)] px-4 py-8 text-center">
                {/* Stride Concentric Track Rings Graphic */}
                <div className="relative mb-3 h-[126px] w-[166px]" aria-hidden="true">
                  <span className="absolute left-3.5 top-2.5 block h-[102px] w-[136px] -rotate-[18deg] rounded-[100px] border-[8px] border-[var(--run)]/30" />
                  <span className="absolute left-8 top-7 block h-[66px] w-[100px] -rotate-[18deg] rounded-[100px] border-[7px] border-[var(--run)]/55" />
                  <span className="absolute left-[52px] top-[44px] block h-[32px] w-[58px] -rotate-[18deg] rounded-[100px] border-[6px] border-[var(--run)]" />
                  <i className="absolute right-3 top-4 block h-5 w-5 rounded-full bg-[var(--yellow)]" />
                </div>
                <h3 className="text-[21px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                  {sessions.length === 0
                    ? 'Every runner starts somewhere.'
                    : 'No matching runs.'}
                </h3>
                <p className="mt-2.5 max-w-[350px] text-[12.5px] leading-relaxed text-[var(--muted)]">
                  {sessions.length === 0
                    ? 'No recorded runs yet. Add your first real session to start building an honest picture of your progress.'
                    : 'Try adjusting or resetting your active filters.'}
                </p>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-[var(--run)] px-4 text-[13px] font-bold text-[var(--run-btn-text)] transition-opacity hover:opacity-90 active:translate-y-px"
                  >
                    <Plus className="h-4 w-4 stroke-[2.5]" />
                    <span>Record your first run</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                {filteredSessions.map((run) => {
                  const isSelected = selectedForCompare.includes(run.id);
                  return (
                    <div
                      key={run.id}
                      className={`flex flex-wrap items-center justify-between gap-3 py-4 transition-colors ${
                        isSelected ? 'bg-[var(--run-lite)]/40 -mx-3 px-3 rounded-xl' : ''
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3.5">
                        <input
                          type="checkbox"
                          aria-label={`Select run on ${run.session_date} for comparison`}
                          checked={isSelected}
                          onChange={() => toggleCompareSelection(run.id)}
                          className="h-4 w-4 shrink-0 rounded border-[var(--line-strong)] accent-[var(--run)]"
                        />
                        <CategoryMark category="RUNNING" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/runs/${run.id}`}
                              className="text-[13.5px] font-bold text-[var(--ink)] hover:text-[var(--run)]"
                            >
                              {WORKOUT_TYPE_LABELS[run.workout_type]}
                            </Link>
                            <span className="font-mono text-[11.5px] text-[var(--muted)]">
                              {run.session_date}
                            </span>
                            {run.is_indoor && (
                              <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                                Indoor
                              </span>
                            )}
                            {run.is_historical_record && (
                              <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                                Historical
                              </span>
                            )}
                            <ProvenanceBadge origin={run.data_origin} />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--muted)]">
                            <span className="font-mono">{formatDurationSeconds(run.duration_s)}</span>
                            {run.rpe && <span>· RPE {run.rpe}/10</span>}
                            {run.splits && run.splits.length > 0 && (
                              <span>· {run.splits.length} splits</span>
                            )}
                            {run.notes && (
                              <span className="truncate max-w-[260px]">· {run.notes}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-[13.5px] font-bold text-[var(--ink)]">
                            {formatDistanceKm(run.distance_m)}
                          </div>
                          <div className="text-[11px] font-medium text-[var(--run)]">
                            {formatPace(run.distance_m, run.duration_s)}
                          </div>
                        </div>

                        <Link
                          to={`/runs/${run.id}`}
                          aria-label={`Analyze run on ${run.session_date}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(run.id)}
                          aria-label={`Delete run on ${run.session_date}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--faint)] transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Sidebar: North Star + Honesty Card + Historical Import */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--run-lite)] p-5">
            <div className="text-[11px] font-bold tracking-[0.12em] text-[var(--muted)]">
              YOUR NORTH STAR
            </div>
            <h2 className="mt-1.5 text-[21px] font-bold tracking-[-0.045em] text-[var(--ink)]">
              5K under 20:00
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
              Your first big milestone. The next chapter is 17:30.
            </p>

            <div className="mt-5 divide-y divide-[var(--line-strong)] border-t border-[var(--line-strong)]">
              <div className="flex items-center justify-between py-3 text-[12px]">
                <span className="text-[var(--muted)]">First target</span>
                <b className="font-mono text-[var(--ink)]">19:59</b>
              </div>
              <div className="flex items-center justify-between py-3 text-[12px]">
                <span className="text-[var(--muted)]">Long-term target</span>
                <b className="font-mono text-[var(--ink)]">17:30</b>
              </div>
              <div className="flex items-center justify-between pt-3 text-[12px]">
                <span className="text-[var(--muted)]">Personal bests</span>
                <Link
                  to="/personal-bests"
                  className="inline-flex items-center gap-1 font-semibold text-[var(--run-ink)] hover:underline"
                >
                  <span>View PBs</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted)]" />
            <p className="text-[12px] leading-relaxed text-[var(--muted)]">
              <b className="text-[var(--ink)]">Real data only.</b> Planned runs, estimates, and
              recorded performances stay clearly separate.
            </p>
          </div>

          {!loading && !hasHistoricalAug2026 && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <div className="text-[12px] font-bold text-[var(--ink)]">
                Import August 2026 Benchmarks
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
                Add your two documented historical runs (Aug 13: 5.00 km in 28:10 · Aug 18: 5.14 km
                in 30:58) without inventing splits.
              </p>
              <Button
                variant="secondary"
                disabled={importingHistory}
                onClick={() => void handleImportAugust2026()}
                className="mt-3.5 w-full !min-h-[36px] !text-[12px]"
              >
                <History className="h-3.5 w-3.5" />
                <span>{importingHistory ? 'Importing...' : 'Import Aug 2026 Records'}</span>
              </Button>
            </div>
          )}
        </aside>
      </div>

      {showCreateModal && user && (
        <RunFormModal
          timezone={profile?.timezone ?? 'Asia/Colombo'}
          onClose={() => setShowCreateModal(false)}
          onSave={async (draft) => {
            await createRunningSession(user.id, draft);
            await loadSessions();
          }}
        />
      )}

      {showScreenshotModal && user && (
        <ScreenshotImportModal
          timezone={profile?.timezone ?? 'Asia/Colombo'}
          onClose={() => setShowScreenshotModal(false)}
          onSave={async (draft) => {
            await createRunningSession(user.id, draft);
            await loadSessions();
          }}
        />
      )}

      {showCompareModal && compareRuns && (
        <RunComparisonModal
          runA={compareRuns[0]}
          runB={compareRuns[1]}
          onClose={() => setShowCompareModal(false)}
        />
      )}
    </div>
  );
}
