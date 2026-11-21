import { describe, expect, it } from 'vitest';
import {
  calculateInstrumentStats,
  extractMusicSessions,
  serializeMusicMeta,
} from '@/modules/music/musicLog';
import type { ScheduleBlock, ScheduleCompletion } from '@/types/domain';

function makeBlock(overrides: Partial<ScheduleBlock>): ScheduleBlock {
  return {
    id: 'blk-1',
    user_id: 'u-1',
    title: 'Vocal Practice',
    category: 'VOCAL',
    block_date: '2026-11-22',
    start_time: null,
    end_time: null,
    duration_min: 30,
    is_recurring: false,
    recurrence_days: [],
    status: 'COMPLETED',
    physical_load: 'NONE',
    notes: null,
    data_origin: 'RECORDED',
    created_at: '2026-11-22T00:00:00Z',
    ...overrides,
  };
}

describe('Music Studio Streaks & Session Merge', () => {
  it('computes dedicated streaks independently per instrument', () => {
    const blocks: ScheduleBlock[] = [
      makeBlock({ id: 'v1', category: 'VOCAL', block_date: '2026-11-20', duration_min: 27 }),
      makeBlock({ id: 'v2', category: 'VOCAL', block_date: '2026-11-21', duration_min: 36 }),
      makeBlock({ id: 'v3', category: 'VOCAL', block_date: '2026-11-22', duration_min: 30 }),
      makeBlock({ id: 'd1', category: 'DRUMMING', block_date: '2026-11-21', duration_min: 45 }),
    ];

    const sessions = extractMusicSessions(blocks, []);
    const vocal = calculateInstrumentStats('VOCAL', sessions, '2026-11-22');
    const drums = calculateInstrumentStats('DRUMMING', sessions, '2026-11-22');

    expect(vocal.currentStreak).toBe(3);
    expect(vocal.bestStreak).toBe(3);
    expect(vocal.checkedToday).toBe(true);
    expect(vocal.totalMinutes).toBe(93);

    expect(drums.currentStreak).toBe(1);
    expect(drums.checkedToday).toBe(false);
    expect(drums.totalMinutes).toBe(45);
  });

  it('merges recurring completions and deduplicates matching block+date entries', () => {
    const recurringVocal = makeBlock({
      id: 'rec-vocal',
      is_recurring: true,
      status: 'PLANNED',
      duration_min: 30,
    });
    const standalone = makeBlock({
      id: 'solo-drum',
      category: 'DRUMMING',
      block_date: '2026-11-22',
      duration_min: 40,
      notes: serializeMusicMeta({ tags: ['Rudiments'], notes: 'Clean doubles' }),
    });
    const completions: ScheduleCompletion[] = [
      {
        id: 'c-1',
        user_id: 'u-1',
        block_id: 'rec-vocal',
        occurrence_date: '2026-11-22',
        status: 'COMPLETED',
        strength_focus: null,
        duration_min: 36,
        physical_load: 'NONE',
        notes: 'Extended breath work',
        created_at: '2026-11-22T10:00:00Z',
      },
    ];

    const sessions = extractMusicSessions([recurringVocal, standalone], completions);
    expect(sessions).toHaveLength(2);

    const vocalEntry = sessions.find((s) => s.instrument === 'VOCAL');
    expect(vocalEntry?.durationMin).toBe(36);
    expect(vocalEntry?.notes).toBe('Extended breath work');

    const drumEntry = sessions.find((s) => s.instrument === 'DRUMMING');
    expect(drumEntry?.tags).toEqual(['Rudiments']);
    expect(drumEntry?.notes).toBe('Clean doubles');
  });
});
