-- Nexame: dados auditáveis para plano adaptativo, sem remover o histórico atual.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'America/Sao_Paulo',
  consent_activity_tracking_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.study_contests add column if not exists priority text not null default 'primary' check (priority in ('primary', 'secondary'));
alter table public.study_contests add column if not exists blueprint jsonb not null default '{}'::jsonb;
-- Mantém apenas o concurso atualizado mais recentemente como principal em dados já existentes.
update public.study_contests set priority = 'secondary' where priority = 'primary' and exists (
  select 1 from public.study_contests newer where newer.user_id = study_contests.user_id
  and newer.priority = 'primary' and newer.updated_at > study_contests.updated_at
);
create unique index if not exists one_primary_contest_per_user on public.study_contests(user_id) where priority = 'primary';

create table if not exists public.study_topics (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id text not null,
  name text not null,
  parent_topic_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

create table if not exists public.study_contest_topics (
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null,
  topic_id text not null,
  subject text not null check (subject in ('specific', 'general')),
  exam_weight numeric(8,3) not null default 1 check (exam_weight > 0),
  coverage text not null default 'planned' check (coverage in ('planned', 'partial', 'complete', 'missing')),
  source_reference text,
  primary key (user_id, contest_id, topic_id),
  foreign key (user_id, contest_id) references public.study_contests(user_id, contest_id) on delete cascade,
  foreign key (user_id, topic_id) references public.study_topics(user_id, topic_id) on delete cascade
);

create table if not exists public.study_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null,
  topic_id text,
  event_type text not null check (event_type in ('video_session', 'question_session', 'review_session', 'simulation', 'focus_pause', 'content_progress')),
  source text not null,
  started_at timestamptz,
  ended_at timestamptz not null default now(),
  seconds integer not null default 0 check (seconds >= 0 and seconds <= 86400),
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  foreign key (user_id, contest_id) references public.study_contests(user_id, contest_id) on delete cascade
);
create index if not exists study_events_user_contest_ended_idx on public.study_events(user_id, contest_id, ended_at desc);

create table if not exists public.study_question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null,
  topic_id text,
  source text not null,
  external_question_id text not null,
  caderno_id text,
  correct boolean not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 7200),
  attempted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  unique (user_id, idempotency_key),
  foreign key (user_id, contest_id) references public.study_contests(user_id, contest_id) on delete cascade
);
create index if not exists study_question_attempts_user_contest_idx on public.study_question_attempts(user_id, contest_id, attempted_at desc);

create table if not exists public.study_plan_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id text not null,
  plan_date date not null,
  algorithm_version text not null,
  inputs jsonb not null,
  decisions jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, contest_id) references public.study_contests(user_id, contest_id) on delete cascade
);

alter table public.profiles enable row level security;
alter table public.study_topics enable row level security;
alter table public.study_contest_topics enable row level security;
alter table public.study_events enable row level security;
alter table public.study_question_attempts enable row level security;
alter table public.study_plan_decisions enable row level security;

drop policy if exists "own profile" on public.profiles;
drop policy if exists "own topics" on public.study_topics;
drop policy if exists "own contest topics" on public.study_contest_topics;
drop policy if exists "own events" on public.study_events;
drop policy if exists "own question attempts" on public.study_question_attempts;
drop policy if exists "own plan decisions" on public.study_plan_decisions;
create policy "own profile" on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own topics" on public.study_topics for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own contest topics" on public.study_contest_topics for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own events" on public.study_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own question attempts" on public.study_question_attempts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own plan decisions" on public.study_plan_decisions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
