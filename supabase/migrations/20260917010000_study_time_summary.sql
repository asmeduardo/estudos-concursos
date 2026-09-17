-- Resumo agregado para o painel. A função respeita a identidade autenticada;
-- não expõe sessões de outro usuário e evita transferir o histórico bruto só
-- para exibir os totais de estudo.
create or replace function public.study_time_summary(
  p_contest_id text,
  p_today date default current_date
)
returns table (
  today_seconds bigint,
  yesterday_seconds bigint,
  week_seconds bigint,
  total_seconds bigint
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
    coalesce(sum(seconds), 0)::bigint
  from public.study_sessions
  where user_id = auth.uid()
    and contest_id = p_contest_id;
$$;

grant execute on function public.study_time_summary(text, date) to authenticated;
