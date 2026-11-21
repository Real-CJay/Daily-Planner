import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Check, Minus, Plus, RotateCcw, X } from 'lucide-react';
import {
  CATEGORY_SHORT_LABELS,
  CategoryMark,
} from '@/design-system';
import type { ActivityCategory } from '@/types/domain';

export function PracticeDurationModal({
  title,
  category,
  dateLabel,
  plannedMin,
  initialActualMin,
  initialNotes,
  isCompleted,
  saving,
  onSave,
  onUndo,
  onClose,
}: {
  title: string;
  category: ActivityCategory;
  dateLabel: string;
  plannedMin: number;
  initialActualMin?: number | null;
  initialNotes?: string | null;
  isCompleted: boolean;
  saving?: boolean;
  onSave: (actualMin: number, notes: string | null) => Promise<void>;
  onUndo?: () => Promise<void>;
  onClose: () => void;
}) {
  const safePlanned = Math.max(5, plannedMin || 30);
  const [minutes, setMinutes] = useState<number>(
    Math.max(1, initialActualMin ?? safePlanned)
  );
  const [notes, setNotes] = useState<string>(initialNotes ?? '');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const catColor = 'var(--music)';
  const delta = minutes - safePlanned;
  const sliderMax = Math.max(90, safePlanned * 2, minutes + 15);
  const plannedMarkerPct = Math.min(96, Math.max(4, (safePlanned / sliderMax) * 100));

  const presets = useMemo(() => {
    const base = new Set<number>([15, 20, 30, 45, 60, safePlanned]);
    return Array.from(base).sort((a, b) => a - b);
  }, [safePlanned]);

  function step(amount: number) {
    setMinutes((prev) => Math.max(1, Math.min(300, prev + amount)));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSave(Math.max(1, Math.round(minutes)), notes.trim() ? notes.trim() : null);
    onClose();
  }

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
        aria-label={`Log ${title} duration`}
        style={{ '--cat-color': catColor } as CSSProperties}
        className="w-full max-w-[460px] overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl"
      >
        {/* Top Accent Header */}
        <div
          className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-6 py-5"
          style={{
            background: 'color-mix(in srgb, var(--cat-color) 9%, var(--surface))',
          }}
        >
          <div className="flex items-center gap-3.5">
            <CategoryMark category={category} />
            <div className="min-w-0">
              <div className="stride-cat-label text-[10.5px] font-bold uppercase tracking-[0.12em]">
                {CATEGORY_SHORT_LABELS[category]} · {dateLabel}
              </div>
              <h2 className="mt-0.5 truncate text-[19px] font-bold tracking-[-0.035em] text-[var(--ink)]">
                {title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close session logger"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 p-6">
          {/* Oversized Tactile Minute Readout */}
          <div className="flex flex-col items-center rounded-2xl border border-[var(--line)] bg-[var(--bg)] px-5 py-6 text-center">
            <div className="flex items-baseline justify-center gap-2">
              <input
                type="number"
                min={1}
                max={300}
                aria-label="Actual minutes"
                value={minutes}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  if (!Number.isNaN(parsed)) {
                    setMinutes(Math.max(1, Math.min(300, parsed)));
                  }
                }}
                className="w-[140px] bg-transparent text-center font-mono text-[72px] font-extrabold leading-none tracking-[-0.06em] text-[var(--ink)] tabular-nums focus:outline-none"
              />
              <span className="text-[20px] font-bold tracking-[-0.03em] text-[var(--muted)]">
                min
              </span>
            </div>

            {/* Live Planned vs Actual Delta Pill */}
            <div className="mt-3">
              {delta === 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1 font-mono text-[11.5px] font-semibold text-[var(--muted)]">
                  Matches {safePlanned}m plan
                </span>
              ) : delta > 0 ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11.5px] font-bold"
                  style={{
                    color: catColor,
                    background: 'color-mix(in srgb, var(--cat-color) 14%, var(--surface))',
                  }}
                >
                  +{delta} min over {safePlanned}m plan
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-3 py-1 font-mono text-[11.5px] font-bold text-amber-700 dark:text-amber-300">
                  {delta} min under {safePlanned}m plan
                </span>
              )}
            </div>

            {/* Interactive Slider with Planned Target Tick */}
            <div className="relative mt-5 w-full px-1">
              <input
                type="range"
                min={5}
                max={sliderMax}
                step={1}
                value={Math.min(sliderMax, Math.max(5, minutes))}
                onChange={(e) => setMinutes(Number(e.target.value))}
                aria-label="Slide to adjust session minutes"
                style={{ accentColor: catColor }}
                className="h-2.5 w-full cursor-pointer rounded-full bg-[var(--surface-3)]"
              />
              <div className="relative mt-1.5 flex justify-between font-mono text-[10px] text-[var(--faint)]">
                <span>5m</span>
                <span
                  style={{ left: `${plannedMarkerPct}%` }}
                  className="absolute -translate-x-1/2 font-bold text-[var(--muted)]"
                >
                  Plan {safePlanned}m
                </span>
                <span>{sliderMax}m</span>
              </div>
            </div>
          </div>

          {/* Giant 4-Button Tactile Steppers */}
          <div className="grid grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => step(-5)}
              className="flex h-14 flex-col items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] font-mono text-[16px] font-extrabold text-[var(--ink)] transition hover:bg-[var(--surface-2)] active:scale-[0.97]"
            >
              -5
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              className="flex h-14 items-center justify-center gap-0.5 rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] font-mono text-[16px] font-extrabold text-[var(--ink)] transition hover:bg-[var(--surface-2)] active:scale-[0.97]"
            >
              <Minus className="h-4 w-4 stroke-[2.6]" />
              <span>1</span>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              className="flex h-14 items-center justify-center gap-0.5 rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] font-mono text-[16px] font-extrabold text-[var(--ink)] transition hover:bg-[var(--surface-2)] active:scale-[0.97]"
            >
              <Plus className="h-4 w-4 stroke-[2.6]" />
              <span>1</span>
            </button>
            <button
              type="button"
              onClick={() => step(5)}
              className="flex h-14 flex-col items-center justify-center rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] font-mono text-[16px] font-extrabold text-[var(--ink)] transition hover:bg-[var(--surface-2)] active:scale-[0.97]"
            >
              +5
            </button>
          </div>

          {/* Quick Duration Chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {presets.map((p) => {
              const active = minutes === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMinutes(p)}
                  className={`rounded-xl border px-3 py-1.5 font-mono text-[12px] font-bold transition-colors ${
                    active
                      ? 'border-transparent text-white'
                      : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                  style={active ? { backgroundColor: 'var(--music)', color: 'var(--music-btn-text)' } : undefined}
                >
                  {p === safePlanned ? `Plan ${p}m` : `${p}m`}
                </button>
              );
            })}
          </div>

          {/* Optional Session Note */}
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Quick note (optional) — e.g. breath support, scales..."
            className="w-full rounded-xl border border-[var(--line-strong)] bg-[var(--input-bg)] px-3.5 py-2.5 text-[13px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:border-[var(--blue)] focus:outline-none"
          />

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-1">
            {isCompleted && onUndo ? (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  await onUndo();
                  onClose();
                }}
                className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[12.5px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Undo</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[12.5px] font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              >
                Cancel
              </button>
            )}

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--music)] px-5 text-[14px] font-bold text-[var(--music-btn-text)] transition-opacity hover:opacity-90 active:translate-y-px disabled:opacity-50"
            >
              <Check className="h-4 w-4 stroke-[2.8]" />
              <span>
                {saving
                  ? 'Saving...'
                  : isCompleted
                    ? `Update to ${minutes} min`
                    : `Complete · ${minutes} min`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
