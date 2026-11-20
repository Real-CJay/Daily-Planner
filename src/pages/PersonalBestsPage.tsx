import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Award, CheckCircle2, Plus, Target, Trash2, X } from 'lucide-react';
import { Button, Card, PageHeader, ProvenanceBadge } from '@/design-system';
import { formatDurationSeconds, getLocalDateString } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import { listRunningSessions } from '@/modules/running/repository';
import { formatPace, parseDurationToSeconds } from '@/modules/running/calculations';
import { buildBenchmarkMatrix } from '@/modules/analytics/analyticsEngine';
import {
  deletePersonalBest,
  listPersonalBests,
  upsertPersonalBest,
} from '@/modules/analytics/repository';
import {
  BENCHMARK_DISTANCES,
  type BenchmarkDistance,
  type PersonalBest,
  type RunningSession,
} from '@/types/domain';

export function PersonalBestsPage() {
  const { user, profile } = useAuth();
  const tz = profile?.timezone ?? 'Asia/Colombo';
  const today = getLocalDateString(new Date(), tz);

  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal state for confirming/editing a PB
  const [editingDist, setEditingDist] = useState<BenchmarkDistance | null>(null);
  const [durationStr, setDurationStr] = useState('');
  const [achievedDate, setAchievedDate] = useState(today);
  const [linkedSessionId, setLinkedSessionId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [runRows, pbRows] = await Promise.all([
        listRunningSessions(user.id),
        listPersonalBests(user.id),
      ]);
      setSessions(runRows);
      setPbs(pbRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load benchmarks.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const matrix = useMemo(() => buildBenchmarkMatrix(sessions, pbs), [sessions, pbs]);

  const fiveKRow = matrix.find((r) => r.distance === '5K');
  const best5kS = fiveKRow?.confirmedPb?.duration_s ?? fiveKRow?.fastestLogged?.durationS ?? null;
  const sub20GoalS = profile?.first_major_5k_goal_s ?? 1200;
  const longTermGoalS = profile?.long_term_5k_goal_s ?? 1050;

  function openEditor(
    dist: BenchmarkDistance,
    prefill?: { durationS: number; date: string; sessionId: string | null; notes: string | null }
  ) {
    setEditingDist(dist);
    setDurationStr(prefill ? formatDurationSeconds(prefill.durationS) : '');
    setAchievedDate(prefill?.date ?? today);
    setLinkedSessionId(prefill?.sessionId ?? null);
    setNotes(prefill?.notes ?? '');
    setError(null);
  }

  async function handleSavePb(e: FormEvent) {
    e.preventDefault();
    if (!user || !editingDist) return;

    const durS = parseDurationToSeconds(durationStr);
    if (!durS) {
      setError('Enter a valid time in mm:ss or h:mm:ss format.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await upsertPersonalBest(user.id, {
        distance_label: editingDist,
        distance_m: BENCHMARK_DISTANCES[editingDist].meters,
        duration_s: durS,
        achieved_date: achievedDate,
        session_id: linkedSessionId,
        notes: notes.trim() ? notes.trim() : null,
      });
      setEditingDist(null);
      setNotice(`Confirmed ${editingDist} Personal Best saved.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save Personal Best.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePb(pb: PersonalBest) {
    if (!user) return;
    if (!window.confirm(`Remove confirmed ${pb.distance_label} Personal Best?`)) return;
    await deletePersonalBest(user.id, pb.id);
    setNotice(`Removed confirmed ${pb.distance_label} Personal Best.`);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personal Bests & Milestones"
        subtitle="Strict separation between Confirmed Lifetime PBs, Fastest Logged Runs, Riegel Estimates, and Goal Targets."
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

      {/* 5K Milestone Gap Card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-700" />
            <h2 className="text-sm font-semibold text-slate-900">5K Goal Progression</h2>
          </div>
          <ProvenanceBadge origin={best5kS ? 'CALCULATED' : 'MISSING'} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-xs font-medium text-slate-500">Current Best Recorded ~5K</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {best5kS ? formatDurationSeconds(best5kS) : 'Missing'}
            </div>
            <div className="mt-1 font-mono text-xs text-slate-500">
              {best5kS ? formatPace(5000, best5kS) : 'Log or confirm a 5K'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-xs font-medium text-slate-500">
              First Major Goal (Sub-{formatDurationSeconds(sub20GoalS)})
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-blue-700 tabular-nums">
              {formatDurationSeconds(sub20GoalS)}
            </div>
            <div className="mt-1 font-mono text-xs text-slate-600">
              {best5kS
                ? best5kS <= sub20GoalS
                  ? 'Goal achieved'
                  : `-${formatDurationSeconds(best5kS - sub20GoalS)} to go (${formatPace(
                      5000,
                      sub20GoalS
                    )})`
                : formatPace(5000, sub20GoalS)}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-xs font-medium text-slate-500">Long-Term 5K Goal</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
              {formatDurationSeconds(longTermGoalS)}
            </div>
            <div className="mt-1 font-mono text-xs text-slate-600">
              {best5kS && best5kS > longTermGoalS
                ? `-${formatDurationSeconds(best5kS - longTermGoalS)} to go (${formatPace(
                    5000,
                    longTermGoalS
                  )})`
                : formatPace(5000, longTermGoalS)}
            </div>
          </div>
        </div>
      </Card>

      {/* Benchmark Matrix (1K, 3K, 5K, 10K) */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          Loading benchmarks...
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {matrix.map((row) => (
            <Card key={row.distance} className="flex flex-col justify-between p-5">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-blue-700" />
                    <h3 className="font-mono text-base font-bold text-slate-900">{row.distance}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        openEditor(
                          row.distance,
                          row.confirmedPb
                            ? {
                                durationS: row.confirmedPb.duration_s,
                                date: row.confirmedPb.achieved_date,
                                sessionId: row.confirmedPb.session_id,
                                notes: row.confirmedPb.notes,
                              }
                            : undefined
                        )
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{row.confirmedPb ? 'Edit PB' : 'Confirm PB'}</span>
                    </Button>
                    {row.confirmedPb && (
                      <button
                        type="button"
                        onClick={() => void handleDeletePb(row.confirmedPb!)}
                        aria-label={`Delete ${row.distance} PB`}
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <dl className="mt-3 divide-y divide-slate-100 text-sm">
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2 text-slate-600">
                      <span>Confirmed Lifetime PB</span>
                      <ProvenanceBadge origin={row.confirmedPb ? 'RECORDED' : 'MISSING'} />
                    </dt>
                    <dd className="text-right font-mono tabular-nums">
                      {row.confirmedPb ? (
                        <div>
                          <span className="font-bold text-slate-900">
                            {formatDurationSeconds(row.confirmedPb.duration_s)}
                          </span>
                          <div className="text-[11px] text-slate-500">
                            {formatPace(row.confirmedPb.distance_m, row.confirmedPb.duration_s)} ·{' '}
                            {row.confirmedPb.achieved_date}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not confirmed</span>
                      )}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2 text-slate-600">
                      <span>Fastest Logged Run</span>
                      <ProvenanceBadge origin={row.fastestLogged ? 'RECORDED' : 'MISSING'} />
                    </dt>
                    <dd className="text-right font-mono tabular-nums">
                      {row.fastestLogged ? (
                        <div>
                          <span className="font-semibold text-slate-900">
                            {formatDurationSeconds(row.fastestLogged.durationS)}
                          </span>
                          <div className="text-[11px] text-slate-500">
                            {(row.fastestLogged.distanceM / 1000).toFixed(2)} km ·{' '}
                            {row.fastestLogged.session.session_date}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">None logged</span>
                      )}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2 text-slate-600">
                      <span>Projected Equivalent</span>
                      <ProvenanceBadge origin={row.estimatedTimeS ? 'ESTIMATED' : 'MISSING'} />
                    </dt>
                    <dd className="text-right font-mono tabular-nums">
                      {row.estimatedTimeS ? (
                        <div>
                          <span className="font-semibold text-slate-700">
                            {formatDurationSeconds(row.estimatedTimeS)}
                          </span>
                          <div className="text-[11px] text-slate-400">
                            {formatPace(row.targetMeters, row.estimatedTimeS)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Needs ≥1.5 km run</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {row.fastestLogged && !row.confirmedPb && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      openEditor(row.distance, {
                        durationS: row.fastestLogged!.durationS,
                        date: row.fastestLogged!.session.session_date,
                        sessionId: row.fastestLogged!.session.id,
                        notes: `Promoted from logged ${(row.fastestLogged!.distanceM / 1000).toFixed(
                          2
                        )} km run.`,
                      })
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Promote fastest logged run to Confirmed PB</span>
                  </button>
                </div>
              )}

              {row.estimatedBasis && (
                <p className="mt-2 text-[11px] text-slate-400">{row.estimatedBasis}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Confirm / Edit PB Modal */}
      {editingDist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-semibold text-slate-900">
                Confirm {editingDist} Personal Best
              </h2>
              <button
                type="button"
                onClick={() => setEditingDist(null)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePb} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Official / Confirmed Time (mm:ss or h:mm:ss) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="28:10"
                  value={durationStr}
                  onChange={(e) => setDurationStr(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Date Achieved *</label>
                <input
                  type="date"
                  required
                  value={achievedDate}
                  onChange={(e) => setAchievedDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Notes</label>
                <input
                  type="text"
                  placeholder="Race, track time trial, GPS watch..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <Button type="button" variant="secondary" onClick={() => setEditingDist(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Confirmed PB'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}