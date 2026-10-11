-- QA ONLY / ADDITIVE: follow-up for atomic V45 source + legacy V44 display.
-- Native consent is still explicit; background and production stay disabled.
-- All writes are in ONE PostgreSQL transaction: V44 failures rollback V45.
-- The V44 sourceUpdatedAt alias represents acquisition, never sensor freshness.
begin;

create or replace function public.m26_wearable_v45_import_explicit_qa_v1(
  p_grant_id uuid, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  v_owner uuid := (select auth.uid());
  v_client uuid := public.iberfit_client_id();
  v_preflight jsonb;
  v_scopes text[];
  v_grant_cursor bigint;
  v_cursor bigint;
  v_row jsonb;
  v_metrics jsonb;
  v_provenance jsonb;
  v_date date;
  v_zone text;
  v_acquired timestamptz;
  v_old public.m26_wearable_source_daily_v45%rowtype;
  v_steps integer;
  v_sleep integer;
  v_hr numeric;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_legacy_records jsonb := '[]'::jsonb;
  v_legacy_ack jsonb;
begin
  -- Actual JWT/role assurance, not untrusted JSON-provided client identifiers.
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_owner is null or v_client is null or p_grant_id is null
    or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
    or pg_catalog.octet_length(p_payload::text)>24000
  then
    raise exception using message='M26_CONNECTED360_V45_WRITER_DENIED',errcode='42501';
  end if;

  -- Serialize with v44 import, authorization, revoke/delete_all and the V45
  -- cleanup trigger. NEVER check a revocation generation outside this lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
  ));

  -- Reuse the existing complete bounded preview validator *inside* the lock.
  -- Its SECURITY INVOKER behavior is supplemented by the explicit checks here.
  v_preflight := public.m26_wearable_v45_validate_native_preview_qa_v1(
    p_grant_id,p_payload
  );
  if v_preflight->>'ok' is distinct from 'true'
    or v_preflight->>'persisted' is distinct from 'false'
    or v_preflight->>'automatic' is distinct from 'false'
    or (v_preflight->>'validated')::integer
         is distinct from pg_catalog.jsonb_array_length(p_payload->'records')
  then
    raise exception using message='M26_CONNECTED360_V45_PREFLIGHT_DENIED',errcode='42501';
  end if;

  select a.scopes,a.revocation_cursor
    into v_scopes,v_grant_cursor
    from public.m26_wearable_authorization_sources_v3 a
    where a.owner_user_id=v_owner and a.client_id=v_client
      and a.provider='health_connect' and a.grant_id=p_grant_id
    for update;
  if not found then
    raise exception using message='M26_CONNECTED360_V45_GRANT_STALE',errcode='42501';
  end if;

  select coalesce(pg_catalog.max(e.id),0)
    into v_cursor
    from public.m26_wearable_revocation_events_v2 e
    where e.owner_user_id=v_owner and e.client_id=v_client
      and e.provider in ('health_connect','*');
  if v_cursor>v_grant_cursor or pg_catalog.cardinality(v_scopes)=0 then
    raise exception using message='M26_CONNECTED360_V45_GRANT_REVOKED',errcode='42501';
  end if;

  -- Both flags are transaction-local and reset before returning. The row
  -- trigger also binds these flags to auth.uid, client, grant and safe fields.
  perform pg_catalog.set_config('iberfit.connected360.v45_writer_qa',
    'explicit-authorized-v1',true);
  perform pg_catalog.set_config('iberfit.connected360.v45_grant_qa',
    p_grant_id::text,true);

  for v_row in select value from pg_catalog.jsonb_array_elements(p_payload->'records')
  loop
    v_metrics:=v_row->'metrics';
    v_provenance:=v_row->'provenance';
    v_date:=(v_row->>'date')::date;
    v_zone:=v_provenance->>'aggregationTimeZone';
    -- The preflight bounds syntax; the writer enforces a real IANA/PG zone.
    -- Never substitute the time zone of the physical watch.
    if v_zone is not null and not exists(
      select 1 from pg_catalog.pg_timezone_names tz where tz.name=v_zone
    ) then
      raise exception using message='M26_CONNECTED360_V45_ZONE_UNKNOWN',errcode='42501';
    end if;
    v_acquired:=(v_provenance->>'acquiredAt')::timestamptz;
    v_steps:=case when v_metrics?'steps' then (v_metrics->>'steps')::integer else null end;
    v_sleep:=case when v_metrics?'sleepMinutes' then (v_metrics->>'sleepMinutes')::integer else null end;
    v_hr:=case when v_metrics?'restingHeartRate' then (v_metrics->>'restingHeartRate')::numeric else null end;

    select * into v_old from public.m26_wearable_source_daily_v45
    where owner_user_id=v_owner and client_id=v_client
      and provider='health_connect' and record_date=v_date
      and source_key is null
      and aggregation_time_zone is not distinct from v_zone
    for update;

    if found then
      if v_acquired < v_old.acquired_at then
        v_unchanged:=v_unchanged+1;
      elsif v_acquired = v_old.acquired_at then
        if v_old.steps is distinct from v_steps
           or v_old.sleep_minutes is distinct from v_sleep
           or v_old.resting_heart_rate is distinct from v_hr then
          raise exception using message='M26_CONNECTED360_V45_TIMESTAMP_CONFLICT',
            errcode='42501';
        end if;
        v_unchanged:=v_unchanged+1;
      else
        -- A later acquisition is NOT proof of newer measurements. Replacement
        -- is the whole observed snapshot; absent metrics become NULL, not zero.
        update public.m26_wearable_source_daily_v45 set
          steps=v_steps,sleep_minutes=v_sleep,resting_heart_rate=v_hr,
          active_minutes=null,hrv_ms=null,active_energy_kcal=null,
          workout_minutes=null,acquired_at=v_acquired,
          imported_at=pg_catalog.now(),grant_id=p_grant_id,
          revocation_cursor=v_cursor,quality='limitada',
          source_time_verified=false,automatic_sync_certified=false
        where id=v_old.id;
        v_updated:=v_updated+1;
      end if;
    else
      insert into public.m26_wearable_source_daily_v45 (
        owner_user_id,client_id,provider,record_date,source_key,
        source_record_key,source_time_zone,aggregation_time_zone,
        acquired_at,source_time_verified,automatic_sync_certified,quality,
        grant_id,revocation_cursor,source_record_count,
        steps,sleep_minutes,resting_heart_rate
      ) values (
        v_owner,v_client,'health_connect',v_date,null,
        null,null,v_zone,v_acquired,false,false,'limitada',
        p_grant_id,v_cursor,1,v_steps,v_sleep,v_hr
      );
      v_inserted:=v_inserted+1;
    end if;
    -- V44 compatibility is transactional, not a second browser-side RPC.
    -- Its schema lacks acquired_at, hence a strictly internal projection.
    v_legacy_records := v_legacy_records || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'clientId',v_client::text,'provider','health_connect',
        'date',v_row->>'date','metrics',v_metrics,
        'quality','limitada','sourceRecordCount',1,
        'sourceUpdatedAt',v_provenance->>'acquiredAt'
      )
    );
  end loop;

  v_legacy_ack := public.m26_wearable_import_authorized_v2(
    p_grant_id,pg_catalog.jsonb_build_object('records',v_legacy_records)
  );
  if v_legacy_ack->>'ok' is distinct from 'true'
    or coalesce((v_legacy_ack->>'rejected')::integer,-1)<>0
    or coalesce((v_legacy_ack->>'accepted')::integer,0)
       +coalesce((v_legacy_ack->>'stale')::integer,0)
       <>pg_catalog.jsonb_array_length(v_legacy_records)
  then
    raise exception using message='M26_CONNECTED360_V45_LEGACY_ATOMIC_FAIL',
      errcode='42501';
  end if;

  perform pg_catalog.set_config('iberfit.connected360.v45_writer_qa','',true);
  perform pg_catalog.set_config('iberfit.connected360.v45_grant_qa','',true);
  return pg_catalog.jsonb_build_object(
    'ok',true,'persisted',true,'automatic',false,
    'provider','health_connect','inserted',v_inserted,
    'updated',v_updated,'unchanged',v_unchanged,
    'count',v_inserted+v_updated+v_unchanged,
    'legacyAccepted',v_legacy_ack->'accepted',
    'legacyStale',v_legacy_ack->'stale',
    'sourceTimeVerified',false,'sourceIdentityVerified',false
  );
end;
$fn$;

-- A SECURITY DEFINER public RPC must be executable ONLY by authenticated
-- users and MUST validate the current actor, client, assurance and grant itself.
revoke all on function public.m26_wearable_v45_import_explicit_qa_v1(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.m26_wearable_v45_import_explicit_qa_v1(uuid,jsonb)
  to authenticated;

comment on function public.m26_wearable_v45_import_explicit_qa_v1(uuid,jsonb) is
  'QA ONLY: explicit user-confirmed Health Connect snapshots, per-owner/client advisory lock and current grant/cursor, atomically mirrored to v44 for existing UI. Not automatic or source-time certified.';
commit;
