-- IBERFIT V46 QA-only metric-consent hardening. Do NOT copy into production.
-- A real workout is not permission to capture heart rate samples without
-- separate explicit generalHeartRate consent, even in the SAME exercise payload.
BEGIN;
create or replace function public.m26_wearable_v46_import_explicit_qa_v1(
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
  if v_owner is null or v_client is null or p_grant_id is null
    or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
    or pg_catalog.octet_length(p_payload::text)>48000
    or p_payload->>'schema' is distinct from 'iberfit.connected360.qa.v46.explicit.v1'
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

  perform pg_catalog.set_config('iberfit.connected360.v46_grant_qa',p_grant_id::text,true);
  perform pg_catalog.set_config('iberfit.connected360.v46_writer_qa','explicit-only-v1',true);

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
    -- Exercise-only consent must never authorize pulse data inside a workout.
    -- The native OS permission and this remote category scope are independent.
    if (v_row ?| array['heartRateSamples','avgBpm','minBpm','maxBpm'])
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
  perform pg_catalog.set_config('iberfit.connected360.v46_grant_qa','',true);
  perform pg_catalog.set_config('iberfit.connected360.v46_writer_qa','',true);
  return pg_catalog.jsonb_build_object(
    'ok',true,'persisted',true,'automatic',false,
    'inserted',v_inserted,'updated',v_updated,'unchanged',v_unchanged,
    'sourceIdentityVerified',false,'automaticSyncCertified',false
  );
end;
$v46$;
-- Function signature and EXECUTE ACL remain unchanged; all checks remain server-side.
COMMIT;
