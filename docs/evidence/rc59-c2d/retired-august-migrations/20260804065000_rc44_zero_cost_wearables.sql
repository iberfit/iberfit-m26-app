-- IBERFIT M26 RC44 · núcleo wearable sin coste fijo.
-- Migración aditiva y exclusiva para Supabase Canary.
-- No almacena claves OAuth, access tokens ni refresh tokens.

begin;

do $m26_guard$
begin
  if to_regclass(
    'public.m26_schema_releases_v43'
  ) is null then
    raise exception 'M26_RC44_RC43_SCHEMA_REQUIRED';
  end if;

  if to_regclass(
    'public.m26_audit_events_v43'
  ) is null then
    raise exception 'M26_RC44_AUDIT_REQUIRED';
  end if;

  if to_regprocedure(
    'public.iberfit_client_id()'
  ) is null then
    raise exception 'M26_RC44_CLIENT_HELPER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.is_assigned_coach(uuid)'
  ) is null then
    raise exception 'M26_RC44_ASSIGNMENT_HELPER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_touch_updated_at_v43()'
  ) is null then
    raise exception 'M26_RC44_TOUCH_TRIGGER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_audit_row_v43()'
  ) is null then
    raise exception 'M26_RC44_AUDIT_TRIGGER_REQUIRED';
  end if;
end
$m26_guard$;

