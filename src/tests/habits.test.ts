import { describe, expect, it } from 'vitest';
import { calculateHabitStreak, PORN_FREE_HABIT_KEY } from '@/modules/habits/streakEngine';
import type { HabitLog } from '@/types/domain';

const makeLog = (date: string): HabitLog => ({
  id: `log-${date}`,
  user_id: 'u-1',
  habit_key: PORN_FREE_HABIT_KEY,
  log_date: date,
  completed: true,
  notes: null,
  created_at: `${date}T20:00:00Z`,
});

describe('Habit Streak Engine', () => {
  it('calculates current streak, best streak, and Mon-Sun week status accurately', () => {
    const logs = [
      makeLog('2026-11-10'),
      makeLog('2026-11-11'),
      makeLog('2026-11-12'),
      makeLog('2026-11-13'),
      // missed Nov 14-18
      makeLog('2026-11-19'),
      makeLog('2026-11-20'),
      makeLog('2026-11-21'),
    ];

    const summary = calculateHabitStreak(PORN_FREE_HABIT_KEY, logs, '2026-11-21');
    expect(summary.checkedToday).toBe(true);
    expect(summary.currentStreak).toBe(3);
    expect(summary.bestStreak).toBe(4);
    expect(summary.totalDays).toBe(7);
    expect(summary.weekStatus).toHaveLength(7);
  });

  it('preserves active streak through yesterday when today is not ticked yet', () => {
    const logs = [makeLog('2026-11-19'), makeLog('2026-11-20')];
    const summary = calculateHabitStreak(PORN_FREE_HABIT_KEY, logs, '2026-11-21');
    expect(summary.checkedToday).toBe(false);
    expect(summary.currentStreak).toBe(2);
  });
});
