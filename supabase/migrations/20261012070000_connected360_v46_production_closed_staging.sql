-- IBERFIT Connected 360 V46 · production CLOSED STORAGE ONLY.
-- New tables are additive to V44, zero automatic sync, no RPC, no grants.
-- Different from QA-only migration: enforced production preflight and dormant release gate.
-- Must not be treated as an Android / watch E2E or production feature activation.
BEGIN;
DO $preflight$
BEGIN
  IF to_regclass('public.clients') IS NULL OR
     to_regclass('public.m26_wearable_daily_summaries_v44') IS NULL OR
     to_regclass('public.m26_wearable_consents_v44') IS NULL OR
     to_regclass('public.m26_wearable_connections_v44') IS NULL THEN
     RAISE EXCEPTION 'M26_V46_PRODUCTION_LEGACY_PREREQUISITES_MISSING';
  END IF;
  IF to_regclass('public.m26_wearable_heart_rate_daily_v46') IS NOT NULL
     OR to_regclass('public.m26_wearable_exercise_evidence_v46') IS NOT NULL THEN
     RAISE EXCEPTION 'M26_V46_PRODUCTION_ALREADY_PRESENT_REVIEW_REQUIRED';
  END IF;
END;
$preflight$;
create table public.m26_wearable_heart_rate_daily_v46 (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider = 'health_connect'),
  record_date date not null,
  source_key text null check (source_key ~ '^[0-9a-f]{64}$'),
  aggregation_time_zone text null check (
    aggregation_time_zone is null or (
      length(aggregation_time_zone) between 1 and 80
      and aggregation_time_zone ~ '^[A-Za-z0-9_.+-]+(/[A-Za-z0-9_.+-]+)*$'
    )
  ),
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  acquired_at timestamptz not null,
  source_updated_at timestamptz null,
  sample_count integer not null check (sample_count between 1 and 200000),
  heart_rate_avg numeric(6,2) null check (heart_rate_avg between 25 and 240),
  heart_rate_min numeric(6,2) null check (heart_rate_min between 25 and 240),
  heart_rate_max numeric(6,2) null check (heart_rate_max between 25 and 240),
  source_identity_verified boolean not null default false check (source_identity_verified = false),
  automatic_sync_certified boolean not null default false check (automatic_sync_certified = false),
  quality text not null default 'limitada' check (quality='limitada'),
  grant_id uuid not null,
  revocation_cursor bigint not null check (revocation_cursor >= 0),
  imported_at timestamptz not null default now(),
  constraint m26_v46_hr_window_valid check (
    window_ended_at > window_started_at and
    window_ended_at - window_started_at <= interval '25 hours'
  ),
  constraint m26_v46_hr_consistent check (
    (heart_rate_min is null or heart_rate_max is null or heart_rate_min <= heart_rate_max)
    and (heart_rate_avg is null or heart_rate_min is null or heart_rate_avg >= heart_rate_min)
    and (heart_rate_avg is null or heart_rate_max is null or heart_rate_avg <= heart_rate_max)
  )
);
create unique index m26_v46_hr_owner_civil_source_uq
  on public.m26_wearable_heart_rate_daily_v46
  (owner_user_id,client_id,provider,record_date,source_key,aggregation_time_zone)
  nulls not distinct;
create index m26_v46_hr_client_recent_idx
  on public.m26_wearable_heart_rate_daily_v46(client_id,record_date desc);

