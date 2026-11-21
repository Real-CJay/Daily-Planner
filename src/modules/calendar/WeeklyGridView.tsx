import { useMemo, type CSSProperties } from 'react';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_SHORT_LABELS } from '@/design-system';
import type {
  PlannedWorkout,
  RunningSession,
  ScheduleBlock,
  ScheduleCompletion,
} from '@/types/domain';
import {
  buildDailyTimeline,
  formatMinutesToTime,
  getWeekDatesIso,
} from './timelineEngine';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_VISIBLE_CARDS = 6;

function formatPrettyTime(min: number | null): string {
  if (min === null) return 'Anytime';
  const raw = formatMinutesToTime(min);
  const [hh, mm] = raw.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return raw;
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}

export function WeeklyGridView({
  weekStartIso,
  todayIso,
  blocks,
  completions,
  plannedRuns,
  recordedRuns,
  onSelectDate,
  onEditBlock,
  onCreateAtSlot,
}: {
  weekStartIso: string;
  todayIso: string;
  blocks: ScheduleBlock[];
  completions: ScheduleCompletion[];
  plannedRuns: PlannedWorkout[];
  recordedRuns: RunningSession[];
  onSelectDate: (dateIso: string) => void;
  onEditBlock: (block: ScheduleBlock) => void;
  onCreateAtSlot?: (dateIso: string, startTime: string, endTime: string) => void;
}) {
  const weekDates = useMemo(() => getWeekDatesIso(weekStartIso), [weekStartIso]);

  const dayTimelines = useMemo(
    () =>
      weekDates.map((d) =>
        buildDailyTimeline(d, blocks, completions, plannedRuns, recordedRuns)
      ),
    [weekDates, blocks, completions, plannedRuns, recordedRuns]
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface)]">
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="grid h-full min-h-0 min-w-[840px] grid-cols-7">
          {dayTimelines.map((dt, idx) => {
            const isToday = dt.dateStr === todayIso;
            const items = [...dt.allDayItems, ...dt.timedItems];
            const visibleItems = items.slice(0, MAX_VISIBLE_CARDS);
            const overflowCount = Math.max(0, items.length - MAX_VISIBLE_CARDS);

            return (
              <section
                key={dt.dateStr}
                style={
                  isToday
                    ? {
                        background:
                          'color-mix(in srgb, var(--blue) 3%, var(--surface))',
                      }
                    : undefined
                }
                className="flex min-h-0 min-w-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] last:border-r-0"
              >
                {/* Column Header (click to open Day view with hours) */}
                <button
                  type="button"
                  onClick={() => onSelectDate(dt.dateStr)}
                  title={`Open daily timeline for ${dt.dateStr}`}
                  className="flex min-h-[78px] w-full shrink-0 flex-col items-start gap-1 border-b border-[var(--line)] px-3.5 py-3 text-left transition-colors hover:bg-[var(--blue-lite)]/40"
                >
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
                    {DAY_LABELS[idx]}
                  </span>
                  <strong
                    className={`font-mono text-[24px] font-bold leading-none tracking-[-0.05em] tabular-nums ${
                      isToday ? 'text-[var(--blue)]' : 'text-[var(--ink)]'
                    }`}
                  >
                    {Number(dt.dateStr.slice(8, 10))}
                  </strong>
                  <small className="mt-0.5 text-[10px] font-medium text-[var(--faint)]">
                    {items.length ? `${items.length} planned` : 'Free day'}
                  </small>
                </button>

                {/* Chronological Activity Cards (no hour grid) */}
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
                  {items.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center text-[11px] text-[var(--faint)]">
                      <span className="relative h-6 w-px bg-[var(--line-strong)]">
                        <span className="absolute -left-[2.5px] -top-1.5 h-1.5 w-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface)]" />
                      </span>
                      <span className="font-medium">Nothing planned</span>
                      <small className="text-[10px] opacity-80">Room to breathe.</small>
                    </div>
                  ) : (
                    <>
                      {visibleItems.map((item) => {
                        const isDone = item.isCompleted || item.isAppRest;
                        const catColor = CATEGORY_COLORS[item.category];
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (item.block) onEditBlock(item.block);
                              else onSelectDate(dt.dateStr);
                            }}
                            style={{ '--cat-color': catColor } as CSSProperties}
                            className={`stride-cal-event flex w-full shrink-0 flex-col gap-0.5 rounded-[7px] px-2.5 py-2 text-left transition-transform hover:-translate-y-px ${
                              isDone ? 'opacity-50' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="stride-cat-label font-mono text-[9.5px] font-bold">
                                {formatPrettyTime(item.startMin)}
                              </span>
                              {isDone && (
                                <Check className="h-3 w-3 shrink-0 text-[var(--muted)]" />
                              )}
                            </div>
                            <span
                              className={`truncate text-[11.5px] font-bold leading-snug text-[var(--ink)] ${
                                isDone ? 'line-through' : ''
                              }`}
                            >
                              {item.title}
                            </span>
                            <span className="truncate text-[9.5px] text-[var(--muted)]">
                              {CATEGORY_SHORT_LABELS[item.category]}
                              {item.durationMin ? ` · ${item.durationMin}m` : ''}
                            </span>
                          </button>
                        );
                      })}

                      {overflowCount > 0 && (
                        <button
                          type="button"
                          onClick={() => onSelectDate(dt.dateStr)}
                          className="inline-flex items-center justify-center gap-0.5 py-1 text-[10.5px] font-bold text-[var(--blue)] hover:underline"
                        >
                          <span>+{overflowCount} more</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Bottom Dashed Add Action */}
                <button
                  type="button"
                  onClick={() => onCreateAtSlot?.(dt.dateStr, '09:00', '09:45')}
                  className="mx-2 mb-2 flex h-8 shrink-0 items-center justify-center gap-1 rounded-[8px] border border-[var(--blue)]/25 bg-[var(--blue-lite)]/65 text-[11px] font-bold text-[var(--blue-ink)] transition-colors hover:border-[var(--blue)] hover:bg-[var(--blue)] hover:text-white dark:hover:text-[#121315]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
