-- IBERFIT M26 RC59.0C2
-- TELEMETRY BACKEND MIGRATION DRAFT
-- DESIGN ONLY. DO NOT APPLY.
--
-- This file is deliberately outside supabase/migrations/.
-- The sentinel below aborts the transaction before any DDL.
-- RC59.0C2A must run the separate read-only preflight first.

begin;

do $rc59_design_only$
begin
  raise exception 'RC59_0C2_DESIGN_ONLY_DO_NOT_APPLY';
end
$rc59_design_only$;

-- ==========================================================
-- Preconditions
-- ==========================================================

do $rc59_guard$
begin
  if to_regclass('public.clients') is null then
    raise exception 'M26_RC59_CLIENTS_REQUIRED';
  end if;

  if to_regprocedure('public.iberfit_client_id()') is null then
    raise exception 'M26_RC59_CLIENT_HELPER_REQUIRED';
  end if;


  if to_regclass('public.iberfit_coach_client_assignments') is null then
    raise exception 'M26_RC59_ASSIGNMENTS_REQUIRED';
  end if;

  if to_regclass('public.iberfit_organization_memberships') is null then
    raise exception 'M26_RC59_MEMBERSHIPS_REQUIRED';
  end if;

  if to_regclass('public.m26_telemetry_events_v59') is not null then
    raise exception 'M26_RC59_TELEMETRY_ALREADY_PRESENT';
  end if;

  if to_regclass('public.m26_telemetry_import_batches_v59') is not null then
    raise exception 'M26_RC59_TELEMETRY_BATCH_AUDIT_ALREADY_PRESENT';
  end if;
end
$rc59_guard$;

-- ==========================================================
-- Telemetry-specific authorization boundary.
--
-- IMPORTANT:
-- Do NOT reuse the deployed global assignment helper here.
-- Canonical preflight 2026-08-14 showed that helper currently
-- grants an Admin bypass and also considers a legacy assignment
-- source. Raw telemetry therefore uses an independent boundary.
--
-- Telemetry raw is stricter:
--   * Client may access own client_id.
--   * Coach may access only an active assignment in
--     iberfit_coach_client_assignments with active membership.
--   * Admin role alone grants nothing.
-- ==========================================================

