import { useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Calendar,
  Check,
  Clock,
  Dumbbell,
  Edit3,
  Flame,
  Footprints,
  GraduationCap,
  Mic,
  Music,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Card, CategoryBadge, ProvenanceBadge } from '@/design-system';
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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CATEGORY_DOT_COLOR: Record<ActivityCategory, string> = {
  RUNNING: 'bg-[#2CCC74] dark:bg-morgen-red',
  KARATE: 'bg-amber-500 dark:bg-morgen-yellow',
  STRENGTH: 'bg-teal-500 dark:bg-teal-400',
  RECOVERY: 'bg-emerald-500 dark:bg-emerald-400',
  VOCAL: 'bg-rose-400 dark:bg-pink-400',
  DRUMMING: 'bg-violet-500 dark:bg-violet-400',
  GUITAR: 'bg-orange-500 dark:bg-orange-400',
  KEYBOARD: 'bg-sky-500 dark:bg-sky-400',
  UNIVERSITY: 'bg-slate-500 dark:bg-morgen-slate',
  CUSTOM: 'bg-slate-400 dark:bg-morgen-muted',
};

const CATEGORY_CAPSULE_BG: Record<ActivityCategory, string> = {
  RUNNING:
    'bg-[#2CCC74]/15 text-[#176D3E] border-[#2CCC74]/40 dark:bg-morgen-wine dark:text-morgen-red dark:border-morgen-red/40',
  KARATE:
    'bg-[#F4DCA4]/60 text-[#7A5416] border-[#CFBE9A] dark:bg-morgen-yellow/15 dark:text-morgen-yellow dark:border-morgen-yellow/40',
  STRENGTH:
    'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-400/40',
  RECOVERY:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/40',
  VOCAL:
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-400/40',
  DRUMMING:
    'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-400/40',
  GUITAR:
    'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-400/40',
  KEYBOARD:
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/40',
  UNIVERSITY:
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-morgen-slate/20 dark:text-[#C5D0DE] dark:border-morgen-slate/40',
  CUSTOM:
    'bg-[#F7F9F8] text-[#525C57] border-[#E5EAE7] dark:bg-morgen-elevated dark:text-morgen-body dark:border-morgen-border',
};

function CategoryIcon({ category }: { category: ActivityCategory }) {
  switch (category) {
    case 'RUNNING':
      return <Footprints className="h-4 w-4" />;
    case 'KARATE':
      return <Flame className="h-4 w-4" />;
    case 'STRENGTH':
      return <Dumbbell className="h-4 w-4" />;
    case 'RECOVERY':
      return <BatteryCharging className="h-4 w-4" />;
    case 'VOCAL':
      return <Mic className="h-4 w-4" />;
    case 'DRUMMING':
    case 'GUITAR':
    case 'KEYBOARD':
      return <Music className="h-4 w-4" />;
    case 'UNIVERSITY':
      return <GraduationCap className="h-4 w-4" />;
    default:
      return <Calendar className="h-4 w-4" />;
  }
}

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
      {/* Mon–Sun Category Dot Strip */}
      <Card className="p-3">
        <div className="grid grid-cols-7 gap-1.5">
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
                className={`flex flex-col items-center rounded-xl py-2 transition-colors ${
                  isSelected
                    ? 'bg-[#176D3E] text-white dark:bg-morgen-rose dark:text-white'
                    : isToday
                      ? 'border border-[#2CCC74]/60 bg-[#2CCC74]/10 text-[#161C19] dark:border-morgen-red/50 dark:bg-morgen-wine/50 dark:text-white'
                      : 'text-[#525C57] hover:bg-[#F7F9F8] dark:text-morgen-body dark:hover:bg-morgen-elevated'
                }`}
              >
                <span
                  className={`text-[10px] font-medium uppercase tracking-wider ${
                    isSelected ? 'text-white/80' : 'text-flomo-slate dark:text-morgen-muted'
                  }`}
                >
                  {DAY_LABELS[idx]}
                </span>
                <span className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                  {dayNum}
                </span>
                <div className="mt-1.5 flex h-1.5 items-center gap-0.5">
                  {dots.map((cat) => (
                    <span
                      key={cat}
                      className={`h-1.5 w-1.5 rounded-full ${
                        isSelected ? 'bg-white/85' : CATEGORY_DOT_COLOR[cat]
                      }`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Leg-Fatigue Protection Banner */}
      {timeline.legFatigueWarning && (
        <div className="flex items-start gap-3 rounded-xl border border-[#CFBE9A] bg-[#F4DCA4]/40 px-4 py-3 text-xs text-[#6D5627] dark:border-morgen-yellow/40 dark:bg-morgen-yellow/10 dark:text-morgen-yellow">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{timeline.legFatigueWarning}</span>
        </div>
      )}

      {/* Day Header & Progress */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E5EAE7] pb-3.5 dark:border-morgen-border">
          <div>
            <h2 className="font-display text-lg font-bold text-[#161C19] dark:font-sans dark:text-white">
              {selectedDate}{' '}
              {selectedDate === todayIso && (
                <span className="ml-1.5 rounded-md bg-[#2CCC74]/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#176D3E] dark:bg-morgen-wine dark:text-morgen-red">
                  TODAY
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-flomo-slate dark:text-morgen-muted">
              {timeline.totalCheckableCount > 0
                ? `${timeline.completedCount} of ${timeline.totalCheckableCount} daily commitments checked off`
                : 'No recurring or timed commitments for this day yet.'}
            </p>
          </div>
          <div className="font-mono text-xs text-flomo-slate dark:text-morgen-muted">
            {timeline.timedItems.length} timed · {timeline.allDayItems.length} flexible
          </div>
        </div>

        {/* All-Day / Flexible Strip (Protected Rest, Unscheduled Planned Runs) */}
        {timeline.allDayItems.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {timeline.allDayItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 rounded-xl border border-[#E5EAE7] bg-[#F7F9F8] px-3 py-2 dark:border-morgen-border dark:bg-morgen-elevated"
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border ${CATEGORY_CAPSULE_BG[item.category]}`}
                >
                  <CategoryIcon category={item.category} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#161C19] dark:text-white">
                    <span>{item.title}</span>
                    <ProvenanceBadge origin={item.origin} />
                  </div>
                  {item.subtitle && (
                    <div className="text-[11px] text-flomo-slate dark:text-morgen-muted">
                      {item.subtitle}
                    </div>
                  )}
                </div>
                {item.block && (
                  <button
                    type="button"
                    onClick={() => onEditBlock(item.block!)}
                    aria-label={`Edit ${item.title}`}
                    className="ml-1 rounded-md p-1 text-flomo-slate hover:bg-white hover:text-[#161C19] dark:text-morgen-muted dark:hover:bg-morgen-surface dark:hover:text-white"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Vertical Proportional Chronological Timeline */}
        {timeline.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Sparkles className="mb-2 h-6 w-6 text-[#2CCC74] dark:text-morgen-red" />
            <p className="text-sm font-medium text-[#161C19] dark:text-white">
              Open timeline for {selectedDate}
            </p>
            <p className="mt-1 max-w-sm text-xs text-flomo-slate dark:text-morgen-muted">
              Add a timed block, slot an item from your Unscheduled Inbox, or seed your recurring
              Home Workout, Karate, Vocal, and Drumming commitments.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {timeline.entries.map((entry, idx) => {
              if (entry.type === 'GAP') {
                const startStr = formatMinutesToTime(entry.gap.startMin);
                const endStr = formatMinutesToTime(entry.gap.endMin);
                return (
                  <div
                    key={`gap-${idx}`}
                    className="group flex items-center gap-3 py-1.5 pl-1"
                  >
                    <div className="w-12 shrink-0 text-right font-mono text-[10px] text-flomo-slate/60 dark:text-morgen-muted/60">
                      {startStr}
                    </div>
                    <div className="flex w-10 shrink-0 justify-center">
                      <div className="h-7 border-l border-dashed border-[#D8E0DC] dark:border-morgen-border" />
                    </div>
                    <button
                      type="button"
                      onClick={() => onCreateAtGap(selectedDate, startStr, endStr)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-transparent px-2.5 py-1 text-xs text-flomo-slate transition-colors hover:border-[#2CCC74]/50 hover:bg-[#2CCC74]/5 hover:text-[#176D3E] dark:text-morgen-muted dark:hover:border-morgen-red/40 dark:hover:bg-morgen-wine/40 dark:hover:text-morgen-red"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatDurationCompact(entry.gap.durationMin)} free</span>
                      <span className="hidden items-center gap-0.5 font-medium group-hover:inline-flex">
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
              const capsuleHeight = Math.max(44, Math.min(88, Math.round(item.durationMin * 0.85)));
              const isStrengthPopoverOpen =
                item.block && openStrengthBlockId === item.block.id;

              return (
                <div key={item.id} className="py-1">
                  <div className="flex items-start gap-3">
                    {/* Start / End Time Rail */}
                    <div className="flex w-12 shrink-0 flex-col items-end justify-between pt-1 font-mono text-[11px] tabular-nums text-flomo-slate dark:text-morgen-muted">
                      <span>{startStr}</span>
                      {item.durationMin >= 45 && (
                        <span className="mt-4 text-[10px] opacity-65">{endStr}</span>
                      )}
                    </div>

                    {/* Proportional Icon Capsule */}
                    <div className="flex w-10 shrink-0 flex-col items-center">
                      <div
                        style={{ minHeight: `${capsuleHeight}px` }}
                        className={`flex w-10 items-center justify-center rounded-full border transition-opacity ${
                          CATEGORY_CAPSULE_BG[item.category]
                        } ${item.isCompleted || item.isAppRest ? 'opacity-65' : ''}`}
                      >
                        <CategoryIcon category={item.category} />
                      </div>
                    </div>

                    {/* Content Row */}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-flomo-slate dark:text-morgen-muted">
                            <span>
                              {startStr}–{endStr} ({formatDurationCompact(item.durationMin)})
                            </span>
                            {item.physicalLoad === 'HIGH' && (
                              <span className="rounded bg-[#F4DCA4]/60 px-1.5 py-0.5 text-[10px] font-semibold text-[#7A5416] dark:bg-morgen-yellow/15 dark:text-morgen-yellow">
                                HIGH LOAD
                              </span>
                            )}
                          </div>

                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-semibold ${
                                item.isCompleted || item.isAppRest
                                  ? 'text-flomo-slate line-through dark:text-morgen-muted'
                                  : 'text-[#161C19] dark:text-white'
                              }`}
                            >
                              {item.title}
                            </span>
                            <CategoryBadge category={item.category} />
                          </div>

                          {item.subtitle && (
                            <p className="mt-0.5 text-xs text-flomo-slate dark:text-morgen-body/75">
                              {item.subtitle}
                            </p>
                          )}
                        </div>

                        {/* Actions: Edit + 1-Tap Check Circle */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          {item.block && (
                            <button
                              type="button"
                              onClick={() => onEditBlock(item.block!)}
                              aria-label={`Edit ${item.title}`}
                              className="rounded-lg p-1.5 text-flomo-slate hover:bg-[#F7F9F8] hover:text-[#161C19] dark:text-morgen-muted dark:hover:bg-morgen-elevated dark:hover:text-white"
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
                                  : `Toggle completion for ${item.title}`
                              }
                              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                                item.isCompleted
                                  ? 'border-[#176D3E] bg-[#176D3E] text-white dark:border-morgen-red dark:bg-morgen-red dark:text-morgen-black'
                                  : item.isAppRest
                                    ? 'border-slate-300 bg-slate-100 text-slate-500 dark:border-morgen-border dark:bg-morgen-elevated dark:text-morgen-muted'
                                    : 'border-[#CFD9D3] bg-transparent hover:border-[#176D3E] dark:border-morgen-border dark:hover:border-morgen-red'
                              }`}
                            >
                              {(item.isCompleted || item.isAppRest) && (
                                <Check className="h-3.5 w-3.5 stroke-[2.75]" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline Rotating Home Workout Focus Picker */}
                      {isStrengthPopoverOpen && item.block && (
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
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
