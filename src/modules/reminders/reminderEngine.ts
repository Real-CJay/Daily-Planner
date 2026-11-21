import { expandCalendarOccurrences } from '@/modules/calendar/scheduleEngine';
import type {
  ActivityCategory,
  ScheduleBlock,
  ScheduleCompletion,
} from '@/types/domain';

export const ALL_REMINDER_CATEGORIES: ActivityCategory[] = [
  'RUNNING',
  'KARATE',
  'STRENGTH',
  'RECOVERY',
  'VOCAL',
  'DRUMMING',
  'GUITAR',
  'KEYBOARD',
  'UNIVERSITY',
  'CUSTOM',
];

export const LEAD_TIME_OPTIONS = [5, 10, 15, 30] as const;
export type ReminderLeadMinutes = (typeof LEAD_TIME_OPTIONS)[number];

export interface ReminderPreferences {
  enabled: boolean;
  browserNotifications: boolean;
  soundEnabled: boolean;
  leadMinutes: ReminderLeadMinutes;
  enabledCategories: ActivityCategory[];
}

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  enabled: true,
  browserNotifications: false,
  soundEnabled: true,
  leadMinutes: 15,
  enabledCategories: [...ALL_REMINDER_CATEGORIES],
};

export interface DueReminder {
  reminderKey: string;
  blockId: string;
  title: string;
  category: ActivityCategory;
  date: string;
  startTime: string; // HH:MM
  durationMin: number | null;
  minutesUntilStart: number;
}

export interface UpcomingReminderPreview {
  reminderKey: string;
  blockId: string;
  title: string;
  category: ActivityCategory;
  startTime: string;
  startMin: number;
  reminderAtMin: number;
  isFired: boolean;
}

export function parseHHMMToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

export function formatMinutesToHHMM(totalMin: number): string {
  const clamped = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatMinutesTo12h(totalMin: number): string {
  const clamped = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}

export function getCurrentLocalMinutes(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);

    const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      return (hh % 24) * 60 + mm;
    }
  } catch {
    // Fallback to device local clock if timezone string is invalid
  }
  return now.getHours() * 60 + now.getMinutes();
}

export function formatReminderLeadText(minutesUntilStart: number): string {
  if (minutesUntilStart <= -1) {
    const ago = Math.abs(Math.round(minutesUntilStart));
    return `Started ${ago}m ago`;
  }
  if (minutesUntilStart <= 0) return 'Starts now';
  if (minutesUntilStart === 1) return 'In 1 min';
  return `In ${Math.round(minutesUntilStart)} min`;
}

function buildCompletedLookup(
  blocks: ScheduleBlock[],
  completions: ScheduleCompletion[],
  todayIso: string
): Set<string> {
  const doneIds = new Set<string>();
  for (const b of blocks) {
    if (!b.is_recurring && b.block_date === todayIso && (b.status === 'COMPLETED' || b.status === 'SKIPPED')) {
      doneIds.add(b.id);
    }
  }
  for (const c of completions) {
    if (c.occurrence_date === todayIso) {
      doneIds.add(c.block_id);
    }
  }
  return doneIds;
}

export function findDueReminders(params: {
  todayIso: string;
  nowMinutes: number;
  blocks: ScheduleBlock[];
  completions: ScheduleCompletion[];
  prefs: ReminderPreferences;
  firedKeys: Set<string>;
  snoozedUntilMap: Record<string, number>;
}): DueReminder[] {
  const { todayIso, nowMinutes, blocks, completions, prefs, firedKeys, snoozedUntilMap } = params;
  if (!prefs.enabled) return [];

  const enabledCats = new Set(prefs.enabledCategories);
  const completedIds = buildCompletedLookup(blocks, completions, todayIso);
  const occurrences = expandCalendarOccurrences(blocks, [], todayIso, todayIso);

  const due: DueReminder[] = [];

  for (const occ of occurrences) {
    if (!enabledCats.has(occ.category)) continue;
    if (completedIds.has(occ.sourceId)) continue;

    const startMin = parseHHMMToMinutes(occ.startTime);
    if (startMin === null) continue;

    const reminderKey = `${occ.sourceId}:${occ.date}:${occ.startTime!.slice(0, 5)}`;
    const minutesUntilStart = startMin - nowMinutes;

    const snoozedUntil = snoozedUntilMap[reminderKey];
    if (typeof snoozedUntil === 'number') {
      if (nowMinutes >= snoozedUntil && minutesUntilStart >= -10) {
        due.push({
          reminderKey,
          blockId: occ.sourceId,
          title: occ.title,
          category: occ.category,
          date: occ.date,
          startTime: occ.startTime!.slice(0, 5),
          durationMin: occ.durationMin,
          minutesUntilStart,
        });
      }
      continue;
    }

    if (firedKeys.has(reminderKey)) continue;

    if (minutesUntilStart <= prefs.leadMinutes && minutesUntilStart >= -2) {
      due.push({
        reminderKey,
        blockId: occ.sourceId,
        title: occ.title,
        category: occ.category,
        date: occ.date,
        startTime: occ.startTime!.slice(0, 5),
        durationMin: occ.durationMin,
        minutesUntilStart,
      });
    }
  }

  return due.sort((a, b) => a.minutesUntilStart - b.minutesUntilStart);
}

export function getUpcomingRemindersForToday(params: {
  todayIso: string;
  nowMinutes: number;
  blocks: ScheduleBlock[];
  completions: ScheduleCompletion[];
  prefs: ReminderPreferences;
  firedKeys: Set<string>;
}): UpcomingReminderPreview[] {
  const { todayIso, nowMinutes, blocks, completions, prefs, firedKeys } = params;
  const enabledCats = new Set(prefs.enabledCategories);
  const completedIds = buildCompletedLookup(blocks, completions, todayIso);
  const occurrences = expandCalendarOccurrences(blocks, [], todayIso, todayIso);

  const upcoming: UpcomingReminderPreview[] = [];
  for (const occ of occurrences) {
    if (!enabledCats.has(occ.category)) continue;
    if (completedIds.has(occ.sourceId)) continue;

    const startMin = parseHHMMToMinutes(occ.startTime);
    if (startMin === null) continue;
    if (startMin < nowMinutes - 2) continue;

    const startTime = occ.startTime!.slice(0, 5);
    const reminderKey = `${occ.sourceId}:${occ.date}:${startTime}`;

    upcoming.push({
      reminderKey,
      blockId: occ.sourceId,
      title: occ.title,
      category: occ.category,
      startTime,
      startMin,
      reminderAtMin: Math.max(0, startMin - prefs.leadMinutes),
      isFired: firedKeys.has(reminderKey),
    });
  }

  return upcoming.sort((a, b) => a.startMin - b.startMin);
}
