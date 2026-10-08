-- Connected 360 v3: strict file generation guard for all legacy RC44 write paths.
-- QA first; idempotent function replacement, no data deletion or table changes.
-- IBERFIT-POLICY: public.m26_wearable_connections_v44 = rls-client
-- IBERFIT-POLICY: public.m26_wearable_daily_summaries_v44 = rls-client
begin;
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
    -- From the first file write, require an active explicit authorization,
    -- including before any tombstone exists. Legacy RC44 stays for other sources.
    if v_source='normalized_file' or v_blocked then
      v_grant_id:=pg_catalog.current_setting('iberfit.connected360.grant_id',true);
      if v_grant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
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
        if v_blocked then
          raise exception using message='M26_CONNECTED360_CONSENT_REVOKED',errcode='42501';
        end if;
        raise exception using message='M26_CONNECTED360_FILE_CONSENT_REQUIRED',errcode='42501';
      end if;
    end if;
  end if;
  return new;
end;
$fn$;

commit;
