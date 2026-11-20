import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Edit3, Sparkles, Trash2 } from 'lucide-react';
import { Button, Card, CategoryBadge, PageHeader, ProvenanceBadge } from '@/design-system';
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
    if (!user || !id) return;
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
    return <div className="py-12 text-center text-sm text-slate-500">Loading session...</div>;
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <Link
          to="/runs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-run hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Running Log</span>
        </Link>
        <Card className="p-6 text-sm text-red-700">{error ?? 'Session not found.'}</Card>
      </div>
    );
  }

  const maxPace = Math.max(...splitAnalysis.splitsWithPace.map((s) => s.paceSecPerKm), 1);
  const minPace = Math.min(...splitAnalysis.splitsWithPace.map((s) => s.paceSecPerKm), maxPace);

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/runs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Running Log</span>
        </Link>
      </div>

      <PageHeader
        title={`${formatDistanceKm(session.distance_m)} · ${WORKOUT_TYPE_LABELS[session.workout_type]}`}
        subtitle={`Recorded on ${session.session_date}${
          session.start_time ? ` at ${session.start_time.slice(0, 5)}` : ''
        } · ${session.is_indoor ? 'Indoor / Treadmill' : 'Outdoor'}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Edit3 className="h-4 w-4" />
              <span>Edit</span>
            </Button>
            <Button variant="secondary" onClick={() => void handleDelete()}>
              <Trash2 className="h-4 w-4 text-red-600" />
              <span className="text-red-700">Delete</span>
            </Button>
          </div>
        }
      />

      {session.is_historical_record && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <strong>Historical Benchmark Record:</strong> Preserved from your reported August 2026
          history. Unrecorded splits and telemetry remain intentionally missing.
        </div>
      )}

      {session.pain_present && (
        <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Pain / Discomfort Reported:</strong>{' '}
            {session.pain_details ?? 'Present (no additional details entered).'}
          </div>
        </div>
      )}

      {/* Primary Summary Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-slate-500">Distance</span>
            <ProvenanceBadge origin="RECORDED" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatDistanceKm(session.distance_m)}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-slate-500">Duration</span>
            <ProvenanceBadge origin="RECORDED" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatDurationSeconds(session.duration_s)}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-slate-500">Average Pace</span>
            <ProvenanceBadge origin="CALCULATED" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-brand-run tabular-nums">
            {formatPace(session.distance_m, session.duration_s)}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-slate-500">Effort (RPE)</span>
            <ProvenanceBadge origin={session.rpe ? 'RECORDED' : 'MISSING'} />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {session.rpe ? `${session.rpe} / 10` : 'Missing'}
          </div>
        </Card>
      </div>

      {/* Kilometer Splits Visualization */}
      <Card className="mt-6 p-6">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Kilometer Split Analysis</h2>
            <p className="mt-0.5 text-sm text-slate-600">{splitAnalysis.patternSummary}</p>
          </div>
          <ProvenanceBadge
            origin={splitAnalysis.splitsWithPace.length > 0 ? 'RECORDED' : 'MISSING'}
          />
        </div>

        {splitAnalysis.splitsWithPace.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No splits were recorded for this session. Splits are never estimated or fabricated.
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Fastest Split</div>
                <div className="mt-1 font-mono text-sm font-semibold text-emerald-700">
                  {splitAnalysis.fastestSplit
                    ? `Km ${splitAnalysis.fastestSplit.split_index} · ${splitAnalysis.fastestSplit.formattedPace}`
                    : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Slowest Split</div>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                  {splitAnalysis.slowestSplit
                    ? `Km ${splitAnalysis.slowestSplit.split_index} · ${splitAnalysis.slowestSplit.formattedPace}`
                    : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Pace Spread</div>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                  {splitAnalysis.paceSpreadSec !== null
                    ? `${splitAnalysis.paceSpreadSec}s /km`
                    : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500">Consistency (CV)</div>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                  {splitAnalysis.coefficientOfVariationPct !== null
                    ? `${splitAnalysis.coefficientOfVariationPct}%`
                    : '—'}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              {splitAnalysis.splitsWithPace.map((s) => {
                // Faster splits get a slightly longer bar for visual clarity
                const range = Math.max(maxPace - minPace, 15);
                const relativeSpeed = 1 - (s.paceSecPerKm - minPace) / range;
                const widthPct = Math.round(45 + relativeSpeed * 55);
                const isFastest = splitAnalysis.fastestSplit?.id === s.id;

                return (
                  <div key={s.id} className="grid grid-cols-12 items-center gap-3 text-xs">
                    <div className="col-span-3 font-mono text-slate-700 sm:col-span-2">
                      Km {s.split_index}{' '}
                      {s.is_partial && (
                        <span className="text-slate-400">
                          ({(s.distance_m / 1000).toFixed(2)}k)
                        </span>
                      )}
                    </div>
                    <div className="col-span-5 sm:col-span-7">
                      <div className="h-6 w-full rounded bg-slate-100 p-0.5">
                        <div
                          style={{ width: `${widthPct}%` }}
                          className={`h-full rounded ${
                            isFastest ? 'bg-emerald-600' : 'bg-brand-run'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="col-span-4 text-right font-mono font-medium text-slate-900 tabular-nums sm:col-span-3">
                      {s.formattedPace}
                      {s.avg_hr_bpm ? (
                        <span className="ml-2 text-slate-400">{s.avg_hr_bpm}bpm</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Physiological Telemetry & Notes */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Physiological &amp; Readiness</h2>
            <CategoryBadge category="RUNNING" />
          </div>
          <dl className="mt-4 divide-y divide-slate-100 text-sm">
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-600">Average Heart Rate</dt>
              <dd className="font-mono text-slate-900">
                {session.avg_hr_bpm ? `${session.avg_hr_bpm} bpm` : 'Missing'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-600">Max Heart Rate</dt>
              <dd className="font-mono text-slate-900">
                {session.max_hr_bpm ? `${session.max_hr_bpm} bpm` : 'Missing'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-600">Cadence</dt>
              <dd className="font-mono text-slate-900">
                {session.cadence_spm ? `${session.cadence_spm} spm` : 'Missing'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-600">Elevation Gain</dt>
              <dd className="font-mono text-slate-900">
                {session.elevation_gain_m !== null ? `${session.elevation_gain_m} m` : 'Missing'}
              </dd>
            </div>
            <div className="flex justify-between py-2.5">
              <dt className="text-slate-600">Energy / Muscle Soreness</dt>
              <dd className="font-mono text-slate-900">
                {session.energy_level ? `Energy ${session.energy_level}/5` : 'Energy —'} ·{' '}
                {session.muscle_soreness ? `Soreness ${session.muscle_soreness}/5` : 'Soreness —'}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="flex flex-col justify-between p-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Conditions &amp; Notes</h2>
            <p className="mt-3 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Conditions:</span>{' '}
              {session.conditions ?? 'Not recorded'}
            </p>
            <p className="mt-3 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Notes:</span>{' '}
              {session.notes ?? 'No session notes recorded.'}
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <Sparkles className="h-4 w-4 text-brand-run" />
                <span>AI Session Analysis (Stage 7)</span>
              </div>
              <Button variant="secondary" disabled className="min-h-[34px] px-3 py-1 text-xs">
                Analyze Run
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Gemini single-run grounded analysis activates in Stage 7 once the server-side AI
              pipeline is connected.
            </p>
          </div>
        </Card>
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