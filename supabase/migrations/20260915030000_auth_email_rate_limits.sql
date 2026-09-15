-- Camada adicional ao rate limit nativo do Supabase Auth.
-- Não armazena e-mail ou IP em texto: somente hashes de escopo.
create table if not exists public.auth_email_send_limits (
  rate_key text primary key,
  last_sent_at timestamptz not null,
  window_started_at timestamptz not null,
  send_count integer not null default 1 check (send_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.auth_email_send_limits enable row level security;

create or replace function public.claim_auth_email_send(p_email text, p_action text, p_ip text default '')
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  rate_key text;
  record_row public.auth_email_send_limits%rowtype;
  keys text[];
  scope_limit integer;
  retry_seconds integer := 0;
begin
  if p_action not in ('signup', 'recovery') then
    raise exception 'unsupported auth email action';
  end if;

  keys := array[
    'email:' || p_action || ':' || encode(extensions.digest(lower(trim(p_email)), 'sha256'), 'hex'),
    'ip:' || p_action || ':' || encode(extensions.digest(coalesce(nullif(trim(p_ip), ''), 'unknown'), 'sha256'), 'hex')
  ];

  foreach rate_key in array keys loop
    select * into record_row from public.auth_email_send_limits where auth_email_send_limits.rate_key = rate_key for update;
    if found then
      if record_row.last_sent_at > now() - interval '60 seconds' then
        retry_seconds := greatest(retry_seconds, ceil(extract(epoch from (record_row.last_sent_at + interval '60 seconds' - now())))::integer);
      end if;
      scope_limit := case when rate_key like 'email:%' then 5 else 15 end;
      if record_row.window_started_at > now() - interval '1 hour' and record_row.send_count >= scope_limit then
        retry_seconds := greatest(retry_seconds, ceil(extract(epoch from (record_row.window_started_at + interval '1 hour' - now())))::integer);
      end if;
    end if;
  end loop;

  if retry_seconds > 0 then
    return query select false, retry_seconds;
    return;
  end if;

  foreach rate_key in array keys loop
    insert into public.auth_email_send_limits(rate_key, last_sent_at, window_started_at, send_count)
    values (rate_key, now(), now(), 1)
    on conflict (rate_key) do update set
      last_sent_at = now(),
      window_started_at = case when public.auth_email_send_limits.window_started_at <= now() - interval '1 hour' then now() else public.auth_email_send_limits.window_started_at end,
      send_count = case when public.auth_email_send_limits.window_started_at <= now() - interval '1 hour' then 1 else public.auth_email_send_limits.send_count + 1 end,
      updated_at = now();
  end loop;

  return query select true, 0;
end;
$$;

revoke all on table public.auth_email_send_limits from anon, authenticated;
revoke all on function public.claim_auth_email_send(text, text, text) from public;
grant execute on function public.claim_auth_email_send(text, text, text) to service_role;