create or replace function
public.m26_json_has_forbidden_key_v44(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $m26$
declare
  v_key text;
  v_child jsonb;
begin
  if p_value is null then
    return false;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select key, value
      from jsonb_each(p_value)
    loop
      if lower(v_key) = any (
        array[
          'password',
          'token',
          'access_token',
          'refresh_token',
          'service_role',
          'secret',
          'authorization',
          'client_secret',
          'email',
          'phone',
          'telefono',
          'name',
          'nombre'
        ]
      ) then
        return true;
      end if;

      if public.m26_json_has_forbidden_key_v44(
        v_child
      ) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in
      select value
      from jsonb_array_elements(p_value)
    loop
      if public.m26_json_has_forbidden_key_v44(
        v_child
      ) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end
$m26$;

revoke all
on function
public.m26_json_has_forbidden_key_v44(jsonb)
from public, anon;

grant execute
on function
public.m26_json_has_forbidden_key_v44(jsonb)
to authenticated;

create table if not exists
public.m26_wearable_connections_v44 (
  id uuid primary key default gen_random_uuid(),

  owner_user_id uuid not null default auth.uid()
    references auth.users(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  provider text not null
    check (
      provider in (
        'normalized_file',
        'health_connect',
        'samsung_health',
        'apple_health',
        'strava',
        'garmin_connect',
        'fitbit',
        'oura'
      )
    ),

  status text not null default 'active'
    check (
      status in (
        'active',
        'paused',
        'revoked'
      )
    ),

  sync_enabled boolean not null default true,

  granted_scopes text[] not null default '{}'::text[]
    check (
      granted_scopes <@ array[
        'steps',
        'activeMinutes',
        'sleepMinutes',
        'restingHeartRate',
        'hrvMs',
        'activeEnergyKcal',
        'workoutMinutes'
      ]::text[]
    ),

  consent_version text not null default 'v44-zero-cost'
    check (
      consent_version = 'v44-zero-cost'
    ),

  last_synced_at timestamptz,

  metadata jsonb not null default '{}'::jsonb
    check (
      octet_length(metadata::text) <= 10000
      and not public.m26_json_has_forbidden_key_v44(
        metadata
      )
    ),

  revision bigint not null default 1
    check (
      revision > 0
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    owner_user_id,
    client_id,
    provider
  )
);

create table if not exists
public.m26_wearable_daily_summaries_v44 (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  provider text not null
    check (
      provider in (
        'normalized_file',
        'health_connect',
        'samsung_health',
        'apple_health',
        'strava',
        'garmin_connect',
        'fitbit',
        'oura'
      )
    ),

  record_date date not null,

  steps integer
    check (
      steps is null
      or steps between 0 and 200000
    ),

  active_minutes integer
    check (
      active_minutes is null
      or active_minutes between 0 and 1440
    ),

  sleep_minutes integer
    check (
      sleep_minutes is null
      or sleep_minutes between 0 and 1440
    ),

  resting_heart_rate numeric(7,2)
    check (
      resting_heart_rate is null
      or resting_heart_rate between 25 and 240
    ),

  hrv_ms numeric(8,2)
    check (
      hrv_ms is null
      or hrv_ms between 0 and 1000
    ),

  active_energy_kcal numeric(10,2)
    check (
      active_energy_kcal is null
      or active_energy_kcal between 0 and 20000
    ),

  workout_minutes integer
    check (
      workout_minutes is null
      or workout_minutes between 0 and 1440
    ),

  quality text not null default 'limitada'
    check (
      quality in (
        'alta',
        'media',
        'limitada'
      )
    ),

  source_updated_at timestamptz not null,
  source_record_count integer not null default 1
    check (
      source_record_count between 1 and 100000
    ),

  imported_by uuid not null default auth.uid()
    references auth.users(id),

  revision bigint not null default 1
    check (
      revision > 0
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    client_id,
    provider,
    record_date
  ),

  check (
    steps is not null
    or active_minutes is not null
    or sleep_minutes is not null
    or resting_heart_rate is not null
    or hrv_ms is not null
    or active_energy_kcal is not null
    or workout_minutes is not null
  )
);

create table if not exists
public.m26_wearable_consents_v44 (
  id uuid primary key default gen_random_uuid(),

  actor_user_id uuid not null default auth.uid()
    references auth.users(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  provider text not null
    check (
      provider in (
        'normalized_file',
        'health_connect',
        'samsung_health',
        'apple_health',
        'strava',
        'garmin_connect',
        'fitbit',
        'oura'
      )
    ),

  action text not null
    check (
      action in (
        'grant',
        'pause',
        'resume',
        'revoke',
        'delete'
      )
    ),

  scopes text[] not null default '{}'::text[]
    check (
      scopes <@ array[
        'steps',
        'activeMinutes',
        'sleepMinutes',
        'restingHeartRate',
        'hrvMs',
        'activeEnergyKcal',
        'workoutMinutes'
      ]::text[]
    ),

  policy_version text not null default 'v44-zero-cost'
    check (
      policy_version = 'v44-zero-cost'
    ),

  created_at timestamptz not null default now()
);

create index if not exists
m26_wearable_connections_client_v44
on public.m26_wearable_connections_v44 (
  client_id,
  provider
);

create index if not exists
m26_wearable_summaries_client_date_v44
on public.m26_wearable_daily_summaries_v44 (
  client_id,
  record_date desc
);

create index if not exists
m26_wearable_consents_client_date_v44
on public.m26_wearable_consents_v44 (
  client_id,
  created_at desc
);

drop trigger if exists
m26_wearable_connections_touch_v44
on public.m26_wearable_connections_v44;

create trigger m26_wearable_connections_touch_v44
before update
on public.m26_wearable_connections_v44
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
m26_wearable_summaries_touch_v44
on public.m26_wearable_daily_summaries_v44;

create trigger m26_wearable_summaries_touch_v44
before update
on public.m26_wearable_daily_summaries_v44
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
m26_wearable_connections_audit_v44
on public.m26_wearable_connections_v44;

create trigger m26_wearable_connections_audit_v44
after insert or update or delete
on public.m26_wearable_connections_v44
for each row
execute function public.m26_audit_row_v43();

drop trigger if exists
m26_wearable_summaries_audit_v44
on public.m26_wearable_daily_summaries_v44;

create trigger m26_wearable_summaries_audit_v44
after insert or update or delete
on public.m26_wearable_daily_summaries_v44
for each row
execute function public.m26_audit_row_v43();

alter table public.m26_wearable_connections_v44
  enable row level security;

alter table public.m26_wearable_daily_summaries_v44
  enable row level security;

alter table public.m26_wearable_consents_v44
  enable row level security;

drop policy if exists
m26_wearable_connections_read_v44
on public.m26_wearable_connections_v44;

create policy m26_wearable_connections_read_v44
on public.m26_wearable_connections_v44
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
m26_wearable_connections_insert_v44
on public.m26_wearable_connections_v44;

create policy m26_wearable_connections_insert_v44
on public.m26_wearable_connections_v44
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
);

drop policy if exists
m26_wearable_connections_update_v44
on public.m26_wearable_connections_v44;

create policy m26_wearable_connections_update_v44
on public.m26_wearable_connections_v44
for update
to authenticated
using (
  owner_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
)
with check (
  owner_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
);

drop policy if exists
m26_wearable_connections_delete_v44
on public.m26_wearable_connections_v44;

create policy m26_wearable_connections_delete_v44
on public.m26_wearable_connections_v44
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
);

drop policy if exists
m26_wearable_summaries_read_v44
on public.m26_wearable_daily_summaries_v44;

create policy m26_wearable_summaries_read_v44
on public.m26_wearable_daily_summaries_v44
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
m26_wearable_summaries_insert_v44
on public.m26_wearable_daily_summaries_v44;

create policy m26_wearable_summaries_insert_v44
on public.m26_wearable_daily_summaries_v44
for insert
to authenticated
with check (
  client_id = public.iberfit_client_id()
  and imported_by = auth.uid()
);

drop policy if exists
m26_wearable_summaries_update_v44
on public.m26_wearable_daily_summaries_v44;

create policy m26_wearable_summaries_update_v44
on public.m26_wearable_daily_summaries_v44
for update
to authenticated
using (
  client_id = public.iberfit_client_id()
  and imported_by = auth.uid()
)
with check (
  client_id = public.iberfit_client_id()
  and imported_by = auth.uid()
);

drop policy if exists
m26_wearable_summaries_delete_v44
on public.m26_wearable_daily_summaries_v44;

create policy m26_wearable_summaries_delete_v44
on public.m26_wearable_daily_summaries_v44
for delete
to authenticated
using (
  client_id = public.iberfit_client_id()
);

drop policy if exists
m26_wearable_consents_read_v44
on public.m26_wearable_consents_v44;

create policy m26_wearable_consents_read_v44
on public.m26_wearable_consents_v44
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
m26_wearable_consents_insert_v44
on public.m26_wearable_consents_v44;

create policy m26_wearable_consents_insert_v44
on public.m26_wearable_consents_v44
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
);

