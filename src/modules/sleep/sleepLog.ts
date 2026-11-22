import { addDaysIso, getMondayIso, getWeekDatesIso } from '@/modules/calendar/timelineEngine';
import type { ScheduleBlock, ScheduleBlockDraft } from '@/types/domain';

export type SleepQualityLabel = 'Excellent' | 'Good' | 'General' | 'Fair' | 'Poor';
export const SLEEP_QUALITY_OPTIONS: SleepQualityLabel[] = [
  'Excellent',
  'Good',
  'General',
  'Fair',
  'Poor',
];

export interface SleepLogMeta {
  bedTime: string; // HH:MM
  wakeTime: string; // HH:MM
  totalMin: number;
  sleepScore: number | null;
  quality: SleepQualityLabel | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
  awakeMin: number | null;
  napMin: number | null;
  awakeCount: number | null;
  notes: string | null;
}

export interface SleepLogEntry {
  id: string;
  block: ScheduleBlock;
  date: string; // YYYY-MM-DD (wake date)
  meta: SleepLogMeta;
}

export interface SleepStats {
  checkedToday: boolean;
  currentStreak: number;
  bestStreak: number;
  weekAvgMin: number;
  weekAvgScore: number | null;
  weekCount: number;
  weekStatus: { date: string; completed: boolean; minutes: number }[];
}

const SLEEP_META_PREFIX = '__SLEEP_LOG__:';

export function calculateSleepDurationMin(bedTime: string, wakeTime: string): number {
  const [bh, bm] = bedTime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  if ([bh, bm, wh, wm].some((n) => Number.isNaN(n))) return 420;
  const bedTotal = bh * 60 + bm;
  const wakeTotal = wh * 60 + wm;
  let diff = wakeTotal - bedTotal;
  if (diff <= 0) diff += 1440;
  return Math.max(15, Math.min(1200, diff));
}

export function formatMinutesAsHrMin(totalMin: number): string {
  const safe = Math.max(0, Math.round(totalMin));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function serializeSleepMeta(meta: SleepLogMeta): string {
  return `${SLEEP_META_PREFIX}${JSON.stringify(meta)}`;
}

export function isSleepBlock(block: ScheduleBlock): boolean {
  return Boolean(block.notes && block.notes.startsWith(SLEEP_META_PREFIX));
}

export function parseSleepMeta(block: ScheduleBlock): SleepLogMeta | null {
  if (!block.notes || !block.notes.startsWith(SLEEP_META_PREFIX)) return null;
  try {
    const parsed = JSON.parse(block.notes.slice(SLEEP_META_PREFIX.length)) as Partial<SleepLogMeta>;
    const bedTime = parsed.bedTime || '23:00';
    const wakeTime = parsed.wakeTime || '06:30';
    const totalMin =
      typeof parsed.totalMin === 'number' && parsed.totalMin > 0
        ? parsed.totalMin
        : block.duration_min ?? calculateSleepDurationMin(bedTime, wakeTime);
    return {
      bedTime,
      wakeTime,
      totalMin,
      sleepScore: typeof parsed.sleepScore === 'number' ? parsed.sleepScore : null,
      quality: parsed.quality ?? null,
      deepMin: typeof parsed.deepMin === 'number' ? parsed.deepMin : null,
      lightMin: typeof parsed.lightMin === 'number' ? parsed.lightMin : null,
      remMin: typeof parsed.remMin === 'number' ? parsed.remMin : null,
      awakeMin: typeof parsed.awakeMin === 'number' ? parsed.awakeMin : null,
      napMin: typeof parsed.napMin === 'number' ? parsed.napMin : null,
      awakeCount: typeof parsed.awakeCount === 'number' ? parsed.awakeCount : null,
      notes: parsed.notes ?? null,
    };
  } catch {
    return null;
  }
}

export function extractSleepEntries(blocks: ScheduleBlock[]): SleepLogEntry[] {
  const entries: SleepLogEntry[] = [];
  for (const b of blocks) {
    const meta = parseSleepMeta(b);
    if (!meta) continue;
    entries.push({
      id: b.id,
      block: b,
      date: b.block_date,
      meta,
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export function buildSleepBlockDraft(date: string, meta: SleepLogMeta): ScheduleBlockDraft {
  return {
    title: `Sleep · ${formatMinutesAsHrMin(meta.totalMin)}`,
    category: 'RECOVERY',
    block_date: date,
    start_time: meta.bedTime || null,
    end_time: meta.wakeTime || null,
    duration_min: Math.max(15, Math.round(meta.totalMin)),
    is_recurring: false,
    recurrence_days: [],
    status: 'COMPLETED',
    physical_load: 'NONE',
    notes: serializeSleepMeta(meta),
  };
}

export function calculateSleepStats(entries: SleepLogEntry[], todayIso: string): SleepStats {
  const byDate = new Map<string, number>();
  for (const e of entries) {
    byDate.set(e.date, Math.max(byDate.get(e.date) ?? 0, e.meta.totalMin));
  }

  const dates = new Set(byDate.keys());
  const checkedToday = dates.has(todayIso);

  let currentStreak = 0;
  let cursor = checkedToday ? todayIso : addDaysIso(todayIso, -1);
  while (dates.has(cursor)) {
    currentStreak++;
    cursor = addDaysIso(cursor, -1);
  }

  const sorted = Array.from(dates).sort();
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) run = 1;
    else run = sorted[i] === addDaysIso(sorted[i - 1], 1) ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
  }

  const monday = getMondayIso(todayIso);
  const weekDates = getWeekDatesIso(monday);
  const weekSet = new Set(weekDates);
  const weekEntries = entries.filter((e) => weekSet.has(e.date));
  const weekAvgMin =
    weekEntries.length > 0
      ? Math.round(weekEntries.reduce((s, e) => s + e.meta.totalMin, 0) / weekEntries.length)
      : 0;
  const scored = weekEntries.filter((e) => e.meta.sleepScore !== null);
  const weekAvgScore =
    scored.length > 0
      ? Math.round(scored.reduce((s, e) => s + (e.meta.sleepScore ?? 0), 0) / scored.length)
      : null;

  const weekStatus = weekDates.map((d) => ({
    date: d,
    completed: dates.has(d),
    minutes: byDate.get(d) ?? 0,
  }));

  return {
    checkedToday,
    currentStreak,
    bestStreak,
    weekAvgMin,
    weekAvgScore,
    weekCount: weekEntries.length,
    weekStatus,
  };
}
