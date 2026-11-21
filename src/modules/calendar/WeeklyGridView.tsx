import { useEffect, useMemo, useRef } from 'react';
import { Check } from 'lucide-react';
import type {
  ActivityCategory,
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
const START_HOUR = 5;
const END_HOUR = 23;
const HOUR_HEIGHT = 76;

const GRID_BLOCK_ACCENT: Record<ActivityCategory, string> = {
  RUNNING:
    'border-l-[#2CCC74] bg-[#EAF9F0] text-[#114A2B] dark:border-l-morgen-red dark:bg-[#381C25] dark:text-[#FFE4E8]',
  KARATE:
    'border-l-[#D97706] bg-[#FEF4D6] text-[#78350F] dark:border-l-morgen-yellow dark:bg-[#362B1A] dark:text-[#FDE68A]',
  STRENGTH:
    'border-l-teal-600 bg-teal-50 text-teal-950 dark:border-l-teal-400 dark:bg-[#143033] dark:text-teal-100',
  RECOVERY:
    'border-l-emerald-600 bg-emerald-50 text-emerald-950 dark:border-l-emerald-400 dark:bg-[#132E25] dark:text-emerald-100',
  VOCAL:
    'border-l-rose-500 bg-rose-50 text-rose-950 dark:border-l-pink-400 dark:bg-[#351D2C] dark:text-pink-100',
  DRUMMING:
    'border-l-violet-600 bg-violet-50 text-violet-950 dark:border-l-violet-400 dark:bg-[#291F3E] dark:text-violet-100',
  GUITAR:
    'border-l-orange-500 bg-orange-50 text-orange-950 dark:border-l-orange-400 dark:bg-[#382317] dark:text-orange-100',
  KEYBOARD:
    'border-l-sky-500 bg-sky-50 text-sky-950 dark:border-l-sky-400 dark:bg-[#152A3A] dark:text-sky-100',
  UNIVERSITY:
    'border-l-slate-600 bg-slate-100 text-slate-900 dark:border-l-morgen-slate dark:bg-[#252B3B] dark:text-slate-100',
  CUSTOM:
    'border-l-slate-500 bg-[#F3F5F4] text-[#161C19] dark:border-l-morgen-muted dark:bg-[#282A38] dark:text-slate-100',
};

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const weekDates = useMemo(() => getWeekDatesIso(weekStartIso), [weekStartIso]);
  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    []
  );

  const dayTimelines = useMemo(
    () =>
      weekDates.map((d) =>
        buildDailyTimeline(d, blocks, completions, plannedRuns, recordedRuns)
      ),
    [weekDates, blocks, completions, plannedRuns, recordedRuns]
  );

  useEffect(() => {
    if (scrollRef.current) {
      // Auto-scroll to 06:00 on mount so morning + daytime hours sit squarely in view
      scrollRef.current.scrollTop = HOUR_HEIGHT;
    }
  }, []);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTopPx = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const showNowLine = nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-morgen-surface">
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
        <div className="flex min-h-0 min-w-[880px] flex-1 flex-col">
          {/* Spacious Weekday Header */}
          <div className="grid shrink-0 grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-[#E5EAE7] bg-[#F8FAF9] dark:border-morgen-border dark:bg-morgen-black">
            <div className="border-r border-[#E5EAE7] dark:border-morgen-border" />
            {weekDates.map((dateIso, idx) => {
              const isToday = dateIso === todayIso;
              return (
                <button
                  key={dateIso}
                  type="button"
                  onClick={() => onSelectDate(dateIso)}
                  title={`Open daily timeline for ${dateIso}`}
                  className={`flex items-center justify-center gap-2.5 border-r border-[#E5EAE7] py-3.5 text-sm font-medium transition-colors last:border-r-0 hover:bg-white dark:border-morgen-border dark:hover:bg-morgen-surface ${
                    isToday ? 'bg-white dark:bg-morgen-surface' : ''
                  }`}
                >
                  <span
                    className={`font-display text-xs font-semibold uppercase tracking-wider ${
                      isToday
                        ? 'text-[#176D3E] dark:text-morgen-rose'
                        : 'text-flomo-slate dark:text-morgen-muted'
                    }`}
                  >
                    {DAY_LABELS[idx]}
                  </span>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-bold tabular-nums ${
                      isToday
                        ? 'bg-[#176D3E] text-white dark:bg-morgen-rose dark:text-white'
                        : 'text-[#161C19] dark:text-white'
                    }`}
                  >
                    {Number(dateIso.slice(8, 10))}
                  </span>
                </button>
              );
            })}
          </div>

          {/* All-Day / Flexible Strip */}
          <div className="grid shrink-0 grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-[#E5EAE7] bg-white dark:border-morgen-border dark:bg-morgen-surface">
            <div className="flex items-center justify-end border-r border-[#E5EAE7] pr-2.5 font-mono text-[10px] font-medium uppercase tracking-wider text-flomo-slate dark:border-morgen-border dark:text-morgen-muted">
              all-day
            </div>
            {dayTimelines.map((dt) => (
              <div
                key={`allday-${dt.dateStr}`}
                className="min-h-[42px] space-y-1.5 border-r border-[#E5EAE7] p-1.5 last:border-r-0 dark:border-morgen-border"
              >
                {dt.allDayItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.title}
                    onClick={() => {
                      if (item.block) onEditBlock(item.block);
                      else onSelectDate(dt.dateStr);
                    }}
                    className={`flex w-full items-center gap-1.5 truncate rounded-lg border-l-[4px] px-2.5 py-1.5 text-left text-xs font-semibold transition-opacity hover:opacity-90 ${
                      GRID_BLOCK_ACCENT[item.category]
                    } ${item.isCompleted || item.isAppRest ? 'opacity-55 line-through' : ''}`}
                  >
                    <span className="truncate">{item.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Scrollable Hourly Time-Block Grid */}
          <div
            ref={scrollRef}
            className="relative grid min-h-0 flex-1 grid-cols-[68px_repeat(7,minmax(0,1fr))] overflow-y-auto"
          >
            {/* Hour Gutter */}
            <div
              className="relative border-r border-[#E5EAE7] bg-[#F8FAF9]/60 dark:border-morgen-border dark:bg-morgen-black/40"
              style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
            >
              {hours.map((h) => (
                <div
                  key={h}
                  style={{ height: `${HOUR_HEIGHT}px` }}
                  className="pr-3 pt-1.5 text-right font-mono text-xs font-medium text-flomo-slate dark:text-morgen-muted"
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* 7 Day Columns */}
            {dayTimelines.map((dt) => {
              const isToday = dt.dateStr === todayIso;
              return (
                <div
                  key={dt.dateStr}
                  style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
                  className={`relative border-r border-[#E5EAE7] last:border-r-0 dark:border-morgen-border ${
                    isToday ? 'bg-[#2CCC74]/[0.03] dark:bg-morgen-rose/[0.03]' : ''
                  }`}
                >
                  {/* Clickable Hour Cells */}
                  {hours.map((h) => {
                    const startStr = `${String(h).padStart(2, '0')}:00`;
                    const endStr = `${String(Math.min(23, h + 1)).padStart(2, '0')}:00`;
                    return (
                      <button
                        key={h}
                        type="button"
                        aria-label={`Add block on ${dt.dateStr} at ${startStr}`}
                        onClick={() => onCreateAtSlot?.(dt.dateStr, startStr, endStr)}
                        style={{ height: `${HOUR_HEIGHT}px` }}
                        className="block w-full border-b border-[#E5EAE7]/80 text-left transition-colors hover:bg-[#2CCC74]/[0.06] dark:border-morgen-border/70 dark:hover:bg-white/[0.025]"
                      />
                    );
                  })}

                  {/* Live Current-Time Line */}
                  {isToday && showNowLine && (
                    <div
                      style={{ top: `${nowTopPx}px` }}
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    >
                      <span className="h-2.5 w-2.5 -translate-x-1 rounded-full bg-[#2CCC74] dark:bg-morgen-red" />
                      <div className="h-[2px] flex-1 bg-[#2CCC74] dark:bg-morgen-red" />
                    </div>
                  )}

                  {/* Positioned Timed Blocks */}
                  {dt.timedItems.map((item) => {
                    if (item.startMin === null) return null;
                    const clampedStart = Math.max(START_HOUR * 60, item.startMin);
                    const topPx = ((clampedStart - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                    const heightPx = Math.max(32, (item.durationMin / 60) * HOUR_HEIGHT - 4);
                    const startLabel = formatMinutesToTime(item.startMin);
                    const endLabel =
                      item.endMin !== null ? formatMinutesToTime(item.endMin) : '';
                    const isDone = item.isCompleted || item.isAppRest;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={`${item.title} (${startLabel}${endLabel ? `–${endLabel}` : ''})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.block) onEditBlock(item.block);
                          else onSelectDate(dt.dateStr);
                        }}
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                        className={`absolute inset-x-1.5 z-10 overflow-hidden rounded-lg border-l-[4px] px-2.5 py-1.5 text-left transition-all hover:brightness-95 dark:hover:brightness-110 ${
                          GRID_BLOCK_ACCENT[item.category]
                        } ${isDone ? 'opacity-55' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span
                            className={`truncate text-xs font-semibold leading-snug ${
                              isDone ? 'line-through' : ''
                            }`}
                          >
                            {item.title}
                          </span>
                          {isDone && (
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" />
                          )}
                        </div>
                        {heightPx >= 48 && (
                          <div className="mt-0.5 truncate font-mono text-[11px] font-medium opacity-80">
                            {startLabel}
                            {endLabel ? `–${endLabel}` : ''}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
