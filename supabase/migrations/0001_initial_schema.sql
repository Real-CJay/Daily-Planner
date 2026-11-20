-- Running Rebuild — Initial Schema & Row Level Security
-- Strictly separates source records from calculated summaries and enforces data provenance.

create extension if not exists "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================
create type data_origin as enum (
  'RECORDED',
  'CALCULATED',
  'ESTIMATED',
  'PLANNED',
  'SUGGESTED',
  'MISSING'
);

create type training_phase as enum (
  'REBUILDING',
  'BUILDING_CONSISTENCY',
  'PERFORMANCE_DEVELOPMENT',
  'GOAL_SPECIFIC_5K'
);

create type workout_type as enum (
  'EASY',
  'RECOVERY',
  'LONG',
  'TEMPO',
  'INTERVALS',
  'PROGRESSION',
  'TIME_TRIAL',
  'RACE',
  'TREADMILL',
  'RUN_WALK',
  'OTHER'
);

create type activity_status as enum (
  'PLANNED',
  'COMPLETED',
  'SKIPPED',
  'CANCELLED'
);

create type other_activity_category as enum (
  'VOCAL',
  'DRUMMING',
  'UNIVERSITY',
  'CUSTOM'
);

create type rest_type as enum (
  'COMPLETE_REST',
  'RUNNING_REST',
  'ACTIVE_RECOVERY',
  'RECOMMENDED_RECOVERY'
);

create type rest_status as enum (
  'SUGGESTED',
  'PLANNED',
  'CONFIRMED',
  'CHANGED',
  'CANCELLED'
);

create type readiness_choice as enum (
  'READY_TO_TRAIN',
  'SOMEWHAT_TIRED',
  'NEED_RECOVERY'
);

create type pb_classification as enum (
  'CONFIRMED_PB',
  'FASTEST_LOGGED',
  'ESTIMATED'
);

create type adaptive_decision as enum (
  'ESTABLISH_BASELINE',
  'REBUILD',
  'MAINTAIN',
  'CONSIDER_PROGRESSION',
  'RECOVER',
  'REDUCE_LOAD',
  'PAUSE_AND_REASSESS'
);

-- ============================================================================
-- HELPER TRIGGER FOR updated_at
-- ============================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. USER PROFILES & PREFERENCES
-- ============================================================================
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Colombo',
  week_start_day smallint not null default 1 check (week_start_day between 1 and 7), -- 1 = Monday
  current_phase training_phase not null default 'REBUILDING',
  immediate_goal text not null default 'Rebuild running consistency and aerobic fitness',
  first_major_5k_goal_s integer not null default 1200 check (first_major_5k_goal_s > 0),  -- 20:00
  long_term_5k_goal_s integer not null default 1050 check (long_term_5k_goal_s > 0),      -- 17:30
  preferred_run_days smallint[] not null default '{}',
  ai_enabled boolean not null default false,
  ai_preferred_model text not null default 'gemini-4-hydrogen',
  ai_privacy_consent_acknowledged boolean not null default false,
  ai_share_notes boolean not null default true,
  ai_share_recovery boolean not null default true,
  ai_share_karate boolean not null default true,
  ai_share_commitments boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_user_profiles_updated
  before update on user_profiles
  for each row execute function set_updated_at();

-- Auto-create profile when a user signs up
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (new.id, split_part(coalesce(new.email, 'Runner'), '@', 1))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- 2. RECURRENCE RULES (Scheduled templates; NEVER auto-completed)
-- ============================================================================
create table recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_domain text not null check (activity_domain in ('KARATE', 'VOCAL', 'DRUMMING', 'UNIVERSITY', 'CUSTOM')),
  title text not null,
  days_of_week smallint[] not null check (cardinality(days_of_week) > 0), -- 1=Mon .. 7=Sun
  default_start_time time,
  default_duration_min integer check (default_duration_min is null or default_duration_min > 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recurrence_rules_user on recurrence_rules(user_id);
create trigger trg_recurrence_rules_updated
  before update on recurrence_rules
  for each row execute function set_updated_at();

-- ============================================================================
-- 3. RUNNING SESSIONS & SPLITS
-- ============================================================================
create table running_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  start_time time,
  distance_m integer not null check (distance_m > 0),
  duration_s integer not null check (duration_s > 0),
  workout_type workout_type not null default 'EASY',
  is_indoor boolean not null default false,
  avg_hr_bpm smallint check (avg_hr_bpm is null or (avg_hr_bpm between 30 and 240)),
  max_hr_bpm smallint check (max_hr_bpm is null or (max_hr_bpm between 30 and 240)),
  cadence_spm smallint check (cadence_spm is null or (cadence_spm between 80 and 250)),
  elevation_gain_m integer check (elevation_gain_m is null or elevation_gain_m >= 0),
  rpe smallint check (rpe is null or (rpe between 1 and 10)),
  energy_level smallint check (energy_level is null or (energy_level between 1 and 5)),
  muscle_soreness smallint check (muscle_soreness is null or (muscle_soreness between 1 and 5)),
  pain_present boolean not null default false,
  pain_details text,
  conditions text,
  notes text,
  data_origin data_origin not null default 'RECORDED' check (data_origin = 'RECORDED'),
  entry_method text not null default 'MANUAL' check (entry_method in ('MANUAL', 'SCREENSHOT', 'HISTORICAL_IMPORT')),
  is_historical_record boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_running_sessions_user_date on running_sessions(user_id, session_date desc);
create trigger trg_running_sessions_updated
  before update on running_sessions
  for each row execute function set_updated_at();

create table running_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references running_sessions(id) on delete cascade,
  split_index smallint not null check (split_index > 0),
  distance_m integer not null check (distance_m > 0),
  duration_s integer not null check (duration_s > 0),
  is_partial boolean not null default false,
  avg_hr_bpm smallint check (avg_hr_bpm is null or (avg_hr_bpm between 30 and 240)),
  data_origin data_origin not null default 'RECORDED' check (data_origin = 'RECORDED'),
  created_at timestamptz not null default now(),
  unique (session_id, split_index)
);

