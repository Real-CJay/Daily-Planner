import {
  STRENGTH_FOCUS_LABELS,
  STRENGTH_FOCUS_LOAD,
  type ActivityCategory,
  type PhysicalLoadLevel,
  type PlannedWorkout,
  type RunningSession,
  type ScheduleBlock,
  type ScheduleCompletion,
} from '@/types/domain';

export interface TimelineItem {
  id: string;
  kind: 'BLOCK' | 'PLANNED_RUN' | 'RECORDED_RUN';
  title: string;
  subtitle: string | null;
  category: ActivityCategory;
  startMin: number | null;
  endMin: number | null;
  durationMin: number;
  physicalLoad: PhysicalLoadLevel;
  isCompleted: boolean;
  isAppRest: boolean;
  origin: 'RECORDED' | 'PLANNED' | 'SUGGESTED';
  block?: ScheduleBlock;
  completion?: ScheduleCompletion;
  plannedRun?: PlannedWorkout;
  recordedRun?: RunningSession;
}

export interface FreeGap {
  startMin: number;
  endMin: number;
  durationMin: number;
}

export type TimelineEntry =
  | { type: 'ITEM'; item: TimelineItem }
  | { type: 'GAP'; gap: FreeGap };

export interface DailyTimelineResult {
  dateStr: string;
  allDayItems: TimelineItem[];
  timedItems: TimelineItem[];
  entries: TimelineEntry[];
  legFatigueWarning: string | null;
  completedCount: number;
  totalCheckableCount: number;
}

const QUALITY_WORKOUT_TYPES = new Set([
  'TEMPO',
  'INTERVALS',
  'LONG',
  'PROGRESSION',
  'TIME_TRIAL',
  'RACE',
]);

