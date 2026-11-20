import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Camera,
  GitCompare,
  History,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, ProvenanceBadge } from '@/design-system';
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
      totalDistKm: formatDistanceKm(totalDistM),
      totalDurStr: formatDurationSeconds(totalDurS),
      avgPace: totalDistM > 0 && totalDurS > 0 ? formatPace(totalDistM, totalDurS) : '—',
    };
  }, [filteredSessions]);

  const hasHistoricalAug2026 = useMemo(
    () => sessions.some((s) => s.is_historical_record),
    [sessions]
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
    <div className="space-y-6">
      <PageHeader
        title="Running Log"
        subtitle="Verified running sessions, exact calculated paces, splits, and run-to-run comparisons."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {selectedForCompare.length === 2 && (
              <Button variant="secondary" onClick={() => setShowCompareModal(true)}>
                <GitCompare className="h-4 w-4" />
                <span>Compare Selected (2)</span>
              </Button>
            )}
            <Button variant="secondary" onClick={() => setShowScreenshotModal(true)}>
              <Camera className="h-4 w-4" />
              <span>Import Screenshot</span>
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              <span>Log Run</span>
            </Button>
          </div>
        }
      />

      {!loading && sessions.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Showing Runs
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
              {filteredSummary.count}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Filtered Distance
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
              {filteredSummary.totalDistKm}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Filtered Time
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
              {filteredSummary.totalDurStr}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Aggregate Pace
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-blue-700 tabular-nums">
              {filteredSummary.avgPace}
            </div>
          </div>
        </div>
      )}

      {!loading && !hasHistoricalAug2026 && (
        <Card className="flex flex-col justify-between gap-4 border-blue-200 bg-blue-50/50 p-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Import Known August 2026 Benchmarks
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Add your two documented historical runs (Aug 13, 2026: 5.00 km in 28:10 · Aug 18,
              2026: 5.14 km in 30:58) marked explicitly as historical records without fabricated
              splits.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={importingHistory}
            onClick={() => void handleImportAugust2026()}
            className="shrink-0 bg-white"
          >
            <History className="h-4 w-4" />
            <span>{importingHistory ? 'Importing...' : 'Import Aug 2026 Records'}</span>
          </Button>
        </Card>
      )}

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

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search notes, conditions, date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by workout type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as WorkoutType | 'ALL')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">All workout types</option>
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
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">Outdoor &amp; Indoor</option>
            <option value="OUTDOOR">Outdoor only</option>
            <option value="INDOOR">Indoor / Treadmill</option>
          </select>

          <input
            type="number"
            step="0.5"
            min="0"
            placeholder="Min km"
            aria-label="Minimum distance km"
            value={minDistanceKm}
            onChange={(e) => setMinDistanceKm(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />

          <input
            type="number"
            min="1"
            max="10"
            placeholder="Min RPE"
            aria-label="Minimum RPE"
            value={minRpe}
            onChange={(e) => setMinRpe(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5">
              <span>From</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span>To</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <span>Select any 2 runs to compare</span>
            {(searchQuery ||
              typeFilter !== 'ALL' ||
              environmentFilter !== 'ALL' ||
              minDistanceKm ||
              minRpe ||
              dateFrom ||
              dateTo) && (
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
                className="font-semibold text-blue-700 hover:underline"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          Loading running history...
        </div>
      ) : filteredSessions.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-5 w-5" />}
          title="No matching running sessions"
          description={
            sessions.length === 0
              ? 'Log your first run manually, import a screenshot, or import your August 2026 benchmarks.'
              : 'No runs match the active filters.'
          }
          action={
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              <span>Log Running Session</span>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filteredSessions.map((run) => {
            const isSelected = selectedForCompare.includes(run.id);
            return (
              <Card
                key={run.id}
                className={`p-4 transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500'
                    : 'hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Select run on ${run.session_date} for comparison`}
                      checked={isSelected}
                      onChange={() => toggleCompareSelection(run.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {run.session_date}
                        </span>
                        <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                          {WORKOUT_TYPE_LABELS[run.workout_type]}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {run.is_indoor ? 'Indoor' : 'Outdoor'}
                        </span>
                        {run.entry_method === 'SCREENSHOT' && (
                          <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
                            Screenshot
                          </span>
                        )}
                        {run.is_historical_record && (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            Historical Benchmark
                          </span>
                        )}
                        <ProvenanceBadge origin={run.data_origin} />
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-sm tabular-nums">
                        <span className="font-bold text-slate-900">
                          {formatDistanceKm(run.distance_m)}
                        </span>
                        <span className="text-slate-700">
                          {formatDurationSeconds(run.duration_s)}
                        </span>
                        <span className="font-bold text-blue-700">
                          {formatPace(run.distance_m, run.duration_s)}
                        </span>
                        {run.rpe && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                            RPE {run.rpe}/10
                          </span>
                        )}
                        {run.splits && run.splits.length > 0 && (
                          <span className="text-xs text-slate-500">
                            {run.splits.length} split(s)
                          </span>
                        )}
                      </div>

                      {run.notes && (
                        <p className="mt-1.5 line-clamp-1 text-xs text-slate-600">{run.notes}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Link
                      to={`/runs/${run.id}`}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
                    >
                      <span>Analyze</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDelete(run.id)}
                      aria-label={`Delete run on ${run.session_date}`}
                      className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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