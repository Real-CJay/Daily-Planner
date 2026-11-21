import { describe, expect, it } from 'vitest';
import {
  buildDailyTimeline,
  getUnscheduledInboxBlocks,
  getWeekDatesIso,
} from '@/modules/calendar/timelineEngine';
import type { PlannedWorkout, ScheduleBlock, ScheduleCompletion } from '@/types/domain';

const baseBlock = (overrides: Partial<ScheduleBlock>): ScheduleBlock => ({
  id: 'b-1',
  user_id: 'u-1',
  title: 'Block',
  category: 'UNIVERSITY',
  block_date: '2026-11-16',
  start_time: '08:00',
  end_time: '09:00',
  duration_min: 60,
  is_recurring: false,
  recurrence_days: [],
  status: 'PLANNED',
  physical_load: 'NONE',
  notes: null,
  data_origin: 'PLANNED',
  created_at: '2026-11-16T00:00:00Z',
  ...overrides,
});

describe('Phase C Timeline & Leg-Fatigue Engine', () => {
  it('interleaves free-time gaps >= 20 minutes between timed blocks', () => {
    const blocks = [
      baseBlock({ id: '1', title: 'Home Workout', category: 'STRENGTH', start_time: '06:45', end_time: '07:10', duration_min: 25 }),
      baseBlock({ id: '2', title: 'Lecture', category: 'UNIVERSITY', start_time: '08:00', end_time: '09:30', duration_min: 90 }),
    ];

    const result = buildDailyTimeline('2026-11-16', blocks, []);
    const gaps = result.entries.filter((e) => e.type === 'GAP');
    expect(gaps).toHaveLength(1);
    if (gaps[0].type === 'GAP') {
      expect(gaps[0].gap.durationMin).toBe(50);
    }
  });

  it('triggers leg-fatigue warning when Lower Body Home Workout stacks with a Tempo run, but not Upper Body', () => {
    const strengthBlock = baseBlock({
      id: 'str-1',
      title: 'Home Workout',
      category: 'STRENGTH',
      is_recurring: true,
      recurrence_days: [1, 2, 3, 4, 5, 6],
      start_time: '06:45',
      end_time: '07:10',
      duration_min: 25,
      physical_load: 'MODERATE',
    });

    const tempoPlan: PlannedWorkout = {
      id: 'p-1',
      user_id: 'u-1',
      plan_date: '2026-11-17',
      workout_type: 'TEMPO',
      title: '4 km Tempo',
      target_distance_m: 4000,
      target_duration_s: 1200,
      target_pace_min_s: 280,
      target_pace_max_s: 300,
      target_rpe_range: '7-8',
      phase: 'REBUILDING',
      rationale: 'Tempo rebuild',
      status: 'PLANNED',
      linked_session_id: null,
      data_origin: 'PLANNED',
      created_at: '2026-11-16T00:00:00Z',
      updated_at: '2026-11-16T00:00:00Z',
    };

    const lowerCompletion: ScheduleCompletion = {
      id: 'c-1',
      user_id: 'u-1',
      block_id: 'str-1',
      occurrence_date: '2026-11-17',
      status: 'COMPLETED',
      strength_focus: 'LOWER',
      duration_min: 25,
      physical_load: 'HIGH',
      notes: null,
      created_at: '2026-11-17T07:15:00Z',
    };

    const upperCompletion: ScheduleCompletion = {
      ...lowerCompletion,
      strength_focus: 'UPPER',
      physical_load: 'LOW',
    };

    const withLower = buildDailyTimeline('2026-11-17', [strengthBlock], [lowerCompletion], [tempoPlan]);
    const withUpper = buildDailyTimeline('2026-11-17', [strengthBlock], [upperCompletion], [tempoPlan]);

    expect(withLower.legFatigueWarning).toContain('Lower Body / Legs');
    expect(withUpper.legFatigueWarning).toBeNull();
  });

  it('filters unscheduled tasks into Inbox while excluding Protected Rest Days and computes 7 Mon-Sun dates', () => {
    const blocks = [
      baseBlock({ id: '1', title: 'Finish Mechanics Lab', start_time: null, end_time: null }),
      baseBlock({ id: '2', title: 'Protected Rest', category: 'RECOVERY', is_recurring: true, recurrence_days: [7], start_time: null, end_time: null }),
    ];

    const inbox = getUnscheduledInboxBlocks(blocks);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].title).toBe('Finish Mechanics Lab');
    expect(getWeekDatesIso('2026-11-16')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });
});
