create or replace function public.claim_auth_email_send(p_email text, p_action text, p_ip text default '')
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_key text;
  record_row public.auth_email_send_limits%rowtype;
  keys text[];
  scope_limit integer;
  retry_seconds integer := 0;
begin
  if p_action not in ('signup', 'recovery') then raise exception 'unsupported auth email action'; end if;
  keys := array[
    'email:' || p_action || ':' || encode(extensions.digest(lower(trim(p_email)), 'sha256'), 'hex'),
    'ip:' || p_action || ':' || encode(extensions.digest(coalesce(nullif(trim(p_ip), ''), 'unknown'), 'sha256'), 'hex')
  ];
  foreach current_key in array keys loop
    select * into record_row from public.auth_email_send_limits where auth_email_send_limits.rate_key = current_key for update;
    if found then
      if record_row.last_sent_at > now() - interval '60 seconds' then retry_seconds := greatest(retry_seconds, ceil(extract(epoch from (record_row.last_sent_at + interval '60 seconds' - now())))::integer); end if;
      scope_limit := case when current_key like 'email:%' then 5 else 15 end;
      if record_row.window_started_at > now() - interval '1 hour' and record_row.send_count >= scope_limit then retry_seconds := greatest(retry_seconds, ceil(extract(epoch from (record_row.window_started_at + interval '1 hour' - now())))::integer); end if;
    end if;
  end loop;
  if retry_seconds > 0 then return query select false, retry_seconds; return; end if;
  foreach current_key in array keys loop
    insert into public.auth_email_send_limits(rate_key, last_sent_at, window_started_at, send_count)
    values (current_key, now(), now(), 1)
    on conflict (rate_key) do update set
      last_sent_at = now(),
      window_started_at = case when public.auth_email_send_limits.window_started_at <= now() - interval '1 hour' then now() else public.auth_email_send_limits.window_started_at end,
      send_count = case when public.auth_email_send_limits.window_started_at <= now() - interval '1 hour' then 1 else public.auth_email_send_limits.send_count + 1 end,
      updated_at = now();
  end loop;
  return query select true, 0;
end;
$$;
