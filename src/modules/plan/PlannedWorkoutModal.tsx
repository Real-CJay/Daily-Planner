import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button, CategoryMark } from '@/design-system';
import type { computeTrainingPaceZones } from '@/modules/plan/planEngine';
import {
  WORKOUT_TYPE_LABELS,
  type PlannedWorkout,
  type PlannedWorkoutDraft,
  type PlannedWorkoutStatus,
  type TrainingPhase,
  type WorkoutType,
} from '@/types/domain';

type PaceZonesResult = ReturnType<typeof computeTrainingPaceZones>;

const WORKOUT_TYPES: WorkoutType[] = [
  'EASY',
  'RECOVERY',
  'LONG',
  'TEMPO',
  'INTERVALS',
  'PROGRESSION',
  'TIME_TRIAL',
  'RACE',
  'TREADMILL',
  'RUN_WALK',
  'OTHER',
];

function formatSecToMmSs(sec: number | null): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseMmSsToSec(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const m = Number(parts[0]);
    const s = Number(parts[1]);
    if (!Number.isNaN(m) && !Number.isNaN(s) && m >= 2 && m <= 25 && s >= 0 && s < 60) {
      return Math.round(m * 60 + s);
    }
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isNaN(num) && num >= 120 && num <= 1500) return Math.round(num);
  return null;
}

function getZoneForType(
  type: WorkoutType,
  zones: PaceZonesResult
): { minSecPerKm: number; maxSecPerKm: number; rpe: string } {
  switch (type) {
    case 'LONG':
      return {
        minSecPerKm: zones.long?.minSecPerKm ?? 0,
        maxSecPerKm: zones.long?.maxSecPerKm ?? 0,
        rpe: 'RPE 4–5 (steady aerobic)',
      };
    case 'TEMPO':
    case 'PROGRESSION':
      return {
        minSecPerKm: zones.tempo?.minSecPerKm ?? 0,
        maxSecPerKm: zones.tempo?.maxSecPerKm ?? 0,
        rpe: 'RPE 6–7 (controlled threshold)',
      };
    case 'INTERVALS':
    case 'TIME_TRIAL':
    case 'RACE':
      return {
        minSecPerKm: zones.intervals?.minSecPerKm ?? 0,
        maxSecPerKm: zones.intervals?.maxSecPerKm ?? 0,
        rpe: 'RPE 7–9 (focused speed)',
      };
    default:
      return {
        minSecPerKm: zones.easy?.minSecPerKm ?? 0,
        maxSecPerKm: zones.easy?.maxSecPerKm ?? 0,
        rpe: 'RPE 3–4 (conversational)',
      };
  }
}

