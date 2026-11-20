import { X } from 'lucide-react';
import { Button, Card, ProvenanceBadge } from '@/design-system';
import { formatDurationSeconds } from '@/lib/datetime';
import {
  analyzeSplits,
  compareTwoRuns,
  formatDistanceKm,
  formatPace,
} from '@/modules/running/calculations';
import { WORKOUT_TYPE_LABELS, type RunningSession } from '@/types/domain';

export function RunComparisonModal({
  runA,
  runB,
  onClose,
}: {
  runA: RunningSession;
  runB: RunningSession;
  onClose: () => void;
}) {
  // Order chronologically: older = Run 1, newer = Run 2
  const [first, second] =
    runA.session_date <= runB.session_date ? [runA, runB] : [runB, runA];

  const comparison = compareTwoRuns(first, second);
  const splitsFirst = analyzeSplits(first.splits ?? []);
  const splitsSecond = analyzeSplits(second.splits ?? []);

  const formatSignedSeconds = (sec: number) => {
    const abs = Math.abs(Math.round(sec));
    const sign = sec > 0 ? '+' : sec < 0 ? '-' : '';
    return `${sign}${formatDurationSeconds(abs)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 overflow-y-auto">
      <Card className="my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Run Comparison</h2>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-xs font-medium ${
                  comparison.comparisonType === 'DIRECT'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {comparison.comparisonType} COMPARISON
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{comparison.basisExplanation}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2.5 pr-4">Metric</th>
                <th className="py-2.5 px-4">Earlier ({first.session_date})</th>
                <th className="py-2.5 px-4">Later ({second.session_date})</th>
                <th className="py-2.5 pl-4">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 pr-4 font-medium text-slate-700">Workout Type</td>
                <td className="py-3 px-4">{WORKOUT_TYPE_LABELS[first.workout_type]}</td>
                <td className="py-3 px-4">{WORKOUT_TYPE_LABELS[second.workout_type]}</td>
                <td className="py-3 pl-4 text-xs text-slate-500">
                  {first.workout_type === second.workout_type ? 'Same' : 'Different'}
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-slate-700">Distance</td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  {formatDistanceKm(first.distance_m)}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  {formatDistanceKm(second.distance_m)}
                </td>
                <td className="py-3 pl-4 font-mono text-xs tabular-nums">
                  {comparison.distanceDiffM >= 0 ? '+' : ''}
                  {(comparison.distanceDiffM / 1000).toFixed(2)} km
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-slate-700">Duration</td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  {formatDurationSeconds(first.duration_s)}
                </td>
                <td className="py-3 px-4 font-mono tabular-nums">
                  {formatDurationSeconds(second.duration_s)}
                </td>
                <td className="py-3 pl-4 font-mono text-xs tabular-nums">
                  {formatSignedSeconds(comparison.durationDiffS)}
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-slate-700">
                  Average Pace <ProvenanceBadge origin="CALCULATED" />
                </td>
                <td className="py-3 px-4 font-mono font-semibold tabular-nums">
                  {formatPace(first.distance_m, first.duration_s)}
                </td>
                <td className="py-3 px-4 font-mono font-semibold tabular-nums">
                  {formatPace(second.distance_m, second.duration_s)}
                </td>
                <td className="py-3 pl-4 font-mono text-xs tabular-nums">
                  {comparison.paceDiffSecPerKm !== null
                    ? `${formatSignedSeconds(comparison.paceDiffSecPerKm)} /km`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-slate-700">Effort (RPE)</td>
                <td className="py-3 px-4 font-mono">{first.rpe ? `${first.rpe}/10` : 'Missing'}</td>
                <td className="py-3 px-4 font-mono">{second.rpe ? `${second.rpe}/10` : 'Missing'}</td>
                <td className="py-3 pl-4 text-xs text-slate-500">—</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-slate-700">Avg Heart Rate</td>
                <td className="py-3 px-4 font-mono">
                  {first.avg_hr_bpm ? `${first.avg_hr_bpm} bpm` : 'Missing'}
                </td>
                <td className="py-3 px-4 font-mono">
                  {second.avg_hr_bpm ? `${second.avg_hr_bpm} bpm` : 'Missing'}
                </td>
                <td className="py-3 pl-4 text-xs text-slate-500">—</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-slate-700">Splits Pattern</td>
                <td className="py-3 px-4 text-xs text-slate-600">{splitsFirst.patternSummary}</td>
                <td className="py-3 px-4 text-xs text-slate-600">{splitsSecond.patternSummary}</td>
                <td className="py-3 pl-4 text-xs text-slate-500">—</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium text-slate-700">Conditions</td>
                <td className="py-3 px-4 text-xs text-slate-600">
                  {first.conditions ?? (first.is_indoor ? 'Indoor' : 'Not recorded')}
                </td>
                <td className="py-3 px-4 text-xs text-slate-600">
                  {second.conditions ?? (second.is_indoor ? 'Indoor' : 'Not recorded')}
                </td>
                <td className="py-3 pl-4 text-xs text-slate-500">—</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}