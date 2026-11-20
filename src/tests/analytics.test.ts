import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkMatrix,
  buildWeeklyVolumeSeries,
  computeActivitySeparation,
  estimateRiegelTimeSeconds,
} from '@/modules/analytics/analyticsEngine';
import type { PersonalBest, RunningSession, ScheduleBlock } from '@/types/domain';

const makeRun = (overrides: Partial<RunningSession>): RunningSession => ({
  id: 'run-1',
  user_id: 'u1',
  session_date: '2026-11-18',
  start_time: null,
  distance_m: 5000,
  duration_s: 1690, // 28:10
  workout_type: 'PROGRESSION',
  is_indoor: false,
  avg_hr_bpm: null,
  max_hr_bpm: null,
  cadence_spm: null,
  elevation_gain_m: null,
  rpe: 7,
  energy_level: null,
  muscle_soreness: null,
  pain_present: false,
  pain_details: null,
  conditions: null,
  notes: null,
  data_origin: 'RECORDED',
  entry_method: 'MANUAL',
  is_historical_record: false,
  created_at: '2026-11-18T00:00:00Z',
  updated_at: '2026-11-18T00:00:00Z',
  ...overrides,
});

describe('Stage 5 Analytics & Personal Bests Engine', () => {
  it('buckets weekly running distance strictly on Monâ€“Sun boundaries and zero-fills empty weeks', () => {
    const runs = [
      makeRun({ id: 'r1', session_date: '2026-11-16', distance_m: 5000, duration_s: 1690 }),
      makeRun({ id: 'r2', session_date: '2026-11-20', distance_m: 3000, duration_s: 1020 }),
    ];

    const series = buildWeeklyVolumeSeries(runs, '2026-11-20', 4);
    expect(series).toHaveLength(4);
    expect(series[3].weekStart).toBe('2026-11-16');
    expect(series[3].distanceKm).toBe(8);
    expect(series[3].runCount).toBe(2);
    expect(series[0].distanceKm).toBe(0);
  });

  it('computes deterministic Riegel estimates and separates Confirmed PB from Fastest Logged', () => {
    // 5000m in 1690s -> 10000m estimate = round(1690 * 2^1.06) = 3524s
    expect(estimateRiegelTimeSeconds(5000, 1690, 10000)).toBe(3524);

    const runs = [makeRun({ id: 'r1', distance_m: 5000, duration_s: 1690 })];
    const pbs: PersonalBest[] = [
      {
        id: 'pb-5k',
        user_id: 'u1',
        distance_label: '5K',
        distance_m: 5000,
        duration_s: 1600,
        achieved_date: '2026-07-01',
        session_id: null,
        is_confirmed: true,
        notes: 'Track TT',
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
    ];

    const matrix = buildBenchmarkMatrix(runs, pbs);
    const fiveK = matrix.find((r) => r.distance === '5K')!;
    const tenK = matrix.find((r) => r.distance === '10K')!;

    expect(fiveK.confirmedPb?.duration_s).toBe(1600);
    expect(fiveK.fastestLogged?.durationS).toBe(1690);
    expect(tenK.confirmedPb).toBeNull();
    expect(tenK.fastestLogged).toBeNull();
    expect(tenK.estimatedTimeS).toBe(3524);
  });

  it('keeps non-running commitments strictly isolated from running km in activity separation', () => {
    const karate: ScheduleBlock = {
      id: 'k1',
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

    const rows = computeActivitySeparation([karate], [], '2026-11-20');
    const karateRow = rows.find((r) => r.category === 'KARATE')!;
    const runRow = rows.find((r) => r.category === 'RUNNING')!;

    expect(karateRow.countLast7d).toBe(2);
    expect(karateRow.totalMinutesLast7d).toBe(180);
    expect(karateRow.contributesToRunningKm).toBe(false);
    expect(runRow.countLast7d).toBe(0);
    expect(runRow.contributesToRunningKm).toBe(true);
  });
});
