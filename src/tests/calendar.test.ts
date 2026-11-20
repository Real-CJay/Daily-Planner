import { describe, expect, it } from 'vitest';
import {
  evaluateReadiness,
  expandCalendarOccurrences,
  getIsoWeekday,
  getWeekDates,
} from '@/modules/calendar/scheduleEngine';
import type { ReadinessCheckIn, ScheduleBlock } from '@/types/domain';

describe('Stage 4 Calendar, Recurring Schedules & Readiness Engine', () => {
  it('computes ISO weekdays (Monday=1 ... Sunday=7) and Mon–Sun week ranges accurately', () => {
    expect(getIsoWeekday('2026-11-16')).toBe(1); // Monday
    expect(getIsoWeekday('2026-11-18')).toBe(3); // Wednesday
    expect(getIsoWeekday('2026-11-20')).toBe(5); // Friday
    expect(getIsoWeekday('2026-11-22')).toBe(7); // Sunday

    const week = getWeekDates('2026-11-20');
    expect(week).toHaveLength(7);
    expect(week[0]).toBe('2026-11-16');
    expect(week[6]).toBe('2026-11-22');
  });

  it('expands recurring Wednesday/Friday Karate strictly on matching weekdays from anchor date', () => {
    const karateBlock: ScheduleBlock = {
      id: 'karate-1',
      user_id: 'u1',
      title: 'Karate Training',
      category: 'KARATE',
      block_date: '2026-11-16',
      start_time: '17:30',
      end_time: '19:00',
      duration_min: 90,
      is_recurring: true,
      recurrence_days: [3, 5],
      status: 'PLANNED',
      physical_load: 'HIGH',
      notes: null,
      data_origin: 'PLANNED',
      created_at: '2026-11-16T00:00:00Z',
    };

    const occurrences = expandCalendarOccurrences([karateBlock], [], '2026-11-16', '2026-11-22');
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((o) => o.date)).toEqual(['2026-11-18', '2026-11-20']);
    expect(occurrences[0].category).toBe('KARATE');
  });

  it('evaluates readiness conservatively without fabricating scores when check-in is missing', () => {
    const missing = evaluateReadiness(null);
    expect(missing.band).toBe('UNAVAILABLE');
    expect(missing.score).toBeNull();

    const goodCheckIn: ReadinessCheckIn = {
      id: 'c1',
      user_id: 'u1',
      checkin_date: '2026-11-20',
      sleep_hours: 8,
      sleep_quality: 4,
      energy_level: 4,
      muscle_soreness: 2,
      stress_level: 2,
      resting_hr_bpm: 54,
      pain_present: false,
      pain_details: null,
      notes: null,
      created_at: '2026-11-20T06:00:00Z',
    };
    const good = evaluateReadiness(goodCheckIn);
    expect(good.band).toBe('READY');
    expect(good.score).toBeGreaterThanOrEqual(75);

    const painCheckIn: ReadinessCheckIn = {
      ...goodCheckIn,
      pain_present: true,
      pain_details: 'Mild right shin tightness',
    };
    const painEval = evaluateReadiness(painCheckIn);
    expect(painEval.band).toBe('CAUTION');
    expect(painEval.score).toBeLessThanOrEqual(45);
  });
});