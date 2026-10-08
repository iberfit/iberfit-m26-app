-- Connected 360 · explicit generation-bound file reconnection.
-- Only QA until verified with authenticated accounts, E2E and rollout review.
-- IBERFIT-TABLE-ACCESS: public.m26_wearable_revocation_events_v2 :: append-only authenticated own client; no UPDATE/DELETE.
-- IBERFIT-POLICY: public.m26_wearable_revocation_events_v2 = rls-client
-- IBERFIT-TABLE-ACCESS: public.m26_wearable_authorization_v2 :: authenticated SELECT own only; writes through strict RPC.
-- IBERFIT-POLICY: public.m26_wearable_authorization_v2 = rls-client
begin;

create table if not exists public.m26_wearable_revocation_events_v2 (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null,
  client_id uuid not null,
  provider text not null check(provider in
    ('*','normalized_file','health_connect','samsung_health','apple_health',
     'strava','garmin_connect','fitbit','oura')),
  revoked_at timestamptz not null default now()
);
create index if not exists m26_wearable_revocation_events_scope_v2
  on public.m26_wearable_revocation_events_v2(owner_user_id,client_id,provider,id desc);
alter table public.m26_wearable_revocation_events_v2 enable row level security;
revoke all on public.m26_wearable_revocation_events_v2 from public,anon,authenticated;
grant select,insert on public.m26_wearable_revocation_events_v2 to authenticated;
grant all on public.m26_wearable_revocation_events_v2 to service_role;
create policy m26_wearable_revocation_events_read_v2
  on public.m26_wearable_revocation_events_v2 for select to authenticated
  using (owner_user_id=(select auth.uid()) and client_id=public.iberfit_client_id());
create policy m26_wearable_revocation_events_insert_v2
  on public.m26_wearable_revocation_events_v2 for insert to authenticated
  with check (owner_user_id=(select auth.uid()) and client_id=public.iberfit_client_id());

create table if not exists public.m26_wearable_authorization_v2(
  owner_user_id uuid not null,
  client_id uuid not null,
  provider text not null check(provider='normalized_file'),
  grant_id uuid not null default gen_random_uuid(),
  revocation_cursor bigint not null default 0 check(revocation_cursor>=0),
  scopes text[] not null,
  granted_at timestamptz not null default now(),
  constraint m26_wearable_authorization_v2_pk primary key (owner_user_id,client_id,provider)
);
alter table public.m26_wearable_authorization_v2 enable row level security;
revoke all on public.m26_wearable_authorization_v2 from public,anon,authenticated;
grant select on public.m26_wearable_authorization_v2 to authenticated;
grant all on public.m26_wearable_authorization_v2 to service_role;
create policy m26_wearable_authorization_read_v2
  on public.m26_wearable_authorization_v2 for select to authenticated
  using (owner_user_id=(select auth.uid()) and client_id=public.iberfit_client_id());

-- Keep an epoch for revocations predating this migration, including delete-all.
insert into public.m26_wearable_revocation_events_v2(owner_user_id,client_id,provider,revoked_at)
select f.owner_user_id,f.client_id,f.provider,f.revoked_at
from public.m26_wearable_revocation_fence_v1 f
where not exists(
  select 1 from public.m26_wearable_revocation_events_v2 e
  where e.owner_user_id=f.owner_user_id and e.client_id=f.client_id
    and e.provider=f.provider
);

-- RC44 logs revocation in m26_wearable_consents_v44; no write path may
-- create a new authorization directly on a legacy connection upsert.
create or replace function public.m26_wearable_revocation_event_from_consent_v2()
returns trigger language plpgsql security invoker set search_path=''
as $fn$
begin
  if new.action in ('revoke','delete') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'iberfit:wfence:v1:'||new.actor_user_id::text||':'||new.client_id::text,0::bigint));
    insert into public.m26_wearable_revocation_events_v2(owner_user_id,client_id,provider)
      values(new.actor_user_id,new.client_id,new.provider);
  end if;
  return new;
end;
$fn$;
revoke all on function public.m26_wearable_revocation_event_from_consent_v2()
  from public,anon,authenticated;
