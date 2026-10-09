-- Connected 360 QA-only: transactional revoke+erase and fail-closed v45 writes.
-- Source v44 function captured from live QA and its signature preserved.
-- Do not promote to PROD or standard supabase/migrations.
begin;
CREATE OR REPLACE FUNCTION public.m26_wearable_revoke_v44(p_provider text, p_delete_data boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
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

  -- Take the shared fence BEFORE any connection or summary mutations.
  -- Import/revoke remain serialized on the same owner/client xact lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||auth.uid()::text||':'||v_client_id::text,0::bigint
  ));

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
$function$;


-- There is intentionally NO v45 INSERT/UPDATE path: even service_role
-- must not begin ingestion before the native identity, consent and
-- revocation design is separately verified.
create or replace function public.m26_wearable_v45_block_unverified_write_qa_v1()
returns trigger
language plpgsql security invoker set search_path=''
as $fn$
begin
  raise exception using message='M26_CONNECTED360_V45_INGEST_UNCERTIFIED',errcode='42501';
end;
$fn$;
revoke all on function public.m26_wearable_v45_block_unverified_write_qa_v1()
  from public,anon,authenticated;
create trigger m26_wearable_v45_block_unverified_write_qa_v1
  before insert or update on public.m26_wearable_source_daily_v45
  for each row execute function public.m26_wearable_v45_block_unverified_write_qa_v1();

-- This internal trigger follows the existing RLS-protected consent
-- and revocation event sources. Delete is atomic with the v44 action.
-- It handles v45-only rows on wildcard erase, even if they have no
-- matching v44 connection or summary.
create or replace function public.m26_wearable_v45_cleanup_after_revoke_qa_v1()
returns trigger
language plpgsql security definer set search_path=''
as $fn$
declare
  v_owner uuid;
  v_client uuid;
  v_provider text;
begin
  if tg_table_schema<>'public' then
    raise exception using message='M26_CONNECTED360_V45_CLEANUP_SCOPE_INVALID',errcode='42501';
  end if;
  if tg_table_name='m26_wearable_consents_v44' then
    if new.action<>'delete' then return new; end if;
    v_owner:=new.actor_user_id;
    v_client:=new.client_id;
    v_provider:=new.provider;
  elsif tg_table_name='m26_wearable_revocation_events_v2' then
    if new.provider<>'*' then return new; end if;
    v_owner:=new.owner_user_id;
    v_client:=new.client_id;
    v_provider:='*';
  else
    raise exception using message='M26_CONNECTED360_V45_CLEANUP_SOURCE_INVALID',errcode='42501';
  end if;

  if v_owner is null or v_client is null
    or v_provider not in (
      '*','normalized_file','health_connect','samsung_health','apple_health',
      'strava','garmin_connect','fitbit','oura'
    ) then
    raise exception using message='M26_CONNECTED360_V45_CLEANUP_SCOPE_INVALID',errcode='42501';
  end if;
  -- For authenticated user actions, never permit a mismatch between
  -- the requested row owner/client and the actual Client session.
  if (select auth.uid()) is not null and (
    v_owner is distinct from (select auth.uid())
    or v_client is distinct from public.iberfit_client_id()
  ) then
    raise exception using message='M26_CONNECTED360_V45_CLEANUP_OWNER_INVALID',errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
  ));
  if v_provider='*' then
    delete from public.m26_wearable_source_daily_v45
      where owner_user_id=v_owner and client_id=v_client;
  else
    delete from public.m26_wearable_source_daily_v45
      where owner_user_id=v_owner and client_id=v_client and provider=v_provider;
  end if;
  return new;
end;
$fn$;
revoke all on function public.m26_wearable_v45_cleanup_after_revoke_qa_v1()
  from public,anon,authenticated;
create trigger m26_wearable_v45_cleanup_on_delete_consent_qa_v1
  after insert on public.m26_wearable_consents_v44
  for each row when (new.action='delete')
  execute function public.m26_wearable_v45_cleanup_after_revoke_qa_v1();
create trigger m26_wearable_v45_cleanup_on_global_revoke_qa_v1
  after insert on public.m26_wearable_revocation_events_v2
  for each row when (new.provider='*')
  execute function public.m26_wearable_v45_cleanup_after_revoke_qa_v1();

comment on function public.m26_wearable_v45_cleanup_after_revoke_qa_v1() is
  'QA-only, internal atomic purge of v45 on own-source consent-delete or global revocation; no public RPC.';

commit;
