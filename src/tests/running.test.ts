import { describe, expect, it } from 'vitest';
import {
  analyzeSplits,
  calculatePaceSecondsPerKm,
  compareTwoRuns,
  computeWeeklyRunningStats,
  extractFiveKBenchmarks,
  formatPace,
  parseDurationToSeconds,
} from '@/modules/running/calculations';
import type { RunningSession, RunningSplit } from '@/types/domain';

function makeSession(overrides: Partial<RunningSession>): RunningSession {
  return {
    id: 'run-1',
    user_id: 'user-1',
    session_date: '2026-08-13',
    start_time: null,
    distance_m: 5000,
    duration_s: 1690,
    workout_type: 'PROGRESSION',
    is_indoor: false,
    avg_hr_bpm: null,
    max_hr_bpm: null,
    cadence_spm: null,
    elevation_gain_m: null,
    rpe: null,
    energy_level: null,
    muscle_soreness: null,
    pain_present: false,
    pain_details: null,
    conditions: null,
    notes: null,
    data_origin: 'RECORDED',
    entry_method: 'MANUAL',
    is_historical_record: false,
    created_at: '2026-08-13T00:00:00Z',
    updated_at: '2026-08-13T00:00:00Z',
    ...overrides,
  };
}

describe('Stage 2 Running Calculations & Split Analysis', () => {
  it('parses valid mm:ss and h:mm:ss durations and rejects invalid strings', () => {
    expect(parseDurationToSeconds('28:10')).toBe(1690);
    expect(parseDurationToSeconds('30:58')).toBe(1858);
    expect(parseDurationToSeconds('1:05:30')).toBe(3930);
    expect(parseDurationToSeconds('28:75')).toBeNull();
    expect(parseDurationToSeconds('0:00')).toBeNull();
    expect(parseDurationToSeconds('')).toBeNull();
  });

  it('calculates exact pace from distance and duration without AI approximation', () => {
    expect(calculatePaceSecondsPerKm(5000, 1690)).toBe(338); // 5:38 /km
    expect(formatPace(5000, 1690)).toBe('5:38 /km');
    expect(formatPace(5140, 1858)).toBe('6:01 /km'); // 361.47s -> 6:01 /km
  });

  it('handles missing splits honestly without fabricating data', () => {
    const analysis = analyzeSplits([]);
    expect(analysis.splitsWithPace).toHaveLength(0);
    expect(analysis.pattern).toBe('INSUFFICIENT_SPLITS');
    expect(analysis.fastestSplit).toBeNull();
  });

  it('detects progressive pacing and supports partial final splits', () => {
    const splits: RunningSplit[] = [
      { id: '1', user_id: 'u', session_id: 's', split_index: 1, distance_m: 1000, duration_s: 360, is_partial: false, avg_hr_bpm: null, data_origin: 'RECORDED', created_at: '' },
      { id: '2', user_id: 'u', session_id: 's', split_index: 2, distance_m: 1000, duration_s: 345, is_partial: false, avg_hr_bpm: null, data_origin: 'RECORDED', created_at: '' },
      { id: '3', user_id: 'u', session_id: 's', split_index: 3, distance_m: 1000, duration_s: 330, is_partial: false, avg_hr_bpm: null, data_origin: 'RECORDED', created_at: '' },
      { id: '4', user_id: 'u', session_id: 's', split_index: 4, distance_m: 140, duration_s: 44, is_partial: true, avg_hr_bpm: null, data_origin: 'RECORDED', created_at: '' },
    ];
    const analysis = analyzeSplits(splits);
    expect(analysis.pattern).toBe('PROGRESSIVE');
    expect(analysis.fastestSplit?.split_index).toBe(3);
    expect(analysis.slowestSplit?.split_index).toBe(1);
  });

  it('computes weekly volume strictly from RECORDED sessions using Monday week boundaries', () => {
    const sessions: RunningSession[] = [
      makeSession({ id: '1', session_date: '2026-08-13', distance_m: 5000 }), // Week of Aug 10
      makeSession({ id: '2', session_date: '2026-08-18', distance_m: 5140 }), // Week of Aug 17
      // Simulated unrecorded/planned entry must never add to completed distance
      makeSession({
        id: '3',
        session_date: '2026-08-20',
        distance_m: 8000,
        data_origin: 'PLANNED' as unknown as 'RECORDED',
      }),
    ];

    const weekAug17 = computeWeeklyRunningStats(sessions, '2026-08-21');
    expect(weekAug17.weekStart).toBe('2026-08-17');
    expect(weekAug17.totalDistanceM).toBe(5140);
    expect(weekAug17.runCount).toBe(1);
    expect(weekAug17.previousWeekDistanceM).toBe(5000);
    expect(weekAug17.distanceDeltaM).toBe(140);
  });

  it('distinguishes direct vs approximate run comparisons', () => {
    const aug13 = makeSession({
      id: '1',
      session_date: '2026-08-13',
      distance_m: 5000,
      duration_s: 1690,
      workout_type: 'PROGRESSION',
    });
    const aug18 = makeSession({
      id: '2',
      session_date: '2026-08-18',
      distance_m: 5140,
      duration_s: 1858,
      workout_type: 'EASY',
    });
    const anotherProgression5K = makeSession({
      id: '3',
      session_date: '2026-09-01',
      distance_m: 5000,
      duration_s: 1650,
      workout_type: 'PROGRESSION',
    });

    expect(compareTwoRuns(aug13, aug18).comparisonType).toBe('APPROXIMATE');
    expect(compareTwoRuns(aug13, anotherProgression5K).comparisonType).toBe('DIRECT');
  });

  it('identifies fastest and most recent ~5K benchmarks accurately', () => {
    const aug13 = makeSession({ id: '1', session_date: '2026-08-13', distance_m: 5000, duration_s: 1690 });
    const aug18 = makeSession({ id: '2', session_date: '2026-08-18', distance_m: 5140, duration_s: 1858 });
    const benchmarks = extractFiveKBenchmarks([aug13, aug18]);

    expect(benchmarks.fastest5K?.session.id).toBe('1');
    expect(benchmarks.mostRecent5K?.session.id).toBe('2');
  });
});