revoke all
on public.m26_wearable_connections_v44
from anon, authenticated;

revoke all
on public.m26_wearable_daily_summaries_v44
from anon, authenticated;

revoke all
on public.m26_wearable_consents_v44
from anon, authenticated;

grant select, insert, update, delete
on public.m26_wearable_connections_v44
to authenticated;

grant select, insert, update, delete
on public.m26_wearable_daily_summaries_v44
to authenticated;

grant select, insert
on public.m26_wearable_consents_v44
to authenticated;

create or replace function
public.m26_wearable_bootstrap_v44()
returns jsonb
language sql
stable
set search_path = ''
as $m26$
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    true,
    'version',
    'RC44',
    'connections',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'status',
            status,
            'syncEnabled',
            sync_enabled,
            'scopes',
            granted_scopes,
            'lastSyncedAt',
            last_synced_at,
            'revision',
            revision
          )
          order by provider
        )
        from public.m26_wearable_connections_v44
      ),
      '[]'::jsonb
    ),
    'dailySummaries',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'date',
            record_date,
            'metrics',
            jsonb_build_object(
              'steps',
              steps,
              'activeMinutes',
              active_minutes,
              'sleepMinutes',
              sleep_minutes,
              'restingHeartRate',
              resting_heart_rate,
              'hrvMs',
              hrv_ms,
              'activeEnergyKcal',
              active_energy_kcal,
              'workoutMinutes',
              workout_minutes
            ),
            'quality',
            quality,
            'sourceUpdatedAt',
            source_updated_at,
            'sourceRecordCount',
            source_record_count,
            'revision',
            revision
          )
          order by record_date desc, provider
        )
        from public.m26_wearable_daily_summaries_v44
      ),
      '[]'::jsonb
    ),
    'consents',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'action',
            action,
            'scopes',
            scopes,
            'createdAt',
            created_at
          )
          order by created_at desc
        )
        from public.m26_wearable_consents_v44
      ),
      '[]'::jsonb
    )
  )
  where auth.uid() is not null;
