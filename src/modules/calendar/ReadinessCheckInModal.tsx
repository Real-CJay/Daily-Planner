import { useEffect, useState, type FormEvent } from 'react';
import { HeartPulse, X } from 'lucide-react';
import { Button } from '@/design-system';
import type { ReadinessCheckIn, ReadinessCheckInDraft } from '@/types/domain';

export function ReadinessCheckInModal({
  initialCheckIn,
  defaultDate,
  onClose,
  onSave,
}: {
  initialCheckIn?: ReadinessCheckIn | null;
  defaultDate: string;
  onClose: () => void;
  onSave: (draft: ReadinessCheckInDraft) => Promise<void>;
}) {
  const [checkinDate, setCheckinDate] = useState(initialCheckIn?.checkin_date ?? defaultDate);
  const [sleepHours, setSleepHours] = useState(initialCheckIn?.sleep_hours?.toString() ?? '');
  const [sleepQuality, setSleepQuality] = useState(initialCheckIn?.sleep_quality?.toString() ?? '');
  const [energyLevel, setEnergyLevel] = useState(initialCheckIn?.energy_level?.toString() ?? '');
  const [muscleSoreness, setMuscleSoreness] = useState(
    initialCheckIn?.muscle_soreness?.toString() ?? ''
  );
  const [stressLevel, setStressLevel] = useState(initialCheckIn?.stress_level?.toString() ?? '');
  const [restingHr, setRestingHr] = useState(initialCheckIn?.resting_hr_bpm?.toString() ?? '');
  const [painPresent, setPainPresent] = useState(initialCheckIn?.pain_present ?? false);
  const [painDetails, setPainDetails] = useState(initialCheckIn?.pain_details ?? '');
  const [notes, setNotes] = useState(initialCheckIn?.notes ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const toNullableInt = (v: string) => (v.trim() ? Number(v) : null);
    const toNullableFloat = (v: string) => (v.trim() ? Number(v) : null);

    const draft: ReadinessCheckInDraft = {
      checkin_date: checkinDate,
      sleep_hours: toNullableFloat(sleepHours),
      sleep_quality: toNullableInt(sleepQuality),
      energy_level: toNullableInt(energyLevel),
      muscle_soreness: toNullableInt(muscleSoreness),
      stress_level: toNullableInt(stressLevel),
      resting_hr_bpm: toNullableInt(restingHr),
      pain_present: painPresent,
      pain_details: painPresent && painDetails.trim() ? painDetails.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
    };

    try {
      setSubmitting(true);
      await onSave(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save readiness check-in.');
    } finally {
      setSubmitting(false);
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
        aria-label="Daily Readiness Check-In"
        className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-[var(--ink)] shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--blue-lite)] text-[var(--blue)]">
              <HeartPulse className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[19px] font-bold tracking-[-0.035em] text-[var(--ink)]">
                Daily Readiness Check-In
              </h2>
              <p className="text-[11.5px] text-[var(--muted)]">
                Leave unmeasured fields blank — readiness only calculates from recorded inputs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close readiness modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Date *</label>
              <input
                type="date"
                required
                value={checkinDate}
                onChange={(e) => setCheckinDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Sleep Hours</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                placeholder="7.5"
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Sleep Quality (1–5)</label>
              <input
                type="number"
                min="1"
                max="5"
                placeholder="4"
                value={sleepQuality}
                onChange={(e) => setSleepQuality(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Energy Level (1–5)</label>
              <input
                type="number"
                min="1"
                max="5"
                placeholder="4"
                value={energyLevel}
                onChange={(e) => setEnergyLevel(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Muscle Soreness (1=None, 5=Severe)</label>
              <input
                type="number"
                min="1"
                max="5"
                placeholder="2"
                value={muscleSoreness}
                onChange={(e) => setMuscleSoreness(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Stress Level (1=Low, 5=High)</label>
              <input
                type="number"
                min="1"
                max="5"
                placeholder="2"
                value={stressLevel}
                onChange={(e) => setStressLevel(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label className={labelClass}>Resting HR (bpm, optional)</label>
              <input
                type="number"
                min="30"
                max="140"
                placeholder="—"
                value={restingHr}
                onChange={(e) => setRestingHr(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={painPresent}
                  onChange={(e) => setPainPresent(e.target.checked)}
                  className="h-4 w-4 rounded accent-red-600"
                />
                <span>Pain or tightness present</span>
              </label>
            </div>
          </div>

          {painPresent && (
            <div>
              <label className="block text-[11.5px] font-semibold text-red-600 dark:text-red-400">
                Pain Details
              </label>
              <input
                type="text"
                placeholder="Location, intensity, whether sharp or dull..."
                value={painDetails}
                onChange={(e) => setPainDetails(e.target.value)}
                className="mt-1 block w-full rounded-[9px] border border-red-400/50 bg-red-500/10 px-3 py-2 text-[13px] text-[var(--ink)] focus:border-red-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Notes</label>
            <input
              type="text"
              placeholder="e.g. Legs felt heavy after Friday karate"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              disabled={submitting}
              className="inline-flex h-[38px] items-center justify-center rounded-[9px] bg-[var(--blue)] px-4 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:text-[#121315]"
            >
              {submitting ? 'Saving...' : 'Save Check-In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
