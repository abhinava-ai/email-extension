-- Server-authoritative product capabilities for the authenticated user.
-- Business is recognized for forward compatibility but currently receives the
-- same product capabilities as Pro until business-only features are defined.

create or replace function public.get_my_entitlements()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_plan text := 'free';
  template_limit bigint := 5;
  ai_limit bigint := 50;
  chrome_sync boolean := false;
  rich_editor boolean := false;
  override_limit bigint;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select lower(s.plan_key) into active_plan
  from public.subscriptions s
  where s.user_id = caller_id
    and lower(s.plan_key) in ('pro', 'business')
    and s.status in ('trialing', 'active')
    and (s.current_period_end is null or s.current_period_end > now())
  order by case lower(s.plan_key) when 'business' then 2 else 1 end desc, s.updated_at desc
  limit 1;

  active_plan := coalesce(active_plan, 'free');
  if active_plan in ('pro', 'business') then
    template_limit := null;
    ai_limit := 500;
    chrome_sync := true;
    rich_editor := true;
  end if;

  select max(e.limit_value) into override_limit
  from public.entitlements e
  where e.user_id = caller_id and e.entitlement_key = 'template_limit' and e.enabled
    and e.valid_from <= now() and (e.valid_until is null or e.valid_until > now());
  if override_limit is not null then template_limit := greatest(override_limit, 0); end if;

  select max(e.limit_value) into override_limit
  from public.entitlements e
  where e.user_id = caller_id and e.entitlement_key = 'ai_monthly_requests' and e.enabled
    and e.valid_from <= now() and (e.valid_until is null or e.valid_until > now());
  if override_limit is not null then ai_limit := greatest(override_limit, 0); end if;

  if exists (
    select 1 from public.entitlements e
    where e.user_id = caller_id and e.entitlement_key = 'chrome_sync' and e.enabled
      and e.valid_from <= now() and (e.valid_until is null or e.valid_until > now())
  ) then chrome_sync := true; end if;

  if exists (
    select 1 from public.entitlements e
    where e.user_id = caller_id and e.entitlement_key = 'rich_editor' and e.enabled
      and e.valid_from <= now() and (e.valid_until is null or e.valid_until > now())
  ) then rich_editor := true; end if;

  return jsonb_build_object(
    'version', 1,
    'plan', initcap(active_plan),
    'templateLimit', template_limit,
    'aiMonthlyLimit', ai_limit,
    'chromeSync', chrome_sync,
    'richEditor', rich_editor,
    'validatedAt', extract(epoch from now())::bigint
  );
end;
$$;

revoke all on function public.get_my_entitlements() from public, anon;
grant execute on function public.get_my_entitlements() to authenticated;

comment on function public.get_my_entitlements() is 'Returns server-authoritative Free, Pro, or reserved Business capabilities for auth.uid().';

-- Business shares the Pro AI allowance while reserved for future product use.
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
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select coalesce(
    max(e.limit_value) filter (
      where e.entitlement_key = 'ai_monthly_requests' and e.enabled and e.valid_from <= now()
        and (e.valid_until is null or e.valid_until > now())
    ),
    case when exists (
      select 1 from public.subscriptions s
      where s.user_id = caller_id and lower(s.plan_key) in ('pro', 'business')
        and s.status in ('trialing', 'active') and (s.current_period_end is null or s.current_period_end > now())
    ) then 500 else 50 end
  ) into request_quota
  from public.entitlements e where e.user_id = caller_id;
  request_quota := greatest(coalesce(request_quota, 50), 0);
  insert into public.ai_usage (user_id, usage_type, period_start, period_end)
  values (caller_id, 'email_assist', month_start, month_end)
  on conflict (user_id, period_start, usage_type) do nothing;
  update public.ai_usage u set request_count = u.request_count + 1
  where u.user_id = caller_id and u.usage_type = 'email_assist' and u.period_start = month_start
    and u.request_count < request_quota returning u.request_count into request_count;
  if request_count is null then
    select u.request_count into request_count from public.ai_usage u
    where u.user_id = caller_id and u.usage_type = 'email_assist' and u.period_start = month_start;
    return query select false, coalesce(request_count, 0), request_quota, month_end;
  else
    return query select true, request_count, request_quota, month_end;
  end if;
end;
$$;
