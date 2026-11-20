import { formatDurationSeconds, getMondayWeekStart } from '@/lib/datetime';
import { formatDistanceKm, formatPace } from '@/modules/running/calculations';
import {
  WORKOUT_TYPE_LABELS,
  type ActivityCategory,
  type PhysicalLoadLevel,
  type ReadinessCheckIn,
  type RunningSession,
  type ScheduleBlock,
  type ScheduleStatus,
} from '@/types/domain';

export interface CalendarOccurrence {
  occurrenceKey: string;
  date: string; // YYYY-MM-DD
  title: string;
  category: ActivityCategory;
  startTime: string | null;
  endTime: string | null;
  durationMin: number | null;
  status: ScheduleStatus;
  physicalLoad: PhysicalLoadLevel;
  sourceType: 'SCHEDULE_BLOCK' | 'RECORDED_RUN';
  sourceId: string;
  notes: string | null;
  isRecurring: boolean;
}

export const ISO_WEEKDAYS = [
  { iso: 1, short: 'Mon', label: 'Monday' },
  { iso: 2, short: 'Tue', label: 'Tuesday' },
  { iso: 3, short: 'Wed', label: 'Wednesday' },
  { iso: 4, short: 'Thu', label: 'Thursday' },
  { iso: 5, short: 'Fri', label: 'Friday' },
  { iso: 6, short: 'Sat', label: 'Saturday' },
  { iso: 7, short: 'Sun', label: 'Sunday' },
] as const;

/* Returns ISO weekday (1 = Monday ... 7 = Sunday) for a YYYY-MM-DD date. */
export function getIsoWeekday(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/* Adds a signed number of days to a YYYY-MM-DD date string deterministically in UTC. */
export function addDaysIso(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

/* Builds an ordered array of YYYY-MM-DD dates from startDate to endDate inclusive. */
export function buildDateRange(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < 400) {
    result.push(cursor);
    cursor = addDaysIso(cursor, 1);
    guard++;
  }
  return result;
}

/* Returns the 7 dates (Mon–Sun) for the week containing referenceIsoDate. */
export function getWeekDates(referenceIsoDate: string): string[] {
  const monday = getMondayWeekStart(referenceIsoDate);
  return buildDateRange(monday, addDaysIso(monday, 6));
}

/* Returns a full Monday-aligned 6-row (42-day) or 5-row (35-day) month grid. */
export function getMonthGridDates(year: number, monthIndex0: number): string[] {
  const firstOfMonth = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-01`;
  const lastDayNum = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const lastOfMonth = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(
    lastDayNum
  ).padStart(2, '0')}`;

  const gridStart = getMondayWeekStart(firstOfMonth);
  const lastWeekday = getIsoWeekday(lastOfMonth);
  const gridEnd = addDaysIso(lastOfMonth, 7 - lastWeekday);

  return buildDateRange(gridStart, gridEnd);
}

/* Expands recurring and one-off schedule blocks plus recorded runs across [startDate, endDate]. */
export function expandCalendarOccurrences(
  blocks: ScheduleBlock[],
  runs: RunningSession[],
  startDate: string,
  endDate: string
): CalendarOccurrence[] {
  const dates = buildDateRange(startDate, endDate);
  const occurrences: CalendarOccurrence[] = [];

  for (const block of blocks) {
    if (block.is_recurring && block.recurrence_days.length > 0) {
      for (const date of dates) {
        if (date < block.block_date) continue;
        const isoDay = getIsoWeekday(date);
        if (!block.recurrence_days.includes(isoDay)) continue;

        occurrences.push({
          occurrenceKey: `block:${block.id}:${date}`,
          date,
          title: block.title,
          category: block.category,
          startTime: block.start_time,
          endTime: block.end_time,
          durationMin: block.duration_min,
          status: block.status,
          physicalLoad: block.physical_load,
          sourceType: 'SCHEDULE_BLOCK',
          sourceId: block.id,
          notes: block.notes,
          isRecurring: true,
        });
      }
    } else if (block.block_date >= startDate && block.block_date <= endDate) {
      occurrences.push({
        occurrenceKey: `block:${block.id}:${block.block_date}`,
        date: block.block_date,
        title: block.title,
        category: block.category,
        startTime: block.start_time,
        endTime: block.end_time,
        durationMin: block.duration_min,
        status: block.status,
        physicalLoad: block.physical_load,
        sourceType: 'SCHEDULE_BLOCK',
        sourceId: block.id,
        notes: block.notes,
        isRecurring: false,
      });
    }
  }

  // Overlay verified RECORDED runs cleanly as distinct occurrences
  for (const run of runs) {
    if (run.data_origin !== 'RECORDED') continue;
    if (run.session_date < startDate || run.session_date > endDate) continue;

    occurrences.push({
      occurrenceKey: `run:${run.id}`,
      date: run.session_date,
      title: `${formatDistanceKm(run.distance_m)} ${WORKOUT_TYPE_LABELS[run.workout_type]} (${formatPace(
        run.distance_m,
        run.duration_s
      )})`,
      category: 'RUNNING',
      startTime: run.start_time ? run.start_time.slice(0, 5) : null,
      endTime: null,
      durationMin: Math.max(1, Math.round(run.duration_s / 60)),
      status: 'COMPLETED',
      physicalLoad: run.rpe && run.rpe >= 7 ? 'HIGH' : 'MODERATE',
      sourceType: 'RECORDED_RUN',
      sourceId: run.id,
      notes: `${formatDurationSeconds(run.duration_s)}${run.notes ? ` · ${run.notes}` : ''}`,
      isRecurring: false,
    });
  }

  return occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const timeA = a.startTime ?? '99:99';
    const timeB = b.startTime ?? '99:99';
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return a.title.localeCompare(b.title);
  });
}

