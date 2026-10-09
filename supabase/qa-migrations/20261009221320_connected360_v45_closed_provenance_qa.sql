-- Connected 360 v45: isolated, QA-first per-source daily provenance.
-- IBERFIT-TABLE-ACCESS: public.m26_wearable_source_daily_v45 :: service-only closed staging; absolutely no browser grants or historical backfill before consent/revoke and physical Android E2E.
-- IBERFIT-POLICY: public.m26_wearable_source_daily_v45 = service-role-only
-- This table has no app read/write path, no live RPC, and NO historical import.
-- Source hashes are pseudonymous; never store raw device IDs or account IDs.
-- v44 remains the only active read/write model. Zero rows are expected.
begin;

create table public.m26_wearable_source_daily_v45 (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in (
    'normalized_file','health_connect','samsung_health','apple_health',
    'strava','garmin_connect','fitbit','oura'
  )),
  record_date date not null,
  -- A cryptographically generated, opaque, per-client/per-provider source hash.
  -- NULL means that the physical source is UNKNOWN, not "the default watch".
  source_key text null check (source_key is null or source_key ~ '^[0-9a-f]{64}$'),
  source_record_key text null check (
    source_record_key is null or source_record_key ~ '^[0-9a-f]{64}$'
  ),
  source_time_zone text null check (
    source_time_zone is null or (
      length(source_time_zone) between 1 and 80
      and source_time_zone ~ '^[A-Za-z0-9_.+-]+(/[A-Za-z0-9_.+-]+)*$'
    )
  ),
  -- Three independent instants. Neither source field is ever derived from
  -- acquired_at, record_date or PostgreSQL current time.
  measured_at timestamptz null,
  source_updated_at timestamptz null,
  acquired_at timestamptz not null,
  imported_at timestamptz not null default now(),
  source_time_verified boolean not null default false,
  automatic_sync_certified boolean not null default false
    check (automatic_sync_certified = false),
  quality text not null default 'limitada'
    check (quality in ('alta','media','limitada')),
  grant_id uuid not null,
  revocation_cursor bigint not null check (revocation_cursor >= 0),
  source_record_count integer not null default 1
    check (source_record_count between 1 and 100000),
  steps integer null check (steps is null or steps between 0 and 200000),
  active_minutes integer null check (
    active_minutes is null or active_minutes between 0 and 1440
  ),
  sleep_minutes integer null check (
    sleep_minutes is null or sleep_minutes between 0 and 1440
  ),
  resting_heart_rate numeric null check (
    resting_heart_rate is null or resting_heart_rate between 25 and 240
  ),
  hrv_ms numeric null check (
    hrv_ms is null or hrv_ms between 0 and 1000
  ),
  active_energy_kcal numeric null check (
    active_energy_kcal is null or active_energy_kcal between 0 and 20000
  ),
  workout_minutes integer null check (
    workout_minutes is null or workout_minutes between 0 and 1440
  ),
  created_at timestamptz not null default now(),
  constraint m26_wearable_source_daily_v45_nonempty_metric check (
    steps is not null or active_minutes is not null
    or sleep_minutes is not null or resting_heart_rate is not null
    or hrv_ms is not null or active_energy_kcal is not null
    or workout_minutes is not null
  ),
  constraint m26_wearable_source_daily_v45_truthful_time check (
    (source_time_verified = false and measured_at is null
      and source_updated_at is null and quality = 'limitada')
    or
    (source_time_verified = true and (
      measured_at is not null or source_updated_at is not null
    ))
  )
);

-- Known source: idempotent per physical source/day. Unknown source: ONLY ONE
-- ambiguous aggregate/provider/day, never implicitly merged with known sources.
create unique index m26_wearable_source_daily_v45_known_source_uq
  on public.m26_wearable_source_daily_v45(
    owner_user_id,client_id,provider,record_date,source_key
  ) where source_key is not null;
create unique index m26_wearable_source_daily_v45_unknown_source_uq
  on public.m26_wearable_source_daily_v45(
    owner_user_id,client_id,provider,record_date
  ) where source_key is null;
create index m26_wearable_source_daily_v45_client_date
  on public.m26_wearable_source_daily_v45(client_id,record_date desc);

-- Fail closed until a future separately reviewed RPC validates current consent,
-- revocation cursor, source provenance and deletion semantics transactionally.
alter table public.m26_wearable_source_daily_v45 enable row level security;
alter table public.m26_wearable_source_daily_v45 force row level security;
revoke all on table public.m26_wearable_source_daily_v45
  from public,anon,authenticated;
grant select,insert,update,delete
  on table public.m26_wearable_source_daily_v45 to service_role;

comment on table public.m26_wearable_source_daily_v45 is
  'Connected360 v45 QA staging: per-source bounded metrics and honest provenance; no client policies, no import RPC, no backfill, no automatic sync. Revocation-safe ingestion is NOT yet enabled.';
comment on column public.m26_wearable_source_daily_v45.acquired_at is
  'Instant the app acquired or recomputed the aggregate; never a proxy for a sensor measurement or source revision.';
comment on column public.m26_wearable_source_daily_v45.source_key is
  'NULL = physical device identity not proven; non-NULL must be an opaque 64-hex hash computed by a trusted service.';

commit;