import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_PREFERENCES,
  findDueReminders,
  formatReminderLeadText,
  parseHHMMToMinutes,
} from '@/modules/reminders/reminderEngine';
import type { ScheduleBlock, ScheduleCompletion } from '@/types/domain';

function makeBlock(overrides: Partial<ScheduleBlock>): ScheduleBlock {
  return {
    id: 'blk-1',
    user_id: 'u-1',
    title: 'Vocal Practice',
    category: 'VOCAL',
    block_date: '2026-11-22',
    start_time: '07:30',
    end_time: '08:00',
    duration_min: 30,
    is_recurring: false,
    recurrence_days: [],
    status: 'PLANNED',
    physical_load: 'NONE',
    notes: null,
    data_origin: 'PLANNED',
    created_at: '2026-11-22T00:00:00Z',
    ...overrides,
  };
}

describe('Session Reminder Engine', () => {
  it('parses HH:MM strings accurately and rejects invalid inputs', () => {
    expect(parseHHMMToMinutes('07:30')).toBe(450);
    expect(parseHHMMToMinutes('17:45:00')).toBe(1065);
    expect(parseHHMMToMinutes(null)).toBeNull();
    expect(parseHHMMToMinutes('25:99')).toBeNull();
  });

  it('triggers reminders inside the lead window and skips completed or already-fired blocks', () => {
    const vocal = makeBlock({ id: 'v1', start_time: '07:30' }); // 450 min
    const karate = makeBlock({ id: 'k1', title: 'Karate', category: 'KARATE', start_time: '18:00' }); // 1080 min
    const doneRun = makeBlock({
      id: 'r1',
      title: 'Easy Run',
      category: 'RUNNING',
      start_time: '07:30',
      status: 'COMPLETED',
    });

    const due = findDueReminders({
      todayIso: '2026-11-22',
      nowMinutes: 438, // 07:18 -> 12 min before 07:30
      blocks: [vocal, karate, doneRun],
      completions: [],
      prefs: { ...DEFAULT_REMINDER_PREFERENCES, leadMinutes: 15 },
      firedKeys: new Set(),
      snoozedUntilMap: {},
    });

    expect(due).toHaveLength(1);
    expect(due[0].blockId).toBe('v1');
    expect(due[0].minutesUntilStart).toBe(12);
    expect(formatReminderLeadText(due[0].minutesUntilStart)).toBe('In 12 min');

    // Once marked fired, it should not re-trigger
    const secondCheck = findDueReminders({
      todayIso: '2026-11-22',
      nowMinutes: 440,
      blocks: [vocal],
      completions: [],
      prefs: { ...DEFAULT_REMINDER_PREFERENCES, leadMinutes: 15 },
      firedKeys: new Set([due[0].reminderKey]),
      snoozedUntilMap: {},
    });
    expect(secondCheck).toHaveLength(0);
  });

  it('suppresses recurring sessions already checked off in schedule_completions and honors snooze', () => {
    const recurringVocal = makeBlock({
      id: 'rec-1',
      is_recurring: true,
      recurrence_days: [7], // Sunday (2026-11-22)
      start_time: '08:00', // 480 min
    });
    const completion: ScheduleCompletion = {
      id: 'c-1',
      user_id: 'u-1',
      block_id: 'rec-1',
      occurrence_date: '2026-11-22',
      status: 'COMPLETED',
      strength_focus: null,
      duration_min: 30,
      physical_load: 'NONE',
      notes: null,
      created_at: '2026-11-22T02:00:00Z',
    };

    const suppressed = findDueReminders({
      todayIso: '2026-11-22',
      nowMinutes: 470,
      blocks: [recurringVocal],
      completions: [completion],
      prefs: DEFAULT_REMINDER_PREFERENCES,
      firedKeys: new Set(),
      snoozedUntilMap: {},
    });
    expect(suppressed).toHaveLength(0);

    // Snoozed reminder re-fires once snooze target minute arrives
    const key = 'rec-1:2026-11-22:08:00';
    const snoozed = findDueReminders({
      todayIso: '2026-11-22',
      nowMinutes: 475,
      blocks: [recurringVocal],
      completions: [],
      prefs: DEFAULT_REMINDER_PREFERENCES,
      firedKeys: new Set([key]),
      snoozedUntilMap: { [key]: 475 },
    });
    expect(snoozed).toHaveLength(1);
    expect(snoozed[0].minutesUntilStart).toBe(5);
  });
});
