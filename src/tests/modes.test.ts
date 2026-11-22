import { describe, expect, it } from 'vitest';
import {
  buildSleepBlockDraft,
  calculateSleepDurationMin,
  calculateSleepStats,
  extractSleepEntries,
} from '@/modules/sleep/sleepLog';
import {
  buildReadingBlockDraft,
  calculateReadingStats,
  extractReadingEntries,
} from '@/modules/reading/readingLog';
import type { ScheduleBlock } from '@/types/domain';

function wrapDraft(id: string, draft: ReturnType<typeof buildSleepBlockDraft>): ScheduleBlock {
  return {
    id,
    user_id: 'u-1',
    data_origin: 'RECORDED',
    created_at: '2026-11-22T00:00:00Z',
    ...draft,
  };
}

describe('Sleep & Reading Modes', () => {
  it('calculates sleep duration across midnight and computes sleep streaks', () => {
    expect(calculateSleepDurationMin('23:15', '06:45')).toBe(450);
    expect(calculateSleepDurationMin('00:30', '07:00')).toBe(390);

    const b1 = wrapDraft(
      's1',
      buildSleepBlockDraft('2026-11-21', {
        bedTime: '23:00',
        wakeTime: '06:46',
        totalMin: 466,
        sleepScore: 69,
        quality: 'General',
        deepMin: 77,
        lightMin: 279,
        remMin: 62,
        awakeMin: 13,
        napMin: 48,
        awakeCount: 1,
        notes: null,
      })
    );
    const b2 = wrapDraft(
      's2',
      buildSleepBlockDraft('2026-11-22', {
        bedTime: '22:45',
        wakeTime: '06:30',
        totalMin: 465,
        sleepScore: 78,
        quality: 'Good',
        deepMin: 90,
        lightMin: 260,
        remMin: 85,
        awakeMin: 10,
        napMin: null,
        awakeCount: 1,
        notes: null,
      })
    );

    const entries = extractSleepEntries([b1, b2]);
    const stats = calculateSleepStats(entries, '2026-11-22');

    expect(entries).toHaveLength(2);
    expect(stats.currentStreak).toBe(2);
    expect(stats.bestStreak).toBe(2);
    expect(stats.weekAvgScore).toBe(74);
  });

  it('tracks reading streaks and aggregates book progress', () => {
    const r1 = wrapDraft(
      'r1',
      buildReadingBlockDraft('2026-11-21', {
        bookTitle: 'Atomic Habits',
        author: 'James Clear',
        pagesRead: 20,
        currentPage: 80,
        totalPages: 320,
        durationMin: 30,
        notes: null,
      })
    );
    const r2 = wrapDraft(
      'r2',
      buildReadingBlockDraft('2026-11-22', {
        bookTitle: 'Atomic Habits',
        author: 'James Clear',
        pagesRead: 25,
        currentPage: 105,
        totalPages: 320,
        durationMin: 35,
        notes: null,
      })
    );

    const entries = extractReadingEntries([r1, r2]);
    const stats = calculateReadingStats(entries, '2026-11-22');

    expect(stats.currentStreak).toBe(2);
    expect(stats.books).toHaveLength(1);
    expect(stats.books[0].totalPagesRead).toBe(45);
    expect(stats.books[0].latestPage).toBe(105);
  });
});
