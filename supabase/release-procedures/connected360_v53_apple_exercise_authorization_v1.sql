-- CANDIDATE ONLY. Independent Apple exercise consent; no writer/activation.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.m26_wearable_v46_release_control_prod IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.m26_wearable_v46_consents_prod IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure)) <> '5f8d8f5e93d9a09bc66d2af8f1a88bad'
    OR md5(pg_get_functiondef('public.m26_wearable_v46_import_prod_v1(uuid,jsonb)'::regprocedure)) <> '15fad17ae91a010ee73c047799eff06d'
    OR to_regprocedure('private.m26_v49_live_session()') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.m26_wearable_exercise_evidence_v46'::regclass AND conname='m26_v51_apple_workout_minimal_check' AND convalidated)
    OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.m26_wearable_v46_consents_prod'::regclass AND conname='m26_wearable_v46_consents_prod_provider_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((provider = ''health_connect''::text))')
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(role_name)
        CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER']) a(action)
        CROSS JOIN unnest(ARRAY['public.m26_wearable_v46_release_control_prod','public.m26_wearable_authorization_sources_v3','public.m26_wearable_v46_consents_prod']) t(rel)
        WHERE has_table_privilege(r.role_name,t.rel,a.action))
    OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.m26_wearable_v46_consents_prod'::regclass AND relrowsecurity AND relforcerowsecurity)
    OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.m26_wearable_authorization_sources_v3'::regclass AND relrowsecurity)
  THEN RAISE EXCEPTION 'M26_V53_PREREQUISITES_REQUIRED'; END IF;
END $guard$;
ALTER TABLE public.m26_wearable_v46_release_control_prod ADD COLUMN apple_exercise_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.m26_wearable_v46_consents_prod DROP CONSTRAINT m26_wearable_v46_consents_prod_provider_check,
  ADD CONSTRAINT m26_wearable_v46_consents_prod_provider_check CHECK (
    provider='health_connect' OR (provider='apple_health' AND scopes=ARRAY['exerciseSessions']::text[]));
-- Invoker helper is private and callable only by the owning definer functions.
CREATE FUNCTION private.m26_v53_apple_client_context()
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE v_owner uuid:=auth.uid(); v_client uuid:=public.iberfit_client_id(); v_context jsonb;
BEGIN
  IF v_owner IS NULL OR v_client IS NULL OR NOT private.m26_v49_live_session()
    OR NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.user_id=v_owner AND p.client_id=v_client AND p.role::text='client')
    OR EXISTS(SELECT 1 FROM public.user_application_roles r WHERE r.user_id=v_owner AND r.active AND r.role::text IN ('coach','admin'))
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V53_CLIENT_REQUIRED'; END IF;
  v_context:=public.iberfit_application_context_v14();
  IF v_context->>'membershipStatus' IS DISTINCT FROM 'active'
  THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V53_CLIENT_REQUIRED'; END IF;
  RETURN v_client;
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v53_apple_client_context() FROM PUBLIC,anon,authenticated,service_role;

-- Internal provider generation check; not callable by API roles. The caller
-- must first establish actor/owner authorization, release-row lock and the
-- owner/client transaction fence. This avoids duplicating the source rule
-- in a later professional sharing boundary.
CREATE FUNCTION private.m26_v53_apple_exercise_source_state(p_owner uuid,p_client uuid,p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $f$
DECLARE
 v_cursor bigint; v_old_grant uuid; v_old_cursor bigint; v_old_scopes text[];
 v_blocked boolean; v_ledger boolean; v_reason text;
BEGIN
 IF p_owner IS NULL OR p_client IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V53_SOURCE_SCOPE_REQUIRED'; END IF;
 SELECT coalesce(max(e.id),0) INTO v_cursor FROM public.m26_wearable_revocation_events_v2 e
 WHERE e.owner_user_id=p_owner AND e.client_id=p_client AND e.provider IN ('apple_health','*');
 SELECT a.grant_id,a.revocation_cursor,a.scopes INTO v_old_grant,v_old_cursor,v_old_scopes
 FROM public.m26_wearable_authorization_sources_v3 a
 WHERE a.owner_user_id=p_owner AND a.client_id=p_client AND a.provider='apple_health';
 SELECT EXISTS(SELECT 1 FROM public.m26_wearable_connections_v44 c
 WHERE c.owner_user_id=p_owner AND c.client_id=p_client AND c.provider='apple_health'
 AND (c.status IN ('paused','revoked','disconnected') OR c.sync_enabled=false)) INTO v_blocked;
 SELECT EXISTS(SELECT 1 FROM public.m26_wearable_v46_consents_prod l
 WHERE l.owner_user_id=p_owner AND l.client_id=p_client AND l.provider='apple_health'
 AND l.grant_id=v_old_grant AND l.revocation_cursor=v_cursor AND l.scopes=ARRAY['exerciseSessions']::text[]) INTO v_ledger;
 v_reason:= CASE WHEN NOT coalesce(p_enabled,false) THEN 'release-disabled'
 WHEN coalesce(v_blocked,false) THEN 'connection-blocked'
 WHEN v_old_grant IS NOT NULL AND v_old_scopes IS DISTINCT FROM ARRAY['exerciseSessions']::text[] THEN 'scope-conflict'
 WHEN v_old_grant IS NOT NULL AND v_old_cursor=v_cursor AND coalesce(v_ledger,false) THEN 'authorized'
 ELSE 'consent-required' END;
 RETURN jsonb_build_object('ok',true,'provider','apple_health','serverEnabled',coalesce(p_enabled,false),
 'authorized',v_reason='authorized','reason',v_reason,'grantId',v_old_grant,'revocationCursor',v_cursor,
 'scopes',CASE WHEN v_reason='authorized' THEN jsonb_build_array('exerciseSessions') ELSE '[]'::jsonb END);
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v53_apple_exercise_source_state(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

-- Passive status never renews consent; stale grant is CAS input only.
CREATE FUNCTION private.m26_v53_apple_exercise_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_owner uuid:=auth.uid(); v_client uuid:=private.m26_v53_apple_client_context(); v_enabled boolean;
BEGIN
 SELECT enabled AND apple_exercise_enabled INTO v_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id=true FOR SHARE;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint))
 THEN RAISE EXCEPTION USING ERRCODE='55P03',MESSAGE='M26_V53_RETRY'; END IF;
 IF private.m26_v53_apple_client_context() IS DISTINCT FROM v_client
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V53_CLIENT_REQUIRED'; END IF;
 RETURN private.m26_v53_apple_exercise_source_state(v_owner,v_client,v_enabled);
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v53_apple_exercise_status() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v53_apple_exercise_status() TO authenticated;
CREATE FUNCTION public.m26_wearable_v53_apple_exercise_status_v1()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v53_apple_exercise_status() $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v53_apple_exercise_status_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v53_apple_exercise_status_v1() TO authenticated;

