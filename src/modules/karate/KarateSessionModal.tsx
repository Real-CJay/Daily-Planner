import { useEffect, useState, type FormEvent } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { Button, CategoryMark } from '@/design-system';
import type { PhysicalLoadLevel, ScheduleBlockDraft } from '@/types/domain';
import {
  buildKarateBlockDraft,
  COMMON_KATAS,
  KARATE_FEEL_OPTIONS,
  KARATE_FOCUS_LABELS,
  type KarateFeel,
  type KarateFocus,
  type KarateSessionView,
} from './karateLog';

const FOCUS_LIST: KarateFocus[] = ['KUMITE', 'KATA', 'KIHON', 'CLASS', 'CONDITIONING'];
const DURATION_PRESETS = [30, 45, 60, 75, 90, 120];

export function KarateSessionModal({
  initialSession,
  defaultDate,
  onClose,
  onSave,
}: {
  initialSession?: KarateSessionView | null;
  defaultDate: string;
  onClose: () => void;
  onSave: (draft: ScheduleBlockDraft) => Promise<void>;
}) {
  const [focus, setFocus] = useState<KarateFocus>(initialSession?.meta.focus ?? 'KATA');
  const [title, setTitle] = useState(initialSession?.title ?? '');
  const [date, setDate] = useState(initialSession?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(initialSession?.startTime?.slice(0, 5) ?? '17:30');
  const [durationMin, setDurationMin] = useState<number>(initialSession?.durationMin ?? 60);
  const [selectedKatas, setSelectedKatas] = useState<string[]>(initialSession?.meta.katas ?? []);
  const [customKata, setCustomKata] = useState('');
  const [rpe, setRpe] = useState<number | null>(initialSession?.meta.rpe ?? 7);
  const [feel, setFeel] = useState<KarateFeel | null>(initialSession?.meta.feel ?? 'Strong');
  const [physicalLoad, setPhysicalLoad] = useState<PhysicalLoadLevel>(
    initialSession?.physicalLoad ?? 'HIGH'
  );
  const [painPresent, setPainPresent] = useState(initialSession?.meta.painPresent ?? false);
  const [painDetails, setPainDetails] = useState(initialSession?.meta.painDetails ?? '');
  const [notes, setNotes] = useState(initialSession?.meta.notes ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function toggleKata(name: string) {
    setSelectedKatas((prev) =>
      prev.includes(name) ? prev.filter((k) => k !== name) : [...prev, name]
    );
  }

  function addCustomKata() {
    const trimmed = customKata.trim();
    if (!trimmed) return;
    if (!selectedKatas.includes(trimmed)) {
      setSelectedKatas((prev) => [...prev, trimmed]);
    }
    setCustomKata('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const katasToSave = [...selectedKatas];
    if (customKata.trim() && !katasToSave.includes(customKata.trim())) {
      katasToSave.push(customKata.trim());
    }

    const fallbackTitle =
      focus === 'KATA' && katasToSave.length > 0
        ? `Kata · ${katasToSave.slice(0, 2).join(', ')}${katasToSave.length > 2 ? ' +' : ''}`
        : `${KARATE_FOCUS_LABELS[focus]} Session`;

    const draft = buildKarateBlockDraft({
      title: title.trim() || fallbackTitle,
      date,
      startTime: startTime || null,
      durationMin,
      physicalLoad,
      meta: {
        focus,
        katas: katasToSave,
        rpe,
        feel,
        painPresent,
        painDetails: painPresent && painDetails.trim() ? painDetails.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
      },
    });

    try {
      setSaving(true);
      await onSave(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save Karate session.');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'mt-1 block w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-3 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--karate)] focus:outline-none';
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
        aria-label={initialSession ? 'Edit Karate Session' : 'Log Karate Session'}
        className="max-h-[92vh] w-full max-w-[600px] overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] bg-[var(--karate-lite)]/65 px-6 py-4">
          <div className="flex items-center gap-3">
            <CategoryMark category="KARATE" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--karate-ink)]">
                {initialSession ? 'EDIT DOJO LOG' : 'LOG DOJO SESSION'}
              </div>
              <h2 className="mt-0.5 text-[20px] font-bold tracking-[-0.04em] text-[var(--ink)]">
                {initialSession ? 'Edit Karate session' : 'Record Karate training'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-6">
          {/* Session Type */}
          <div>
            <span className={labelClass}>Session focus</span>
            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {FOCUS_LIST.map((f) => {
                const active = focus === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFocus(f);
                      if (f === 'KUMITE' || f === 'CONDITIONING') setPhysicalLoad('HIGH');
                      else if (f === 'KATA' || f === 'CLASS') setPhysicalLoad('MODERATE');
                      else setPhysicalLoad('LOW');
                    }}
                    className={`rounded-xl border py-2 text-[12px] font-bold transition-colors ${
                      active
                        ? 'border-transparent bg-[var(--karate)] text-[var(--karate-btn-text)]'
                        : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {KARATE_FOCUS_LABELS[f]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date, Start Time, Duration */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Date *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Start time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className={labelClass}>Duration (min) *</label>
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDurationMin((m) => Math.max(5, m - 5))}
                  aria-label="Subtract 5 minutes"
                  className="grid h-[38px] w-9 shrink-0 place-items-center rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--surface-3)]"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="number"
                  min={5}
                  max={360}
                  value={durationMin}
                  onChange={(e) => setDurationMin(Math.max(5, Number(e.target.value) || 30))}
                  className="block h-[38px] w-full rounded-[9px] border border-[var(--line-strong)] bg-[var(--input-bg)] px-2 text-center font-mono text-[13px] font-bold text-[var(--ink)] focus:border-[var(--karate)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setDurationMin((m) => Math.min(360, m + 5))}
                  aria-label="Add 5 minutes"
                  className="grid h-[38px] w-9 shrink-0 place-items-center rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--surface-3)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDurationMin(m)}
                className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-bold transition-colors ${
                  durationMin === m
                    ? 'border-[var(--karate)] bg-[var(--karate-lite)] text-[var(--karate-ink)]'
                    : 'border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                {m}m
              </button>
            ))}
          </div>

          {/* Kata Selector */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3.5">
            <div className="flex items-center justify-between">
              <span className={labelClass}>Kata practiced (optional)</span>
              {selectedKatas.length > 0 && (
                <span className="font-mono text-[10.5px] font-bold text-[var(--karate)]">
                  {selectedKatas.length} selected
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COMMON_KATAS.map((kata) => {
                const active = selectedKatas.includes(kata);
                return (
                  <button
                    key={kata}
                    type="button"
                    onClick={() => toggleKata(kata)}
                    className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                      active
                        ? 'border-transparent bg-[var(--karate)] text-[var(--karate-btn-text)]'
                        : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]'
                    }`}
                  >
                    {kata}
                  </button>
                );
              })}
              {selectedKatas
                .filter((k) => !COMMON_KATAS.includes(k))
                .map((custom) => (
                  <button
                    key={custom}
                    type="button"
                    onClick={() => toggleKata(custom)}
                    className="rounded-lg border border-transparent bg-[var(--karate)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--karate-btn-text)]"
                  >
                    {custom} ×
                  </button>
                ))}
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <input
                type="text"
                value={customKata}
                onChange={(e) => setCustomKata(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomKata();
                  }
                }}
                placeholder="Add another kata (e.g. Nijushiho, Gankaku)..."
                className="min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--karate)] focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustomKata}
                className="rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]"
              >
                Add
              </button>
            </div>
          </div>

          {/* How it felt + RPE + Leg Load */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={labelClass}>How did it feel?</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {KARATE_FEEL_OPTIONS.map((f) => {
                  const active = feel === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFeel(active ? null : f)}
                      className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                        active
                          ? 'border-[var(--karate)] bg-[var(--karate-lite)] text-[var(--karate-ink)]'
                          : 'border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelClass}>Effort RPE (1–10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={rpe ?? ''}
                  onChange={(e) =>
                    setRpe(e.target.value ? Math.min(10, Math.max(1, Number(e.target.value))) : null)
                  }
                  placeholder="7"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className={labelClass}>Leg / Body Load</label>
                <select
                  value={physicalLoad}
                  onChange={(e) => setPhysicalLoad(e.target.value as PhysicalLoadLevel)}
                  className={inputClass}
                >
                  <option value="LOW">Low</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Title + Pain */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Session title (optional)</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`e.g. Evening ${KARATE_FOCUS_LABELS[focus]}`}
                className={inputClass}
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
                <span>Soreness / pain or impact knock</span>
              </label>
            </div>
          </div>

          {painPresent && (
            <div>
              <label className="block text-[11.5px] font-semibold text-red-600 dark:text-red-400">
                Pain / impact details
              </label>
              <input
                type="text"
                value={painDetails}
                onChange={(e) => setPainDetails(e.target.value)}
                placeholder="e.g. Right shin impact from kumite, knee tightness..."
                className="mt-1 block w-full rounded-[9px] border border-red-400/50 bg-red-500/10 px-3 py-2 text-[13px] text-[var(--ink)] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Session notes &amp; takeaways</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Footwork, timing, kime, stances, combinations..."
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
              className="inline-flex h-[38px] items-center justify-center rounded-[9px] bg-[var(--karate)] px-5 text-[12.5px] font-bold text-[var(--karate-btn-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : initialSession ? 'Update Session' : 'Log Karate Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
