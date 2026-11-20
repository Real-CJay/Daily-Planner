create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model_used text,
  context_snapshot jsonb,
  data_origin text not null default 'SUGGESTED' check (data_origin in ('RECORDED', 'SUGGESTED')),
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  summary_snapshot jsonb not null,
  ai_narrative text,
  ai_model text,
  user_reflection text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.coach_messages enable row level security;
alter table public.weekly_reviews enable row level security;

drop policy if exists "Users manage own coach_messages" on public.coach_messages;
create policy "Users manage own coach_messages"
  on public.coach_messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage own weekly_reviews" on public.weekly_reviews;
create policy "Users manage own weekly_reviews"
  on public.weekly_reviews
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);