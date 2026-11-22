import { describe, expect, it } from 'vitest';
import { calculateHabitStreak, PORN_FREE_HABIT_KEY } from '@/modules/habits/streakEngine';
import type { HabitLog } from '@/types/domain';

describe('Porn-Free Failure Reset', () => {
  it('immediately resets currentStreak to 0 when today is marked failed (completed: false)', () => {
    const logs: HabitLog[] = [
      {
        id: '1',
        user_id: 'u-1',
        habit_key: PORN_FREE_HABIT_KEY,
        log_date: '2026-11-21',
        completed: true,
        notes: null,
        created_at: '2026-11-21T20:00:00Z',
      },
      {
        id: '2',
        user_id: 'u-1',
        habit_key: PORN_FREE_HABIT_KEY,
        log_date: '2026-11-22',
        completed: true,
        notes: null,
        created_at: '2026-11-22T20:00:00Z',
      },
      {
        id: '3',
        user_id: 'u-1',
        habit_key: PORN_FREE_HABIT_KEY,
        log_date: '2026-11-23',
        completed: false,
        notes: null,
        created_at: '2026-11-23T01:00:00Z',
      },
    ];

    const summary = calculateHabitStreak(PORN_FREE_HABIT_KEY, logs, '2026-11-23');
    expect(summary.checkedToday).toBe(false);
    expect(summary.currentStreak).toBe(0);
    expect(summary.bestStreak).toBe(2);
  });
});
