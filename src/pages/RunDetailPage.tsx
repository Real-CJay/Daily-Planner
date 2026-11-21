import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Edit3, Sparkles, Trash2 } from 'lucide-react';
import { Button, CategoryBadge, CategoryMark, ProvenanceBadge } from '@/design-system';
import { formatDurationSeconds } from '@/lib/datetime';
import { useAuth } from '@/modules/auth/AuthContext';
import {
  analyzeSplits,
  formatDistanceKm,
  formatPace,
} from '@/modules/running/calculations';
import {
  deleteRunningSession,
  getRunningSessionById,
  updateRunningSession,
} from '@/modules/running/repository';
import { RunFormModal } from '@/modules/running/RunFormModal';
import { WORKOUT_TYPE_LABELS, type RunningSession } from '@/types/domain';

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [session, setSession] = useState<RunningSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!user || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getRunningSessionById(user.id, id)
      .then((res) => {
        setSession(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load running session.');
        setLoading(false);
      });
  }, [user, id]);

  const splitAnalysis = useMemo(() => analyzeSplits(session?.splits ?? []), [session]);

  async function handleDelete() {
    if (!user || !session) return;
    if (!window.confirm('Delete this recorded run? All dependent statistics will recalculate.')) {
      return;
    }
    await deleteRunningSession(user.id, session.id);
    navigate('/runs');
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-[var(--muted)]">Loading session...</div>;
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <Link
          to="/runs"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--blue)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Running Log</span>
        </Link>
        <div className="rounded-2xl border border-red-300/60 bg-red-500/10 p-6 text-sm text-red-700 dark:text-red-300">
          {error ?? 'Session not found.'}
        </div>
      </div>
    );
  }

  const maxPace = Math.max(...splitAnalysis.splitsWithPace.map((s) => s.paceSecPerKm), 1);
  const minPace = Math.min(...splitAnalysis.splitsWithPace.map((s) => s.paceSecPerKm), maxPace);

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/runs"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to all runs</span>
        </Link>
      </div>

      {/* Main Stride Run Detail Card */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3.5">
            <CategoryMark category="RUNNING" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  RECORDED SESSION
                </span>
                <ProvenanceBadge origin={session.data_origin} />
              </div>
              <h1 className="mt-1.5 text-[24px] font-bold leading-tight tracking-[-0.04em] text-[var(--ink)] sm:text-[28px]">
                {formatDistanceKm(session.distance_m)} · {WORKOUT_TYPE_LABELS[session.workout_type]}
              </h1>
              <p className="mt-1 font-mono text-[12px] text-[var(--muted)]">
                {session.session_date}
                {session.start_time ? ` · ${session.start_time.slice(0, 5)}` : ''} ·{' '}
                {session.is_indoor ? 'Indoor / Treadmill' : 'Outdoor'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setEditing(true)}
              className="!min-h-[36px] !px-3.5 !py-1.5 !text-[12px]"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              aria-label="Delete run"
              className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>

        {session.is_historical_record && (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
            <strong>Historical Benchmark Record:</strong> Preserved from your reported August 2026
            history. Unrecorded splits and telemetry remain intentionally missing.
          </div>
        )}

        {session.pain_present && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Pain / Discomfort Reported:</strong>{' '}
              {session.pain_details ?? 'Present (no additional details entered).'}
            </div>
          </div>
        )}

        {/* Stride 4-Column Metric Bar */}
        <div className="mt-5 grid grid-cols-2 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--surface-2)] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--muted)]">Distance</span>
              <ProvenanceBadge origin="RECORDED" />
            </div>
            <strong className="mt-2 block font-mono text-[24px] font-bold tracking-[-0.04em] text-[var(--ink)] tabular-nums">
              {formatDistanceKm(session.distance_m)}
            </strong>
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--muted)]">Duration</span>
              <ProvenanceBadge origin="RECORDED" />
            </div>
            <strong className="mt-2 block font-mono text-[24px] font-bold tracking-[-0.04em] text-[var(--ink)] tabular-nums">
              {formatDurationSeconds(session.duration_s)}
            </strong>
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--muted)]">Average pace</span>
              <ProvenanceBadge origin="CALCULATED" />
            </div>
            <strong className="mt-2 block font-mono text-[24px] font-bold tracking-[-0.04em] text-[var(--run)] tabular-nums">
              {formatPace(session.distance_m, session.duration_s)}
            </strong>
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--muted)]">Effort (RPE)</span>
              <ProvenanceBadge origin={session.rpe ? 'RECORDED' : 'MISSING'} />
            </div>
            <strong className="mt-2 block font-mono text-[24px] font-bold tracking-[-0.04em] text-[var(--ink)] tabular-nums">
              {session.rpe ? `${session.rpe} / 10` : '—'}
            </strong>
          </div>
        </div>
      </section>

      {/* Kilometer Split Analysis */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              PACING BREAKDOWN
            </div>
            <h2 className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-[var(--ink)]">
              Kilometer Split Analysis
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
              {splitAnalysis.patternSummary}
            </p>
          </div>
          <ProvenanceBadge
            origin={splitAnalysis.splitsWithPace.length > 0 ? 'RECORDED' : 'MISSING'}
          />
        </div>

        {splitAnalysis.splitsWithPace.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--bg)] px-4 py-7 text-center text-xs text-[var(--muted)]">
            No splits were recorded for this session. Splits are never estimated or fabricated.
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
                <div className="text-[11px] text-[var(--muted)]">Fastest Split</div>
                <div className="mt-1 font-mono text-[13px] font-bold text-[#2D9D87]">
                  {splitAnalysis.fastestSplit
                    ? `Km ${splitAnalysis.fastestSplit.split_index} · ${splitAnalysis.fastestSplit.formattedPace}`
                    : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
                <div className="text-[11px] text-[var(--muted)]">Slowest Split</div>
                <div className="mt-1 font-mono text-[13px] font-bold text-[var(--ink)]">
                  {splitAnalysis.slowestSplit
                    ? `Km ${splitAnalysis.slowestSplit.split_index} · ${splitAnalysis.slowestSplit.formattedPace}`
                    : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
                <div className="text-[11px] text-[var(--muted)]">Pace Spread</div>
                <div className="mt-1 font-mono text-[13px] font-bold text-[var(--ink)]">
                  {splitAnalysis.paceSpreadSec !== null
                    ? `${splitAnalysis.paceSpreadSec}s /km`
                    : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
                <div className="text-[11px] text-[var(--muted)]">Consistency (CV)</div>
                <div className="mt-1 font-mono text-[13px] font-bold text-[var(--ink)]">
                  {splitAnalysis.coefficientOfVariationPct !== null
                    ? `${splitAnalysis.coefficientOfVariationPct}%`
                    : '—'}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {splitAnalysis.splitsWithPace.map((s) => {
                const range = Math.max(maxPace - minPace, 15);
                const relativeSpeed = 1 - (s.paceSecPerKm - minPace) / range;
                const widthPct = Math.round(45 + relativeSpeed * 55);
                const isFastest = splitAnalysis.fastestSplit?.id === s.id;

                return (
                  <div key={s.id} className="grid grid-cols-12 items-center gap-3 text-xs">
                    <div className="col-span-3 font-mono text-[var(--muted)] sm:col-span-2">
                      Km {s.split_index}{' '}
                      {s.is_partial && (
                        <span className="text-[var(--faint)]">
                          ({(s.distance_m / 1000).toFixed(2)}k)
                        </span>
                      )}
                    </div>
                    <div className="col-span-5 sm:col-span-7">
                      <div className="h-5 w-full rounded-md bg-[var(--surface-2)] p-0.5">
                        <div
                          style={{ width: `${widthPct}%` }}
                          className={`h-full rounded-[4px] ${
                            isFastest ? 'bg-[#4F846E]' : 'bg-[var(--run)]'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="col-span-4 text-right font-mono font-semibold text-[var(--ink)] tabular-nums sm:col-span-3">
                      {s.formattedPace}
                      {s.avg_hr_bpm ? (
                        <span className="ml-2 text-[var(--faint)]">{s.avg_hr_bpm}bpm</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Bottom 2-Column Telemetry & Notes */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold tracking-[-0.03em] text-[var(--ink)]">
              Physiological &amp; Readiness
            </h2>
            <CategoryBadge category="RUNNING" />
          </div>
          <dl className="mt-4 divide-y divide-[var(--line)] text-[13px]">
            <div className="flex justify-between py-2.5">
              <dt className="text-[var(--muted)]">Average Heart Rate</dt>
              <dd className="font-mono font-semibold text-[var(--ink)]">
                {session.avg_hr_bpm ? `${session.avg_hr_bpm} bpm` : 'Missing'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-[var(--muted)]">Max Heart Rate</dt>
              <dd className="font-mono font-semibold text-[var(--ink)]">
                {session.max_hr_bpm ? `${session.max_hr_bpm} bpm` : 'Missing'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-[var(--muted)]">Cadence</dt>
              <dd className="font-mono font-semibold text-[var(--ink)]">
                {session.cadence_spm ? `${session.cadence_spm} spm` : 'Missing'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-[var(--muted)]">Elevation Gain</dt>
              <dd className="font-mono font-semibold text-[var(--ink)]">
                {session.elevation_gain_m !== null ? `${session.elevation_gain_m} m` : 'Missing'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-[var(--muted)]">Energy / Muscle Soreness</dt>
              <dd className="font-mono font-semibold text-[var(--ink)]">
                {session.energy_level ? `Energy ${session.energy_level}/5` : 'Energy —'} ·{' '}
                {session.muscle_soreness ? `Soreness ${session.muscle_soreness}/5` : 'Soreness —'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="flex flex-col justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          <div>
            <h2 className="text-[16px] font-bold tracking-[-0.03em] text-[var(--ink)]">
              Conditions &amp; Notes
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              <span className="font-semibold text-[var(--ink)]">Conditions:</span>{' '}
              {session.conditions ?? 'Not recorded'}
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
              <span className="font-semibold text-[var(--ink)]">Notes:</span>{' '}
              {session.notes ?? 'No session notes recorded.'}
            </p>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--blue-lite)]/60 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--ink)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--blue)]" />
                <span>Discuss this run with Coach</span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
                Your recorded splits, pace, and readiness are already synced.
              </p>
            </div>
            <Link
              to="/coach"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] bg-[var(--blue)] px-3 text-[11.5px] font-bold text-white transition-opacity hover:opacity-90 dark:text-[#121315]"
            >
              <span>Open Coach</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </div>

      {editing && user && (
        <RunFormModal
          initialSession={session}
          timezone={profile?.timezone ?? 'Asia/Colombo'}
          onClose={() => setEditing(false)}
          onSave={async (draft) => {
            const updated = await updateRunningSession(user.id, session.id, draft);
            setSession(updated);
          }}
        />
      )}
    </div>
  );
}
