-- Read-only scope verification for canonical existing migration.
-- Expected behavior is scoped in QA and, after protected release, PROD.
-- Uses real current profile internally; does not return UUIDs or create sessions.
BEGIN READ ONLY;
DO $probe$
DECLARE a record; v_own integer; v_other integer; v_disclosed integer; v_expected integer; v_actual integer;
BEGIN
  SELECT p.user_id,p.client_id INTO a FROM public.user_profiles p
  WHERE lower(p.role::text)='client' AND p.client_id IS NOT NULL LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLIENT_PROFILE_MISSING'; END IF;
  PERFORM set_config('request.jwt.claim.sub',a.user_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a.user_id,'role','authenticated')::text,true);
  IF public.iberfit_client_id() IS DISTINCT FROM a.client_id OR public.iberfit_current_role_v26() IS DISTINCT FROM 'cliente' THEN RAISE EXCEPTION 'ROLE_SCOPE_MISMATCH'; END IF;
  SELECT count(*) FILTER(WHERE c.client_id=a.client_id),
    count(*) FILTER(WHERE c.client_id<>a.client_id AND NOT coalesce(public.iberfit_can_access_client_v26(c.client_id),false)),
    count(*) FILTER(WHERE c.client_id<>a.client_id AND NOT coalesce(public.iberfit_can_access_client_v26(c.client_id),false) AND public.iberfit_canary_enabled_v26(c.client_id)),
    count(*) FILTER(WHERE c.client_id=a.client_id AND coalesce(public.iberfit_can_access_client_v26(c.client_id),false)),
    count(*) FILTER(WHERE c.client_id=a.client_id AND public.iberfit_canary_enabled_v26(c.client_id))
  INTO v_own,v_other,v_disclosed,v_expected,v_actual FROM public.m26_canary_clients_v26 c WHERE c.active;
  IF v_own<1 OR v_other<1 OR v_actual<>v_expected THEN RAISE EXCEPTION 'FIXTURE_OR_OWN_ACCESS_INVALID'; END IF;
  IF v_disclosed<>0 THEN RAISE EXCEPTION 'CANARY_SCOPE_DISCLOSURE'; END IF;
  IF has_function_privilege('anon','public.iberfit_canary_enabled_v26(uuid)','EXECUTE') OR NOT has_function_privilege('authenticated','public.iberfit_canary_enabled_v26(uuid)','EXECUTE') THEN RAISE EXCEPTION 'CANARY_ACL_INVALID'; END IF;
END $probe$;
ROLLBACK;
