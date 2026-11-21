import { useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Edit3,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  CATEGORY_COLORS,
  CATEGORY_SHORT_LABELS,
  CategoryBadge,
  CategoryMark,
  ProvenanceBadge,
} from '@/design-system';
import type {
  ActivityCategory,
  PlannedWorkout,
  RunningSession,
  ScheduleBlock,
  ScheduleCompletion,
  ScheduleCompletionDraft,
} from '@/types/domain';
import {
  buildDailyTimeline,
  formatDurationCompact,
  formatMinutesToTime,
  getCategoryDotsForDate,
  getWeekDatesIso,
  type TimelineItem,
} from './timelineEngine';
import { StrengthFocusPopover } from './StrengthFocusPopover';
import { PracticeDurationModal } from './PracticeDurationModal';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PRACTICE_DURATION_CATEGORIES = new Set<ActivityCategory>([
  'VOCAL',
  'DRUMMING',
  'GUITAR',
  'KEYBOARD',
]);

export function DailyTimelineView({
  weekStartIso,
  selectedDate,
  todayIso,
  blocks,
  completions,
  plannedRuns,
  recordedRuns,
  onSelectDate,
  onEditBlock,
  onCreateAtGap,
  onSaveCompletion,
  onClearCompletion,
}: {
  weekStartIso: string;
  selectedDate: string;
  todayIso: string;
  blocks: ScheduleBlock[];
  completions: ScheduleCompletion[];
  plannedRuns: PlannedWorkout[];
  recordedRuns: RunningSession[];
  onSelectDate: (dateIso: string) => void;
  onEditBlock: (block: ScheduleBlock) => void;
  onCreateAtGap: (dateIso: string, startTime: string, endTime: string) => void;
  onSaveCompletion: (draft: ScheduleCompletionDraft) => Promise<void>;
  onClearCompletion: (blockId: string, occurrenceDate: string) => Promise<void>;
}) {
  const [openStrengthBlockId, setOpenStrengthBlockId] = useState<string | null>(null);
  const [practiceModalItem, setPracticeModalItem] = useState<TimelineItem | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const weekDates = getWeekDatesIso(weekStartIso);
  const timeline = buildDailyTimeline(
    selectedDate,
    blocks,
    completions,
    plannedRuns,
    recordedRuns
  );

  async function handleQuickToggle(item: TimelineItem) {
    if (!item.block) return;

    if (item.category === 'STRENGTH') {
      setOpenStrengthBlockId((prev) => (prev === item.block!.id ? null : item.block!.id));
      return;
    }

    if (PRACTICE_DURATION_CATEGORIES.has(item.category)) {
      setPracticeModalItem(item);
      return;
    }

    setSavingId(item.block.id);
    try {
      if (item.isCompleted) {
        await onClearCompletion(item.block.id, selectedDate);
      } else {
        await onSaveCompletion({
          block_id: item.block.id,
          occurrence_date: selectedDate,
          status: 'COMPLETED',
          strength_focus: null,
          duration_min: item.durationMin,
          physical_load: item.block.physical_load,
          notes: null,
        });
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mon-Sun Category Dot Strip */}
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2">
        <div className="grid grid-cols-7 gap-1">
          {weekDates.map((dateIso, idx) => {
            const isSelected = dateIso === selectedDate;
            const isToday = dateIso === todayIso;
            const dayNum = Number(dateIso.slice(8, 10));
            const dots = getCategoryDotsForDate(dateIso, blocks, plannedRuns, recordedRuns);

            return (
              <button
                key={dateIso}
                type="button"
                onClick={() => {
                  setOpenStrengthBlockId(null);
                  onSelectDate(dateIso);
                }}
                className={`flex flex-col items-center rounded-[10px] py-2 transition-colors ${
                  isSelected
                    ? 'bg-[var(--blue)] text-white dark:text-[#121315]'
                    : isToday
                      ? 'border border-[var(--blue)]/40 bg-[var(--blue-lite)] text-[var(--blue-ink)]'
                      : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
                }`}
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.06em] ${
                    isSelected ? 'opacity-80' : 'text-[var(--muted)]'
                  }`}
                >
                  {DAY_LABELS[idx]}
                </span>
                <span className="mt-0.5 font-mono text-[14px] font-bold tabular-nums">
                  {dayNum}
                </span>
                <div className="mt-1.5 flex h-1.5 items-center gap-0.5">
                  {dots.map((cat) => (
                    <span
                      key={cat}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: isSelected ? 'currentColor' : CATEGORY_COLORS[cat],
                        opacity: isSelected ? 0.85 : 1,
                      }}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Leg-Fatigue Protection Banner */}
      {timeline.legFatigueWarning && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{timeline.legFatigueWarning}</span>
        </div>
      )}

      {/* Day Timeline Container */}
      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)]">
        {/* Hairline Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface-2)]/50 px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-[15px] font-bold text-[var(--ink)]">
                {selectedDate}
              </h2>
              {selectedDate === todayIso && (
                <span className="rounded-[5px] bg-[var(--blue-lite)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--blue-ink)]">
                  TODAY
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
              {timeline.totalCheckableCount > 0
                ? `${timeline.completedCount} of ${timeline.totalCheckableCount} daily commitments checked off`
                : 'No recurring or timed commitments for this day yet.'}
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] font-medium text-[var(--muted)]">
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5">
              {timeline.timedItems.length} timed
            </span>
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5">
              {timeline.allDayItems.length} flexible
            </span>
          </div>
        </div>

        <div className="space-y-3 p-5">
          {/* All-Day / Flexible Rows */}
          {timeline.allDayItems.length > 0 && (
            <div className="space-y-2 border-b border-[var(--line)] pb-4">
              {timeline.allDayItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="w-12 shrink-0 text-right font-mono text-[10.5px] font-medium text-[var(--faint)]">
                    All-day
                  </div>
                  <div className="flex w-9 shrink-0 justify-center">
                    <CategoryMark category={item.category} />
                  </div>
                  <div
                    style={{ '--cat-color': CATEGORY_COLORS[item.category] } as CSSProperties}
                    className="stride-cal-event flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-bold text-[var(--ink)]">
                          {item.title}
                        </span>
                        <ProvenanceBadge origin={item.origin} />
                      </div>
                      {item.subtitle && (
                        <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                    {item.block && (
                      <button
                        type="button"
                        onClick={() => onEditBlock(item.block!)}
                        aria-label={`Edit ${item.title}`}
                        className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vertical Hourly Timeline */}
          {timeline.entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[var(--blue-lite)] text-[var(--blue)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-[var(--ink)]">
                Open timeline for {selectedDate}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--muted)]">
                Add a timed block, slot an item from your Unscheduled Inbox, or seed your recurring
                commitments from the top bar.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {timeline.entries.map((entry, idx) => {
                if (entry.type === 'GAP') {
                  const startStr = formatMinutesToTime(entry.gap.startMin);
                  const endStr = formatMinutesToTime(entry.gap.endMin);
                  return (
                    <div key={`gap-${idx}`} className="group flex items-center gap-3 py-0.5">
                      <div className="w-12 shrink-0 text-right font-mono text-[10px] text-[var(--faint)]">
                        {startStr}
                      </div>
                      <div className="flex w-9 shrink-0 justify-center">
                        <div className="h-6 border-l border-dashed border-[var(--line-strong)]" />
                      </div>
                      <button
                        type="button"
                        onClick={() => onCreateAtGap(selectedDate, startStr, endStr)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-transparent px-2.5 py-1 text-[11.5px] font-medium text-[var(--muted)] transition-colors hover:border-[var(--blue)]/50 hover:bg-[var(--blue-lite)]/60 hover:text-[var(--blue-ink)]"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatDurationCompact(entry.gap.durationMin)} free</span>
                        <span className="hidden items-center gap-0.5 font-bold group-hover:inline-flex">
                          · <Plus className="h-3 w-3" /> Slot block
                        </span>
                      </button>
                    </div>
                  );
                }

                const { item } = entry;
                const startStr =
                  item.startMin !== null ? formatMinutesToTime(item.startMin) : '';
                const endStr = item.endMin !== null ? formatMinutesToTime(item.endMin) : '';
                const isStrengthPopoverOpen =
                  item.block && openStrengthBlockId === item.block.id;
                const isDone = item.isCompleted || item.isAppRest;
                const catColor = CATEGORY_COLORS[item.category];
                const isPractice = PRACTICE_DURATION_CATEGORIES.has(item.category);
                const actualLoggedMin = item.completion?.duration_min ?? null;

                return (
                  <div key={item.id}>
                    <div className="flex items-center gap-3">
                      {/* Centered Time Rail */}
                      <div className="flex w-12 shrink-0 flex-col items-end font-mono text-[11px] tabular-nums text-[var(--muted)]">
                        <span className="font-semibold text-[var(--ink)]">{startStr}</span>
                        {endStr && (
                          <span className="text-[10px] text-[var(--faint)]">{endStr}</span>
                        )}
                      </div>

                      {/* Single Centered CategoryMark */}
                      <div className={`flex w-9 shrink-0 justify-center ${isDone ? 'opacity-50' : ''}`}>
                        <CategoryMark category={item.category} />
                      </div>

                      {/* Content Card */}
                      <div
                        style={{ '--cat-color': catColor } as CSSProperties}
                        className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--line-strong)] ${
                          isDone ? 'opacity-75' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-[var(--muted)]">
                            <span>
                              {startStr}–{endStr} ({formatDurationCompact(item.durationMin)})
                            </span>
                            {isPractice && item.isCompleted && actualLoggedMin !== null && (
                              <button
                                type="button"
                                onClick={() => setPracticeModalItem(item)}
                                className="stride-cat-mark rounded-md px-1.5 py-0.5 text-[10px] font-bold hover:opacity-85"
                              >
                                {actualLoggedMin}m actual
                              </button>
                            )}
                            {item.physicalLoad === 'HIGH' && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-700 dark:text-amber-300">
                                HIGH LOAD
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[13.5px] font-bold ${
                                isDone
                                  ? 'text-[var(--faint)] line-through'
                                  : 'text-[var(--ink)]'
                              }`}
                            >
                              {item.title}
                            </span>
                            <CategoryBadge category={item.category} />
                          </div>

                          <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
                            {item.completion?.notes ||
                              item.subtitle ||
                              CATEGORY_SHORT_LABELS[item.category]}
                          </p>
                        </div>

                        {/* Vertically Centered Actions */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          {item.block && (
                            <button
                              type="button"
                              onClick={() => onEditBlock(item.block!)}
                              aria-label={`Edit ${item.title}`}
                              className="rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {item.kind === 'BLOCK' && item.block && (
                            <button
                              type="button"
                              disabled={savingId === item.block.id}
                              onClick={() => void handleQuickToggle(item)}
                              aria-label={
                                item.category === 'STRENGTH'
                                  ? `Log Home Workout focus for ${item.title}`
                                  : isPractice
                                    ? `Log actual duration for ${item.title}`
                                    : `Toggle completion for ${item.title}`
                              }
                              className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-colors ${
                                item.isCompleted
                                  ? 'border-[var(--blue)] bg-[var(--blue)] text-white dark:text-[#121315]'
                                  : item.isAppRest
                                    ? 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)]'
                                    : 'border-[var(--line-strong)] bg-[var(--surface)] text-transparent hover:border-[var(--blue)]'
                              }`}
                            >
                              {(item.isCompleted || item.isAppRest) && (
                                <Check className="h-3.5 w-3.5 stroke-[2.75]" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Inline Rotating Home Workout Focus Picker */}
                    {isStrengthPopoverOpen && item.block && (
                      <div className="pl-[6.25rem]">
                        <StrengthFocusPopover
                          blockId={item.block.id}
                          occurrenceDate={selectedDate}
                          defaultDurationMin={item.durationMin}
                          existingCompletion={item.completion}
                          saving={savingId === item.block.id}
                          onSave={async (draft) => {
                            setSavingId(item.block!.id);
                            try {
                              await onSaveCompletion(draft);
                            } finally {
                              setSavingId(null);
                            }
                          }}
                          onClear={
                            item.completion
                              ? async () => {
                                  setSavingId(item.block!.id);
                                  try {
                                    await onClearCompletion(item.block!.id, selectedDate);
                                  } finally {
                                    setSavingId(null);
                                  }
                                }
                              : undefined
                          }
                          onClose={() => setOpenStrengthBlockId(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Big Tactile Practice Duration Modal (Vocal / Drumming / Guitar / Keyboard) */}
      {practiceModalItem && practiceModalItem.block && (
        <PracticeDurationModal
          title={practiceModalItem.title}
          category={practiceModalItem.category}
          dateLabel={selectedDate}
          plannedMin={practiceModalItem.durationMin}
          initialActualMin={practiceModalItem.completion?.duration_min}
          initialNotes={practiceModalItem.completion?.notes}
          isCompleted={practiceModalItem.isCompleted}
          saving={savingId === practiceModalItem.block.id}
          onSave={async (actualMin, notes) => {
            const blk = practiceModalItem.block!;
            setSavingId(blk.id);
            try {
              await onSaveCompletion({
                block_id: blk.id,
                occurrence_date: selectedDate,
                status: 'COMPLETED',
                strength_focus: null,
                duration_min: actualMin,
                physical_load: blk.physical_load,
                notes,
              });
            } finally {
              setSavingId(null);
            }
          }}
          onUndo={
            practiceModalItem.isCompleted
              ? async () => {
                  const blk = practiceModalItem.block!;
                  setSavingId(blk.id);
                  try {
                    await onClearCompletion(blk.id, selectedDate);
                  } finally {
                    setSavingId(null);
                  }
                }
              : undefined
          }
          onClose={() => setPracticeModalItem(null)}
        />
      )}
    </div>
  );
}
