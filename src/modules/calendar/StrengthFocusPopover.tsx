import { useState, type CSSProperties } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { SPLIT_COLORS } from '@/design-system';
import {
  STRENGTH_FOCUS_LABELS,
  STRENGTH_FOCUS_LOAD,
  type ScheduleCompletion,
  type ScheduleCompletionDraft,
  type StrengthFocus,
} from '@/types/domain';

const FOCUS_OPTIONS: StrengthFocus[] = [
  'UPPER',
  'CORE',
  'LOWER',
  'FULL_BODY',
  'MOBILITY',
  'APP_REST',
];

const DURATION_PRESETS = [15, 20, 25, 30, 45];

export function StrengthFocusPopover({
  blockId,
  occurrenceDate,
  defaultDurationMin,
  existingCompletion,
  saving,
  onSave,
  onClear,
  onClose,
}: {
  blockId: string;
  occurrenceDate: string;
  defaultDurationMin: number;
  existingCompletion?: ScheduleCompletion;
  saving?: boolean;
  onSave: (draft: ScheduleCompletionDraft) => Promise<void>;
  onClear?: () => Promise<void>;
  onClose: () => void;
}) {
  const [durationMin, setDurationMin] = useState<number>(
    existingCompletion?.duration_min ?? defaultDurationMin ?? 20
  );

  async function handleSelectFocus(focus: StrengthFocus) {
    const isRest = focus === 'APP_REST';
    await onSave({
      block_id: blockId,
      occurrence_date: occurrenceDate,
      status: isRest ? 'REST_DAY' : 'COMPLETED',
      strength_focus: focus,
      duration_min: isRest ? null : durationMin,
      physical_load: STRENGTH_FOCUS_LOAD[focus],
      notes: null,
    });
    onClose();
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)]/70 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[12px] font-bold text-[var(--ink)]">
            What did your Home Workout app assign today?
          </div>
          <div className="text-[11px] text-[var(--muted)]">
            Lower Body &amp; Full Body automatically flag leg fatigue for running protection.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close workout focus picker"
          className="rounded-md p-1 text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Duration presets */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[11px] text-[var(--muted)]">Duration:</span>
        {DURATION_PRESETS.map((mins) => (
          <button
            key={mins}
            type="button"
            onClick={() => setDurationMin(mins)}
            className={`rounded-[6px] border px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors ${
              durationMin === mins
                ? 'border-[var(--blue)] bg-[var(--blue)] text-white dark:text-[#121315]'
                : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            {mins}m
          </button>
        ))}
      </div>

      {/* 1-tap rotating split pills */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FOCUS_OPTIONS.map((focus) => {
          const load = STRENGTH_FOCUS_LOAD[focus];
          const isSelected = existingCompletion?.strength_focus === focus;
          const isHigh = load === 'HIGH';

          return (
            <button
              key={focus}
              type="button"
              disabled={saving}
              onClick={() => void handleSelectFocus(focus)}
              style={{ '--split-color': SPLIT_COLORS[focus] } as CSSProperties}
              className={`stride-split-cell flex flex-col items-start rounded-lg px-3 py-2 text-left ${
                isSelected ? 'selected' : ''
              }`}
            >
              <span className="text-[12px] font-bold text-[var(--ink)]">
                {STRENGTH_FOCUS_LABELS[focus]}
              </span>
              <span
                className={`mt-0.5 font-mono text-[10px] ${
                  isHigh
                    ? 'font-semibold text-amber-700 dark:text-amber-300'
                    : 'text-[var(--muted)]'
                }`}
              >
                {focus === 'APP_REST'
                  ? 'Dismiss cleanly'
                  : isHigh
                    ? 'HIGH leg load'
                    : load === 'NONE'
                      ? 'Restorative'
                      : 'LOW leg load'}
              </span>
            </button>
          );
        })}
      </div>

      {existingCompletion && onClear && (
        <div className="mt-3 flex justify-end border-t border-[var(--line)] pt-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              await onClear();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Undo check-off
          </button>
        </div>
      )}
    </div>
  );
}
