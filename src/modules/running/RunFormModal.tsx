import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button, Card, ProvenanceBadge } from '@/design-system';
import { formatDurationSeconds, getLocalDateString } from '@/lib/datetime';
import { formatPace, parseDurationToSeconds } from './calculations';
import {
  WORKOUT_TYPE_LABELS,
  type RunningSession,
  type RunningSessionDraft,
  type WorkoutType,
} from '@/types/domain';

interface SplitRowState {
  distanceKm: string;
  durationStr: string;
  isPartial: boolean;
  avgHr: string;
}

export function RunFormModal({
  initialSession,
  timezone,
  onClose,
  onSave,
}: {
  initialSession?: RunningSession | null;
  timezone: string;
  onClose: () => void;
  onSave: (draft: RunningSessionDraft) => Promise<void>;
}) {
  const [sessionDate, setSessionDate] = useState(
    initialSession?.session_date ?? getLocalDateString(new Date(), timezone)
  );
  const [startTime, setStartTime] = useState(initialSession?.start_time?.slice(0, 5) ?? '');
  const [distanceKm, setDistanceKm] = useState(
    initialSession ? (initialSession.distance_m / 1000).toFixed(2) : ''
  );
  const [durationStr, setDurationStr] = useState(
    initialSession ? formatDurationSeconds(initialSession.duration_s) : ''
  );
  const [workoutType, setWorkoutType] = useState<WorkoutType>(
    initialSession?.workout_type ?? 'EASY'
  );
  const [isIndoor, setIsIndoor] = useState(initialSession?.is_indoor ?? false);

  // Optional physiological & subjective fields
  const [avgHr, setAvgHr] = useState(initialSession?.avg_hr_bpm?.toString() ?? '');
  const [maxHr, setMaxHr] = useState(initialSession?.max_hr_bpm?.toString() ?? '');
  const [cadence, setCadence] = useState(initialSession?.cadence_spm?.toString() ?? '');
  const [elevation, setElevation] = useState(initialSession?.elevation_gain_m?.toString() ?? '');
  const [rpe, setRpe] = useState(initialSession?.rpe?.toString() ?? '');
  const [energy, setEnergy] = useState(initialSession?.energy_level?.toString() ?? '');
  const [soreness, setSoreness] = useState(initialSession?.muscle_soreness?.toString() ?? '');
  const [painPresent, setPainPresent] = useState(initialSession?.pain_present ?? false);
  const [painDetails, setPainDetails] = useState(initialSession?.pain_details ?? '');
  const [conditions, setConditions] = useState(initialSession?.conditions ?? '');
  const [notes, setNotes] = useState(initialSession?.notes ?? '');

  const [splits, setSplits] = useState<SplitRowState[]>(() =>
    (initialSession?.splits ?? []).map((s) => ({
      distanceKm: (s.distance_m / 1000).toString(),
      durationStr: formatDurationSeconds(s.duration_s),
      isPartial: s.is_partial,
      avgHr: s.avg_hr_bpm?.toString() ?? '',
    }))
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const livePace = useMemo(() => {
    const meters = Math.round(Number(distanceKm) * 1000);
    const seconds = parseDurationToSeconds(durationStr);
    if (!meters || !seconds) return 'Enter distance & duration';
    return formatPace(meters, seconds);
  }, [distanceKm, durationStr]);

  function addSplitRow() {
    setSplits((prev) => [
      ...prev,
      { distanceKm: '1.00', durationStr: '', isPartial: false, avgHr: '' },
    ]);
  }

  function removeSplitRow(index: number) {
    setSplits((prev) => prev.filter((_, idx) => idx !== index));
  }

  function updateSplitRow(index: number, patch: Partial<SplitRowState>) {
    setSplits((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const distanceM = Math.round(Number(distanceKm) * 1000);
    const durationS = parseDurationToSeconds(durationStr);

    if (!Number.isFinite(distanceM) || distanceM < 100) {
      setError('Enter a valid distance (at least 0.10 km).');
      return;
    }
    if (!durationS) {
      setError('Enter duration in mm:ss or h:mm:ss format (for example, 28:10 or 1:02:15).');
      return;
    }

    const parsedSplits = [];
    for (let i = 0; i < splits.length; i++) {
      const row = splits[i];
      const splitDistM = Math.round(Number(row.distanceKm) * 1000);
      const splitDurS = parseDurationToSeconds(row.durationStr);
      if (!splitDistM || !splitDurS) {
        setError(`Split #${i + 1}: enter valid distance (km) and duration (mm:ss).`);
        return;
      }
      parsedSplits.push({
        split_index: i + 1,
        distance_m: splitDistM,
        duration_s: splitDurS,
        is_partial: row.isPartial || splitDistM !== 1000,
        avg_hr_bpm: row.avgHr.trim() ? Number(row.avgHr) : null,
      });
    }

    const toNullableInt = (val: string) => (val.trim() ? Number(val) : null);

    const draft: RunningSessionDraft = {
      session_date: sessionDate,
      start_time: startTime.trim() ? startTime.trim() : null,
      distance_m: distanceM,
      duration_s: durationS,
      workout_type: workoutType,
      is_indoor: isIndoor || workoutType === 'TREADMILL',
      avg_hr_bpm: toNullableInt(avgHr),
      max_hr_bpm: toNullableInt(maxHr),
      cadence_spm: toNullableInt(cadence),
      elevation_gain_m: toNullableInt(elevation),
      rpe: toNullableInt(rpe),
      energy_level: toNullableInt(energy),
      muscle_soreness: toNullableInt(soreness),
      pain_present: painPresent,
      pain_details: painPresent && painDetails.trim() ? painDetails.trim() : null,
      conditions: conditions.trim() ? conditions.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
      entry_method: initialSession?.entry_method ?? 'MANUAL',
      is_historical_record: initialSession?.is_historical_record ?? false,
      splits: parsedSplits,
    };

    try {
      setSubmitting(true);
      await onSave(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save run.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 overflow-y-auto">
      <Card className="my-auto max-h-[92vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {initialSession ? 'Edit Running Session' : 'Log Running Session'}
            </h2>
            <p className="text-xs text-slate-500">
              Leave unmeasured fields blank — never estimate missing splits or heart rate.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-6">
          {/* Primary Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">Date *</label>
              <input
                type="date"
                required
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Start Time (Optional)
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Distance (km) *</label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                required
                placeholder="5.00"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Duration (mm:ss) *
              </label>
              <input
                type="text"
                required
                placeholder="28:10"
                value={durationStr}
                onChange={(e) => setDurationStr(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </div>
          </div>

          {/* Live Calculated Pace & Workout Classification */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Average Pace</span>
                <ProvenanceBadge origin="CALCULATED" />
              </div>
              <div className="mt-1 font-mono text-base font-semibold text-slate-900 tabular-nums">
                {livePace}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Workout Type</label>
              <select
                value={workoutType}
                onChange={(e) => setWorkoutType(e.target.value as WorkoutType)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {Object.entries(WORKOUT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isIndoor || workoutType === 'TREADMILL'}
                  onChange={(e) => setIsIndoor(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-run"
                />
                <span>Indoor / Treadmill session</span>
              </label>
            </div>
          </div>

          {/* Effort, Readiness & Pain */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Effort &amp; Physical Feedback (Optional)
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">RPE (1–10)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  placeholder="—"
                  value={rpe}
                  onChange={(e) => setRpe(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Energy Level (1–5)
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  placeholder="—"
                  value={energy}
                  onChange={(e) => setEnergy(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Muscle Soreness (1–5)
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  placeholder="—"
                  value={soreness}
                  onChange={(e) => setSoreness(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={painPresent}
                    onChange={(e) => setPainPresent(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-red-600"
                  />
                  <span>Pain or discomfort</span>
                </label>
              </div>
            </div>

            {painPresent && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-red-700">
                  Pain / Discomfort Location &amp; Notes
                </label>
                <input
                  type="text"
                  placeholder="Describe location, onset, and severity..."
                  value={painDetails}
                  onChange={(e) => setPainDetails(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-red-300 bg-red-50/40 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          {/* Optional Physiological Data */}
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Physiological &amp; Route Telemetry (Optional)
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Avg HR (bpm)</label>
                <input
                  type="number"
                  min="30"
                  max="240"
                  placeholder="—"
                  value={avgHr}
                  onChange={(e) => setAvgHr(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Max HR (bpm)</label>
                <input
                  type="number"
                  min="30"
                  max="240"
                  placeholder="—"
                  value={maxHr}
                  onChange={(e) => setMaxHr(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Cadence (spm)</label>
                <input
                  type="number"
                  min="80"
                  max="250"
                  placeholder="—"
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Elevation (m)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="—"
                  value={elevation}
                  onChange={(e) => setElevation(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Kilometer Splits (Only if genuinely recorded) */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Recorded Splits (Optional)
                </h3>
                <p className="text-xs text-slate-500">
                  Supports full 1.00 km splits and partial final splits (e.g. 0.14 km).
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={addSplitRow}>
                <Plus className="h-4 w-4" />
                <span>Add Split</span>
              </Button>
            </div>

            {splits.length > 0 && (
              <div className="mt-3 space-y-2">
                {splits.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"
                  >
                    <div className="col-span-2 font-mono text-xs font-medium text-slate-600 pl-1">
                      Km {idx + 1}
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0.05"
                        aria-label={`Split ${idx + 1} distance km`}
                        placeholder="1.00"
                        value={row.distanceKm}
                        onChange={(e) => updateSplitRow(idx, { distanceKm: e.target.value })}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="text"
                        aria-label={`Split ${idx + 1} duration`}
                        placeholder="5:35"
                        value={row.durationStr}
                        onChange={(e) => updateSplitRow(idx, { durationStr: e.target.value })}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        aria-label={`Split ${idx + 1} avg HR`}
                        placeholder="HR (opt)"
                        value={row.avgHr}
                        onChange={(e) => updateSplitRow(idx, { avgHr: e.target.value })}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeSplitRow(idx)}
                        aria-label={`Remove split ${idx + 1}`}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Conditions & Notes */}
          <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Conditions (Weather, surface, heat)
              </label>
              <input
                type="text"
                placeholder="e.g. Warm evening, road"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Session Notes</label>
              <input
                type="text"
                placeholder="How did the session feel?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : initialSession ? 'Update Session' : 'Save Running Session'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}