CREATE FUNCTION private.m26_v53_authorize_apple_exercise(p_expected_grant uuid,p_expected_cursor bigint,p_confirmed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_owner uuid:=auth.uid(); v_client uuid:=private.m26_v53_apple_client_context();
 v_enabled boolean; v_cursor bigint; v_old public.m26_wearable_authorization_sources_v3%rowtype;
 v_grant uuid;
BEGIN
 IF p_confirmed IS DISTINCT FROM true OR p_expected_cursor IS NULL OR p_expected_cursor<0
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V53_EXPLICIT_CONSENT_REQUIRED'; END IF;
 SELECT enabled AND apple_exercise_enabled INTO v_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id=true FOR SHARE;
 IF v_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V53_APPLE_DISABLED'; END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint))
 THEN RAISE EXCEPTION USING ERRCODE='55P03',MESSAGE='M26_V53_RETRY'; END IF;
 IF private.m26_v53_apple_client_context() IS DISTINCT FROM v_client
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V53_CLIENT_REQUIRED'; END IF;
 SELECT coalesce(max(e.id),0) INTO v_cursor FROM public.m26_wearable_revocation_events_v2 e
  WHERE e.owner_user_id=v_owner AND e.client_id=v_client AND e.provider IN ('apple_health','*');
 SELECT * INTO v_old FROM public.m26_wearable_authorization_sources_v3 a
  WHERE a.owner_user_id=v_owner AND a.client_id=v_client AND a.provider='apple_health' FOR UPDATE;
 IF v_cursor<>p_expected_cursor OR v_old.grant_id IS DISTINCT FROM p_expected_grant
 THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='M26_V53_GRANT_STALE'; END IF;
 -- Existing unrelated scopes are never inherited into this workout-only grant.
 -- If an old source grant has other scopes, do not overwrite it.
 IF v_old.grant_id IS NOT NULL AND v_old.scopes IS DISTINCT FROM ARRAY['exerciseSessions']::text[]
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V53_EXISTING_SCOPE_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM public.m26_wearable_connections_v44 c
  WHERE c.owner_user_id=v_owner AND c.client_id=v_client AND c.provider='apple_health'
    AND (c.status IN ('paused','revoked','disconnected') OR c.sync_enabled=false))
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V53_APPLE_PAUSED'; END IF;
 IF v_old.grant_id IS NOT NULL AND v_old.revocation_cursor=v_cursor
    AND EXISTS(SELECT 1 FROM public.m26_wearable_v46_consents_prod l
       WHERE l.owner_user_id=v_owner AND l.client_id=v_client AND l.provider='apple_health'
         AND l.grant_id=v_old.grant_id AND l.revocation_cursor=v_cursor AND l.scopes=ARRAY['exerciseSessions']::text[])
 THEN
   RETURN jsonb_build_object('ok',true,'provider','apple_health','grantId',v_old.grant_id,
     'revocationCursor',v_cursor,'scopes',jsonb_build_array('exerciseSessions'),'alreadyAuthorized',true);
 END IF;
 v_grant:=gen_random_uuid();
 INSERT INTO public.m26_wearable_authorization_sources_v3(owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes)
 VALUES(v_owner,v_client,'apple_health',v_grant,v_cursor,ARRAY['exerciseSessions']::text[])
 ON CONFLICT(owner_user_id,client_id,provider) DO UPDATE SET
  grant_id=excluded.grant_id,revocation_cursor=excluded.revocation_cursor,scopes=excluded.scopes,granted_at=pg_catalog.now();
 INSERT INTO public.m26_wearable_v46_consents_prod(owner_user_id,client_id,provider,grant_id,revocation_cursor,scopes)
 VALUES(v_owner,v_client,'apple_health',v_grant,v_cursor,ARRAY['exerciseSessions']::text[]);
 RETURN jsonb_build_object('ok',true,'provider','apple_health','grantId',v_grant,
   'revocationCursor',v_cursor,'scopes',jsonb_build_array('exerciseSessions'),'alreadyAuthorized',false);
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v53_authorize_apple_exercise(uuid,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v53_authorize_apple_exercise(uuid,bigint,boolean) TO authenticated;
CREATE FUNCTION public.m26_wearable_v53_authorize_apple_exercise_v1(p_expected_grant uuid,p_expected_cursor bigint,p_confirmed boolean)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v53_authorize_apple_exercise(p_expected_grant,p_expected_cursor,p_confirmed) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v53_authorize_apple_exercise_v1(uuid,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v53_authorize_apple_exercise_v1(uuid,bigint,boolean) TO authenticated;
COMMIT;
