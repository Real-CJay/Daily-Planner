import { describe, expect, it } from 'vitest';
import {
  buildCompactCoachContext,
  computeDeterministicWeeklyReview,
  generateDeterministicCoachFallback,
} from '@/modules/coach/coachEngine';
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
  duration_s: 1690,
  workout_type: 'EASY',
  is_indoor: false,
  avg_hr_bpm: null,
  max_hr_bpm: null,
  cadence_spm: null,
  elevation_gain_m: null,
  rpe: 5,
  energy_level: null,
  muscle_soreness: null,
  pain_present: false,
  pain_details: null,
  conditions: null,
  notes: 'Private personal run note',
  data_origin: 'RECORDED',
  entry_method: 'MANUAL',
  is_historical_record: false,
  created_at: '2026-11-16T00:00:00Z',
  updated_at: '2026-11-16T00:00:00Z',
  ...overrides,
});

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

const vocalBlock: ScheduleBlock = {
  id: 'vocal-1',
  user_id: 'u1',
  title: 'Vocal Practice',
  category: 'VOCAL',
  block_date: '2026-11-16',
  start_time: '07:30',
  end_time: '08:00',
  duration_min: 30,
  is_recurring: true,
  recurrence_days: [1, 2, 3, 4, 5, 6, 7],
  status: 'PLANNED',
  physical_load: 'NONE',
  notes: null,
  data_origin: 'PLANNED',
  created_at: '2026-11-16T00:00:00Z',
};

const sampleCheckIn: ReadinessCheckIn = {
  id: 'rc-1',
  user_id: 'u1',
  checkin_date: '2026-11-18',
  sleep_hours: 8,
  sleep_quality: 4,
  energy_level: 4,
  muscle_soreness: 2,
  stress_level: 2,
  resting_hr_bpm: 55,
  pain_present: false,
  pain_details: null,
  notes: null,
  created_at: '2026-11-18T06:00:00Z',
};

