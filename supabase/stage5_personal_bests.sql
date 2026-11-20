create table if not exists public.personal_bests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  distance_label text not null check (distance_label in ('1K', '3K', '5K', '10K')),
  distance_m integer not null check (distance_m > 0),
  duration_s integer not null check (duration_s > 0),
  achieved_date date not null,
  session_id uuid references public.running_sessions(id) on delete set null,
  is_confirmed boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, distance_label)
);

alter table public.personal_bests enable row level security;

drop policy if exists "Users manage own personal_bests" on public.personal_bests;
create policy "Users manage own personal_bests"
  on public.personal_bests
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);