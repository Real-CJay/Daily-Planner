import { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
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
    <div className="mt-2 rounded-xl border border-[#E5EAE7] bg-[#F7F9F8] p-3.5 shadow-sm dark:border-morgen-border dark:bg-morgen-elevated">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-[#161C19] dark:text-white">
            What did your Home Workout app assign today?
          </div>
          <div className="text-[11px] text-flomo-slate dark:text-morgen-muted">
            Lower Body &amp; Full Body automatically flag leg fatigue for running protection.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close workout focus picker"
          className="rounded-md p-1 text-flomo-slate hover:bg-white hover:text-[#161C19] dark:text-morgen-muted dark:hover:bg-morgen-surface dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Duration presets */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[11px] text-flomo-slate dark:text-morgen-muted">
          Duration:
        </span>
        {DURATION_PRESETS.map((mins) => (
          <button
            key={mins}
            type="button"
            onClick={() => setDurationMin(mins)}
            className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium transition-colors ${
              durationMin === mins
                ? 'border-[#176D3E] bg-[#176D3E] text-white dark:border-morgen-rose dark:bg-morgen-rose'
                : 'border-[#E5EAE7] bg-white text-[#525C57] hover:border-[#2CCC74] dark:border-morgen-border dark:bg-morgen-surface dark:text-morgen-body'
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
              className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? 'border-[#176D3E] bg-[#2CCC74]/15 dark:border-morgen-red dark:bg-morgen-wine/80'
                  : 'border-[#E5EAE7] bg-white hover:border-[#176D3E]/50 dark:border-morgen-border dark:bg-morgen-surface dark:hover:border-morgen-red/50'
              }`}
            >
              <span className="text-xs font-semibold text-[#161C19] dark:text-white">
                {STRENGTH_FOCUS_LABELS[focus]}
              </span>
              <span
                className={`mt-0.5 font-mono text-[10px] ${
                  isHigh
                    ? 'text-[#A06214] dark:text-morgen-yellow'
                    : 'text-flomo-slate dark:text-morgen-muted'
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
        <div className="mt-3 flex justify-end border-t border-[#E5EAE7] pt-2.5 dark:border-morgen-border">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              await onClear();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-flomo-slate hover:text-[#161C19] dark:text-morgen-muted dark:hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Undo check-off
          </button>
        </div>
      )}
    </div>
  );
}
