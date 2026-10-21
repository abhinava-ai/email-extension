-- Lock down every user-owned table. Anonymous users have no table privileges.

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.ai_usage enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.profiles, public.devices, public.subscriptions,
  public.entitlements, public.ai_usage, public.audit_events from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.devices to authenticated;
grant select on table public.subscriptions, public.entitlements,
  public.ai_usage, public.audit_events to authenticated;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "devices_select_own"
  on public.devices for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "devices_insert_own"
  on public.devices for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "devices_update_own"
  on public.devices for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "devices_delete_own"
  on public.devices for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "subscriptions_select_own"
  on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "entitlements_select_own"
  on public.entitlements for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "ai_usage_select_own"
  on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "audit_events_select_own"
  on public.audit_events for select to authenticated
  using ((select auth.uid()) = user_id);

-- No client write grants or policies exist for billing, entitlements, usage, or
-- audit tables. Trusted server processes write those records. RLS still limits
-- all authenticated client reads to auth.uid().

