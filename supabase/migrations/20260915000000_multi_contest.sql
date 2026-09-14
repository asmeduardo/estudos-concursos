-- Migração para um painel reutilizável em qualquer concurso.
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

alter table public.study_contests add column if not exists min_questions integer not null default 10;

alter table public.study_cadernos add column if not exists contest_id text not null default 'dataprev-2026';
alter table public.study_sessions add column if not exists contest_id text not null default 'dataprev-2026';
alter table public.study_sync_runs add column if not exists contest_id text not null default 'dataprev-2026';

alter table public.study_cadernos drop constraint if exists study_cadernos_pkey;
alter table public.study_cadernos add constraint study_cadernos_pkey primary key (user_id, contest_id, caderno_id);

alter table public.study_contests enable row level security;
drop policy if exists "own contests" on public.study_contests;
create policy "own contests" on public.study_contests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
alter table public.study_content_progress enable row level security;
drop policy if exists "own content progress" on public.study_content_progress;
create policy "own content progress" on public.study_content_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
alter table public.study_content enable row level security;
drop policy if exists "own content" on public.study_content;
create policy "own content" on public.study_content for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
