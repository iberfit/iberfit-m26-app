-- IBERFIT Connected 360 · SINGLE PRODUCTION MACRO · dormant until signed Android E2E.
-- Preserves all V44 records. This is not an implicit consent or migration of historical data.
-- Activation only via privileged explicit change to the release control AFTER physical QA.
BEGIN;
SELECT 1 FROM public.m26_wearable_consents_v44 LIMIT 0;
SELECT 1 FROM public.m26_wearable_authorization_sources_v3 LIMIT 0;
SELECT 1 FROM public.m26_wearable_heart_rate_daily_v46 LIMIT 0;
SELECT 1 FROM public.m26_wearable_exercise_evidence_v46 LIMIT 0;
-- IBERFIT-TABLE-ACCESS: public.m26_wearable_v46_release_control_prod :: owner-only operator configuration, zero client CRUD
-- IBERFIT-POLICY: public.m26_wearable_v46_release_control_prod = service-role-only
CREATE TABLE public.m26_wearable_v46_release_control_prod(
  id boolean PRIMARY KEY DEFAULT true CHECK(id=true),
  enabled boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_ticket text,
  CHECK (change_ticket IS NULL OR length(change_ticket) BETWEEN 8 AND 160)
);
ALTER TABLE public.m26_wearable_v46_release_control_prod ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m26_wearable_v46_release_control_prod FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.m26_wearable_v46_release_control_prod FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.m26_wearable_v46_release_control_prod TO service_role;
INSERT INTO public.m26_wearable_v46_release_control_prod(id,enabled,change_ticket)
 VALUES(true,false,'CONNECTED360_RELEASE_NOT_YET_CERTIFIED');
-- Read-only switch visible only through a client-authenticated status RPC.
CREATE OR REPLACE FUNCTION public.m26_wearable_v46_capabilities_prod_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $capabilities$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_client uuid := public.iberfit_client_id();
  v_enabled boolean := false;
BEGIN
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF v_owner IS NULL OR v_client IS NULL THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_CLIENT_REQUIRED',ERRCODE='42501';
  END IF;
  SELECT enabled INTO v_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id=true;
  RETURN jsonb_build_object(
    'ok',true,'provider','health_connect','nativeAndroidOnly',true,
    'serverEnabled',COALESCE(v_enabled,false),'schema','iberfit.connected360.v46.ingest.v1'
  );
