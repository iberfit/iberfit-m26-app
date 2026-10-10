-- IBERFIT Connected360 v45 QA-only: authorization + honest provenance preflight.
-- No insert/update/delete, no bypass RLS, no automatic synchronization.
-- The existing v45 insert/update BLOCKING TRIGGER remains enabled.
-- IBERFIT-ACCESS: RPC authenticated Client only; no browser table privileges.
begin;

create or replace function public.m26_wearable_v45_validate_native_preview_qa_v1(
  p_grant_id uuid, p_payload jsonb
) returns jsonb
language plpgsql security invoker set search_path=''
as $fn$
declare
  v_owner uuid := (select auth.uid());
  v_client uuid := public.iberfit_client_id();
  v_granted_scopes text[];
  v_grant_cursor bigint;
  v_latest_revocation bigint;
  v_rows jsonb;
  v_row jsonb;
  v_provenance jsonb;
  v_metrics jsonb;
  v_key text;
  v_value jsonb;
  v_date date;
  v_acquired timestamptz;
  v_zone text;
  v_dates text[] := '{}'::text[];
  v_count integer;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_owner is null or v_client is null or p_grant_id is null
    or p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object'
    or pg_catalog.octet_length(p_payload::text)>24000
    or p_payload <> pg_catalog.jsonb_build_object('records', p_payload->'records')
  then
    raise exception using message='M26_CONNECTED360_V45_PREVIEW_INVALID',errcode='42501';
  end if;

  v_rows := p_payload->'records';
  if pg_catalog.jsonb_typeof(v_rows)<>'array'
    or pg_catalog.jsonb_array_length(v_rows) not between 1 and 7
  then
    raise exception using message='M26_CONNECTED360_V45_BATCH_INVALID',errcode='42501';
  end if;
  v_count := pg_catalog.jsonb_array_length(v_rows);

  -- RLS on authorization_sources_v3 and revocation_events_v2 remains
  -- authoritative: this SECURITY INVOKER function cannot read other clients.
  select a.scopes,a.revocation_cursor
    into v_granted_scopes,v_grant_cursor
    from public.m26_wearable_authorization_sources_v3 a
    where a.owner_user_id=v_owner and a.client_id=v_client
      and a.provider='health_connect' and a.grant_id=p_grant_id;
  if not found or pg_catalog.coalesce(pg_catalog.array_length(v_granted_scopes,1),0)=0 then
    raise exception using message='M26_CONNECTED360_V45_GRANT_STALE',errcode='42501';
  end if;
  select pg_catalog.coalesce(pg_catalog.max(e.id),0)
    into v_latest_revocation
    from public.m26_wearable_revocation_events_v2 e
    where e.owner_user_id=v_owner and e.client_id=v_client
      and e.provider in ('health_connect','*');
  if v_latest_revocation>v_grant_cursor then
    raise exception using message='M26_CONNECTED360_V45_GRANT_REVOKED',errcode='42501';
  end if;

  for v_row in select value from pg_catalog.jsonb_array_elements(v_rows) loop
    if pg_catalog.jsonb_typeof(v_row)<>'object'
      or v_row->>'clientId' is distinct from v_client::text
      or v_row->>'provider' is distinct from 'health_connect'
      or v_row->>'quality' is distinct from 'limitada'
      or v_row->'sourceRecordCount' is distinct from '1'::jsonb
      or pg_catalog.jsonb_typeof(v_row->'metrics')<>'object'
      or pg_catalog.jsonb_typeof(v_row->'provenance')<>'object'
    then
      raise exception using message='M26_CONNECTED360_V45_RECORD_INVALID',errcode='42501';
    end if;
    for v_key in select * from pg_catalog.jsonb_object_keys(v_row) loop
      if v_key not in ('clientId','provider','date','quality','sourceRecordCount','metrics','provenance') then
        raise exception using message='M26_CONNECTED360_V45_EXTRA_FIELD',errcode='42501';
      end if;
    end loop;

    if v_row->>'date' is null or v_row->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}
      raise exception using message='M26_CONNECTED360_V45_DATE_INVALID',errcode='42501';
    end if;
    begin
      v_date := (v_row->>'date')::date;
    exception when others then
      raise exception using message='M26_CONNECTED360_V45_DATE_INVALID',errcode='42501';
    end;
    if v_date < (pg_catalog.now() at time zone 'UTC')::date - 30
      or v_date > (pg_catalog.now() at time zone 'UTC')::date + 1
      or v_row->>'date' = any(v_dates)
    then
      raise exception using message='M26_CONNECTED360_V45_DATE_INVALID',errcode='42501';
    end if;
    v_dates := pg_catalog.array_append(v_dates,v_row->>'date');

    v_provenance := v_row->'provenance';
    if v_provenance->>'schema' is distinct from 'iberfit.connected360.qa.provenance.v45.preview'
      or v_provenance->>'aggregation' is distinct from 'daily'
      or v_provenance->'measuredAt' is distinct from 'null'::jsonb
      or v_provenance->'sourceUpdatedAt' is distinct from 'null'::jsonb
      or v_provenance->'sourceIdentity' is distinct from 'null'::jsonb
      or v_provenance->'timeZone' is distinct from 'null'::jsonb
      or v_provenance->'sourceTimestampVerified' is distinct from 'false'::jsonb
      or v_provenance->'automaticSyncCertified' is distinct from 'false'::jsonb
    then
      raise exception using message='M26_CONNECTED360_V45_PROVENANCE_UNVERIFIED',errcode='42501';
    end if;
    for v_key in select * from pg_catalog.jsonb_object_keys(v_provenance) loop
      if v_key not in ('schema','aggregation','acquiredAt','measuredAt','sourceUpdatedAt',
        'sourceIdentity','timeZone','aggregationTimeZone','sourceTimestampVerified',
        'automaticSyncCertified') then
        raise exception using message='M26_CONNECTED360_V45_PROVENANCE_FIELD',errcode='42501';
      end if;
    end loop;
    v_zone := v_provenance->>'aggregationTimeZone';
    if v_zone is not null and (
      pg_catalog.length(v_zone) not between 1 and 80
      or v_zone !~ '^[A-Za-z0-9_.:+-]+(/[A-Za-z0-9_.:+-]+)*$'
    ) then
      raise exception using message='M26_CONNECTED360_V45_ZONE_INVALID',errcode='42501';
    end if;
    if v_provenance->>'acquiredAt' is null or v_provenance->>'acquiredAt' !~ 
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$'
    then
      raise exception using message='M26_CONNECTED360_V45_ACQUISITION_INVALID',errcode='42501';
    end if;
    begin
      v_acquired := (v_provenance->>'acquiredAt')::timestamptz;
    exception when others then
      raise exception using message='M26_CONNECTED360_V45_ACQUISITION_INVALID',errcode='42501';
    end;
    if v_acquired < pg_catalog.now()-interval '20 minutes'
      or v_acquired > pg_catalog.now()+interval '5 minutes'
    then
      raise exception using message='M26_CONNECTED360_V45_ACQUISITION_STALE',errcode='42501';
    end if;

    v_metrics := v_row->'metrics';
    if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_metrics)) not between 1 and 3 then
      raise exception using message='M26_CONNECTED360_V45_METRICS_INVALID',errcode='42501';
    end if;
    for v_key,v_value in
      select key,value from pg_catalog.jsonb_each(v_metrics)
    loop
      if v_key not in ('steps','sleepMinutes','restingHeartRate')
        or not (v_key=any(v_granted_scopes))
        or pg_catalog.jsonb_typeof(v_value)<>'number'
        or (v_value #>> '{}') !~ '^[0-9]{1,6}$'
        or (v_key='steps' and (v_value #>> '{}')::integer>200000)
        or (v_key='sleepMinutes' and (v_value #>> '{}')::integer>1440)
        or (v_key='restingHeartRate' and (v_value #>> '{}')::integer not between 25 and 240)
      then
        raise exception using message='M26_CONNECTED360_V45_METRIC_SCOPE_INVALID',errcode='42501';
      end if;
    end loop;
  end loop;
  -- Preview ONLY. This approval is not a persistence authorization:
  -- revoke/erase must be checked again inside any future writer's shared lock.
  return pg_catalog.jsonb_build_object(
    'ok',true,'validated',v_count,'persisted',false,
    'automatic',false,'sourceTimeVerified',false,
    'sourceIdentityVerified',false,'provider','health_connect'
  );
end;
$fn$;

revoke all on function public.m26_wearable_v45_validate_native_preview_qa_v1(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.m26_wearable_v45_validate_native_preview_qa_v1(uuid,jsonb)
  to authenticated;
comment on function public.m26_wearable_v45_validate_native_preview_qa_v1(uuid,jsonb) is
  'QA only: Client/RLS/grant/cursor/scopes/provenance validation with NO persistence. Does not unblock v45 write trigger, nor certify source or background sync.';
commit;
