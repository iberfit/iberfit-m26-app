-- CANDIDATE ONLY. Non-destructive rollback; refuse once multiprovider schema exists.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.m26_wearable_heart_rate_daily_v46,
  public.m26_wearable_exercise_evidence_v46,
  public.m26_wearable_daily_health_v47,
  public.m26_wearable_v46_consents_prod,
  public.m26_wearable_v47_consents_prod IN SHARE ROW EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure)) <> '5f8d8f5e93d9a09bc66d2af8f1a88bad' THEN
    RAISE EXCEPTION 'M26_V50_ROLLBACK_CANDIDATE_DRIFT';
  END IF;
  -- Rollback only while all five relations still enforce the old single-provider
  -- invariant. Never delete Apple/other data to make rollback possible.
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.m26_wearable_heart_rate_daily_v46'::regclass AND c.contype='c' AND c.convalidated
      AND pg_get_constraintdef(c.oid)='CHECK ((provider = ''health_connect''::text))') THEN
    RAISE EXCEPTION 'M26_V50_ROLLBACK_MULTIPROVIDER_SCHEMA';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.m26_wearable_exercise_evidence_v46'::regclass AND c.contype='c' AND c.convalidated
      AND pg_get_constraintdef(c.oid)='CHECK ((provider = ''health_connect''::text))') THEN
    RAISE EXCEPTION 'M26_V50_ROLLBACK_MULTIPROVIDER_SCHEMA';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.m26_wearable_daily_health_v47'::regclass AND c.contype='c' AND c.convalidated
      AND pg_get_constraintdef(c.oid)='CHECK ((provider = ''health_connect''::text))') THEN
    RAISE EXCEPTION 'M26_V50_ROLLBACK_MULTIPROVIDER_SCHEMA';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.m26_wearable_v46_consents_prod'::regclass AND c.contype='c' AND c.convalidated
      AND pg_get_constraintdef(c.oid)='CHECK ((provider = ''health_connect''::text))') THEN
    RAISE EXCEPTION 'M26_V50_ROLLBACK_MULTIPROVIDER_SCHEMA';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.m26_wearable_v47_consents_prod'::regclass AND c.contype='c' AND c.convalidated
      AND pg_get_constraintdef(c.oid)='CHECK ((provider = ''health_connect''::text))') THEN
    RAISE EXCEPTION 'M26_V50_ROLLBACK_MULTIPROVIDER_SCHEMA';
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
DO $restore$
DECLARE
  definition text:=$original$CREATE OR REPLACE FUNCTION public.m26_wearable_v46_cleanup_prod_v1()
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
  if v_provider in ('health_connect','*') then
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
  end if;
  return new;
end;
$function$$original$;
  body_start integer;
BEGIN
  body_start:=strpos(definition,'AS $function$')+length('AS $function$');
  -- pg_get_functiondef original body used CRLF; header used LF.
  EXECUTE left(definition,body_start-1)||replace(substr(definition,body_start),chr(10),chr(13)||chr(10));
  IF md5(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure)) <> '28bb4b1e77b2d64e2c579e2eeb50eb23' THEN
    RAISE EXCEPTION 'M26_V50_ROLLBACK_BASELINE_DRIFT';
  END IF;
END $restore$;
COMMIT;
