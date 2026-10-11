-- Connected 360 V45 QA-only: explicitly authorized, transactional native daily ingestion.
-- NEVER copy to supabase/migrations or deploy to PROD before hardware+privacy gates.
-- The table stays FORCE RLS with NO browser table grants or policies.
-- Only the narrowly authenticated Client RPC may write unknown-source aggregates.
-- Not a certified automatic source; measured/source-updated times remain NULL.
begin;

-- Keep the historical name but make the rejection conditional upon the narrow
-- RPC's transaction-local grant. Other SQL inserts and updates still fail closed.
create or replace function public.m26_wearable_v45_block_unverified_write_qa_v1()
returns trigger language plpgsql security invoker set search_path=''
as $fn$
begin
  if pg_catalog.current_setting('iberfit.connected360.v45_writer_qa',true)
       is distinct from 'explicit-authorized-v1'
    or pg_catalog.current_setting('iberfit.connected360.v45_grant_qa',true)
       is distinct from new.grant_id::text
    or (select auth.uid()) is null
    or new.owner_user_id is distinct from (select auth.uid())
    or new.client_id is distinct from public.iberfit_client_id()
    or new.provider is distinct from 'health_connect'
    or new.source_key is not null
    or new.source_record_key is not null
    or new.source_time_zone is not null
    or new.measured_at is not null
    or new.source_updated_at is not null
    or new.source_time_verified is distinct from false
    or new.automatic_sync_certified is distinct from false
    or new.quality is distinct from 'limitada'
  then
    raise exception using message='M26_CONNECTED360_V45_INGEST_UNCERTIFIED',errcode='42501';
  end if;
  return new;
end;
$fn$;
revoke all on function public.m26_wearable_v45_block_unverified_write_qa_v1()
  from public,anon,authenticated;

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
  end loop;

  perform pg_catalog.set_config('iberfit.connected360.v45_writer_qa','',true);
  perform pg_catalog.set_config('iberfit.connected360.v45_grant_qa','',true);
  return pg_catalog.jsonb_build_object(
    'ok',true,'persisted',true,'automatic',false,
    'provider','health_connect','inserted',v_inserted,
    'updated',v_updated,'unchanged',v_unchanged,
    'count',v_inserted+v_updated+v_unchanged,
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
  'QA ONLY: explicit user-confirmed Health Connect snapshots, per-owner/client advisory lock, current grant/cursor and scopes. No background/automatic sync or source-time certification.';
commit;
