import { useEffect, useState, type FormEvent } from 'react';
import { DuoIcon, type DuoIconName } from '@/design-system/DuoIcon';
import { getDom, getV2Theme, type DomainId } from '@/design-system/v2Theme';
import type {
  ActivityCategory,
  PhysicalLoadLevel,
  ScheduleBlock,
  ScheduleBlockDraft,
} from '@/types/domain';

interface CategoryOption {
  category: ActivityCategory;
  label: string;
  domId: DomainId;
  icon: DuoIconName;
  defaultLoad: PhysicalLoadLevel;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { category: 'RUNNING', label: 'Running', domId: 'running', icon: 'running', defaultLoad: 'MODERATE' },
  { category: 'STRENGTH', label: 'Strength', domId: 'strength', icon: 'strength', defaultLoad: 'MODERATE' },
  { category: 'KARATE', label: 'Karate', domId: 'karate', icon: 'karate', defaultLoad: 'HIGH' },
  { category: 'VOCAL', label: 'Vocal', domId: 'music', icon: 'vocal', defaultLoad: 'NONE' },
  { category: 'DRUMMING', label: 'Drums', domId: 'music', icon: 'drumming', defaultLoad: 'LOW' },
  { category: 'GUITAR', label: 'Guitar', domId: 'music', icon: 'guitar', defaultLoad: 'NONE' },
  { category: 'RECOVERY', label: 'Recovery', domId: 'recovery', icon: 'recovery', defaultLoad: 'NONE' },
  { category: 'CUSTOM', label: 'Other', domId: 'health', icon: 'spark', defaultLoad: 'NONE' },
];

const WEEKDAY_LABELS = [
  { iso: 1, label: 'M' },
  { iso: 2, label: 'T' },
  { iso: 3, label: 'W' },
  { iso: 4, label: 'T' },
  { iso: 5, label: 'F' },
  { iso: 6, label: 'S' },
  { iso: 7, label: 'S' },
];

function computeEndTime(startTime: string | null, durationMin: number): string | null {
  if (!startTime) return null;
  const [h, m] = startTime.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const total = (h * 60 + m + durationMin) % (24 * 60);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

export function V2BlockModal({
  isDark,
  block,
  defaultDate,
  defaultCategory = 'RUNNING',
  saving,
  onClose,
  onSave,
  onDelete,
}: {
  isDark: boolean;
  block: ScheduleBlock | null;
  defaultDate: string;
  defaultCategory?: ActivityCategory;
  saving?: boolean;
  onClose: () => void;
  onSave: (draft: ScheduleBlockDraft, existingId: string | null) => Promise<void>;
  onDelete?: (blockId: string) => Promise<void>;
}) {
  const T = getV2Theme(isDark);

  const [category, setCategory] = useState<ActivityCategory>(block?.category ?? defaultCategory);
  const [title, setTitle] = useState(block?.title ?? '');
  const [blockDate, setBlockDate] = useState(block?.block_date ?? defaultDate);
  const [startTime, setStartTime] = useState(block?.start_time ?? '08:00');
  const [durationMin, setDurationMin] = useState(String(block?.duration_min ?? 30));
  const [isRecurring, setIsRecurring] = useState(Boolean(block?.is_recurring));
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(block?.recurrence_days ?? []);
  const [notes, setNotes] = useState(block?.notes ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggleDay(dayIso: number) {
    setRecurrenceDays((prev) =>
      prev.includes(dayIso) ? prev.filter((d) => d !== dayIso) : [...prev, dayIso].sort()
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const dur = Math.max(5, Math.min(360, Number(durationMin) || 30));
    const meta = CATEGORY_OPTIONS.find((c) => c.category === category);
    const cleanTime = startTime.trim() ? startTime.trim() : null;

    const draft: ScheduleBlockDraft = {
      title: trimmed,
      category,
      block_date: blockDate,
      start_time: cleanTime,
      end_time: computeEndTime(cleanTime, dur),
      duration_min: dur,
      is_recurring: isRecurring && recurrenceDays.length > 0,
      recurrence_days: isRecurring ? recurrenceDays : [],
      status: block?.status ?? 'PLANNED',
      physical_load: block?.physical_load ?? meta?.defaultLoad ?? 'NONE',
      notes: notes.trim() ? notes.trim() : null,
    };

    await onSave(draft, block?.id ?? null);
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
        className={`animate-pop max-h-[92vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-3xl border p-6 shadow-2xl ${T.card}`}
      >
        <div className="flex items-center justify-between">
          <h3 className={`font-display text-xl font-extrabold ${T.text}`}>
            {block ? 'Edit Block' : 'Quick Add Block'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className={`h-9 w-9 cursor-pointer rounded-xl font-extrabold ${T.btnNeutral}`}
          >
            ×
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {CATEGORY_OPTIONS.map((opt) => {
              const d = getDom(opt.domId, isDark);
              const sel = category === opt.category;
              return (
                <button
                  key={opt.category}
                  type="button"
                  onClick={() => setCategory(opt.category)}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border p-2.5 transition-all active:scale-[0.97] ${
                    sel ? `${d.soft} ${d.border} ${d.text}` : `${T.cardSubtle} ${T.muted}`
                  }`}
                >
                  <DuoIcon name={opt.icon} className="h-6 w-6" />
                  <span className={`text-[10px] font-extrabold ${T.text}`}>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <input
            type="text"
            required
            placeholder="Activity title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`w-full rounded-xl border px-3.5 py-2.5 font-display text-sm font-bold focus:outline-none ${T.input}`}
          />

          <div className="grid grid-cols-3 gap-2.5">
            <input
              type="date"
              value={blockDate}
              onChange={(e) => setBlockDate(e.target.value)}
              className={`rounded-xl border px-2.5 py-2.5 text-xs font-bold tabular-nums ${T.input}`}
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={`rounded-xl border px-2.5 py-2.5 text-xs font-bold tabular-nums ${T.input}`}
            />
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              className={`rounded-xl border px-2.5 py-2.5 text-xs font-bold tabular-nums ${T.input}`}
            >
              {[15, 20, 25, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m}m
                </option>
              ))}
            </select>
          </div>

          {/* Optional Recurring Days Toggle */}
          <div className={`space-y-2.5 rounded-2xl border p-3 ${T.cardSubtle}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-extrabold ${T.text}`}>Repeat weekly</span>
              <button
                type="button"
                onClick={() => setIsRecurring((v) => !v)}
                className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${
                  isRecurring ? T.btnPrimary : T.btnWhite
                }`}
              >
                {isRecurring ? 'On' : 'Off'}
              </button>
            </div>
            {isRecurring && (
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_LABELS.map((w) => {
                  const active = recurrenceDays.includes(w.iso);
                  return (
                    <button
                      key={w.iso}
                      type="button"
                      onClick={() => toggleDay(w.iso)}
                      className={`cursor-pointer rounded-xl py-1.5 text-xs font-extrabold transition-all ${
                        active ? T.btnPrimary : T.btnWhite
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <input
            type="text"
            placeholder="Cue / note (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`w-full rounded-xl border px-3.5 py-2 text-xs font-bold ${T.input}`}
          />

          <div className="flex items-center justify-between pt-2">
            {block && onDelete ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void onDelete(block.id)}
                className={`cursor-pointer rounded-xl px-3.5 py-2 text-xs font-extrabold disabled:opacity-50 ${T.btnDangerSoft}`}
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-extrabold ${T.btnNeutral}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={`cursor-pointer rounded-xl px-5 py-2 font-display text-xs font-bold disabled:opacity-50 ${T.btnPrimary}`}
              >
                {saving ? 'Saving...' : 'Save Block'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