create trigger m26_wearable_z_revocation_event_v2
  after insert on public.m26_wearable_consents_v44
  for each row execute function public.m26_wearable_revocation_event_from_consent_v2();

-- Preserve v44 write format, but its revoked path can only be crossed inside
-- a v2 import transaction carrying the exact current grant UUID.
create or replace function public.m26_wearable_fence_write_gate_v1()
returns trigger
language plpgsql security invoker set search_path=''
as $fn$
declare
  v_owner uuid;
  v_client uuid;
  v_source text;
  v_actor uuid:=(select auth.uid());
  v_blocked boolean;
  v_log_revocation boolean:=false;
  v_check_write boolean:=false;
  v_grant_id text;
  v_current boolean:=false;
begin
  if tg_table_name='m26_wearable_connections_v44' then
    v_owner:=new.owner_user_id;
    v_client:=new.client_id;
    v_source:=new.provider;
    v_log_revocation:=new.status='revoked';
    v_check_write:=new.status='active';
  elsif tg_table_name='m26_wearable_daily_summaries_v44' then
    v_owner:=new.imported_by;
    v_client:=new.client_id;
    v_source:=new.provider;
    v_check_write:=true;
  elsif tg_table_name='m26_wearable_consents_v44' then
    v_owner:=new.actor_user_id;
    v_client:=new.client_id;
    v_source:=new.provider;
    v_log_revocation:=new.action in ('revoke','delete');
  else
    raise exception using message='M26_CONNECTED360_FENCE_TABLE_INVALID',errcode='42501';
  end if;
  if v_owner is null or v_client is null or v_source is null then
    raise exception using message='M26_CONNECTED360_FENCE_SCOPE_REQUIRED',errcode='42501';
  end if;
  if (v_actor is distinct from v_owner
      or v_client is distinct from public.iberfit_client_id())
      and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception using message='M26_CONNECTED360_FENCE_OWNER_REQUIRED',errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
    )
  );

  if v_log_revocation then
    insert into public.m26_wearable_revocation_fence_v1(
      owner_user_id,client_id,provider
    ) values(v_owner,v_client,v_source)
    on conflict do nothing;
    return new;
  end if;

  if v_check_write then
    select exists(
      select 1 from public.m26_wearable_revocation_fence_v1 f
      where f.owner_user_id=v_owner
        and f.client_id=v_client
        and f.provider in (v_source,'*')
    ) into v_blocked;
    if v_blocked then
      v_grant_id:=pg_catalog.current_setting('iberfit.connected360.grant_id',true);
      if v_grant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
  end if;
  return new;
end;
$fn$; then
        select exists(
          select 1 from public.m26_wearable_authorization_v2 a
          where a.owner_user_id=v_owner and a.client_id=v_client
            and a.provider=v_source and a.grant_id=v_grant_id::uuid
            and a.revocation_cursor>=coalesce((
              select max(e.id) from public.m26_wearable_revocation_events_v2 e
              where e.owner_user_id=v_owner and e.client_id=v_client
                and e.provider in (v_source,'*')
            ),0)
        ) into v_current;
      end if;
      if not v_current then
        raise exception using message='M26_CONNECTED360_CONSENT_REVOKED',errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$fn$;