export function PlannedWorkoutModal({
  initialWorkout,
  defaultDate,
  activePhase,
  paceZones,
  onClose,
  onSave,
}: {
  initialWorkout?: PlannedWorkout | null;
  defaultDate: string;
  activePhase: TrainingPhase;
  paceZones: PaceZonesResult;
  onClose: () => void;
  onSave: (draft: PlannedWorkoutDraft, previousId?: string, previousDate?: string) => Promise<void>;
}) {
  const initialType: WorkoutType = initialWorkout?.workout_type ?? 'EASY';
  const defaultZone = getZoneForType(initialType, paceZones);

  const [planDate, setPlanDate] = useState(initialWorkout?.plan_date ?? defaultDate);
  const [workoutType, setWorkoutType] = useState<WorkoutType>(initialType);
  const [title, setTitle] = useState(
    initialWorkout?.title ?? `${WORKOUT_TYPE_LABELS[initialType]} Run`
  );
  const [distanceKm, setDistanceKm] = useState(
    initialWorkout ? (initialWorkout.target_distance_m / 1000).toFixed(1) : '4.0'
  );
  const [durationMin, setDurationMin] = useState(
    initialWorkout?.target_duration_s
      ? String(Math.round(initialWorkout.target_duration_s / 60))
      : ''
  );
  const [paceMinStr, setPaceMinStr] = useState(
    initialWorkout
      ? formatSecToMmSs(initialWorkout.target_pace_min_s)
      : formatSecToMmSs(defaultZone.minSecPerKm || null)
  );
  const [paceMaxStr, setPaceMaxStr] = useState(
    initialWorkout
      ? formatSecToMmSs(initialWorkout.target_pace_max_s)
      : formatSecToMmSs(defaultZone.maxSecPerKm || null)
  );
  const [rpeRange, setRpeRange] = useState(
    initialWorkout?.target_rpe_range ?? defaultZone.rpe
  );
  const [status, setStatus] = useState<PlannedWorkoutStatus>(
    initialWorkout?.status ?? 'PLANNED'
  );
  const [rationale, setRationale] = useState(
    initialWorkout?.rationale ?? 'Custom workout planned manually.'
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleTypeChange(nextType: WorkoutType) {
    const prevDefaultTitle = `${WORKOUT_TYPE_LABELS[workoutType]} Run`;
    setWorkoutType(nextType);
    if (!title.trim() || title === prevDefaultTitle) {
      setTitle(`${WORKOUT_TYPE_LABELS[nextType]} Run`);
    }
    const z = getZoneForType(nextType, paceZones);
    setPaceMinStr(formatSecToMmSs(z.minSecPerKm || null));
    setPaceMaxStr(formatSecToMmSs(z.maxSecPerKm || null));
    setRpeRange(z.rpe);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const distKmNum = Number(distanceKm);
    if (Number.isNaN(distKmNum) || distKmNum < 0 || distKmNum > 100) {
      setError('Enter a valid target distance between 0 and 100 km.');
      return;
    }

    const paceMinSec = parseMmSsToSec(paceMinStr);
    const paceMaxSec = parseMmSsToSec(paceMaxStr);
    if ((paceMinStr.trim() && !paceMinSec) || (paceMaxStr.trim() && !paceMaxSec)) {
      setError('Use M:SS format for pace bounds (e.g. 6:30), or leave blank for RPE-only.');
      return;
    }

    const targetDistanceM = Math.round(distKmNum * 1000);
    let targetDurationS: number | null = durationMin.trim()
      ? Math.max(0, Math.round(Number(durationMin) * 60))
      : null;

    if (targetDurationS === null && targetDistanceM > 0 && paceMinSec && paceMaxSec) {
      const midPace = (paceMinSec + paceMaxSec) / 2;
      targetDurationS = Math.round((targetDistanceM / 1000) * midPace);
    }

    const draft: PlannedWorkoutDraft = {
      plan_date: planDate,
      workout_type: workoutType,
      title: title.trim() || `${WORKOUT_TYPE_LABELS[workoutType]} Run`,
      target_distance_m: targetDistanceM,
      target_duration_s: targetDurationS,
      target_pace_min_s: paceMinSec,
      target_pace_max_s: paceMaxSec,
      target_rpe_range: rpeRange.trim() ? rpeRange.trim() : null,
      phase: initialWorkout?.phase ?? activePhase,
      rationale: rationale.trim() || 'Custom workout planned manually.',
      status,
      linked_session_id: initialWorkout?.linked_session_id ?? null,
      data_origin: 'PLANNED',
    };

    try {
      setSaving(true);
      await onSave(draft, initialWorkout?.id, initialWorkout?.plan_date);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save planned workout.');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'mt-1 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--blue)] focus:outline-none';
  const labelClass = 'block text-[11.5px] font-semibold text-[var(--muted)]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initialWorkout ? 'Edit Planned Workout' : 'Add Planned Workout'}
        className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3.5">
          <div className="flex items-center gap-3">
            <CategoryMark category="RUNNING" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                {initialWorkout ? 'TWEAK PLANNED RUN' : 'MANUAL TRAINING PLAN'}
              </div>
              <h2 className="mt-0.5 text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                {initialWorkout ? 'Edit workout' : 'Add planned workout'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Date *</label>
              <input
                type="date"
                required
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Workout type *</label>
              <select
                value={workoutType}
                onChange={(e) => handleTypeChange(e.target.value as WorkoutType)}
                className={inputClass}
              >
                {WORKOUT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WORKOUT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Workout title *</label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Easy Aerobic 5K, 4x800m Intervals"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelClass}>Distance (km)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Est. min</label>
              <input
                type="number"
                min="0"
                max="600"
                placeholder="Auto"
                value={durationMin}
                onChange={(e) => setDurationMin(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Faster pace</label>
              <input
                type="text"
                placeholder="6:20"
                value={paceMinStr}
                onChange={(e) => setPaceMinStr(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Slower pace</label>
              <input
                type="text"
                placeholder="6:55"
                value={paceMaxStr}
                onChange={(e) => setPaceMaxStr(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Effort / RPE cue</label>
              <input
                type="text"
                value={rpeRange}
                onChange={(e) => setRpeRange(e.target.value)}
                placeholder="e.g. RPE 3–4 conversational"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PlannedWorkoutStatus)}
                className={inputClass}
              >
                <option value="PLANNED">Planned</option>
                <option value="ADJUSTED">Adjusted</option>
                <option value="COMPLETED">Completed</option>
                <option value="SKIPPED">Skipped</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Workout notes / structure</label>
            <textarea
              rows={2}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Warmup, splits, strides, or recovery focus..."
              className={inputClass}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2.5 border-t border-[var(--line)] pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="!min-h-[38px] !px-4 !text-[12.5px]"
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-[38px] items-center justify-center rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-[var(--blue-btn-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : initialWorkout ? 'Save changes' : 'Add workout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
