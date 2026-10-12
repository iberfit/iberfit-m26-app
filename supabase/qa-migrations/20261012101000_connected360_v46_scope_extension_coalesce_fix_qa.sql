-- QA ONLY: forward-only correction of installed V46 scope extension.
-- DO NOT run in production. Does not create any sync job nor alter V44 records.
-- This safely extends a LIVE existing grant without revoking an owner's other
-- scopes or invalidating approved historical data. The grant UUID is preserved.
BEGIN;
CREATE OR REPLACE FUNCTION public.m26_wearable_v46_extend_scopes_explicit_qa_v1(
  p_expected_grant uuid,
  p_expected_cursor bigint,
  p_scopes text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $qa_v46_extend$
DECLARE
  v_owner uuid := (select auth.uid());
  v_client uuid := public.iberfit_client_id();
  v_cursor bigint;
  v_grant public.m26_wearable_authorization_sources_v3%rowtype;
  v_union text[];
  v_requested text[];
BEGIN
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF v_owner IS NULL OR v_client IS NULL
    OR p_expected_grant IS NULL OR p_expected_cursor IS NULL
    OR p_expected_cursor < 0 OR p_scopes IS NULL
    OR pg_catalog.cardinality(p_scopes) < 1
    OR pg_catalog.cardinality(p_scopes) > 2
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_scopes) x
        WHERE x IS NULL OR x <> ALL(ARRAY['generalHeartRate','exerciseSessions']::text[]))
  THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_QA_SCOPE_EXTENSION_INVALID',ERRCODE='42501';
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT item ORDER BY item)
    INTO v_requested FROM pg_catalog.unnest(p_scopes) item;
  IF pg_catalog.cardinality(v_requested) <> pg_catalog.cardinality(p_scopes) THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_QA_SCOPE_DUPLICATE',ERRCODE='42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
  ));
  SELECT coalesce(pg_catalog.max(e.id),0) INTO v_cursor
  FROM public.m26_wearable_revocation_events_v2 e
  WHERE e.owner_user_id=v_owner AND e.client_id=v_client
    AND e.provider IN ('health_connect','*');
  SELECT a.* INTO v_grant
  FROM public.m26_wearable_authorization_sources_v3 a
  WHERE a.owner_user_id=v_owner AND a.client_id=v_client
    AND a.provider='health_connect'
  FOR UPDATE;
  IF v_grant.grant_id IS NULL
    OR v_grant.grant_id IS DISTINCT FROM p_expected_grant
    OR v_cursor <> p_expected_cursor
    OR v_grant.revocation_cursor < v_cursor THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_QA_SCOPE_GRANT_STALE',ERRCODE='42501';
  END IF;
  SELECT pg_catalog.array_agg(DISTINCT item ORDER BY item)
    INTO v_union FROM pg_catalog.unnest(v_grant.scopes||v_requested) item;
  IF pg_catalog.cardinality(v_union) > 9 THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_QA_SCOPE_TOO_MANY',ERRCODE='42501';
  END IF;
  IF v_requested <@ v_grant.scopes THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok',true,'provider','health_connect','grantId',v_grant.grant_id,
      'revocationCursor',v_cursor,'scopes',pg_catalog.to_jsonb(v_grant.scopes),
      'alreadyAuthorized',true
    );
  END IF;
  UPDATE public.m26_wearable_authorization_sources_v3
  SET scopes=v_union,granted_at=pg_catalog.now()
  WHERE owner_user_id=v_owner AND client_id=v_client
    AND provider='health_connect' AND grant_id=p_expected_grant;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_QA_SCOPE_GRANT_STALE',ERRCODE='42501';
  END IF;
  -- Existing consent log permits only this canonical policy version.
  INSERT INTO public.m26_wearable_consents_v44(
    actor_user_id,client_id,provider,action,scopes,policy_version
  ) VALUES(
    v_owner,v_client,'health_connect','grant',v_requested,'v44-zero-cost'
  );
  RETURN pg_catalog.jsonb_build_object(
    'ok',true,'provider','health_connect','grantId',p_expected_grant,
    'revocationCursor',v_cursor,'scopes',pg_catalog.to_jsonb(v_union),
    'alreadyAuthorized',false
  );
END;
$qa_v46_extend$;
REVOKE ALL ON FUNCTION public.m26_wearable_v46_extend_scopes_explicit_qa_v1(uuid,bigint,text[])
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v46_extend_scopes_explicit_qa_v1(uuid,bigint,text[])
  TO authenticated;
COMMIT;