export function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDurationCompact(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function getIsoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDaysIso(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getMondayIso(dateStr: string): string {
  const weekday = getIsoWeekday(dateStr);
  return addDaysIso(dateStr, -(weekday - 1));
}

export function getWeekDatesIso(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(mondayStr, i));
}

export function blockAppliesToDate(block: ScheduleBlock, dateStr: string): boolean {
  if (block.is_recurring) {
    const weekday = getIsoWeekday(dateStr);
    return block.recurrence_days.includes(weekday);
  }
  return block.block_date === dateStr;
}

function formatRunSubtitle(distanceM: number, durationS: number | null): string {
  const km = (distanceM / 1000).toFixed(2);
  if (!durationS || durationS <= 0) return `${km} km target`;
  const mins = Math.floor(durationS / 60);
  const secs = durationS % 60;
  return `${km} km · ${mins}:${String(secs).padStart(2, '0')}`;
}

function hasHighLegLoadOnDate(
  dateStr: string,
  blocks: ScheduleBlock[],
  completions: ScheduleCompletion[]
): string | null {
  const dayCompletions = completions.filter((c) => c.occurrence_date === dateStr);
  for (const c of dayCompletions) {
    if (c.status === 'COMPLETED' && c.strength_focus) {
      const load = STRENGTH_FOCUS_LOAD[c.strength_focus];
      if (load === 'HIGH') {
        return `Home Workout (${STRENGTH_FOCUS_LABELS[c.strength_focus]})`;
      }
    }
  }

  for (const b of blocks) {
    if (!blockAppliesToDate(b, dateStr)) continue;
    if (b.category === 'KARATE' && b.physical_load === 'HIGH') {
      return b.title;
    }
  }
  return null;
}

export function buildDailyTimeline(
  dateStr: string,
  blocks: ScheduleBlock[],
  completions: ScheduleCompletion[],
  plannedRuns: PlannedWorkout[] = [],
  recordedRuns: RunningSession[] = [],
  minGapMinutes = 20
): DailyTimelineResult {
  const completionByBlockId = new Map<string, ScheduleCompletion>();
  for (const c of completions) {
    if (c.occurrence_date === dateStr) {
      completionByBlockId.set(c.block_id, c);
    }
  }

  const allDayItems: TimelineItem[] = [];
  const timedItems: TimelineItem[] = [];

  for (const block of blocks) {
    if (!blockAppliesToDate(block, dateStr)) continue;

    const completion = completionByBlockId.get(block.id);
    const startMin = parseTimeToMinutes(block.start_time);
    const rawEndMin = parseTimeToMinutes(block.end_time);
    const durationMin =
      completion?.duration_min ??
      block.duration_min ??
      (startMin !== null && rawEndMin !== null && rawEndMin > startMin
        ? rawEndMin - startMin
        : 30);
    const endMin =
      startMin !== null
        ? rawEndMin !== null && rawEndMin > startMin
          ? rawEndMin
          : Math.min(24 * 60, startMin + durationMin)
        : null;

    const isAppRest =
      completion?.status === 'REST_DAY' || completion?.strength_focus === 'APP_REST';
    const isCompleted =
      completion?.status === 'COMPLETED' ||
      (!block.is_recurring && block.status === 'COMPLETED');

    const effectiveLoad: PhysicalLoadLevel = completion
      ? completion.physical_load
      : block.physical_load;

    let subtitle: string | null = block.notes;
    if (block.category === 'STRENGTH' && completion?.strength_focus) {
      subtitle = `${STRENGTH_FOCUS_LABELS[completion.strength_focus]} · ${
        effectiveLoad === 'HIGH'
          ? 'High leg load'
          : effectiveLoad === 'NONE'
            ? 'Zero leg load'
            : 'Low leg load'
      }`;
    }

    const item: TimelineItem = {
      id: `block-${block.id}`,
      kind: 'BLOCK',
      title: block.title,
      subtitle,
      category: block.category,
      startMin,
      endMin,
      durationMin,
      physicalLoad: effectiveLoad,
      isCompleted,
      isAppRest,
      origin: isCompleted ? 'RECORDED' : block.data_origin,
      block,
      completion,
    };

    if (startMin === null) {
      allDayItems.push(item);
    } else {
      timedItems.push(item);
    }
  }

  // Recorded runs for the day
  const dayRecordedRuns = recordedRuns.filter((r) => r.session_date === dateStr);
  for (const run of dayRecordedRuns) {
    const startMin = parseTimeToMinutes(run.start_time);
    const durationMin = Math.max(10, Math.round(run.duration_s / 60));
    const endMin = startMin !== null ? Math.min(24 * 60, startMin + durationMin) : null;

    const item: TimelineItem = {
      id: `run-${run.id}`,
      kind: 'RECORDED_RUN',
      title: `Run · ${run.workout_type.replace('_', ' ')}`,
      subtitle: formatRunSubtitle(run.distance_m, run.duration_s),
      category: 'RUNNING',
      startMin,
      endMin,
      durationMin,
      physicalLoad: QUALITY_WORKOUT_TYPES.has(run.workout_type) ? 'HIGH' : 'MODERATE',
      isCompleted: true,
      isAppRest: false,
      origin: 'RECORDED',
      recordedRun: run,
    };

    if (startMin === null) {
      allDayItems.push(item);
    } else {
      timedItems.push(item);
    }
  }

  // Planned runs not already linked to a recorded run today
  const dayPlannedRuns = plannedRuns.filter((p) => p.plan_date === dateStr);
  for (const plan of dayPlannedRuns) {
    if (plan.status === 'COMPLETED' && dayRecordedRuns.length > 0) continue;
    const durationMin = plan.target_duration_s
      ? Math.max(15, Math.round(plan.target_duration_s / 60))
      : Math.max(20, Math.round((plan.target_distance_m / 1000) * 6));

    allDayItems.push({
      id: `plan-${plan.id}`,
      kind: 'PLANNED_RUN',
      title: plan.title,
      subtitle: formatRunSubtitle(plan.target_distance_m, plan.target_duration_s),
      category: 'RUNNING',
      startMin: null,
      endMin: null,
      durationMin,
      physicalLoad: QUALITY_WORKOUT_TYPES.has(plan.workout_type) ? 'HIGH' : 'MODERATE',
      isCompleted: plan.status === 'COMPLETED',
      isAppRest: false,
      origin: plan.data_origin,
      plannedRun: plan,
    });
  }

  timedItems.sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0));

  // Interleave free-time gaps >= minGapMinutes
  const entries: TimelineEntry[] = [];
  let latestEndMin: number | null = null;

  for (const item of timedItems) {
    if (latestEndMin !== null && item.startMin !== null) {
      const gapMins = item.startMin - latestEndMin;
      if (gapMins >= minGapMinutes) {
        entries.push({
          type: 'GAP',
          gap: {
            startMin: latestEndMin,
            endMin: item.startMin,
            durationMin: gapMins,
          },
        });
      }
    }
    entries.push({ type: 'ITEM', item });
    if (item.endMin !== null) {
      latestEndMin = latestEndMin === null ? item.endMin : Math.max(latestEndMin, item.endMin);
    }
  }

  // Check leg-fatigue protection: quality/long run stacked on same day or day after High Leg Load
  const hasQualityRunToday = dayPlannedRuns.some((p) =>
    QUALITY_WORKOUT_TYPES.has(p.workout_type)
  );
  let legFatigueWarning: string | null = null;

  if (hasQualityRunToday) {
    const todayLoadSource = hasHighLegLoadOnDate(dateStr, blocks, completions);
    const yesterdayLoadSource = hasHighLegLoadOnDate(
      addDaysIso(dateStr, -1),
      blocks,
      completions
    );
    if (todayLoadSource) {
      legFatigueWarning = `Leg-fatigue alert: ${todayLoadSource} is stacked on the same day as a quality/long run. Consider switching the run to Easy if legs feel heavy.`;
    } else if (yesterdayLoadSource) {
      legFatigueWarning = `Leg-fatigue alert: Yesterday included ${yesterdayLoadSource}. Monitor soreness before pushing pace targets today.`;
    }
  }

  const checkable = [...allDayItems, ...timedItems].filter(
    (i) => i.kind === 'BLOCK' && i.category !== 'RECOVERY'
  );
  const completedCount = checkable.filter((i) => i.isCompleted || i.isAppRest).length;

  return {
    dateStr,
    allDayItems,
    timedItems,
    entries,
    legFatigueWarning,
    completedCount,
    totalCheckableCount: checkable.length,
  };
}

export function getUnscheduledInboxBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return blocks.filter(
    (b) =>
      !b.is_recurring &&
      b.start_time === null &&
      b.status === 'PLANNED' &&
      b.category !== 'RECOVERY'
  );
}

export function getCategoryDotsForDate(
  dateStr: string,
  blocks: ScheduleBlock[],
  plannedRuns: PlannedWorkout[] = [],
  recordedRuns: RunningSession[] = []
): ActivityCategory[] {
  const seen = new Set<ActivityCategory>();
  if (
    recordedRuns.some((r) => r.session_date === dateStr) ||
    plannedRuns.some((p) => p.plan_date === dateStr)
  ) {
    seen.add('RUNNING');
  }
  for (const b of blocks) {
    if (blockAppliesToDate(b, dateStr)) {
      seen.add(b.category);
    }
  }
  return Array.from(seen).slice(0, 5);
}