END;
$capabilities$;
REVOKE ALL ON FUNCTION public.m26_wearable_v46_capabilities_prod_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v46_capabilities_prod_v1() TO authenticated;
-- V44 stays IMMUTABLE. New categories have their own auditable consent receipts.
-- IBERFIT-TABLE-ACCESS: public.m26_wearable_v46_consents_prod :: Private HR/exercise consent receipts, no direct browser access
-- IBERFIT-POLICY: public.m26_wearable_v46_consents_prod = service-role-only
CREATE TABLE public.m26_wearable_v46_consents_prod(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'health_connect' CHECK(provider='health_connect'),
  grant_id uuid NOT NULL,
  revocation_cursor bigint NOT NULL CHECK(revocation_cursor>=0),
  scopes text[] NOT NULL CHECK(
    cardinality(scopes) BETWEEN 1 AND 2
    AND scopes <@ ARRAY['generalHeartRate','exerciseSessions']::text[]
  ),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX m26_v46_consent_owner_lookup_prod ON public.m26_wearable_v46_consents_prod
(owner_user_id,client_id,recorded_at DESC);
ALTER TABLE public.m26_wearable_v46_consents_prod ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m26_wearable_v46_consents_prod FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.m26_wearable_v46_consents_prod FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.m26_wearable_v46_consents_prod TO service_role;
CREATE OR REPLACE FUNCTION public.m26_wearable_v46_authorize_prod_v1(
  p_expected_grant uuid,
  p_expected_cursor bigint,
  p_scopes text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $qa_v46_extend$
DECLARE
  v_owner uuid := (select auth.uid());
  v_client uuid := public.iberfit_client_id();
  v_cursor bigint;
  v_grant public.m26_wearable_authorization_sources_v3%rowtype;
  v_union text[];
  v_requested text[];
  v_new_grant uuid;
BEGIN
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF NOT EXISTS (SELECT 1 FROM public.m26_wearable_v46_release_control_prod
    WHERE id=true AND enabled=true) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PRODUCTION_DISABLED',ERRCODE='42501';
  END IF;
  IF v_owner IS NULL OR v_client IS NULL
    OR p_expected_cursor IS NULL
    OR p_expected_cursor < 0 OR p_scopes IS NULL
    OR pg_catalog.cardinality(p_scopes) < 1
    OR pg_catalog.cardinality(p_scopes) > 2
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_scopes) x
        WHERE x IS NULL OR x <> ALL(ARRAY['generalHeartRate','exerciseSessions']::text[]))
  THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_EXTENSION_INVALID',ERRCODE='42501';
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT item ORDER BY item)
    INTO v_requested FROM pg_catalog.unnest(p_scopes) item;
  IF pg_catalog.cardinality(v_requested) <> pg_catalog.cardinality(p_scopes) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_DUPLICATE',ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
  ));
  SELECT coalesce(pg_catalog.max(e.id),0) INTO v_cursor
  FROM public.m26_wearable_revocation_events_v2 e
  WHERE e.owner_user_id=v_owner AND e.client_id=v_client
    AND e.provider IN ('health_connect','*');
  SELECT a.* INTO v_grant
  FROM public.m26_wearable_authorization_sources_v3 a
  WHERE a.owner_user_id=v_owner AND a.client_id=v_client
    AND a.provider='health_connect'
  FOR UPDATE;
  IF v_cursor <> p_expected_cursor OR
    (v_grant.grant_id IS NOT NULL AND
      (v_grant.grant_id IS DISTINCT FROM p_expected_grant OR
       v_grant.revocation_cursor < v_cursor)) OR
    (v_grant.grant_id IS NULL AND p_expected_grant IS NOT NULL) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_GRANT_STALE',ERRCODE='42501';
  END IF;
  IF v_grant.grant_id IS NULL THEN
    v_new_grant:=gen_random_uuid();
    INSERT INTO public.m26_wearable_authorization_sources_v3(
      owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes
    ) VALUES(v_owner,v_client,'health_connect',v_new_grant,v_cursor,v_requested);
    INSERT INTO public.m26_wearable_v46_consents_prod(
    owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes
  ) VALUES(v_owner,v_client,'health_connect',v_new_grant,v_cursor,v_requested);
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'provider','health_connect','grantId',v_new_grant,
      'revocationCursor',v_cursor,'scopes',pg_catalog.to_jsonb(v_requested),
      'alreadyAuthorized',false
    );
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT item ORDER BY item)
    INTO v_union FROM pg_catalog.unnest(v_grant.scopes||v_requested) item;
  IF pg_catalog.cardinality(v_union) > 9 THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_TOO_MANY',ERRCODE='42501';
  END IF;
  IF v_requested <@ v_grant.scopes THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'provider','health_connect','grantId',v_grant.grant_id,
      'revocationCursor',v_cursor,'scopes',pg_catalog.to_jsonb(v_grant.scopes),
      'alreadyAuthorized',true
    );
  END IF;
  UPDATE public.m26_wearable_authorization_sources_v3
  SET scopes=v_union,granted_at=pg_catalog.now()
  WHERE owner_user_id=v_owner AND client_id=v_client
    AND provider='health_connect' AND grant_id=p_expected_grant;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_PROD_SCOPE_GRANT_STALE',ERRCODE='42501';
  END IF;
  -- Existing consent log permits only this canonical policy version.
  INSERT INTO public.m26_wearable_v46_consents_prod(
    owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes
  ) VALUES(v_owner,v_client,'health_connect',p_expected_grant,v_cursor,v_requested);
  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'provider','health_connect','grantId',p_expected_grant,
    'revocationCursor',v_cursor,'scopes',pg_catalog.to_jsonb(v_union),
    'alreadyAuthorized',false
  );
END;
$qa_v46_extend$;

