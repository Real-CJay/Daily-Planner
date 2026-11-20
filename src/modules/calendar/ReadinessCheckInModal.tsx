import { useState, type FormEvent } from 'react';
import { HeartPulse, X } from 'lucide-react';
import { Button, Card } from '@/design-system';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/45 p-4">
      <Card className="my-auto max-h-[92vh] w-full max-w-xl overflow-y-auto p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-emerald-700" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Daily Readiness Check-In</h2>
              <p className="text-xs text-slate-500">
                Leave unmeasured fields blank — readiness only calculates from recorded inputs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close readiness modal"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">Date *</label>
              <input
                type="date"
                required
                value={checkinDate}
                onChange={(e) => setCheckinDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Sleep Hours</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="24"
                placeholder="7.5"
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Sleep Quality (1–5)
              </label>
              <input
                type="number"
                min="1"
                max="5"
                placeholder="4"
                value={sleepQuality}
                onChange={(e) => setSleepQuality(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Energy Level (1–5)</label>
              <input
                type="number"
                min="1"
                max="5"
                placeholder="4"
                value={energyLevel}
                onChange={(e) => setEnergyLevel(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Muscle Soreness (1=None, 5=Severe)
              </label>
              <input
                type="number"
                min="1"
                max="5"
                placeholder="2"
                value={muscleSoreness}
                onChange={(e) => setMuscleSoreness(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Stress Level (1=Low, 5=High)
              </label>
              <input
                type="number"
                min="1"
                max="5"
                placeholder="2"
                value={stressLevel}
                onChange={(e) => setStressLevel(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Resting HR (bpm, optional)
              </label>
              <input
                type="number"
                min="30"
                max="140"
                placeholder="—"
                value={restingHr}
                onChange={(e) => setRestingHr(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
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
                <span>Pain or tightness present</span>
              </label>
            </div>
          </div>

          {painPresent && (
            <div>
              <label className="block text-xs font-medium text-red-700">Pain Details</label>
              <input
                type="text"
                placeholder="Location, intensity, whether sharp or dull..."
                value={painDetails}
                onChange={(e) => setPainDetails(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-red-300 bg-red-50/40 px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700">Notes</label>
            <input
              type="text"
              placeholder="e.g. Legs felt heavy after Friday karate"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
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
              {submitting ? 'Saving...' : 'Save Check-In'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}