-- The global delete must advance the epoch on every invocation, including
-- repeated deletes with zero rows and a pre-existing global tombstone.
create or replace function public.m26_wearable_delete_all_v44()
returns jsonb
language plpgsql security invoker set search_path=''
as $fn$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer:=0;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;
  v_client_id:=public.iberfit_client_id();
  if v_client_id is null then
    raise exception 'M26_RC44_CLIENT_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'iberfit:wfence:v1:'||auth.uid()::text||':'||v_client_id::text,0::bigint
    )
  );
  -- Every delete generates a fresh epoch barrier, even when '*' already exists.
  insert into public.m26_wearable_revocation_events_v2(owner_user_id,client_id,provider)
    values(auth.uid(),v_client_id,'*');
  insert into public.m26_wearable_revocation_fence_v1(
    owner_user_id,client_id,provider
  ) values(auth.uid(),v_client_id,'*')
  on conflict do nothing;

  for v_provider in
    select distinct provider from (
      select provider from public.m26_wearable_connections_v44
      where client_id=v_client_id
      union
      select provider from public.m26_wearable_daily_summaries_v44
      where client_id=v_client_id
    ) providers
  loop
    insert into public.m26_wearable_consents_v44(
      actor_user_id,client_id,provider,action,scopes,policy_version
    ) values(auth.uid(),v_client_id,v_provider,'delete','{}'::text[],'v44-zero-cost');
  end loop;
  delete from public.m26_wearable_daily_summaries_v44
  where client_id=v_client_id;
  get diagnostics v_deleted=row_count;
  delete from public.m26_wearable_connections_v44
  where owner_user_id=auth.uid() and client_id=v_client_id;
  return jsonb_build_object('ok',true,'deleted',true,'recordsDeleted',v_deleted,'clientId',v_client_id);
end;
$fn$;

create or replace function public.m26_wearable_authorization_status_v2(p_provider text)
returns jsonb
language plpgsql stable security invoker set search_path=''
as $fn$
declare
  v_owner uuid:=(select auth.uid());
  v_client uuid:=public.iberfit_client_id();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_cursor bigint:=0;
  v_grant uuid;
  v_grant_cursor bigint;
  v_scopes text[];
begin
  if v_owner is null or v_client is null or v_provider<>'normalized_file' then
    raise exception using message='M26_CONNECTED360_CLIENT_FILE_REQUIRED',errcode='42501';
  end if;
  select coalesce(max(e.id),0) into v_cursor
  from public.m26_wearable_revocation_events_v2 e
  where e.owner_user_id=v_owner and e.client_id=v_client
    and e.provider in(v_provider,'*');
  select a.grant_id,a.revocation_cursor,a.scopes
  into v_grant,v_grant_cursor,v_scopes
  from public.m26_wearable_authorization_v2 a
  where a.owner_user_id=v_owner and a.client_id=v_client and a.provider=v_provider;
  return jsonb_build_object(
    'provider',v_provider,'revocationCursor',v_cursor,
    'grantId',v_grant,'authorized',v_grant is not null and v_grant_cursor>=v_cursor,
    'scopes',case when v_grant is not null and v_grant_cursor>=v_cursor
      then to_jsonb(v_scopes) else '[]'::jsonb end);
end;
$fn$;
revoke all on function public.m26_wearable_authorization_status_v2(text)
  from public,anon;
grant execute on function public.m26_wearable_authorization_status_v2(text) to authenticated;

