export type DataOrigin =
  | 'RECORDED'
  | 'CALCULATED'
  | 'ESTIMATED'
  | 'PLANNED'
  | 'SUGGESTED'
  | 'MISSING';

export type TrainingPhase =
  | 'REBUILDING'
  | 'BUILDING_CONSISTENCY'
  | 'PERFORMANCE_DEVELOPMENT'
  | 'GOAL_SPECIFIC_5K';

export type ActivityCategory =
  | 'RUNNING'
  | 'KARATE'
  | 'RECOVERY'
  | 'VOCAL'
  | 'DRUMMING'
  | 'UNIVERSITY'
  | 'CUSTOM';

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  RUNNING: 'Running',
  KARATE: 'Karate',
  RECOVERY: 'Rest & Recovery',
  VOCAL: 'Vocal Practice',
  DRUMMING: 'Drumming',
  UNIVERSITY: 'University',
  CUSTOM: 'Custom',
};

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  timezone: string;
  week_start_day: number; // 1 = Monday
  current_phase: TrainingPhase;
  immediate_goal: string;
  first_major_5k_goal_s: number;
  long_term_5k_goal_s: number;
  preferred_run_days: number[];
  ai_enabled: boolean;
  ai_preferred_model: string;
  ai_privacy_consent_acknowledged: boolean;
  ai_share_notes: boolean;
  ai_share_recovery: boolean;
  ai_share_karate: boolean;
  ai_share_commitments: boolean;
  created_at: string;
  updated_at: string;
}

export const TRAINING_PHASE_LABELS: Record<TrainingPhase, string> = {
  REBUILDING: 'Phase 1 — Rebuilding',
  BUILDING_CONSISTENCY: 'Phase 2 — Building Consistency',
  PERFORMANCE_DEVELOPMENT: 'Phase 3 — Performance Development',
  GOAL_SPECIFIC_5K: 'Phase 4 — Goal-Specific 5K Training',
};

export type WorkoutType =
  | 'EASY'
  | 'RECOVERY'
  | 'LONG'
  | 'TEMPO'
  | 'INTERVALS'
  | 'PROGRESSION'
  | 'TIME_TRIAL'
  | 'RACE'
  | 'TREADMILL'
  | 'RUN_WALK'
  | 'OTHER';

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  EASY: 'Easy',
  RECOVERY: 'Recovery',
  LONG: 'Long',
  TEMPO: 'Tempo',
  INTERVALS: 'Intervals',
  PROGRESSION: 'Progression',
  TIME_TRIAL: 'Time Trial',
  RACE: 'Race',
  TREADMILL: 'Treadmill',
  RUN_WALK: 'Run / Walk',
  OTHER: 'Other',
};

export type EntryMethod = 'MANUAL' | 'SCREENSHOT' | 'HISTORICAL_IMPORT';

export interface RunningSplit {
  id: string;
  user_id: string;
  session_id: string;
  split_index: number;
  distance_m: number;
  duration_s: number;
  is_partial: boolean;
  avg_hr_bpm: number | null;
  data_origin: 'RECORDED';
  created_at: string;
}

export interface RunningSession {
  id: string;
  user_id: string;
  session_date: string; // YYYY-MM-DD
  start_time: string | null;
  distance_m: number;
  duration_s: number;
  workout_type: WorkoutType;
  is_indoor: boolean;
  avg_hr_bpm: number | null;
  max_hr_bpm: number | null;
  cadence_spm: number | null;
  elevation_gain_m: number | null;
  rpe: number | null;
  energy_level: number | null;
  muscle_soreness: number | null;
  pain_present: boolean;
  pain_details: string | null;
  conditions: string | null;
  notes: string | null;
  data_origin: 'RECORDED';
  entry_method: EntryMethod;
  is_historical_record: boolean;
  created_at: string;
  updated_at: string;
  splits?: RunningSplit[];
}

export interface SplitDraft {
  split_index: number;
  distance_m: number;
  duration_s: number;
  is_partial: boolean;
  avg_hr_bpm: number | null;
}

export interface RunningSessionDraft {
  session_date: string;
  start_time: string | null;
  distance_m: number;
  duration_s: number;
  workout_type: WorkoutType;
  is_indoor: boolean;
  avg_hr_bpm: number | null;
  max_hr_bpm: number | null;
  cadence_spm: number | null;
  elevation_gain_m: number | null;
  rpe: number | null;
  energy_level: number | null;
  muscle_soreness: number | null;
  pain_present: boolean;
  pain_details: string | null;
  conditions: string | null;
  notes: string | null;
  entry_method?: EntryMethod;
  is_historical_record?: boolean;
  splits: SplitDraft[];
}

export type ScheduleStatus = 'PLANNED' | 'COMPLETED' | 'SKIPPED' | 'RESCHEDULED';
export type PhysicalLoadLevel = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';

export interface ScheduleBlock {
  id: string;
  user_id: string;
  title: string;
  category: ActivityCategory;
  block_date: string; // YYYY-MM-DD (anchor date if recurring)
  start_time: string | null; // HH:MM
  end_time: string | null; // HH:MM
  duration_min: number | null;
  is_recurring: boolean;
  recurrence_days: number[]; // ISO weekday 1=Mon .. 7=Sun
  status: ScheduleStatus;
  physical_load: PhysicalLoadLevel;
  notes: string | null;
  data_origin: 'PLANNED' | 'RECORDED';
  created_at: string;
}

export interface ScheduleBlockDraft {
  title: string;
  category: ActivityCategory;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_min: number | null;
  is_recurring: boolean;
  recurrence_days: number[];
  status: ScheduleStatus;
  physical_load: PhysicalLoadLevel;
  notes: string | null;
}

export interface ReadinessCheckIn {
  id: string;
  user_id: string;
  checkin_date: string; // YYYY-MM-DD
  sleep_hours: number | null;
  sleep_quality: number | null; // 1-5
  energy_level: number | null; // 1-5
  muscle_soreness: number | null; // 1-5 (1 = none, 5 = severe)
  stress_level: number | null; // 1-5 (1 = low, 5 = high)
  resting_hr_bpm: number | null;
  pain_present: boolean;
  pain_details: string | null;
  notes: string | null;
  created_at: string;
}

export interface ReadinessCheckInDraft {
  checkin_date: string;
  sleep_hours: number | null;
  sleep_quality: number | null;
  energy_level: number | null;
  muscle_soreness: number | null;
  stress_level: number | null;
  resting_hr_bpm: number | null;
  pain_present: boolean;
  pain_details: string | null;
  notes: string | null;
}

export type BenchmarkDistance = '1K' | '3K' | '5K' | '10K';

export const BENCHMARK_DISTANCES: Record<
  BenchmarkDistance,
  { label: string; meters: number; minMatchM: number; maxMatchM: number }
> = {
  '1K': { label: '1K', meters: 1000, minMatchM: 950, maxMatchM: 1050 },
  '3K': { label: '3K', meters: 3000, minMatchM: 2900, maxMatchM: 3100 },
  '5K': { label: '5K', meters: 5000, minMatchM: 4850, maxMatchM: 5200 },
  '10K': { label: '10K', meters: 10000, minMatchM: 9800, maxMatchM: 10300 },
};

export interface PersonalBest {
  id: string;
  user_id: string;
  distance_label: BenchmarkDistance;
  distance_m: number;
  duration_s: number;
  achieved_date: string; // YYYY-MM-DD
  session_id: string | null;
  is_confirmed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalBestDraft {
  distance_label: BenchmarkDistance;
  distance_m: number;
  duration_s: number;
  achieved_date: string;
  session_id: string | null;
  notes: string | null;
}