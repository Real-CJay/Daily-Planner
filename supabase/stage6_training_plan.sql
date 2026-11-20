create table if not exists public.planned_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  workout_type text not null check (workout_type in (
    'EASY','RECOVERY','LONG','TEMPO','INTERVALS','PROGRESSION','TIME_TRIAL','RACE','TREADMILL','RUN_WALK','OTHER'
  )),
  title text not null,
  target_distance_m integer not null check (target_distance_m >= 0 and target_distance_m <= 100000),
  target_duration_s integer check (target_duration_s is null or target_duration_s >= 0),
  target_pace_min_s integer check (target_pace_min_s is null or target_pace_min_s > 0),
  target_pace_max_s integer check (target_pace_max_s is null or target_pace_max_s > 0),
  target_rpe_range text,
  phase text not null check (phase in (
    'REBUILDING','BUILDING_CONSISTENCY','PERFORMANCE_DEVELOPMENT','GOAL_SPECIFIC_5K'
  )),
  rationale text not null,
  status text not null default 'PLANNED' check (status in ('PLANNED','COMPLETED','SKIPPED','ADJUSTED')),
  linked_session_id uuid references public.running_sessions(id) on delete set null,
  data_origin text not null default 'PLANNED' check (data_origin in ('PLANNED','SUGGESTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists public.plan_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  adjustment_date date not null,
  trigger_code text not null,
  trigger_reason text not null,
  previous_summary text not null,
  proposed_summary text not null,
  decision text not null check (decision in ('ACCEPTED','DISMISSED')),
  created_at timestamptz not null default now()
);

alter table public.planned_workouts enable row level security;
alter table public.plan_adjustments enable row level security;

drop policy if exists "Users manage own planned_workouts" on public.planned_workouts;
create policy "Users manage own planned_workouts"
  on public.planned_workouts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own plan_adjustments" on public.plan_adjustments;
create policy "Users manage own plan_adjustments"
  on public.plan_adjustments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);