create or replace function public.m26_telemetry_can_access_client_v59(
  target_client uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $rc59$
  select
    target_client is not null
    and (
      target_client = public.iberfit_client_id()
      or exists (
        select 1
        from public.iberfit_coach_client_assignments a
        join public.iberfit_organization_memberships m
          on m.organization_id = a.organization_id
         and m.user_id = a.coach_user_id
         and m.status = 'active'
        where a.coach_user_id = auth.uid()
          and a.client_id = target_client::text
          and a.status = 'active'
          and a.starts_at <= current_date
          and (
            a.ends_at is null
            or a.ends_at >= current_date
          )
      )
    );
$rc59$;

revoke all
on function public.m26_telemetry_can_access_client_v59(uuid)
from public, anon;

grant execute
on function public.m26_telemetry_can_access_client_v59(uuid)
to authenticated;
-- ==========================================================
-- Recursive privacy / secret guard.
-- Rejects identifiers or secrets that do not belong in raw
-- canonical telemetry. The canonical event keeps provider,
-- logical providerId, deviceType, quality and provenance,
-- but never hardware-unique identifiers.
-- ==========================================================

create or replace function public.m26_telemetry_json_safe_v59(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $rc59$
declare
  v_key text;
  v_normalized_key text;
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
      v_normalized_key := lower(
        regexp_replace(v_key,'[^a-z0-9]','','g')
      );

      if v_normalized_key = any (
        array[
          'password',
          'token',
          'accesstoken',
          'refreshtoken',
          'servicerole',
          'secret',
          'authorization',
          'clientsecret',
          'email',
          'phone',
          'telefono',
          'name',
          'nombre',
          'deviceid',
          'mac',
          'macaddress',
          'gatt',
          'gattid',
          'serial',
          'serialnumber'
        ]
      ) then
        return false;
      end if;

      if not public.m26_telemetry_json_safe_v59(v_child) then
        return false;
      end if;
    end loop;

    return true;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    for v_child in
      select value
      from jsonb_array_elements(p_value)
    loop
      if not public.m26_telemetry_json_safe_v59(v_child) then
        return false;
      end if;
    end loop;

    return true;
  end if;

  return true;
end
$rc59$;

revoke all
on function public.m26_telemetry_json_safe_v59(jsonb)
from public, anon, authenticated;

-- ==========================================================
-- Canonical event validator.
-- Structural validation only: it intentionally does NOT
-- impose a physiological 25–240 BPM filter.
-- ==========================================================

create or replace function public.m26_telemetry_event_valid_v59(
  p_event jsonb,
  p_client_id uuid,
  p_session_id text,
  p_execution_id text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $rc59$
declare
  v_rr jsonb;
  v_recorded_at timestamptz;
  v_received_at timestamptz;
  v_hr numeric;
  v_set_number integer;
begin
  if
    p_event is null
    or jsonb_typeof(p_event) <> 'object'
    or octet_length(p_event::text) > 12000
    or not public.m26_telemetry_json_safe_v59(p_event)
    or p_event ? 'derived'
  then
    return false;
  end if;

  if
    p_event ->> 'schemaVersion' <> 'iberfit.telemetry.v1'
    or p_event ->> 'eventType' <> 'heart_rate_sample'
    or coalesce(p_event ->> 'eventId','')
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or p_event ->> 'clientId' <> p_client_id::text
    or p_event ->> 'sessionId' <> p_session_id
    or p_event ->> 'executionId' <> p_execution_id
  then
    return false;
  end if;

  if
    p_session_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or p_execution_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
  then
    return false;
  end if;

  begin
    v_recorded_at := (p_event ->> 'recordedAt')::timestamptz;
    v_received_at := (p_event ->> 'receivedAt')::timestamptz;
  exception
    when others then
      return false;
  end;

  if v_recorded_at is null or v_received_at is null then
    return false;
  end if;

  if
    jsonb_typeof(p_event -> 'context') <> 'object'
    or jsonb_typeof(p_event -> 'source') <> 'object'
    or jsonb_typeof(p_event -> 'quality') <> 'object'
    or jsonb_typeof(p_event -> 'raw') <> 'object'
    or jsonb_typeof(p_event -> 'provenance') <> 'object'
  then
    return false;
  end if;

  if
    coalesce(p_event #>> '{context,phase}','')
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,39}$'
    or (
      p_event #>> '{context,blockId}' is not null
      and p_event #>> '{context,blockId}'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    )
    or (
      p_event #>> '{context,exerciseId}' is not null
      and p_event #>> '{context,exerciseId}'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    )
  then
    return false;
  end if;

  begin
    if p_event #>> '{context,setNumber}' is not null then
      v_set_number := (p_event #>> '{context,setNumber}')::integer;
      if v_set_number < 1 or v_set_number > 10000 then
        return false;
      end if;
    end if;
  exception
    when others then
      return false;
  end;

  if
    p_event #>> '{source,provider}' not in (
      'apple_health',
      'wear_os_health_services',
      'ble_direct'
    )
    or coalesce(p_event #>> '{source,deviceType}','unknown') not in (
      'watch',
      'chest_strap',
      'arm_band',
      'sensor',
      'phone',
      'unknown'
    )
    or (
      p_event #>> '{source,providerId}' is not null
      and p_event #>> '{source,providerId}'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    )
    or (
      p_event #>> '{source,transport}' is not null
      and p_event #>> '{source,transport}'
        !~ '^[a-z0-9][a-z0-9._:-]{0,79}$'
    )
  then
    return false;
  end if;

  if
    coalesce(p_event #>> '{quality,grade}','limitada') not in (
      'alta',
      'media',
      'limitada'
    )
    or (
      p_event #>> '{quality,code}' is not null
      and p_event #>> '{quality,code}' not in (
        'valid',
        'acquiring',
        'poor_contact',
        'stale',
        'out_of_range',
        'disconnected',
        'unsupported'
      )
    )
    or coalesce(
      p_event #>> '{quality,contactStatus}',
      'unknown'
    ) not in (
      'detected',
      'not_detected',
      'unsupported',
      'unknown'
    )
  then
    return false;
  end if;

  if jsonb_typeof(p_event #> '{raw,heartRateBpm}') <> 'number' then
    return false;
  end if;

  begin
    v_hr := (p_event #>> '{raw,heartRateBpm}')::numeric;
  exception
    when others then
      return false;
  end;

  if v_hr is null then
    return false;
  end if;

  if jsonb_typeof(p_event #> '{raw,rrIntervalsMs}') <> 'array' then
    return false;
  end if;

  if jsonb_array_length(p_event #> '{raw,rrIntervalsMs}') > 128 then
    return false;
  end if;

  for v_rr in
    select value
    from jsonb_array_elements(
      p_event #> '{raw,rrIntervalsMs}'
    )
  loop
    if jsonb_typeof(v_rr) <> 'number' then
      return false;
    end if;

    begin
      if (v_rr #>> '{}')::numeric <= 0 then
        return false;
      end if;
    exception
      when others then
        return false;
    end;
  end loop;

  if
    p_event #>> '{provenance,origin}' <> 'live_sensor'
    or p_event #>> '{provenance,capturedBy}' <> 'm26-web'
    or coalesce(
      p_event #>> '{provenance,timestampOrigin}',
      ''
    ) not in (
      'sensor',
      'receive_time',
      'source_or_receive_unverified'
    )
    or coalesce(
      (p_event #>> '{provenance,rawPreserved}')::boolean,
      false
    ) is not true
  then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end
$rc59$;

revoke all
on function public.m26_telemetry_event_valid_v59(
  jsonb,
  uuid,
  text,
  text
)
from public, anon, authenticated;

-- ==========================================================
-- Raw immutable telemetry.
-- session_id / execution_id remain opaque canonical IDs.
-- No generic per-row audit trigger: provenance is inside the
-- immutable event and operational audit is recorded by batch.
-- ==========================================================

create table public.m26_telemetry_events_v59 (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  event_id text not null
    check (
      event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    ),

  session_id text not null
    check (
      session_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    ),

  execution_id text not null
    check (
      execution_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    ),

  event_type text not null
    check (
      event_type = 'heart_rate_sample'
    ),

  source_provider text not null
    check (
      source_provider in (
        'apple_health',
        'wear_os_health_services',
        'ble_direct'
      )
    ),

  recorded_at timestamptz not null,
  received_at timestamptz not null,

  canonical_event jsonb not null
    check (
      octet_length(canonical_event::text) <= 12000
      and public.m26_telemetry_json_safe_v59(canonical_event)
    ),

  imported_by uuid not null
    references auth.users(id),

  created_at timestamptz not null default now(),

  expires_at timestamptz not null,

  unique (
    client_id,
    event_id
  ),

  check (
    canonical_event ->> 'eventId' = event_id
    and canonical_event ->> 'clientId' = client_id::text
    and canonical_event ->> 'sessionId' = session_id
    and canonical_event ->> 'executionId' = execution_id
    and canonical_event ->> 'eventType' = event_type
    and canonical_event #>> '{source,provider}' = source_provider
    and canonical_event ->> 'recordedAt' = recorded_at::text
      is not false
  )
);

create index m26_telemetry_client_recorded_v59
on public.m26_telemetry_events_v59 (
  client_id,
  recorded_at desc,
  event_id
);

create index m26_telemetry_execution_recorded_v59
on public.m26_telemetry_events_v59 (
  client_id,
  execution_id,
  recorded_at,
  event_id
);

create index m26_telemetry_expiry_v59
on public.m26_telemetry_events_v59 (
  expires_at
);

-- ==========================================================
-- Operational batch audit (no raw sample payload).
-- ==========================================================

create table public.m26_telemetry_import_batches_v59 (
  id uuid primary key default gen_random_uuid(),

  actor_user_id uuid not null
    references auth.users(id),

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  session_id text not null,
  execution_id text not null,

  received_count integer not null
    check (received_count between 1 and 100),

  accepted_count integer not null
    check (accepted_count between 0 and 100),

  duplicate_count integer not null
    check (duplicate_count between 0 and 100),

  rejected_count integer not null
    check (rejected_count between 0 and 100),

  payload_bytes integer not null
    check (payload_bytes between 1 and 192000),

  created_at timestamptz not null default now(),

  check (
    accepted_count
    + duplicate_count
    + rejected_count
    = received_count
  )
);

create index m26_telemetry_batches_client_created_v59
on public.m26_telemetry_import_batches_v59 (
  client_id,
  created_at desc
);

-- ==========================================================
-- Defense-in-depth RLS.
-- Direct table privileges stay revoked.
-- Admin role by itself receives no raw access.
-- A user who is also an actively assigned Coach is authorized
-- through assignment scope, not through the Admin role.
-- ==========================================================

alter table public.m26_telemetry_events_v59
  enable row level security;

alter table public.m26_telemetry_events_v59
  force row level security;

alter table public.m26_telemetry_import_batches_v59
  enable row level security;

alter table public.m26_telemetry_import_batches_v59
  force row level security;

create policy m26_telemetry_events_read_v59
on public.m26_telemetry_events_v59
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.m26_telemetry_can_access_client_v59(client_id)
);

create policy m26_telemetry_events_insert_v59
on public.m26_telemetry_events_v59
for insert
to authenticated
with check (
  imported_by = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.m26_telemetry_can_access_client_v59(client_id)
  )
);

revoke all
on public.m26_telemetry_events_v59
from public, anon, authenticated;

revoke all
on public.m26_telemetry_import_batches_v59
from public, anon, authenticated;

-- ==========================================================
-- Import RPC.
-- SECURITY DEFINER is intentional because direct table grants
-- remain revoked. Authorization is re-evaluated explicitly
-- server-side before any insert.
-- ==========================================================

create or replace function public.m26_telemetry_import_v59(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $rc59$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_session_id text;
  v_execution_id text;
  v_events jsonb;
  v_event jsonb;
  v_event_id text;
  v_existing jsonb;
  v_rows integer;
  v_payload_bytes integer;

  v_accepted jsonb := '[]'::jsonb;
  v_duplicate jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_rejected_reasons jsonb := '{}'::jsonb;

  v_accepted_count integer := 0;
  v_duplicate_count integer := 0;
  v_rejected_count integer := 0;
begin
  if v_actor is null then
    raise exception using
      errcode = '28000',
      message = 'M26_RC59_AUTH_REQUIRED';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_IMPORT_PAYLOAD_INVALID';
  end if;

  v_payload_bytes := octet_length(p_payload::text);

  if
    v_payload_bytes < 20
    or v_payload_bytes > 192000
    or not public.m26_telemetry_json_safe_v59(p_payload)
  then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_IMPORT_PAYLOAD_INVALID';
  end if;

  if p_payload ->> 'schemaVersion'
    <> 'iberfit.telemetry.remote.v1'
  then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_REMOTE_SCHEMA_INVALID';
  end if;

  begin
    v_client_id := (p_payload ->> 'clientId')::uuid;
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'M26_RC59_CLIENT_ID_INVALID';
  end;

  v_session_id := trim(coalesce(p_payload ->> 'sessionId',''));
  v_execution_id := trim(coalesce(p_payload ->> 'executionId',''));
  v_events := p_payload -> 'events';

  if
    v_session_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or v_execution_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or jsonb_typeof(v_events) <> 'array'
    or jsonb_array_length(v_events) < 1
    or jsonb_array_length(v_events) > 100
  then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_IMPORT_BATCH_INVALID';
  end if;

  if not (
    v_client_id = public.iberfit_client_id()
    or public.m26_telemetry_can_access_client_v59(v_client_id)
  ) then
    raise exception using
      errcode = '42501',
      message = 'M26_RC59_CLIENT_SCOPE_FORBIDDEN';
  end if;

  for v_event in
    select value
    from jsonb_array_elements(v_events)
  loop
    v_event_id := trim(coalesce(v_event ->> 'eventId',''));

    if v_event_id
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    then
      raise exception using
        errcode = '22023',
        message = 'M26_RC59_EVENT_ID_INVALID';
    end if;

    if not public.m26_telemetry_event_valid_v59(
      v_event,
      v_client_id,
      v_session_id,
      v_execution_id
    ) then
      v_rejected := v_rejected || jsonb_build_array(v_event_id);
      v_rejected_reasons :=
        v_rejected_reasons
        || jsonb_build_object(
          v_event_id,
          'M26_RC59_EVENT_INVALID'
        );
      v_rejected_count := v_rejected_count + 1;
      continue;
    end if;

    insert into public.m26_telemetry_events_v59 (
      client_id,
      event_id,
      session_id,
      execution_id,
      event_type,
      source_provider,
      recorded_at,
      received_at,
      canonical_event,
      imported_by,
      expires_at
    )
    values (
      v_client_id,
      v_event_id,
      v_session_id,
      v_execution_id,
      v_event ->> 'eventType',
      v_event #>> '{source,provider}',
      (v_event ->> 'recordedAt')::timestamptz,
      (v_event ->> 'receivedAt')::timestamptz,
      v_event,
      v_actor,
      (v_event ->> 'recordedAt')::timestamptz
        + interval '180 days'
    )
    on conflict (
      client_id,
      event_id
    )
    do nothing;

    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      v_accepted := v_accepted || jsonb_build_array(v_event_id);
      v_accepted_count := v_accepted_count + 1;
      continue;
    end if;

    select canonical_event
    into v_existing
    from public.m26_telemetry_events_v59
    where client_id = v_client_id
      and event_id = v_event_id;

    if v_existing = v_event then
      v_duplicate := v_duplicate || jsonb_build_array(v_event_id);
      v_duplicate_count := v_duplicate_count + 1;
    else
      v_rejected := v_rejected || jsonb_build_array(v_event_id);
      v_rejected_reasons :=
        v_rejected_reasons
        || jsonb_build_object(
          v_event_id,
          'M26_RC59_EVENT_ID_COLLISION'
        );
      v_rejected_count := v_rejected_count + 1;
    end if;
  end loop;

  insert into public.m26_telemetry_import_batches_v59 (
    actor_user_id,
    client_id,
    session_id,
    execution_id,
    received_count,
    accepted_count,
    duplicate_count,
    rejected_count,
    payload_bytes
  )
  values (
    v_actor,
    v_client_id,
    v_session_id,
    v_execution_id,
    jsonb_array_length(v_events),
    v_accepted_count,
    v_duplicate_count,
    v_rejected_count,
    v_payload_bytes
  );

  return jsonb_build_object(
    'ok', true,
    'schemaVersion', 'iberfit.telemetry.remote.v1',
    'clientId', v_client_id,
    'sessionId', v_session_id,
    'executionId', v_execution_id,
    'acceptedEventIds', v_accepted,
    'duplicateEventIds', v_duplicate,
    'rejectedEventIds', v_rejected,
    'rejectedReasons', v_rejected_reasons,
    'received', jsonb_array_length(v_events),
    'accepted', v_accepted_count,
    'duplicate', v_duplicate_count,
    'rejected', v_rejected_count
  );
end
$rc59$;

revoke all
on function public.m26_telemetry_import_v59(jsonb)
from public, anon;

grant execute
on function public.m26_telemetry_import_v59(jsonb)
to authenticated;

-- ==========================================================
-- Read / export page.
-- Raw access: own Client or currently assigned Coach.
-- Admin role alone grants nothing.
-- ==========================================================

create or replace function public.m26_telemetry_read_page_v59(
  p_client_id uuid,
  p_before timestamptz default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $rc59$
declare
  v_actor uuid := auth.uid();
  v_limit integer;
  v_events jsonb;
  v_next_before timestamptz;
begin
  if v_actor is null then
    raise exception using
      errcode = '28000',
      message = 'M26_RC59_AUTH_REQUIRED';
  end if;

  if not (
    p_client_id = public.iberfit_client_id()
    or public.m26_telemetry_can_access_client_v59(p_client_id)
  ) then
    raise exception using
      errcode = '42501',
      message = 'M26_RC59_CLIENT_SCOPE_FORBIDDEN';
  end if;

  v_limit := greatest(
    1,
    least(
      1000,
      coalesce(p_limit,500)
    )
  );

  with page as (
    select
      canonical_event,
      recorded_at,
      event_id
    from public.m26_telemetry_events_v59
    where client_id = p_client_id
      and (
        p_before is null
        or recorded_at < p_before
      )
    order by
      recorded_at desc,
      event_id desc
    limit v_limit
  )
  select
    coalesce(
      jsonb_agg(
        canonical_event
        order by recorded_at desc, event_id desc
      ),
      '[]'::jsonb
    ),
    min(recorded_at)
  into
    v_events,
    v_next_before
  from page;

  return jsonb_build_object(
    'ok', true,
    'clientId', p_client_id,
    'events', v_events,
    'nextBefore', v_next_before,
    'limit', v_limit
  );
end
$rc59$;

revoke all
on function public.m26_telemetry_read_page_v59(
  uuid,
  timestamptz,
  integer
)
from public, anon;

grant execute
on function public.m26_telemetry_read_page_v59(
  uuid,
  timestamptz,
  integer
)
to authenticated;

-- ==========================================================
-- Client-owned delete path.
-- Coach and Admin cannot delete a Client's raw telemetry.
-- ==========================================================

create or replace function public.m26_telemetry_delete_own_v59(
  p_before timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $rc59$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_deleted_events integer := 0;
  v_deleted_batches integer := 0;
begin
  if v_actor is null then
    raise exception using
      errcode = '28000',
      message = 'M26_RC59_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();

  if v_client_id is null then
    raise exception using
      errcode = '42501',
      message = 'M26_RC59_CLIENT_SELF_REQUIRED';
  end if;

  delete from public.m26_telemetry_events_v59
  where client_id = v_client_id
    and (
      p_before is null
      or recorded_at < p_before
    );

  get diagnostics v_deleted_events = row_count;

  delete from public.m26_telemetry_import_batches_v59
  where client_id = v_client_id
    and (
      p_before is null
      or created_at < p_before
    );

  get diagnostics v_deleted_batches = row_count;

  return jsonb_build_object(
    'ok', true,
    'clientId', v_client_id,
    'deletedEvents', v_deleted_events,
    'deletedBatchMetadata', v_deleted_batches
  );
end
$rc59$;

revoke all
on function public.m26_telemetry_delete_own_v59(timestamptz)
from public, anon;

grant execute
on function public.m26_telemetry_delete_own_v59(timestamptz)
to authenticated;

-- ==========================================================
-- Retention purge.
-- Intentionally NOT granted to authenticated.
-- Intended for controlled database scheduling after review.
-- ==========================================================

create or replace function public.m26_telemetry_purge_expired_v59()
returns integer
language plpgsql
security definer
set search_path = ''
as $rc59$
declare
  v_deleted integer := 0;
begin
  delete from public.m26_telemetry_events_v59
  where expires_at <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$rc59$;

revoke all
on function public.m26_telemetry_purge_expired_v59()
from public, anon, authenticated;

-- ==========================================================
-- Postchecks for the future executable migration.
-- ==========================================================

do $rc59_postcheck$
declare
  v_rls integer;
begin
  if to_regclass('public.m26_telemetry_events_v59') is null then
    raise exception 'M26_RC59_TELEMETRY_TABLE_MISSING';
  end if;

  if to_regclass('public.m26_telemetry_import_batches_v59') is null then
    raise exception 'M26_RC59_BATCH_AUDIT_TABLE_MISSING';
  end if;

  if to_regprocedure('public.m26_telemetry_import_v59(jsonb)') is null then
    raise exception 'M26_RC59_IMPORT_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_telemetry_read_page_v59(uuid,timestamp with time zone,integer)'
  ) is null then
    raise exception 'M26_RC59_READ_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_telemetry_delete_own_v59(timestamp with time zone)'
  ) is null then
    raise exception 'M26_RC59_DELETE_RPC_MISSING';
  end if;

  select count(*)
  into v_rls
  from pg_catalog.pg_class
  where oid = any (
    array[
      'public.m26_telemetry_events_v59'::regclass,
      'public.m26_telemetry_import_batches_v59'::regclass
    ]
  )
  and relrowsecurity is true;

  if v_rls <> 2 then
    raise exception 'M26_RC59_RLS_POSTCHECK_FAILED';
  end if;
end
$rc59_postcheck$;

commit;