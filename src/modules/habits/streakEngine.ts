import type { HabitLog, HabitStreakSummary } from '@/types/domain';
import { addDaysIso, getMondayIso, getWeekDatesIso } from '@/modules/calendar/timelineEngine';

export const PORN_FREE_HABIT_KEY = 'PORN_FREE';

export function calculateHabitStreak(
  habitKey: string,
  logs: HabitLog[],
  todayIso: string
): HabitStreakSummary {
  const completedDates = new Set(
    logs.filter((l) => l.habit_key === habitKey && l.completed).map((l) => l.log_date)
  );

  const checkedToday = completedDates.has(todayIso);

  // Current streak: counts backwards from today (or yesterday if today isn't ticked yet)
  let currentStreak = 0;
  let cursor = checkedToday ? todayIso : addDaysIso(todayIso, -1);
  while (completedDates.has(cursor)) {
    currentStreak++;
    cursor = addDaysIso(cursor, -1);
  }

  // Best streak across all logged dates
  const sorted = Array.from(completedDates).sort();
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      run = 1;
    } else {
      const expected = addDaysIso(sorted[i - 1], 1);
      run = sorted[i] === expected ? run + 1 : 1;
    }
    if (run > bestStreak) bestStreak = run;
  }

  const monday = getMondayIso(todayIso);
  const weekDates = getWeekDatesIso(monday);
  const weekStatus = weekDates.map((date) => ({
    date,
    completed: completedDates.has(date),
  }));

  return {
    habitKey,
    checkedToday,
    currentStreak,
    bestStreak,
    totalDays: completedDates.size,
    weekStatus,
  };
}
