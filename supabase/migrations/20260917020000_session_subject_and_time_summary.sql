-- A área é registrada por sessão para que o painel distinga específicas e
-- gerais sem inferir dados históricos. Sessões anteriores permanecem nulas.
alter table public.study_sessions
  add column if not exists subject text check (subject in ('specific', 'general'));

drop function if exists public.study_time_summary(text, date);

create function public.study_time_summary(
  p_contest_id text,
  p_today date default current_date
)
returns table (
  today_seconds bigint,
  yesterday_seconds bigint,
  week_seconds bigint,
  total_seconds bigint,
  specific_seconds bigint,
  general_seconds bigint,
  unclassified_seconds bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(seconds) filter (where session_date = p_today), 0)::bigint,
    coalesce(sum(seconds) filter (where session_date = p_today - 1), 0)::bigint,
    coalesce(sum(seconds) filter (where session_date >= p_today - 6 and session_date <= p_today), 0)::bigint,
    coalesce(sum(seconds), 0)::bigint,
    coalesce(sum(seconds) filter (where subject = 'specific'), 0)::bigint,
    coalesce(sum(seconds) filter (where subject = 'general'), 0)::bigint,
    coalesce(sum(seconds) filter (where subject is null), 0)::bigint
  from public.study_sessions
  where user_id = auth.uid()
    and contest_id = p_contest_id;
$$;

grant execute on function public.study_time_summary(text, date) to authenticated;