REVOKE ALL ON FUNCTION public.m26_wearable_v46_authorize_prod_v1(uuid,bigint,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v46_authorize_prod_v1(uuid,bigint,text[]) TO authenticated;
create or replace function public.m26_wearable_v46_import_prod_v1(
  p_grant_id uuid,p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $v46$
declare
  v_owner uuid := (select auth.uid());
  v_client uuid := public.iberfit_client_id();
  v_grant_cursor bigint;
  v_cursor bigint;
  v_scopes text[];
  v_hr_rows jsonb;
  v_ex_rows jsonb;
  v_row jsonb;
  v_key text;
  v_zone text;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_acquired timestamptz;
  v_source text;
  v_app text;
  v_sport text;
  v_samples integer;
  v_hr_min numeric;
  v_hr_max numeric;
  v_hr_avg numeric;
  v_distance numeric;
  v_steps integer;
  v_calories numeric;
  v_old_hr public.m26_wearable_heart_rate_daily_v46%rowtype;
  v_old_ex public.m26_wearable_exercise_evidence_v46%rowtype;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if not exists (select 1 from public.m26_wearable_v46_release_control_prod where id=true and enabled=true) then
    raise exception using message='M26_V46_PRODUCTION_DISABLED',errcode='42501';
  end if;
  if v_owner is null or v_client is null or p_grant_id is null
    or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
    or pg_catalog.octet_length(p_payload::text)>48000
    or p_payload->>'schema' is distinct from 'iberfit.connected360.v46.ingest.v1'
    or exists (select 1 from pg_catalog.jsonb_object_keys(p_payload) k
               where k not in ('schema','heartRateDaily','exerciseEvidence'))
  then
    raise exception using message='M26_V46_PAYLOAD_DENIED',errcode='42501';
  end if;
  v_hr_rows:=coalesce(p_payload->'heartRateDaily','[]'::jsonb);
  v_ex_rows:=coalesce(p_payload->'exerciseEvidence','[]'::jsonb);
  if pg_catalog.jsonb_typeof(v_hr_rows)<>'array'
    or pg_catalog.jsonb_typeof(v_ex_rows)<>'array' then
    raise exception using message='M26_V46_ARRAYS_REQUIRED',errcode='42501';
  end if;
  if pg_catalog.jsonb_array_length(v_hr_rows)>7
    or pg_catalog.jsonb_array_length(v_ex_rows)>20
    or pg_catalog.jsonb_array_length(v_hr_rows)+pg_catalog.jsonb_array_length(v_ex_rows)<1 then
    raise exception using message='M26_V46_BATCH_BOUNDS',errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
  ));
  select a.scopes,a.revocation_cursor into v_scopes,v_grant_cursor
    from public.m26_wearable_authorization_sources_v3 a
    where a.owner_user_id=v_owner and a.client_id=v_client
      and a.provider='health_connect' and a.grant_id=p_grant_id
    for update;
  if not found or v_grant_cursor is null then
    raise exception using message='M26_V46_GRANT_STALE',errcode='42501';
  end if;
  select coalesce(max(e.id),0) into v_cursor
    from public.m26_wearable_revocation_events_v2 e
    where e.owner_user_id=v_owner and e.client_id=v_client
      and e.provider in ('health_connect','*');
  if v_cursor>v_grant_cursor then
    raise exception using message='M26_V46_GRANT_REVOKED',errcode='42501';
  end if;
  if (pg_catalog.jsonb_array_length(v_hr_rows)>0 and not ('generalHeartRate'=any(v_scopes)))
     or (pg_catalog.jsonb_array_length(v_ex_rows)>0 and not ('exerciseSessions'=any(v_scopes))) then
    raise exception using message='M26_V46_SCOPE_DENIED',errcode='42501';
  end if;

  perform pg_catalog.set_config('iberfit.connected360.v46_grant_prod',p_grant_id::text,true);
  perform pg_catalog.set_config('iberfit.connected360.v46_writer_prod','explicit-only-v1',true);

  for v_row in select value from pg_catalog.jsonb_array_elements(v_hr_rows) loop
    if pg_catalog.jsonb_typeof(v_row)<>'object'
      or exists (select 1 from pg_catalog.jsonb_object_keys(v_row) k where k not in
        ('date','aggregationTimeZone','windowStartedAt','windowEndedAt','acquiredAt',
        'sourceKey','sampleCount','avgBpm','minBpm','maxBpm')) then
      raise exception using message='M26_V46_HR_FIELDS_INVALID',errcode='42501';
    end if;
    v_zone:=v_row->>'aggregationTimeZone';
    v_source:=v_row->>'sourceKey';
    if v_row->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or v_zone is null
      or not exists (select 1 from pg_catalog.pg_timezone_names tz where tz.name=v_zone)
      or (v_source is not null and v_source !~ '^[0-9a-f]{64}$')
      or v_row->>'windowStartedAt' is null
      or v_row->>'windowEndedAt' is null
      or v_row->>'acquiredAt' is null
      or v_row->>'sampleCount' !~ '^[0-9]{1,6}$' then
      raise exception using message='M26_V46_HR_PROVENANCE_INVALID',errcode='42501';
    end if;
    v_date:=(v_row->>'date')::date;
    v_start:=(v_row->>'windowStartedAt')::timestamptz;
    v_end:=(v_row->>'windowEndedAt')::timestamptz;
    v_acquired:=(v_row->>'acquiredAt')::timestamptz;
    v_samples:=(v_row->>'sampleCount')::integer;
    v_hr_min:=(v_row->>'minBpm')::numeric;
    v_hr_max:=(v_row->>'maxBpm')::numeric;
    v_hr_avg:=(v_row->>'avgBpm')::numeric;
    if not isfinite(v_start) or not isfinite(v_end) or not isfinite(v_acquired)
      or v_date is distinct from (v_start at time zone v_zone)::date
      or v_start<pg_catalog.now()-interval '31 days'
      or v_start>pg_catalog.now()+interval '5 minutes'
      or v_end<=v_start or v_end-v_start>interval '25 hours'
      or v_acquired<pg_catalog.now()-interval '20 minutes'
      or v_acquired>pg_catalog.now()+interval '5 minutes'
      or v_samples not between 1 and 200000
      or (v_hr_min is null) <> (v_hr_max is null)
      or (v_hr_min is not null and (v_hr_min<25 or v_hr_max>240 or v_hr_min>v_hr_max))
      or (v_hr_avg is not null and (v_hr_avg<25 or v_hr_avg>240
        or (v_hr_min is not null and v_hr_avg not between v_hr_min and v_hr_max))) then
      raise exception using message='M26_V46_HR_RANGE_INVALID',errcode='42501';
    end if;
    select * into v_old_hr from public.m26_wearable_heart_rate_daily_v46
      where owner_user_id=v_owner and client_id=v_client and provider='health_connect'
        and record_date=v_date and source_key is not distinct from v_source
        and aggregation_time_zone is not distinct from v_zone for update;
    if found and v_old_hr.acquired_at>=v_acquired then
      if v_old_hr.acquired_at=v_acquired and (
        v_old_hr.window_started_at is distinct from v_start
        or v_old_hr.window_ended_at is distinct from v_end
        or v_old_hr.sample_count is distinct from v_samples
        or v_old_hr.heart_rate_min is distinct from v_hr_min
        or v_old_hr.heart_rate_max is distinct from v_hr_max
        or v_old_hr.heart_rate_avg is distinct from v_hr_avg
      ) then
        raise exception using message='M26_V46_HR_SAME_TIMESTAMP_CONFLICT',errcode='40001';
      end if;
      v_unchanged:=v_unchanged+1;
    elsif found then
      update public.m26_wearable_heart_rate_daily_v46 set
        window_started_at=v_start,window_ended_at=v_end,
        acquired_at=v_acquired,sample_count=v_samples,
        heart_rate_min=v_hr_min,heart_rate_max=v_hr_max,heart_rate_avg=v_hr_avg,
        grant_id=p_grant_id,revocation_cursor=v_cursor,imported_at=pg_catalog.now()
      where id=v_old_hr.id;
      v_updated:=v_updated+1;
    else
      insert into public.m26_wearable_heart_rate_daily_v46(
        owner_user_id,client_id,provider,record_date,source_key,aggregation_time_zone,
        window_started_at,window_ended_at,acquired_at,sample_count,heart_rate_avg,
        heart_rate_min,heart_rate_max,grant_id,revocation_cursor
      ) values (
        v_owner,v_client,'health_connect',v_date,v_source,v_zone,
        v_start,v_end,v_acquired,v_samples,v_hr_avg,
        v_hr_min,v_hr_max,p_grant_id,v_cursor
      );
      v_inserted:=v_inserted+1;
    end if;
  end loop;

  for v_row in select value from pg_catalog.jsonb_array_elements(v_ex_rows) loop
    if pg_catalog.jsonb_typeof(v_row)<>'object'
      or exists (select 1 from pg_catalog.jsonb_object_keys(v_row) k where k not in
        ('observationKey','sourceAppKey','sport','startedAt','endedAt','acquiredAt',
         'aggregationTimeZone','heartRateSamples','avgBpm','minBpm','maxBpm',
         'distanceMeters','steps','caloriesKcal')) then
      raise exception using message='M26_V46_EX_FIELDS_INVALID',errcode='42501';
    end if;
    v_source:=v_row->>'observationKey';
    v_app:=v_row->>'sourceAppKey';
    v_sport:=v_row->>'sport';
    v_zone:=v_row->>'aggregationTimeZone';
    if v_source is null or v_source !~ '^[0-9a-f]{64}$'
      or (v_app is not null and v_app !~ '^[0-9a-f]{64}$')
      or v_sport not in ('running','interval_running','hiit','cycling','walking','strength','other')
      or (v_zone is not null and not exists (
        select 1 from pg_catalog.pg_timezone_names tz where tz.name=v_zone))
      or v_row->>'startedAt' is null or v_row->>'endedAt' is null
      or v_row->>'acquiredAt' is null then
      raise exception using message='M26_V46_EX_PROVENANCE_INVALID',errcode='42501';
    end if;
    v_start:=(v_row->>'startedAt')::timestamptz;
    v_end:=(v_row->>'endedAt')::timestamptz;
    v_acquired:=(v_row->>'acquiredAt')::timestamptz;
    if v_row ?| array['heartRateSamples','avgBpm','minBpm','maxBpm']
      and not ('generalHeartRate'=any(v_scopes)) then
      raise exception using message='M26_V46_WORKOUT_HR_SCOPE_DENIED',errcode='42501';
    end if;
    v_samples:=(v_row->>'heartRateSamples')::integer;
    v_hr_avg:=(v_row->>'avgBpm')::numeric;
    v_hr_min:=(v_row->>'minBpm')::numeric;
    v_hr_max:=(v_row->>'maxBpm')::numeric;
    v_distance:=(v_row->>'distanceMeters')::numeric;
    v_steps:=(v_row->>'steps')::integer;
    v_calories:=(v_row->>'caloriesKcal')::numeric;
    if not isfinite(v_start) or not isfinite(v_end) or not isfinite(v_acquired)
      or v_start<pg_catalog.now()-interval '31 days'
      or v_start>pg_catalog.now()+interval '5 minutes'
      or v_end<=v_start or v_end-v_start>interval '24 hours'
      or v_acquired<pg_catalog.now()-interval '20 minutes'
      or v_acquired>pg_catalog.now()+interval '5 minutes'
      or (v_samples is not null and v_samples not between 0 and 200000)
      or (v_hr_min is null)<>(v_hr_max is null)
      or (v_hr_min is not null and (v_hr_min<25 or v_hr_max>240 or v_hr_min>v_hr_max))
      or (v_hr_avg is not null and (v_hr_avg<25 or v_hr_avg>240
        or (v_hr_min is not null and v_hr_avg not between v_hr_min and v_hr_max)))
      or (v_samples is null and (v_hr_avg is not null or v_hr_min is not null or v_hr_max is not null))
      or (v_distance is not null and v_distance not between 0 and 500000)
      or (v_steps is not null and v_steps not between 0 and 200000)
      or (v_calories is not null and v_calories not between 0 and 20000) then
      raise exception using message='M26_V46_EX_RANGE_INVALID',errcode='42501';
    end if;
    select * into v_old_ex from public.m26_wearable_exercise_evidence_v46
      where owner_user_id=v_owner and client_id=v_client and provider='health_connect'
        and source_record_key=v_source for update;
    if found and v_old_ex.acquired_at>=v_acquired then
      if v_old_ex.acquired_at=v_acquired and (
        v_old_ex.observed_started_at is distinct from v_start
        or v_old_ex.observed_ended_at is distinct from v_end
        or v_old_ex.sport is distinct from v_sport
        or v_old_ex.source_app_key is distinct from v_app
        or v_old_ex.aggregation_time_zone is distinct from v_zone
        or v_old_ex.heart_rate_samples is distinct from v_samples
        or v_old_ex.heart_rate_avg is distinct from v_hr_avg
        or v_old_ex.heart_rate_min is distinct from v_hr_min
        or v_old_ex.heart_rate_max is distinct from v_hr_max
        or v_old_ex.distance_meters is distinct from v_distance
        or v_old_ex.steps is distinct from v_steps
        or v_old_ex.calories_kcal is distinct from v_calories
      ) then
        raise exception using message='M26_V46_EX_SAME_TIMESTAMP_CONFLICT',errcode='40001';
      end if;
      v_unchanged:=v_unchanged+1;
    elsif found then
      update public.m26_wearable_exercise_evidence_v46 set
        observed_started_at=v_start,observed_ended_at=v_end,
        source_app_key=v_app,sport=v_sport,aggregation_time_zone=v_zone,
        acquired_at=v_acquired,heart_rate_samples=v_samples,
        heart_rate_avg=v_hr_avg,heart_rate_min=v_hr_min,heart_rate_max=v_hr_max,
        distance_meters=v_distance,steps=v_steps,calories_kcal=v_calories,
        grant_id=p_grant_id,revocation_cursor=v_cursor,imported_at=pg_catalog.now()
      where id=v_old_ex.id;
      v_updated:=v_updated+1;
    else
      insert into public.m26_wearable_exercise_evidence_v46(
        owner_user_id,client_id,provider,source_record_key,source_app_key,sport,
        observed_started_at,observed_ended_at,aggregation_time_zone,acquired_at,
        heart_rate_samples,heart_rate_avg,heart_rate_min,heart_rate_max,
        distance_meters,steps,calories_kcal,grant_id,revocation_cursor
      ) values (
        v_owner,v_client,'health_connect',v_source,v_app,v_sport,
        v_start,v_end,v_zone,v_acquired,
        v_samples,v_hr_avg,v_hr_min,v_hr_max,
        v_distance,v_steps,v_calories,p_grant_id,v_cursor
      );
      v_inserted:=v_inserted+1;
    end if;
  end loop;
  perform pg_catalog.set_config('iberfit.connected360.v46_grant_prod','',true);
  perform pg_catalog.set_config('iberfit.connected360.v46_writer_prod','',true);
  return pg_catalog.jsonb_build_object(
    'ok',true,'persisted',true,'automatic',false,
    'inserted',v_inserted,'updated',v_updated,'unchanged',v_unchanged,
    'sourceIdentityVerified',false,'automaticSyncCertified',false
  );
