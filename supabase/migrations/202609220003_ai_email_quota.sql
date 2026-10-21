-- Atomic AI quota enforcement and metadata-only usage recording.
-- Email input and generated output are never accepted by these functions.

create or replace function public.reserve_ai_email_request()
returns table (allowed boolean, used bigint, quota bigint, period_end date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  month_start date := date_trunc('month', timezone('utc', now()))::date;
  month_end date := (date_trunc('month', timezone('utc', now())) + interval '1 month - 1 day')::date;
  request_quota bigint;
  request_count bigint;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(
    max(e.limit_value) filter (
      where e.entitlement_key = 'ai_monthly_requests'
        and e.enabled
        and e.valid_from <= now()
        and (e.valid_until is null or e.valid_until > now())
    ),
    case when exists (
      select 1 from public.subscriptions s
      where s.user_id = caller_id
        and lower(s.plan_key) = 'pro'
        and s.status in ('trialing', 'active')
        and (s.current_period_end is null or s.current_period_end > now())
    ) or exists (
      select 1 from public.entitlements p
      where p.user_id = caller_id and p.entitlement_key = 'pro' and p.enabled
        and p.valid_from <= now() and (p.valid_until is null or p.valid_until > now())
    ) then 500 else 50 end
  ) into request_quota
  from public.entitlements e
  where e.user_id = caller_id;

  request_quota := greatest(coalesce(request_quota, 50), 0);

  insert into public.ai_usage (user_id, usage_type, period_start, period_end)
  values (caller_id, 'email_assist', month_start, month_end)
  on conflict (user_id, period_start, usage_type) do nothing;

  update public.ai_usage u
  set request_count = u.request_count + 1
  where u.user_id = caller_id
    and u.usage_type = 'email_assist'
    and u.period_start = month_start
    and u.request_count < request_quota
  returning u.request_count into request_count;

  if request_count is null then
    select u.request_count into request_count
    from public.ai_usage u
    where u.user_id = caller_id and u.usage_type = 'email_assist' and u.period_start = month_start;
    return query select false, coalesce(request_count, 0), request_quota, month_end;
  else
    return query select true, request_count, request_quota, month_end;
  end if;
end;
$$;

create or replace function public.record_ai_email_usage(
  input_tokens bigint,
  output_tokens bigint,
  operation text,
  model text,
  provider_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  month_start date := date_trunc('month', timezone('utc', now()))::date;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if input_tokens < 0 or output_tokens < 0 or
     operation not in ('reply', 'grammar', 'professional', 'shorten', 'expand', 'friendly', 'formal') or
     char_length(model) not between 1 and 100 or
     (provider_request_id is not null and char_length(provider_request_id) > 200) then
    raise exception 'Invalid AI usage metadata' using errcode = '22023';
  end if;

  update public.ai_usage u
  set input_units = u.input_units + input_tokens,
      output_units = u.output_units + output_tokens
  where u.user_id = caller_id and u.usage_type = 'email_assist' and u.period_start = month_start;

  insert into public.audit_events (user_id, event_type, actor_type, metadata)
  values (
    caller_id,
    'ai.email.completed',
    'user',
    jsonb_build_object(
      'operation', operation,
      'model', model,
      'input_tokens', input_tokens,
      'output_tokens', output_tokens,
      'provider_request_id', provider_request_id
    )
  );
end;
$$;

revoke all on function public.reserve_ai_email_request() from public, anon;
revoke all on function public.record_ai_email_usage(bigint, bigint, text, text, text) from public, anon;
grant execute on function public.reserve_ai_email_request() to authenticated;
grant execute on function public.record_ai_email_usage(bigint, bigint, text, text, text) to authenticated;

comment on function public.reserve_ai_email_request() is 'Atomically reserves one monthly AI email request for auth.uid(); stores no email content.';
comment on function public.record_ai_email_usage(bigint, bigint, text, text, text) is 'Records token and request metadata for auth.uid(); accepts no email content.';