create index idx_running_splits_session on running_splits(session_id, split_index);

-- ============================================================================
-- 4. SCREENSHOT IMPORTS
-- ============================================================================
create table screenshot_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  storage_path text not null,
  file_sha256 text not null,
  retain_image boolean not null default true,
  extracted_payload jsonb,
  uncertain_fields text[] not null default '{}',
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW', 'CONFIRMED', 'DISCARDED', 'DUPLICATE_BLOCKED')),
  linked_session_id uuid references running_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_screenshot_imports_user_hash on screenshot_imports(user_id, file_sha256);
create index idx_screenshot_imports_batch on screenshot_imports(user_id, batch_id);
create trigger trg_screenshot_imports_updated
  before update on screenshot_imports
  for each row execute function set_updated_at();

-- ============================================================================
-- 5. KARATE SESSIONS (Isolated from running mileage/pace/PBs)
-- ============================================================================
create table karate_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurrence_rule_id uuid references recurrence_rules(id) on delete set null,
  session_date date not null,
  start_time time,
  duration_min integer check (duration_min is null or duration_min > 0),
  intensity text check (intensity is null or intensity in ('LIGHT', 'MODERATE', 'HARD', 'VERY_HARD')),
  rpe smallint check (rpe is null or (rpe between 1 and 10)),
  fatigue_after smallint check (fatigue_after is null or (fatigue_after between 1 and 5)),
  muscle_soreness smallint check (muscle_soreness is null or (muscle_soreness between 1 and 5)),
  status activity_status not null default 'PLANNED',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_karate_sessions_user_date on karate_sessions(user_id, session_date desc);
create trigger trg_karate_sessions_updated
  before update on karate_sessions
  for each row execute function set_updated_at();

-- ============================================================================
-- 6. OTHER ACTIVITIES (Vocal, Drumming, University, Custom)
-- ============================================================================
create table other_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurrence_rule_id uuid references recurrence_rules(id) on delete set null,
  category other_activity_category not null,
  title text not null,
  session_date date not null,
  start_time time,
  duration_min integer check (duration_min is null or duration_min > 0),
  status activity_status not null default 'PLANNED',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_other_activities_user_date on other_activities(user_id, session_date desc);
create trigger trg_other_activities_updated
  before update on other_activities
  for each row execute function set_updated_at();

-- ============================================================================
-- 7. REST DAYS & DAILY READINESS CHECK-INS
-- ============================================================================
create table rest_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rest_date date not null,
  rest_type rest_type not null default 'RUNNING_REST',
  status rest_status not null default 'PLANNED',
  energy_level smallint check (energy_level is null or (energy_level between 1 and 5)),
  muscle_soreness smallint check (muscle_soreness is null or (muscle_soreness between 1 and 5)),
  fatigue_level smallint check (fatigue_level is null or (fatigue_level between 1 and 5)),
  pain_present boolean not null default false,
  pain_details text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, rest_date)
);

create index idx_rest_days_user_date on rest_days(user_id, rest_date desc);
create trigger trg_rest_days_updated
  before update on rest_days
  for each row execute function set_updated_at();