describe('Stage 7 AI Coach Context & Weekly Review Engine', () => {
  it('enforces privacy toggles strictly when building compact coach context', () => {
    const restricted = buildCompactCoachContext({
      today: '2026-11-20',
      profile: {
        timezone: 'Asia/Colombo',
        current_phase: 'REBUILDING',
        immediate_goal: 'Rebuild consistent running',
        first_major_5k_goal_s: 1200,
        long_term_5k_goal_s: 1050,
        ai_share_notes: false,
        ai_share_recovery: false,
        ai_share_karate: false,
        ai_share_commitments: false,
      },
      sessions: [makeRun()],
      personalBests: [],
      plannedWorkouts: [],
      blocks: [karateBlock, vocalBlock],
      checkIns: [sampleCheckIn],
    });

    expect(restricted.recentRuns[0]).not.toHaveProperty('notes');
    expect(restricted.recovery).toBeUndefined();
    expect(restricted.karateSchedule).toBeUndefined();
    expect(restricted.otherCommitments).toBeUndefined();

    const shared = buildCompactCoachContext({
      today: '2026-11-20',
      profile: {
        timezone: 'Asia/Colombo',
        current_phase: 'REBUILDING',
        immediate_goal: 'Rebuild consistent running',
        first_major_5k_goal_s: 1200,
        long_term_5k_goal_s: 1050,
        ai_share_notes: true,
        ai_share_recovery: true,
        ai_share_karate: true,
        ai_share_commitments: true,
      },
      sessions: [makeRun()],
      personalBests: [],
      plannedWorkouts: [],
      blocks: [karateBlock, vocalBlock],
      checkIns: [sampleCheckIn],
    });

    expect(shared.recentRuns[0].notes).toBe('Private personal run note');
    expect(shared.recovery?.score).toBe(84);
    expect(shared.karateSchedule?.length).toBeGreaterThan(0);
    expect(shared.otherCommitments?.length).toBeGreaterThan(0);
  });

  it('computes deterministic Mon–Sun weekly review metrics without polluting running km', () => {
    const runs = [
      makeRun({ id: 'r1', session_date: '2026-11-16', distance_m: 5000, duration_s: 1690 }),
      makeRun({ id: 'r2', session_date: '2026-11-19', distance_m: 3000, duration_s: 1080 }),
      makeRun({ id: 'r-prev', session_date: '2026-11-12', distance_m: 5000, duration_s: 1750 }),
    ];

    const planned: PlannedWorkout[] = [
      {
        id: 'p1',
        user_id: 'u1',
        plan_date: '2026-11-16',
        workout_type: 'EASY',
        title: 'Easy Run',
        target_distance_m: 5000,
        target_duration_s: 1800,
        target_pace_min_s: null,
        target_pace_max_s: null,
        target_rpe_range: 'RPE 3–4',
        phase: 'REBUILDING',
        rationale: 'Base',
        status: 'COMPLETED',
        linked_session_id: null,
        data_origin: 'PLANNED',
        created_at: '2026-11-16T00:00:00Z',
        updated_at: '2026-11-16T00:00:00Z',
      },
      {
        id: 'p2',
        user_id: 'u1',
        plan_date: '2026-11-19',
        workout_type: 'EASY',
        title: 'Easy Run',
        target_distance_m: 3000,
        target_duration_s: 1100,
        target_pace_min_s: null,
        target_pace_max_s: null,
        target_rpe_range: 'RPE 3–4',
        phase: 'REBUILDING',
        rationale: 'Base',
        status: 'COMPLETED',
        linked_session_id: null,
        data_origin: 'PLANNED',
        created_at: '2026-11-16T00:00:00Z',
        updated_at: '2026-11-16T00:00:00Z',
      },
      {
        id: 'p3',
        user_id: 'u1',
        plan_date: '2026-11-21',
        workout_type: 'EASY',
        title: 'Steady Run',
        target_distance_m: 4000,
        target_duration_s: 1450,
        target_pace_min_s: null,
        target_pace_max_s: null,
        target_rpe_range: 'RPE 4',
        phase: 'REBUILDING',
        rationale: 'Base',
        status: 'PLANNED',
        linked_session_id: null,
        data_origin: 'PLANNED',
        created_at: '2026-11-16T00:00:00Z',
        updated_at: '2026-11-16T00:00:00Z',
      },
    ];

    const review = computeDeterministicWeeklyReview({
      referenceDate: '2026-11-20',
      sessions: runs,
      plannedWorkouts: planned,
      blocks: [karateBlock, vocalBlock],
      checkIns: [sampleCheckIn],
    });

    expect(review.weekStart).toBe('2026-11-16');
    expect(review.weekEnd).toBe('2026-11-22');
    expect(review.runCount).toBe(2);
    expect(review.totalDistanceM).toBe(8000);
    expect(review.totalDurationS).toBe(2770);
    expect(review.avgPaceSecPerKm).toBe(346);
    expect(review.previousWeekDistanceM).toBe(5000);
    expect(review.distanceDeltaM).toBe(3000);
    expect(review.adherencePct).toBe(67);
    expect(review.avgReadinessScore).toBe(84);
    expect(review.karateSessionsCount).toBe(2);
    expect(review.karateMinutes).toBe(180);
  });

  it('produces grounded deterministic coach replies without inventing missing metrics', () => {
    const context = buildCompactCoachContext({
      today: '2026-11-20',
      profile: {
        timezone: 'Asia/Colombo',
        current_phase: 'REBUILDING',
        immediate_goal: 'Rebuild consistent running',
        first_major_5k_goal_s: 1200,
        long_term_5k_goal_s: 1050,
        ai_share_notes: false,
        ai_share_recovery: true,
        ai_share_karate: true,
        ai_share_commitments: false,
      },
      sessions: [],
      personalBests: [],
      plannedWorkouts: [],
      blocks: [],
      checkIns: [],
    });

    const reply = generateDeterministicCoachFallback('What should my 5K pace zone be?', context, []);
    expect(reply).toContain('None logged yet');
    expect(reply).toContain('Unavailable until a ≥ 1.50 km run is recorded');
    expect(reply).toContain('Recovery data: Missing');
  });
});