create table public.m26_wearable_exercise_evidence_v46 (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider='health_connect'),
  -- SHA256 of an opaque Health Connect record identifier, never a raw ID.
  source_record_key text not null check (source_record_key ~ '^[0-9a-f]{64}$'),
  -- NULL = unknown physical origin, not an inferred watch or smartphone.
  source_app_key text null check (source_app_key ~ '^[0-9a-f]{64}$'),
  sport text not null check (sport in (
    'running','interval_running','hiit','cycling','walking','strength','other'
  )),
  observed_started_at timestamptz not null,
  observed_ended_at timestamptz not null,
  aggregation_time_zone text null check (
    aggregation_time_zone is null or (
      length(aggregation_time_zone) between 1 and 80 and
      aggregation_time_zone ~ '^[A-Za-z0-9_.+-]+(/[A-Za-z0-9_.+-]+)*$'
    )
  ),
  source_updated_at timestamptz null,
  acquired_at timestamptz not null,
  heart_rate_samples integer null check (heart_rate_samples between 0 and 200000),
  heart_rate_avg numeric(6,2) null check (heart_rate_avg between 25 and 240),
  heart_rate_min numeric(6,2) null check (heart_rate_min between 25 and 240),
  heart_rate_max numeric(6,2) null check (heart_rate_max between 25 and 240),
  distance_meters numeric(12,2) null check (distance_meters between 0 and 500000),
  steps integer null check (steps between 0 and 200000),
  calories_kcal numeric(10,2) null check (calories_kcal between 0 and 20000),
  source_identity_verified boolean not null default false check (source_identity_verified=false),
  automatic_sync_certified boolean not null default false check (automatic_sync_certified=false),
  link_status text not null default 'unlinked' check (link_status='unlinked'),
  quality text not null default 'limitada' check (quality='limitada'),
  grant_id uuid not null,
  revocation_cursor bigint not null check (revocation_cursor >= 0),
  imported_at timestamptz not null default now(),
  constraint m26_v46_workout_window_valid check (
    observed_ended_at > observed_started_at
    and observed_ended_at - observed_started_at <= interval '24 hours'
  ),
  constraint m26_v46_workout_hr_consistent check (
    (heart_rate_min is null or heart_rate_max is null or heart_rate_min <= heart_rate_max)
    and (heart_rate_avg is null or heart_rate_min is null or heart_rate_avg >= heart_rate_min)
    and (heart_rate_avg is null or heart_rate_max is null or heart_rate_avg <= heart_rate_max)
    and (heart_rate_samples is not null
      or (heart_rate_avg is null and heart_rate_min is null and heart_rate_max is null))
  )
);
create unique index m26_v46_workout_owner_source_uq
  on public.m26_wearable_exercise_evidence_v46
  (owner_user_id,client_id,provider,source_record_key);
create index m26_v46_workout_client_recent_idx
  on public.m26_wearable_exercise_evidence_v46
  (client_id,observed_started_at desc);

-- Production disabled: zero Data API access even for signed-in clients.
-- A future separately-reviewed production writer MAY be introduced,
-- only after account/session binding, E2E physical Android, revocation and Play policy gates.
alter table public.m26_wearable_heart_rate_daily_v46 enable row level security;
alter table public.m26_wearable_heart_rate_daily_v46 force row level security;
alter table public.m26_wearable_exercise_evidence_v46 enable row level security;
alter table public.m26_wearable_exercise_evidence_v46 force row level security;
revoke all on table public.m26_wearable_heart_rate_daily_v46
  from public,anon,authenticated;
revoke all on table public.m26_wearable_exercise_evidence_v46
  from public,anon,authenticated;

-- Unlike V44, source_updated_at is NULL until actually provided by the
-- upstream source. acquired_at is merely when the phone read the data.
comment on table public.m26_wearable_heart_rate_daily_v46 is
  'PROD CLOSED STAGING: general heart rate, not resting HR. No direct API grants or certified writer; disabled until native E2E.';
comment on table public.m26_wearable_exercise_evidence_v46 is
  'PROD CLOSED STAGING: Health Connect exercise observation, not a confirmed IBERFIT training session. No direct app grants.';
comment on column public.m26_wearable_exercise_evidence_v46.source_record_key is
  'Opaque SHA256 source record pseudonym, never a device identifier or user account.';

-- Migration is schema only; all V44 data remains unchanged.
COMMIT;