$m26$;

revoke all
on function public.m26_wearable_bootstrap_v44()
from public, anon;

grant execute
on function public.m26_wearable_bootstrap_v44()
to authenticated;

create or replace function
public.m26_wearable_import_v44(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_records jsonb;
  v_record jsonb;
  v_metrics jsonb;
  v_client_id uuid;
  v_provider text;
  v_date date;
  v_source_updated_at timestamptz;
  v_source_count integer;
  v_quality text;
  v_steps integer;
  v_active_minutes integer;
  v_sleep_minutes integer;
  v_resting_hr numeric;
  v_hrv numeric;
  v_energy numeric;
  v_workout_minutes integer;
  v_row_count integer;
  v_accepted integer := 0;
  v_stale integer := 0;
  v_rejected integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or public.m26_json_has_forbidden_key_v44(
      p_payload
    )
    or octet_length(p_payload::text) > 900000
  then
    raise exception 'M26_RC44_IMPORT_PAYLOAD_INVALID';
  end if;

  v_records := p_payload -> 'records';

  if
    jsonb_typeof(v_records) <> 'array'
    or jsonb_array_length(v_records) < 1
    or jsonb_array_length(v_records) > 250
  then
    raise exception 'M26_RC44_IMPORT_BATCH_INVALID';
  end if;

  for v_record in
    select value
    from jsonb_array_elements(v_records)
  loop
    begin
      v_client_id := nullif(
        v_record ->> 'clientId',
        ''
      )::uuid;

      v_provider := lower(
        trim(v_record ->> 'provider')
      );

      v_date := nullif(
        v_record ->> 'date',
        ''
      )::date;

      v_metrics := v_record -> 'metrics';

      if
        v_client_id is null
        or v_client_id <> public.iberfit_client_id()
        or v_provider not in (
          'normalized_file',
          'health_connect',
          'samsung_health',
          'apple_health',
          'strava',
          'garmin_connect',
          'fitbit',
          'oura'
        )
        or v_date is null
        or jsonb_typeof(v_metrics) <> 'object'
      then
        raise exception 'M26_RC44_IMPORT_RECORD_INVALID';
      end if;

      v_steps := round(
        nullif(
          v_metrics ->> 'steps',
          ''
        )::numeric
      )::integer;

      v_active_minutes := round(
        nullif(
          v_metrics ->> 'activeMinutes',
          ''
        )::numeric
      )::integer;

      v_sleep_minutes := round(
        nullif(
          v_metrics ->> 'sleepMinutes',
          ''
        )::numeric
      )::integer;

      v_resting_hr := nullif(
        v_metrics ->> 'restingHeartRate',
        ''
      )::numeric;

      v_hrv := nullif(
        v_metrics ->> 'hrvMs',
        ''
      )::numeric;

      v_energy := nullif(
        v_metrics ->> 'activeEnergyKcal',
        ''
      )::numeric;

      v_workout_minutes := round(
        nullif(
          v_metrics ->> 'workoutMinutes',
          ''
        )::numeric
      )::integer;

      v_quality := coalesce(
        nullif(
          lower(trim(v_record ->> 'quality')),
          ''
        ),
        'limitada'
      );

      v_source_updated_at := coalesce(
        nullif(
          v_record ->> 'sourceUpdatedAt',
          ''
        )::timestamptz,
        (v_date::text || 'T12:00:00Z')::timestamptz
      );

      v_source_count := greatest(
        1,
        least(
          100000,
          coalesce(
            nullif(
              v_record ->> 'sourceRecordCount',
              ''
            )::integer,
            1
          )
        )
      );

      insert into
      public.m26_wearable_daily_summaries_v44 (
        client_id,
        provider,
        record_date,
        steps,
        active_minutes,
        sleep_minutes,
        resting_heart_rate,
        hrv_ms,
        active_energy_kcal,
        workout_minutes,
        quality,
        source_updated_at,
        source_record_count,
        imported_by
      )
      values (
        v_client_id,
        v_provider,
        v_date,
        v_steps,
        v_active_minutes,
        v_sleep_minutes,
        v_resting_hr,
        v_hrv,
        v_energy,
        v_workout_minutes,
        v_quality,
        v_source_updated_at,
        v_source_count,
        auth.uid()
      )
      on conflict (
        client_id,
        provider,
        record_date
      )
      do update set
        steps = excluded.steps,
        active_minutes = excluded.active_minutes,
        sleep_minutes = excluded.sleep_minutes,
        resting_heart_rate = excluded.resting_heart_rate,
        hrv_ms = excluded.hrv_ms,
        active_energy_kcal = excluded.active_energy_kcal,
        workout_minutes = excluded.workout_minutes,
        quality = excluded.quality,
        source_updated_at = excluded.source_updated_at,
        source_record_count = excluded.source_record_count,
        imported_by = auth.uid()
      where
        public.m26_wearable_daily_summaries_v44
          .source_updated_at
        <= excluded.source_updated_at;

      get diagnostics
        v_row_count = row_count;

      if v_row_count = 1 then
        v_accepted := v_accepted + 1;
      else
        v_stale := v_stale + 1;
      end if;
    exception
      when others then
        v_rejected := v_rejected + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok',
    true,
    'accepted',
    v_accepted,
    'stale',
    v_stale,
    'rejected',
    v_rejected,
    'total',
    jsonb_array_length(v_records)
  );