export type ReadinessBand = 'READY' | 'MODERATE' | 'CAUTION' | 'UNAVAILABLE';

export interface ReadinessEvaluation {
  band: ReadinessBand;
  label: string;
  score: number | null; // 0-100 deterministic score, null if insufficient data
  summary: string;
  flags: string[];
}

/* Deterministic readiness scoring strictly from recorded check-in values. Never fabricates data. */
export function evaluateReadiness(checkin: ReadinessCheckIn | null): ReadinessEvaluation {
  if (!checkin) {
    return {
      band: 'UNAVAILABLE',
      label: 'Unavailable',
      score: null,
      summary: 'No readiness check-in recorded yet.',
      flags: [],
    };
  }

  const components: number[] = [];
  const flags: string[] = [];

  if (checkin.sleep_hours !== null) {
    // 8+ hrs => 100, 7 => 85, 6 => 65, 5 => 45, <5 => 25
    const sleepScore =
      checkin.sleep_hours >= 8
        ? 100
        : checkin.sleep_hours >= 7
        ? 85
        : checkin.sleep_hours >= 6
        ? 65
        : checkin.sleep_hours >= 5
        ? 45
        : 25;
    components.push(sleepScore);
    if (checkin.sleep_hours < 6) {
      flags.push(`Short sleep (${checkin.sleep_hours}h)`);
    }
  }

  if (checkin.sleep_quality !== null) {
    components.push(checkin.sleep_quality * 20);
  }

  if (checkin.energy_level !== null) {
    components.push(checkin.energy_level * 20);
    if (checkin.energy_level <= 2) {
      flags.push('Low energy reported');
    }
  }

  if (checkin.muscle_soreness !== null) {
    // Invert: 1 (no soreness) => 100, 5 (severe soreness) => 20
    components.push((6 - checkin.muscle_soreness) * 20);
    if (checkin.muscle_soreness >= 4) {
      flags.push(`Elevated muscle soreness (${checkin.muscle_soreness}/5)`);
    }
  }

  if (checkin.stress_level !== null) {
    // Invert: 1 (low stress) => 100, 5 (high stress) => 20
    components.push((6 - checkin.stress_level) * 20);
    if (checkin.stress_level >= 4) {
      flags.push(`High stress (${checkin.stress_level}/5)`);
    }
  }

  if (checkin.pain_present) {
    flags.push(
      checkin.pain_details
        ? `Pain flagged: ${checkin.pain_details}`
        : 'Pain or discomfort flagged'
    );
  }

  if (components.length === 0) {
    return {
      band: checkin.pain_present ? 'CAUTION' : 'UNAVAILABLE',
      label: checkin.pain_present ? 'Caution (Pain)' : 'Incomplete',
      score: null,
      summary: checkin.pain_present
        ? 'Pain was flagged without numeric readiness metrics.'
        : 'Check-in saved without numeric metrics.',
      flags,
    };
  }

  let rawScore = Math.round(components.reduce((a, b) => a + b, 0) / components.length);
  if (checkin.pain_present) {
    rawScore = Math.min(rawScore, 45);
  }

  if (rawScore >= 75 && !checkin.pain_present) {
    return {
      band: 'READY',
      label: 'Ready to Train',
      score: rawScore,
      summary: 'Recovery signals support normal planned training.',
      flags,
    };
  }

  if (rawScore >= 55 && !checkin.pain_present) {
    return {
      band: 'MODERATE',
      label: 'Moderate Readiness',
      score: rawScore,
      summary: 'Keep easy runs genuinely controlled and prioritize sleep/recovery.',
      flags,
    };
  }

  return {
    band: 'CAUTION',
    label: 'Recovery Priority',
    score: rawScore,
    summary: checkin.pain_present
      ? 'Pain flagged — avoid intensity and prioritize assessment/recovery.'
      : 'Elevated fatigue or poor recovery signals — favor easy movement or rest.',
    flags,
  };
}