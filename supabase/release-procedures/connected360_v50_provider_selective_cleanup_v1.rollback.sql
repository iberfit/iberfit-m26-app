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
-- Exact inverse transformation. Restore the historical CRLF function body.
DO $restore$
DECLARE d text; relation text; deletes text:=''; prior text; target text;
  body_start integer;
BEGIN
  -- Read the exact installed definition; keep the five relation names explicit.
  d:=replace(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure),chr(13)||chr(10),chr(10));
  FOREACH relation IN ARRAY ARRAY['m26_wearable_heart_rate_daily_v46','m26_wearable_exercise_evidence_v46','m26_wearable_daily_health_v47','m26_wearable_v46_consents_prod','m26_wearable_v47_consents_prod'] LOOP
    deletes:=deletes||'    delete from public.'||relation||chr(10)||'      where owner_user_id=v_owner and client_id=v_client;'||chr(10);
  END LOOP;
  prior:=$prior$  if v_provider in ('health_connect','*') then
$prior$||deletes||'  end if;'||chr(10);
  target:=$target$  -- Keep exact provider deletion separate from an explicit all-source purge.
  -- All branches run behind the existing owner/client advisory fence.
  if v_provider='*' then
$target$||deletes||'  else'||chr(10)||replace(deletes,'client_id=v_client;','client_id=v_client and provider=v_provider;')||'  end if;'||chr(10);
  IF strpos(d,target)=0 THEN RAISE EXCEPTION 'M26_V50_ROLLBACK_CANDIDATE_DRIFT'; END IF;
  d:=replace(d,target,prior);
  body_start:=strpos(d,'AS $function$')+length('AS $function$');
  d:=left(d,body_start-1)||replace(substr(d,body_start),chr(10),chr(13)||chr(10));
  EXECUTE d;
  IF md5(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure)) <> '28bb4b1e77b2d64e2c579e2eeb50eb23' THEN
    RAISE EXCEPTION 'M26_V50_ROLLBACK_BASELINE_DRIFT';
  END IF;
END $restore$;
COMMIT;
