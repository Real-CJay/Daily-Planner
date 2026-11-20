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