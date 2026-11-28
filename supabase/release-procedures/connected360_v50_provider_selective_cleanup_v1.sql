-- CANDIDATE ONLY. Not a migration; do not install before certified release.
-- No data or constraint changes; same trigger OID/ACL and owner/client fence.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure)) <> '28bb4b1e77b2d64e2c579e2eeb50eb23' THEN
    RAISE EXCEPTION 'M26_V50_CLEANUP_BASELINE_DRIFT';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.m26_wearable_consents_v44'::regclass
    AND t.tgname='m26_wearable_v46_cleanup_on_delete_consent_prod_v1'
    AND t.tgfoid='public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure AND t.tgenabled IN ('O','A'))
    OR NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.m26_wearable_revocation_events_v2'::regclass
    AND t.tgname='m26_wearable_v46_cleanup_on_erase_all_prod_v1'
    AND t.tgfoid='public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure AND t.tgenabled IN ('O','A')) THEN
    RAISE EXCEPTION 'M26_V50_CLEANUP_TRIGGER_DRIFT';
  END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.m26_wearable_v46_cleanup_prod_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Keep exact provider deletion separate from an explicit all-source purge.
  -- All branches run behind the existing owner/client advisory fence.
  if v_provider='*' then
    delete from public.m26_wearable_heart_rate_daily_v46
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_exercise_evidence_v46
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_daily_health_v47
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_v46_consents_prod
      where owner_user_id=v_owner and client_id=v_client;
    delete from public.m26_wearable_v47_consents_prod
      where owner_user_id=v_owner and client_id=v_client;
  else
    delete from public.m26_wearable_heart_rate_daily_v46
      where owner_user_id=v_owner and client_id=v_client and provider=v_provider;
    delete from public.m26_wearable_exercise_evidence_v46
      where owner_user_id=v_owner and client_id=v_client and provider=v_provider;
    delete from public.m26_wearable_daily_health_v47
      where owner_user_id=v_owner and client_id=v_client and provider=v_provider;
    delete from public.m26_wearable_v46_consents_prod
      where owner_user_id=v_owner and client_id=v_client and provider=v_provider;
    delete from public.m26_wearable_v47_consents_prod
      where owner_user_id=v_owner and client_id=v_client and provider=v_provider;
  end if;
  return new;
end;
$function$;
DO $verify$
BEGIN
  IF md5(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure)) <> '5f8d8f5e93d9a09bc66d2af8f1a88bad' THEN
    RAISE EXCEPTION 'M26_V50_CLEANUP_CANDIDATE_DRIFT';
  END IF;
END $verify$;
COMMIT;
