-- Mail Template Vault account schema.
-- Auth identities remain in Supabase's managed auth.users table.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  locale text not null default 'en',
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) between 1 and 120),
  constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048),
  constraint profiles_locale_length check (char_length(locale) between 2 and 35),
  constraint profiles_time_zone_length check (char_length(time_zone) between 1 and 100)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  installation_id uuid not null,
  display_name text not null,
  platform text not null,
  browser text,
  extension_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_user_installation_unique unique (user_id, installation_id),
  constraint devices_display_name_length check (char_length(display_name) between 1 and 120),
  constraint devices_platform_length check (char_length(platform) between 1 and 80),
  constraint devices_browser_length check (browser is null or char_length(browser) <= 80),
  constraint devices_extension_version_length check (extension_version is null or char_length(extension_version) <= 40)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'none',
  provider_customer_id text,
  provider_subscription_id text,
  plan_key text not null default 'starter',
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_provider_check check (provider in ('none', 'stripe')),
  constraint subscriptions_status_check check (status in ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  constraint subscriptions_period_order check (current_period_end is null or current_period_start is null or current_period_end >= current_period_start),
  constraint subscriptions_one_provider_record unique (provider, provider_subscription_id)
);

create unique index subscriptions_one_current_per_user_idx
  on public.subscriptions (user_id)
  where status in ('trialing', 'active', 'past_due', 'unpaid', 'paused');

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement_key text not null,
  enabled boolean not null default true,
  limit_value bigint,
  source text not null default 'system',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_user_key_unique unique (user_id, entitlement_key),
  constraint entitlements_key_length check (char_length(entitlement_key) between 1 and 100),
  constraint entitlements_source_check check (source in ('system', 'subscription', 'promotion', 'support')),
  constraint entitlements_limit_nonnegative check (limit_value is null or limit_value >= 0),
  constraint entitlements_valid_period check (valid_until is null or valid_until >= valid_from)
);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_type text not null,
  period_start date not null,
  period_end date not null,
  request_count bigint not null default 0,
  input_units bigint not null default 0,
  output_units bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_usage_user_period_type_unique unique (user_id, period_start, usage_type),
  constraint ai_usage_type_length check (char_length(usage_type) between 1 and 80),
  constraint ai_usage_period_order check (period_end >= period_start),
  constraint ai_usage_counts_nonnegative check (request_count >= 0 and input_units >= 0 and output_units >= 0)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'user',
  device_id uuid references public.devices (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_type_length check (char_length(event_type) between 1 and 100),
  constraint audit_events_actor_check check (actor_type in ('user', 'system', 'support')),
  constraint audit_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

-- RLS policy predicates filter on user_id, so every table needs a leading index.
create index devices_user_id_idx on public.devices (user_id);
create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index entitlements_user_id_idx on public.entitlements (user_id);
create index ai_usage_user_id_idx on public.ai_usage (user_id);
create index audit_events_user_id_idx on public.audit_events (user_id);
create index audit_events_created_at_idx on public.audit_events (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger devices_set_updated_at before update on public.devices
  for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger entitlements_set_updated_at before update on public.entitlements
  for each row execute function public.set_updated_at();
create trigger ai_usage_set_updated_at before update on public.ai_usage
  for each row execute function public.set_updated_at();

-- A public profile is created automatically for every Auth identity, regardless
-- of whether the identity was created by password or a future auth provider.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on table public.ai_usage is 'Server-maintained aggregate AI usage. Never stores model-provider credentials or prompt content.';
comment on table public.audit_events is 'Append-only security and account activity. Do not place secrets or full template bodies in metadata.';

