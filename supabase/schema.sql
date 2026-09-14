-- Execute no projeto Supabase privado. Não coloque chaves neste repositório.
create table if not exists public.study_contests (
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null,
  name text not null,
  exam_date date,
  target_minutes integer not null default 390 check (target_minutes between 30 and 960),
  specific_weight numeric(6,2) not null default 2.5 check (specific_weight > 0),
  general_weight numeric(6,2) not null default 1 check (general_weight > 0),
  min_questions integer not null default 10 check (min_questions between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id)
);

create table if not exists public.study_cadernos (
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null default 'dataprev-2026',
  caderno_id text not null,
  name text not null,
  subject text not null check (subject in ('specific','general')),
  topic text not null default '',
  attempted integer not null default 0 check (attempted >= 0),
  correct integer not null default 0 check (correct >= 0),
  incorrect integer not null default 0 check (incorrect >= 0),
  repeat_errors integer not null default 0 check (repeat_errors >= 0),
  last_attempt_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id, caderno_id)
);

create table if not exists public.study_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null default 'dataprev-2026',
  session_date date not null,
  session_type text not null,
  seconds integer not null check (seconds > 0),
  ended_at timestamptz not null default now(),
  source text not null default 'dashboard'
);

create table if not exists public.study_sync_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null default 'dataprev-2026',
  source text not null,
  record_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.study_content_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null default 'dataprev-2026',
  content_code text not null,
  player text not null,
  position_seconds numeric(12,2) not null default 0 check (position_seconds >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id, content_code)
);

create table if not exists public.study_content (
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null default 'dataprev-2026',
  content_code text not null,
  position integer not null default 0,
  area text not null default '',
  layer text not null default '',
  video_id text not null,
  start_seconds integer not null default 0,
  end_seconds integer not null default 0,
  title text not null,
  channel text not null default '',
  purpose text not null default '',
  tec jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, contest_id, content_code)
);

alter table public.study_contests enable row level security;
alter table public.study_cadernos enable row level security;
alter table public.study_sessions enable row level security;
alter table public.study_sync_runs enable row level security;
alter table public.study_content_progress enable row level security;
alter table public.study_content enable row level security;

drop policy if exists "own contests" on public.study_contests;
drop policy if exists "own cadernos" on public.study_cadernos;
drop policy if exists "own sessions" on public.study_sessions;
drop policy if exists "own sync runs" on public.study_sync_runs;
drop policy if exists "own content progress" on public.study_content_progress;
drop policy if exists "own content" on public.study_content;
create policy "own contests" on public.study_contests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own cadernos" on public.study_cadernos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on public.study_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sync runs" on public.study_sync_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own content progress" on public.study_content_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own content" on public.study_content for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