create table readiness_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  recorded_at timestamptz not null default now(),
  readiness readiness_choice not null,
  energy_level smallint check (energy_level is null or (energy_level between 1 and 5)),
  muscle_soreness smallint check (muscle_soreness is null or (muscle_soreness between 1 and 5)),
  pain_present boolean not null default false,
  pain_details text,
  available_minutes integer check (available_minutes is null or available_minutes >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_readiness_checkins_user_time on readiness_checkins(user_id, recorded_at desc);

-- ============================================================================
-- 8. ADAPTIVE RECOMMENDATIONS & PLANNED WORKOUTS
-- ============================================================================
create table training_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  engine_version text not null,
  target_date date not null,
  decision adaptive_decision not null,
  training_phase training_phase not null,
  recommended_kind text not null check (recommended_kind in ('RUN', 'REST', 'ACTIVE_RECOVERY')),
  workout_type workout_type,
  suggested_duration_min integer check (suggested_duration_min is null or suggested_duration_min > 0),
  suggested_distance_m integer check (suggested_distance_m is null or suggested_distance_m > 0),
  target_intensity text not null,
  pace_guidance text,
  confidence text not null check (confidence in ('LOW', 'MODERATE', 'HIGH')),
  reasoning text not null,
  recovery_considerations text,
  input_snapshot jsonb not null,
  status text not null default 'SUGGESTED'
    check (status in ('SUGGESTED', 'ACCEPTED', 'MODIFIED', 'SKIPPED', 'REPLACED', 'SUPERSEDED')),
  superseded_by_id uuid references training_recommendations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_training_recs_user_date on training_recommendations(user_id, target_date desc);
create trigger trg_training_recs_updated
  before update on training_recommendations
  for each row execute function set_updated_at();

create table planned_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid references training_recommendations(id) on delete set null,
  planned_date date not null,
  workout_type workout_type not null,
  target_duration_min integer check (target_duration_min is null or target_duration_min > 0),
  target_distance_m integer check (target_distance_m is null or target_distance_m > 0),
  target_effort text,
  pace_guidance text,
  status activity_status not null default 'PLANNED',
  linked_session_id uuid references running_sessions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_planned_workouts_user_date on planned_workouts(user_id, planned_date desc);
create trigger trg_planned_workouts_updated
  before update on planned_workouts
  for each row execute function set_updated_at();

-- ============================================================================
-- 9. PERSONAL BESTS
-- ============================================================================
create table personal_bests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  distance_bucket text not null check (distance_bucket in ('1K', '3K', '5K', '10K')),
  session_id uuid references running_sessions(id) on delete set null,
  duration_s integer not null check (duration_s > 0),
  recorded_date date not null,
  classification pb_classification not null,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, distance_bucket, classification)
);

create index idx_personal_bests_user on personal_bests(user_id, distance_bucket);
create trigger trg_personal_bests_updated
  before update on personal_bests
  for each row execute function set_updated_at();

-- ============================================================================
-- 10. AI CONVERSATIONS, WEEKLY SUMMARIES & USAGE LOGS
-- ============================================================================
create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Coaching Session',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ai_conversations_user on ai_conversations(user_id, updated_at desc);
create trigger trg_ai_conversations_updated
  before update on ai_conversations
  for each row execute function set_updated_at();

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('USER', 'ASSISTANT')),
  content text not null,
  model_used text,
  context_hash text,
  created_at timestamptz not null default now()
);

create index idx_ai_messages_conversation on ai_messages(conversation_id, created_at asc);

create table weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null, -- Always a Monday in user's timezone
  metrics_json jsonb not null,
  ai_review_json jsonb,
  data_revision_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

create index idx_weekly_summaries_user_week on weekly_summaries(user_id, week_start_date desc);
create trigger trg_weekly_summaries_updated
  before update on weekly_summaries
  for each row execute function set_updated_at();

create table ai_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  scope text not null check (scope in ('DASHBOARD_INSIGHT', 'RUN_ANALYSIS', 'WEEKLY_REVIEW')),
  model_used text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, cache_key)
);

create table ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  model_used text,
  status_code smallint not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_ai_usage_logs_user_time on ai_usage_logs(user_id, created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY (Strictly isolated per authenticated user)
-- ============================================================================
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'user_profiles',
    'recurrence_rules',
    'running_sessions',
    'running_splits',
    'screenshot_imports',
    'karate_sessions',
    'other_activities',
    'rest_days',
    'readiness_checkins',
    'training_recommendations',
    'planned_workouts',
    'personal_bests',
    'ai_conversations',
    'ai_messages',
    'weekly_summaries',
    'ai_cache',
    'ai_usage_logs'
  ]
  loop
    execute format('alter table %I enable row level security;', tbl);
    execute format('alter table %I force row level security;', tbl);
    execute format(
      'create policy "%I_select_own" on %I for select using (auth.uid() = user_id);',
      tbl, tbl
    );
    execute format(
      'create policy "%I_insert_own" on %I for insert with check (auth.uid() = user_id);',
      tbl, tbl
    );
    execute format(
      'create policy "%I_update_own" on %I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      tbl, tbl
    );
    execute format(
      'create policy "%I_delete_own" on %I for delete using (auth.uid() = user_id);',
      tbl, tbl
    );
  end loop;
end $$;