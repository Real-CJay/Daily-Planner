import { useEffect, useState } from 'react';
import { getV2Theme } from '@/design-system/v2Theme';
import type { ReadinessCheckIn, ReadinessCheckInDraft } from '@/types/domain';

export function V2ReadinessModal({
  isDark,
  todayIso,
  existing,
  saving,
  onClose,
  onSave,
}: {
  isDark: boolean;
  todayIso: string;
  existing: ReadinessCheckIn | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: ReadinessCheckInDraft) => Promise<void>;
}) {
  const T = getV2Theme(isDark);
  const [energy, setEnergy] = useState(existing?.energy_level ?? 4);
  const [sleep, setSleep] = useState(existing?.sleep_quality ?? 4);
  const [soreness, setSoreness] = useState(existing?.muscle_soreness ?? 2);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = [
    { label: 'Energy', value: energy, set: setEnergy },
    { label: 'Sleep Quality', value: sleep, set: setSleep },
    { label: 'Soreness (1 low – 5 high)', value: soreness, set: setSoreness },
  ];

  async function handleSave() {
    await onSave({
      checkin_date: todayIso,
      sleep_hours: existing?.sleep_hours ?? null,
      sleep_quality: sleep,
      energy_level: energy,
      muscle_soreness: soreness,
      stress_level: existing?.stress_level ?? null,
      resting_hr_bpm: existing?.resting_hr_bpm ?? null,
      pain_present: existing?.pain_present ?? false,
      pain_details: existing?.pain_details ?? null,
      notes: existing?.notes ?? null,
    });
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${T.modalOverlay}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-pop w-full max-w-sm space-y-5 rounded-3xl border p-6 shadow-2xl ${T.card}`}
      >
        <h3 className={`font-display text-xl font-extrabold ${T.text}`}>Readiness Check-in</h3>
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.label} className="space-y-1.5">
              <span className={`text-xs font-extrabold uppercase ${T.muted}`}>{r.label}</span>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => r.set(n)}
                    className={`cursor-pointer rounded-xl border py-2.5 font-display text-sm font-extrabold transition-all active:scale-[0.98] ${
                      r.value === n
                        ? 'border-transparent bg-[#0D9488] text-white'
                        : `${T.cardSubtle} ${T.muted}`
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold ${T.btnNeutral}`}
          >
            Close
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="cursor-pointer rounded-xl bg-[#0D9488] px-5 py-2 font-display text-xs font-bold text-white transition-all hover:bg-[#0F766E] active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
