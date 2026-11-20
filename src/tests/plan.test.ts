import { describe, expect, it } from 'vitest';
import {
  computeTrainingPaceZones,
  detectPlanAdjustments,
  generateRollingSevenDayPlan,
} from '@/modules/plan/planEngine';
import type {
  PlannedWorkout,
  ReadinessCheckIn,
  RunningSession,
  ScheduleBlock,
} from '@/types/domain';

const makeRun = (overrides: Partial<RunningSession> = {}): RunningSession => ({
  id: 'run-1',
  user_id: 'u1',
  session_date: '2026-11-16',
  start_time: null,
  distance_m: 5000,
  duration_s: 1690, // 28:10 -> 338 s/km
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
  created_at: '2026-11-16T00:00:00Z',
  updated_at: '2026-11-16T00:00:00Z',
  ...overrides,
});

describe('Stage 6 Adaptive Training Plan Engine', () => {
  it('computes deterministic pace zones from a recorded anchor run and never invents paces when missing', () => {
    const emptyZones = computeTrainingPaceZones([]);
    expect(emptyZones.anchorRun).toBeNull();
    expect(emptyZones.easy).toBeNull();
    expect(emptyZones.tempo).toBeNull();

    const zones = computeTrainingPaceZones([makeRun()]);
    // 5000m in 1690s => 338 s/km anchor
    expect(zones.equivalent5kSec).toBe(1690);
    expect(zones.easy).toEqual({ minSecPerKm: 393, maxSecPerKm: 428 });
    expect(zones.tempo).toEqual({ minSecPerKm: 353, maxSecPerKm: 366 });
    expect(zones.intervals).toEqual({ minSecPerKm: 333, maxSecPerKm: 343 });
  });

  it('respects protected Rest days and avoids placing quality runs on high-load Karate days', () => {
    const blocks: ScheduleBlock[] = [
      {
        id: 'karate-1',
        user_id: 'u1',
        title: 'Karate Training',
        category: 'KARATE',
        block_date: '2026-11-16',
        start_time: '17:30',
        end_time: '19:00',
        duration_min: 90,
        is_recurring: true,
        recurrence_days: [3, 5], // Wed (Nov 18), Fri (Nov 20)
        status: 'PLANNED',
        physical_load: 'HIGH',
        notes: null,
        data_origin: 'PLANNED',
        created_at: '2026-11-16T00:00:00Z',
      },
      {
        id: 'rest-sun',
        user_id: 'u1',
        title: 'Protected Rest Day',
        category: 'RECOVERY',
        block_date: '2026-11-16',
        start_time: null,
        end_time: null,
        duration_min: null,
        is_recurring: true,
        recurrence_days: [7], // Sun (Nov 22)
        status: 'PLANNED',
        physical_load: 'NONE',
        notes: null,
        data_origin: 'PLANNED',
        created_at: '2026-11-16T00:00:00Z',
      },
    ];

    const plan = generateRollingSevenDayPlan({
      referenceDate: '2026-11-16', // Monday
      profile: {
        current_phase: 'BUILDING_CONSISTENCY',
        preferred_run_days: [1, 2, 4, 6, 7], // Includes Sun, which must be blocked by RECOVERY
      },
      sessions: [makeRun()],
      blocks,
      checkIns: [],
    });

    expect(plan).toHaveLength(4);
    expect(plan.some((w) => w.plan_date === '2026-11-22')).toBe(false); // Never on Sunday Rest
    // No TEMPO/INTERVALS/LONG placed on Wed (Nov 18) or Fri (Nov 20)
    for (const w of plan) {
      if (w.plan_date === '2026-11-18' || w.plan_date === '2026-11-20') {
        expect(['TEMPO', 'INTERVALS', 'LONG']).not.toContain(w.workout_type);
      }
    }
  });

  it('proposes non-silent adjustments on pain flags without mutating the original workout', () => {
    const workout: PlannedWorkout = {
      id: 'pw-1',
      user_id: 'u1',
      plan_date: '2026-11-20',
      workout_type: 'TEMPO',
      title: 'Threshold / Tempo Run',
      target_distance_m: 6000,
      target_duration_s: 2150,
      target_pace_min_s: 353,
      target_pace_max_s: 366,
      target_rpe_range: 'RPE 6–7',
      phase: 'BUILDING_CONSISTENCY',
      rationale: 'Tempo work',
      status: 'PLANNED',
      linked_session_id: null,
      data_origin: 'PLANNED',
      created_at: '2026-11-16T00:00:00Z',
      updated_at: '2026-11-16T00:00:00Z',
    };

    const painCheckIn: ReadinessCheckIn = {
      id: 'rc-1',
      user_id: 'u1',
      checkin_date: '2026-11-20',
      sleep_hours: 7,
      sleep_quality: 4,
      energy_level: 3,
      muscle_soreness: 4,
      stress_level: 2,
      resting_hr_bpm: 56,
      pain_present: true,
      pain_details: 'Left Achilles tightness',
      notes: null,
      created_at: '2026-11-20T06:00:00Z',
    };

    const proposals = detectPlanAdjustments({
      today: '2026-11-20',
      plannedWorkouts: [workout],
      sessions: [makeRun()],
      blocks: [],
      checkIns: [painCheckIn],
    });

    expect(proposals).toHaveLength(1);
    expect(proposals[0].triggerCode).toBe('PAIN_FLAG');
    expect(proposals[0].severity).toBe('HIGH');
    expect(proposals[0].updatedDraft.target_distance_m).toBe(0);
    expect(workout.target_distance_m).toBe(6000); // Original object untouched
  });
});