end;
$v46$;

REVOKE ALL ON FUNCTION public.m26_wearable_v46_import_prod_v1(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v46_import_prod_v1(uuid,jsonb) TO authenticated;
create or replace function public.m26_wearable_v46_cleanup_prod_v1()
returns trigger language plpgsql security definer set search_path = ''
as $cleanup$
declare
  v_owner uuid;
  v_client uuid;
  v_provider text;
begin
  if tg_table_schema <> 'public' then
    raise exception 'M26_V46_CLEANUP_SCOPE_INVALID';
  end if;
  if tg_table_name='m26_wearable_consents_v44' then
    if new.action<>'delete' then return new; end if;
    v_owner:=new.actor_user_id; v_client:=new.client_id; v_provider:=new.provider;
  elsif tg_table_name='m26_wearable_revocation_events_v2' then
    if new.provider<>'*' then return new; end if;
    v_owner:=new.owner_user_id; v_client:=new.client_id; v_provider:='*';
  else
    raise exception 'M26_V46_CLEANUP_SOURCE_INVALID';
  end if;
  if v_owner is null or v_client is null or v_provider not in ('*','health_connect',
    'samsung_health','apple_health','normalized_file','strava','garmin_connect','fitbit','oura') then
    raise exception 'M26_V46_CLEANUP_OWNER_INVALID';
  end if;
  if (select auth.uid()) is not null and (
    v_owner is distinct from (select auth.uid())
    or v_client is distinct from public.iberfit_client_id()
  ) then
    raise exception 'M26_V46_CLEANUP_AUTH_MISMATCH';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
  ));
  if v_provider in ('health_connect','*') then
    delete from public.m26_wearable_heart_rate_daily_v46
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_exercise_evidence_v46
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_v46_consents_prod
      where owner_user_id=v_owner and client_id=v_client;
  end if;
  return new;
end;
$cleanup$;
revoke all on function public.m26_wearable_v46_cleanup_prod_v1() from public,anon,authenticated;
create trigger m26_wearable_v46_cleanup_on_delete_consent_prod_v1
  after insert on public.m26_wearable_consents_v44 for each row
  when (new.action='delete')
  execute function public.m26_wearable_v46_cleanup_prod_v1();
create trigger m26_wearable_v46_cleanup_on_erase_all_prod_v1
  after insert on public.m26_wearable_revocation_events_v2 for each row
  when (new.provider='*')
  execute function public.m26_wearable_v46_cleanup_prod_v1();
COMMIT;