end
$m26$;

revoke all
on function public.m26_wearable_import_v44(jsonb)
from public, anon;

grant execute
on function public.m26_wearable_import_v44(jsonb)
to authenticated;

create or replace function
public.m26_wearable_connection_upsert_v44(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_provider text;
  v_status text;
  v_sync_enabled boolean;
  v_scopes text[];
  v_metadata jsonb;
  v_action text;
  v_last_synced_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or public.m26_json_has_forbidden_key_v44(
      p_payload
    )
    or octet_length(p_payload::text) > 20000
  then
    raise exception 'M26_RC44_CONNECTION_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_provider := lower(
    trim(p_payload ->> 'provider')
  );

  v_status := coalesce(
    nullif(
      lower(trim(p_payload ->> 'status')),
      ''
    ),
    'active'
  );

  v_sync_enabled := coalesce(
    (p_payload ->> 'syncEnabled')::boolean,
    v_status = 'active'
  );

  v_scopes := array(
    select distinct value
    from jsonb_array_elements_text(
      coalesce(
        p_payload -> 'scopes',
        '[]'::jsonb
      )
    )
    where value = any (
      array[
        'steps',
        'activeMinutes',
        'sleepMinutes',
        'restingHeartRate',
        'hrvMs',
        'activeEnergyKcal',
        'workoutMinutes'
      ]
    )
    order by value
  );

  v_metadata := coalesce(
    p_payload -> 'metadata',
    '{}'::jsonb
  );

  v_last_synced_at := nullif(
    p_payload ->> 'lastSyncedAt',
    ''
  )::timestamptz;

  if
    v_client_id is null
    or v_client_id <> public.iberfit_client_id()
    or v_provider not in (
      'normalized_file',
      'health_connect',
      'samsung_health',
      'apple_health',
      'strava',
      'garmin_connect',
      'fitbit',
      'oura'
    )
    or v_status not in (
      'active',
      'paused',
      'revoked'
    )
  then
    raise exception 'M26_RC44_CONNECTION_INVALID';
  end if;

  insert into public.m26_wearable_connections_v44 (
    owner_user_id,
    client_id,
    provider,
    status,
    sync_enabled,
    granted_scopes,
    consent_version,
    last_synced_at,
    metadata
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    v_status,
    v_sync_enabled,
    v_scopes,
    'v44-zero-cost',
    v_last_synced_at,
    v_metadata
  )
  on conflict (
    owner_user_id,
    client_id,
    provider
  )
  do update set
    status = excluded.status,
    sync_enabled = excluded.sync_enabled,
    granted_scopes = excluded.granted_scopes,
    last_synced_at = excluded.last_synced_at,
    metadata = excluded.metadata
  returning id into v_id;

  v_action := case
    when v_status = 'paused' then 'pause'
    when v_status = 'revoked' then 'revoke'
    when v_sync_enabled then 'grant'
    else 'pause'
  end;

  insert into public.m26_wearable_consents_v44 (
    actor_user_id,
    client_id,
    provider,
    action,
    scopes,
    policy_version
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    v_action,
    v_scopes,
    'v44-zero-cost'
  );

  return jsonb_build_object(
    'ok',
    true,
    'saved',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id,
    'provider',
    v_provider,
    'status',
    v_status,
    'syncEnabled',
    v_sync_enabled
  );