-- Only explicit user action calls this RPC; no retry/flush/bridge may call it.
-- CAS on latest revocation event invalidates requests drafted before a revoke.
create or replace function public.m26_wearable_reauthorize_v2(
  p_provider text,p_expected_cursor bigint,p_expected_grant uuid,p_scopes text[]
) returns jsonb
language plpgsql security definer set search_path=''
as $fn$
declare
  v_owner uuid:=(select auth.uid());
  v_client uuid:=public.iberfit_client_id();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_cursor bigint;
  v_old_grant uuid;
  v_old_cursor bigint;
  v_new_grant uuid:=gen_random_uuid();
  v_scopes text[];
  v_all_scopes constant text[]:=array[
    'steps','activeMinutes','sleepMinutes','restingHeartRate','hrvMs',
    'activeEnergyKcal','workoutMinutes'
  ];
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_owner is null or v_client is null or v_provider<>'normalized_file'
    or p_expected_cursor is null or p_expected_cursor<0 or p_expected_cursor>9223372036854775000
    or p_scopes is null or pg_catalog.cardinality(p_scopes)<1
    or pg_catalog.cardinality(p_scopes)>7
    or exists(select 1 from pg_catalog.unnest(p_scopes) value
              where value is null or value<>all(v_all_scopes))
  then
    raise exception using message='M26_CONNECTED360_REAUTHORIZE_INVALID',errcode='42501';
  end if;
  select array_agg(distinct value order by value) into v_scopes from pg_catalog.unnest(p_scopes) value;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint));
  select coalesce(max(e.id),0) into v_cursor
    from public.m26_wearable_revocation_events_v2 e
    where e.owner_user_id=v_owner and e.client_id=v_client
      and e.provider in(v_provider,'*');
  select a.grant_id,a.revocation_cursor into v_old_grant,v_old_cursor
    from public.m26_wearable_authorization_v2 a
    where a.owner_user_id=v_owner and a.client_id=v_client
      and a.provider=v_provider for update;
  if v_cursor<>p_expected_cursor
    or v_old_grant is distinct from p_expected_grant then
    raise exception using message='M26_CONNECTED360_CONSENT_VERSION_CONFLICT',errcode='40001';
  end if;
  if v_old_grant is not null and v_old_cursor>=v_cursor then
    raise exception using message='M26_CONNECTED360_ALREADY_AUTHORIZED',errcode='23505';
  end if;
  insert into public.m26_wearable_authorization_v2(
    owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes
  ) values(v_owner,v_client,v_provider,v_new_grant,v_cursor,v_scopes)
  on conflict(owner_user_id,client_id,provider) do update set
    grant_id=excluded.grant_id,revocation_cursor=excluded.revocation_cursor,
    scopes=excluded.scopes,granted_at=pg_catalog.now();
  insert into public.m26_wearable_consents_v44(
    actor_user_id,client_id,provider,action,scopes,policy_version
  ) values(v_owner,v_client,v_provider,'grant',v_scopes,'connected360-v2');
  return jsonb_build_object('ok',true,'provider',v_provider,'grantId',v_new_grant,
    'revocationCursor',v_cursor,'scopes',to_jsonb(v_scopes));
end;
$fn$;
revoke all on function public.m26_wearable_reauthorize_v2(text,bigint,uuid,text[])
  from public,anon;
grant execute on function public.m26_wearable_reauthorize_v2(text,bigint,uuid,text[])
  to authenticated;

create or replace function public.m26_wearable_import_authorized_v2(
  p_grant_id uuid,p_payload jsonb
) returns jsonb
language plpgsql security invoker set search_path=''
as $fn$
declare
  v_owner uuid:=(select auth.uid());
  v_client uuid:=public.iberfit_client_id();
  v_grant public.m26_wearable_authorization_v2%rowtype;
  v_cursor bigint;
  v_rows jsonb;
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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint));
  select * into v_grant from public.m26_wearable_authorization_v2 a
    where a.owner_user_id=v_owner and a.client_id=v_client
      and a.provider='normalized_file' and a.grant_id=p_grant_id;
  if not found then
    raise exception using message='M26_CONNECTED360_GRANT_STALE',errcode='42501';
  end if;
  select coalesce(max(e.id),0) into v_cursor
    from public.m26_wearable_revocation_events_v2 e
    where e.owner_user_id=v_owner and e.client_id=v_client
      and e.provider in('normalized_file','*');
  if v_cursor>v_grant.revocation_cursor then
    raise exception using message='M26_CONNECTED360_GRANT_REVOKED',errcode='42501';
  end if;
  for v_row in select value from jsonb_array_elements(v_rows) loop
    if jsonb_typeof(v_row)<>'object' or v_row->>'clientId'<>v_client::text
      or v_row->>'provider'<>'normalized_file'
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
    'clientId',v_client,'provider','normalized_file','status','active',
    'syncEnabled',true,'scopes',to_jsonb(v_grant.scopes),'lastSyncedAt',pg_catalog.now(),
    'metadata',jsonb_build_object('mode','confirmed_import','consentGeneration',p_grant_id)
  ));
  return jsonb_build_object('ok',true,'accepted',v_import->'accepted',
    'stale',v_import->'stale','rejected',0,'grantId',p_grant_id,
    'connection',v_link->'status');
end;
$fn$;
revoke all on function public.m26_wearable_import_authorized_v2(uuid,jsonb)
  from public,anon;
grant execute on function public.m26_wearable_import_authorized_v2(uuid,jsonb)
  to authenticated;
commit;
