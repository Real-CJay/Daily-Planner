import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Info, Trash2, X } from 'lucide-react';
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

  useEffect(() => {
    if (!editingDist) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingDist(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingDist]);

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
      setNotice(`Confirmed ${editingDist} personal best saved.`);
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
    setNotice(`Removed confirmed ${pb.distance_label} personal best.`);
    await loadData();
  }

  return (
    <div className="space-y-7 pb-6">
      {/* Studio Header (Common Default Stride Blue) */}
      <header>
        <h1 className="text-[34px] font-bold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-[42px]">
          Every second <em className="not-italic text-[var(--blue)]">counts.</em>
        </h1>
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

      {/* Top 2 Studio Feature Cards */}
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section
          className="flex min-h-[205px] flex-col rounded-[15px] border border-[var(--line)] p-6"
          style={{ background: 'color-mix(in srgb, var(--blue) 4%, var(--surface))' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--faint)]">
            FIRST MAJOR GOAL
          </span>
          <div className="mt-4 text-[40px] font-bold leading-tight tracking-[-0.06em] text-[var(--ink)] sm:text-[46px]">
            5K <span className="text-[var(--blue)]">under {formatDurationSeconds(sub20GoalS)}</span>
          </div>
          <p className="mt-1.5 text-[12.5px] text-[var(--muted)]">
            Long-term goal: {formatDurationSeconds(longTermGoalS)} ({formatPace(5000, longTermGoalS)}).
          </p>
          <div className="mt-auto border-t border-[var(--line)] pt-4">
            <span className="inline-flex items-center gap-2 text-[11.5px] text-[var(--muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--blue)]" />
              {best5kS && best5kS > sub20GoalS
                ? `${formatDurationSeconds(best5kS - sub20GoalS)} to go from current best`
                : 'Targets, not recorded results'}
            </span>
          </div>
        </section>

        <section className="flex min-h-[205px] flex-col rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--faint)]">
            BEST RECORDED 5 KM
          </span>
          <div className="mt-5 font-mono text-[50px] font-bold leading-none tracking-[-0.07em] text-[var(--ink)] tabular-nums">
            {best5kS ? formatDurationSeconds(best5kS) : '—'}
          </div>
          <p className="mt-2.5 text-[12.5px] text-[var(--muted)]">
            {best5kS
              ? `${formatPace(5000, best5kS)} · ${
                  fiveKRow?.confirmedPb?.achieved_date ??
                  fiveKRow?.fastestLogged?.session.session_date ??
                  ''
                }`
              : 'No exact 5 km result logged yet'}
          </p>
          <div className="mt-auto border-t border-[var(--line)] pt-4 text-[11.5px] text-[var(--muted)]">
            A logged best is never promoted to a lifetime PB without your confirmation.
          </div>
        </section>
      </div>

      {/* Studio Records Table (1K, 3K, 5K, 10K) */}
      <section className="rounded-[15px] border border-[var(--line)] bg-[var(--surface)] p-6">
        <div>
          <h2 className="text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
            Your distances
          </h2>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            Confirmed lifetime PBs, fastest logged sessions, and Riegel estimates stay separate.
          </p>
        </div>

        {loading ? (
          <div className="mt-6 border-t border-[var(--line)] py-10 text-center text-sm text-[var(--muted)]">
            Loading benchmarks...
          </div>
        ) : (
          <div className="mt-6 border-t border-[var(--line)]">
            <div className="hidden grid-cols-[90px_1.2fr_1.1fr_1fr_140px] items-center gap-4 border-b border-[var(--line)] py-3 text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--faint)] md:grid">
              <span>Distance</span>
              <span>Confirmed PB</span>
              <span>Fastest logged</span>
              <span>Projected eq.</span>
              <span className="text-right">Action</span>
            </div>

            <div className="divide-y divide-[var(--line)]">
              {matrix.map((row) => (
                <div
                  key={row.distance}
                  className="grid grid-cols-2 items-center gap-3 py-4 text-[13px] md:grid-cols-[90px_1.2fr_1.1fr_1fr_140px] md:gap-4"
                >
                  <strong className="font-mono text-[15px] font-bold text-[var(--ink)]">
                    {row.distance}
                  </strong>

                  <div>
                    <span className="block text-[10px] uppercase text-[var(--faint)] md:hidden">
                      Confirmed PB
                    </span>
                    {row.confirmedPb ? (
                      <div>
                        <span className="font-mono font-bold text-[var(--blue)] tabular-nums">
                          {formatDurationSeconds(row.confirmedPb.duration_s)}
                        </span>
                        <span className="ml-2 font-mono text-[11px] text-[var(--muted)]">
                          {row.confirmedPb.achieved_date}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">Not confirmed</span>
                    )}
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase text-[var(--faint)] md:hidden">
                      Fastest logged
                    </span>
                    {row.fastestLogged ? (
                      <div>
                        <span className="font-mono font-semibold text-[var(--ink)] tabular-nums">
                          {formatDurationSeconds(row.fastestLogged.durationS)}
                        </span>
                        <span className="ml-2 font-mono text-[11px] text-[var(--muted)]">
                          {row.fastestLogged.session.session_date}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase text-[var(--faint)] md:hidden">
                      Projected
                    </span>
                    <span className="font-mono text-[var(--muted)] tabular-nums">
                      {row.estimatedTimeS ? formatDurationSeconds(row.estimatedTimeS) : '—'}
                    </span>
                  </div>

                  <div className="col-span-2 flex items-center justify-start gap-1.5 md:col-span-1 md:justify-end">
                    <button
                      type="button"
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
                            : row.fastestLogged
                              ? {
                                  durationS: row.fastestLogged.durationS,
                                  date: row.fastestLogged.session.session_date,
                                  sessionId: row.fastestLogged.session.id,
                                  notes: `Promoted from logged ${(
                                    row.fastestLogged.distanceM / 1000
                                  ).toFixed(2)} km run.`,
                                }
                              : undefined
                        )
                      }
                      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--blue)]/35 bg-[var(--blue-lite)] px-3 text-[11.5px] font-bold text-[var(--blue-ink)] transition-opacity hover:opacity-90"
                    >
                      <span>{row.confirmedPb ? 'Edit PB' : 'Confirm PB'}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    {row.confirmedPb && (
                      <button
                        type="button"
                        onClick={() => void handleDeletePb(row.confirmedPb!)}
                        aria-label={`Delete ${row.distance} PB`}
                        className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line)] text-[var(--muted)] hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="flex items-start gap-2.5 px-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Projected equivalents use the Riegel formula (1.06) from your recent recorded runs and are
          never treated as confirmed records.
        </p>
      </div>

      {/* Confirm / Edit PB Modal */}
      {editingDist && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingDist(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Confirm ${editingDist} Personal Best`}
            className="w-full max-w-[460px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3.5">
              <h2 className="text-[19px] font-bold tracking-[-0.035em] text-[var(--ink)]">
                Confirm {editingDist} personal best
              </h2>
              <button
                type="button"
                onClick={() => setEditingDist(null)}
                aria-label="Close modal"
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSavePb(e)} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
                  Confirmed time (mm:ss or h:mm:ss) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="24:30"
                  value={durationStr}
                  onChange={(e) => setDurationStr(e.target.value)}
                  className="mt-1 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 font-mono text-[13px] text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
                  Date achieved *
                </label>
                <input
                  type="date"
                  required
                  value={achievedDate}
                  onChange={(e) => setAchievedDate(e.target.value)}
                  className="mt-1 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 font-mono text-[13px] text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-[var(--muted)]">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Race, track time trial, GPS watch..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--ink)] focus:border-[var(--blue)] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setEditingDist(null)}
                  className="h-9 rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[12.5px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-[var(--blue-btn-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save PB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