end
$m26$;

revoke all
on function
public.m26_wearable_connection_upsert_v44(jsonb)
from public, anon;

grant execute
on function
public.m26_wearable_connection_upsert_v44(jsonb)
to authenticated;

create or replace function
public.m26_wearable_revoke_v44(
  p_provider text,
  p_delete_data boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();
  v_provider := lower(trim(p_provider));

  if
    v_client_id is null
    or v_provider not in (
      'normalized_file',
      'health_connect',
      'samsung_health',
      'apple_health',
      'strava',
      'garmin_connect',
      'fitbit',
      'oura'
    )
  then
    raise exception 'M26_RC44_REVOKE_INVALID';
  end if;

  update public.m26_wearable_connections_v44
  set
    status = 'revoked',
    sync_enabled = false
  where owner_user_id = auth.uid()
    and client_id = v_client_id
    and provider = v_provider;

  if coalesce(p_delete_data, false) then
    delete from public.m26_wearable_daily_summaries_v44
    where client_id = v_client_id
      and provider = v_provider;

    get diagnostics
      v_deleted = row_count;
  end if;

  insert into public.m26_wearable_consents_v44 (
    actor_user_id,
    client_id,
    provider,
    action,
    scopes,
    policy_version
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    case
      when coalesce(p_delete_data, false)
        then 'delete'
      else 'revoke'
    end,
    '{}'::text[],
    'v44-zero-cost'
  );

  return jsonb_build_object(
    'ok',
    true,
    'revoked',
    true,
    'provider',
    v_provider,
    'deleted',
    v_deleted
  );
end
$m26$;

revoke all
on function
public.m26_wearable_revoke_v44(text,boolean)
from public, anon;

grant execute
on function
public.m26_wearable_revoke_v44(text,boolean)
to authenticated;

create or replace function
public.m26_wearable_delete_all_v44()
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();

  if v_client_id is null then
    raise exception 'M26_RC44_CLIENT_REQUIRED';
  end if;

  for v_provider in
    select distinct provider
    from (
      select provider
      from public.m26_wearable_connections_v44
      where client_id = v_client_id

      union

      select provider
      from public.m26_wearable_daily_summaries_v44
      where client_id = v_client_id
    ) providers
  loop
    insert into public.m26_wearable_consents_v44 (
      actor_user_id,
      client_id,
      provider,
      action,
      scopes,
      policy_version
    )
    values (
      auth.uid(),
      v_client_id,
      v_provider,
      'delete',
      '{}'::text[],
      'v44-zero-cost'
    );
  end loop;

  delete from public.m26_wearable_daily_summaries_v44
  where client_id = v_client_id;

  get diagnostics
    v_deleted = row_count;

  delete from public.m26_wearable_connections_v44
  where owner_user_id = auth.uid()
    and client_id = v_client_id;

  return jsonb_build_object(
    'ok',
    true,
    'deleted',
    true,
    'recordsDeleted',
    v_deleted,
    'clientId',
    v_client_id
  );
end
$m26$;

revoke all
on function public.m26_wearable_delete_all_v44()
from public, anon;

grant execute
on function public.m26_wearable_delete_all_v44()
to authenticated;

create or replace function
public.m26_wearable_health_v44()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $m26$
  with wearable_tables as (
    select unnest(
      array[
        'public.m26_wearable_connections_v44',
        'public.m26_wearable_daily_summaries_v44',
        'public.m26_wearable_consents_v44'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,

      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from wearable_tables
  ),
  policy_state as (
    select count(*) as policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'm26_wearable_connections_v44',
        'm26_wearable_daily_summaries_v44',
        'm26_wearable_consents_v44'
      )
  ),
  rpc_state as (
    select count(*) as rpc_count
    from unnest(
      array[
        'public.m26_wearable_bootstrap_v44()',
        'public.m26_wearable_import_v44(jsonb)',
        'public.m26_wearable_connection_upsert_v44(jsonb)',
        'public.m26_wearable_revoke_v44(text,boolean)',
        'public.m26_wearable_delete_all_v44()'
      ]
    ) as rpc_name
    where to_regprocedure(rpc_name) is not null
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 3
      and rls_count = 3
      and policy_count >= 10
      and rpc_count = 5,
    'version',
    'RC44',
    'environment',
    'canary',
    'wearableTables',
    table_count,
    'wearableRls',
    rls_count,
    'wearablePolicies',
    policy_count,
    'wearableRpcs',
    rpc_count,
    'productionModified',
    false,
    'productionDeployed',
    false
  )
  from table_state
  cross join policy_state
  cross join rpc_state;
$m26$;

revoke all
on function public.m26_wearable_health_v44()
from public;

grant execute
on function public.m26_wearable_health_v44()
to anon, authenticated;

insert into public.m26_schema_releases_v43 (
  version,
  environment,
  production_modified,
  production_deployed
)
values (
  'RC44',
  'canary',
  false,
  false
)
on conflict (version)
do update set
  environment = excluded.environment,
  applied_at = now(),
  production_modified = false,
  production_deployed = false;

do $m26_postcheck$
declare
  v_tables integer;
  v_rls integer;
  v_policies integer;
begin
  select count(*)
  into v_tables
  from unnest(
    array[
      'public.m26_wearable_connections_v44',
      'public.m26_wearable_daily_summaries_v44',
      'public.m26_wearable_consents_v44'
    ]
  ) as relations(relation_name)
  where to_regclass(relation_name) is not null;

  select count(*)
  into v_rls
  from pg_catalog.pg_class
  where oid = any (
    array[
      'public.m26_wearable_connections_v44'::regclass,
      'public.m26_wearable_daily_summaries_v44'::regclass,
      'public.m26_wearable_consents_v44'::regclass
    ]
  )
  and relrowsecurity is true;

  select count(*)
  into v_policies
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in (
      'm26_wearable_connections_v44',
      'm26_wearable_daily_summaries_v44',
      'm26_wearable_consents_v44'
    );

  if v_tables <> 3 then
    raise exception 'M26_RC44_TABLE_POSTCHECK_FAILED';
  end if;

  if v_rls <> 3 then
    raise exception 'M26_RC44_RLS_POSTCHECK_FAILED';
  end if;

  if v_policies < 10 then
    raise exception 'M26_RC44_POLICY_POSTCHECK_FAILED';
  end if;

  if to_regprocedure(
    'public.m26_wearable_health_v44()'
  ) is null then
    raise exception 'M26_RC44_HEALTH_RPC_MISSING';
  end if;
end
$m26_postcheck$;

commit;
