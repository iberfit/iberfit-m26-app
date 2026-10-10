-- IBERFIT Connected 360: manual imported data is NOT an automatic device connection.
-- Fail closed if either original RPC definition has drifted before release.
-- CREATE OR REPLACE preserves existing owners, function ACL and SECURITY INVOKER.
-- No historical row updates; no v45 ingestion or source permission changes.
-- Read-only assertions; division-by-zero intentionally stops migration on drift.
-- This form respects the no-anonymous-DO/no-mutation release policy.
select 1 / (case when
  md5(pg_catalog.pg_get_functiondef('public.m26_wearable_import_authorized_v2(uuid,jsonb)'::regprocedure)) =
    '2c4c8613e811d9fa46d614165fa8ad49'
  then 1 else 0 end) as "M26_CONNECTED360_IMPORT_TRUTH_V7_SOURCE_DRIFT";

select 1 / (case when
  md5(pg_catalog.pg_get_functiondef('public.m26_wearable_connection_upsert_v44(jsonb)'::regprocedure)) =
    '76b3f83ec9f64e4426fd353abbb6a477'
  then 1 else 0 end) as "M26_CONNECTED360_CONNECTION_V7_SOURCE_DRIFT";

-- A manually incorporated file remains an active authorized SOURCE, but
-- must not acquire automatic sync semantics. Keep 'grant' consent action
-- for verified explicit manual import; generic paused sources remain 'pause'.
CREATE OR REPLACE FUNCTION public.m26_wearable_connection_upsert_v44(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  perform public.iberfit_require_privileged_assurance_v65d();
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
    when v_sync_enabled or (v_status = 'active' and v_metadata ->> 'mode' = 'confirmed_import') then 'grant'
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
$function$


-- This RPC only accepts an explicit generation-bound import, under the
-- existing advisory lock / scope validation / revocation fencing.
-- lastImportedAt means receipt by IBERFIT, not measurement or source freshness.
CREATE OR REPLACE FUNCTION public.m26_wearable_import_authorized_v2(p_grant_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_owner uuid:=(select auth.uid());
  v_client uuid:=public.iberfit_client_id();
  v_grant public.m26_wearable_authorization_v2%rowtype;
  v_cursor bigint;
  v_rows jsonb;
  v_provider text;
  v_row jsonb;
  v_metrics jsonb;
  v_key text;
  v_value jsonb;
  v_import jsonb;
  v_link jsonb;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_owner is null or v_client is null or p_grant_id is null
    or jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>900000 then
    raise exception using message='M26_CONNECTED360_IMPORT_INVALID',errcode='42501';
  end if;
  v_rows:=p_payload->'records';
  if jsonb_typeof(v_rows)<>'array' or jsonb_array_length(v_rows) not between 1 and 250 then
    raise exception using message='M26_CONNECTED360_IMPORT_BATCH_INVALID',errcode='42501';
  end if;
  v_provider:=lower(trim(coalesce(v_rows->0->>'provider','')));
  if v_provider not in ('normalized_file','health_connect','samsung_health','apple_health','strava','garmin_connect','fitbit','oura') then
    raise exception using message='M26_CONNECTED360_IMPORT_SOURCE_INVALID',errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint));
  if v_provider='normalized_file' then
    select * into v_grant from public.m26_wearable_authorization_v2 a
      where a.owner_user_id=v_owner and a.client_id=v_client
        and a.provider=v_provider and a.grant_id=p_grant_id;
  else
    select a.owner_user_id,a.client_id,a.provider,a.grant_id,a.revocation_cursor,a.scopes,a.granted_at
      into v_grant from public.m26_wearable_authorization_sources_v3 a
      where a.owner_user_id=v_owner and a.client_id=v_client
        and a.provider=v_provider and a.grant_id=p_grant_id;
  end if;
  if not found then
    raise exception using message='M26_CONNECTED360_GRANT_STALE',errcode='42501';
  end if;
  select coalesce(max(e.id),0) into v_cursor
    from public.m26_wearable_revocation_events_v2 e
    where e.owner_user_id=v_owner and e.client_id=v_client
      and e.provider in(v_provider,'*');
  if v_cursor>v_grant.revocation_cursor then
    raise exception using message='M26_CONNECTED360_GRANT_REVOKED',errcode='42501';
  end if;
  for v_row in select value from jsonb_array_elements(v_rows) loop
    if jsonb_typeof(v_row)<>'object' or v_row->>'clientId'<>v_client::text
      or v_row->>'provider'<>v_provider
      or jsonb_typeof(v_row->'metrics')<>'object' then
      raise exception using message='M26_CONNECTED360_IMPORT_SCOPE_INVALID',errcode='42501';
    end if;
    v_metrics:=v_row->'metrics';
    for v_key,v_value in select key,value from jsonb_each(v_metrics) loop
      if v_value is distinct from 'null'::jsonb and not (v_key=any(v_grant.scopes)) then
        raise exception using message='M26_CONNECTED360_IMPORT_SCOPE_FORBIDDEN',errcode='42501';
      end if;
    end loop;
  end loop;
  perform pg_catalog.set_config('iberfit.connected360.grant_id',p_grant_id::text,true);
  v_import:=public.m26_wearable_import_v44(p_payload);
  if coalesce((v_import->>'rejected')::integer,0)>0 then
    raise exception using message='M26_CONNECTED360_IMPORT_REJECTED',errcode='42501';
  end if;
  v_link:=public.m26_wearable_connection_upsert_v44(jsonb_build_object(
    'clientId',v_client,'provider',v_provider,'status','active',
    'syncEnabled',false,'scopes',to_jsonb(v_grant.scopes),'lastSyncedAt',null,
    'metadata',jsonb_build_object('mode','confirmed_import','automatic',false,
      'lastImportedAt',pg_catalog.now(),'consentGeneration',p_grant_id)
  ));
  return jsonb_build_object('ok',true,'accepted',v_import->'accepted',
    'stale',v_import->'stale','rejected',0,'grantId',p_grant_id,
    'connection',v_link->'status');
end;
$function$

