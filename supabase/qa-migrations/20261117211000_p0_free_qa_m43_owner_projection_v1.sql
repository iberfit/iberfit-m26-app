-- IBERFIT #1209 / QA-only / M43 owner bootstrap transport reduction.
-- Never promote to PROD. Preserve exact authenticated bootstrap as authority.
-- This callable projects only one synthetic owner entity, not any private body.
DO $guard$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR to_regprocedure('public.iberfit_qa_m43_owner_projection_v1(text,uuid)') IS NOT NULL
    OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure))
       IS DISTINCT FROM '9c83765e0a36b0144fde2dca4a0cdcba'
    OR md5(pg_get_functiondef('public.iberfit_qa_m43_bootstrap_visibility_v1(text,uuid)'::regprocedure))
       IS DISTINCT FROM 'bf35d39f67f690d13079c6ef59843617'
    OR has_function_privilege('anon','public.iberfit_bootstrap_v26()','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.iberfit_bootstrap_v26()','EXECUTE')
 THEN RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_DRIFT_OR_PROD'
      USING ERRCODE='42501';
 END IF;
END
$guard$;

CREATE FUNCTION public.iberfit_qa_m43_owner_projection_v1(
  p_entity_type text, p_entity_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO ''
AS $projection$
DECLARE
 v_env jsonb;
 v_snapshot jsonb;
 v_client_id uuid;
 v_candidates jsonb;
 v_record jsonb;
 v_canonical jsonb := NULL;
 v_legacy_count integer := 0;
 v_kind text;
BEGIN
 v_env := public.iberfit_environment();
 IF v_env->>'environment' IS DISTINCT FROM 'QA'
    OR v_env->>'realDataAllowed' IS DISTINCT FROM 'false'
    OR v_env->>'productionBlocked' IS DISTINCT FROM 'true'
    OR auth.uid() IS NULL
    OR lower(coalesce(auth.jwt()->>'email','')) NOT IN
      ('qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl')
    OR public.iberfit_current_role_v26() NOT IN ('client','cliente')
 THEN RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_CLIENT_ONLY'
   USING ERRCODE='42501';
 END IF;
 v_client_id := public.iberfit_client_id();
 IF v_client_id IS NULL OR p_entity_id IS NULL
    OR p_entity_type IS NULL OR p_entity_type NOT IN ('planning','session')
 THEN RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_BAD_ACTOR_OR_ARGUMENTS'
   USING ERRCODE='22023';
 END IF;
 -- Execute the same authenticated, security-filtered bootstrap as the E2E.
 -- Never replace it with an unguarded table read or a fabricated fixture.
 v_snapshot := public.iberfit_bootstrap_v26();
 v_kind := CASE WHEN p_entity_type='planning' THEN 'trainingCycles' ELSE 'sessions' END;
 IF jsonb_typeof(v_snapshot#>'{data,m26Entities}') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_snapshot#>ARRAY['data',v_kind]) IS DISTINCT FROM 'array'
    OR lower(coalesce(v_snapshot#>>'{user,role}','')) NOT IN ('client','cliente')
    OR v_snapshot#>>'{user,clientId}' IS DISTINCT FROM v_client_id::text
    OR v_snapshot#>>'{canary,active}' IS DISTINCT FROM 'true'
    OR v_snapshot#>>'{canary,scope}' IS DISTINCT FROM 'allowlist'
 THEN RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_BAD_BOOTSTRAP'
   USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(item),'[]'::jsonb) INTO v_candidates
 FROM jsonb_array_elements(v_snapshot#>'{data,m26Entities}') item
 WHERE item->>'entityType'=p_entity_type
   AND item->>'entityId'=p_entity_id::text;
 IF jsonb_array_length(v_candidates)>1 THEN
   RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_DUPLICATE_CANONICAL'
     USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(v_candidates)=1 THEN
   v_record := v_candidates->0;
   IF v_record->>'clientId' IS DISTINCT FROM v_client_id::text
   THEN RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_FOREIGN_SCOPE'
     USING ERRCODE='42501'; END IF;
   IF p_entity_type='session' THEN
     IF v_record->>'entityType' IS DISTINCT FROM 'session'
        OR v_record->>'entityId' IS DISTINCT FROM p_entity_id::text
        OR jsonb_typeof(v_record->'status') IS DISTINCT FROM 'string'
        OR nullif(btrim(v_record->>'status'),'') IS NULL
        OR jsonb_typeof(v_record->'revision') IS DISTINCT FROM 'number'
        OR (v_record->>'revision') !~ '^[0-9]+$'
     THEN RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_CANONICAL_MALFORMED'
       USING ERRCODE='22023'; END IF;
     v_canonical := jsonb_build_object(
       'entityType',v_record->'entityType',
       'entityId',v_record->'entityId',
       'clientId',v_record->'clientId',
       'status',v_record->'status',
       'revision',v_record->'revision'
     );
   END IF;
 END IF;
 SELECT count(*) INTO v_legacy_count
 FROM jsonb_array_elements(v_snapshot#>ARRAY['data',v_kind]) item
 WHERE item->>'id'=p_entity_id::text;
 IF v_legacy_count>1 THEN
   RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_DUPLICATE_LEGACY'
     USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object(
  'schema','iberfit.qa.m43.owner-projection.v1',
  'canonicalVisible',jsonb_array_length(v_candidates)=1,
  'legacyVisible',v_legacy_count=1,
  'canonical',v_canonical
 );
END
$projection$;

REVOKE ALL ON FUNCTION public.iberfit_qa_m43_owner_projection_v1(text,uuid)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iberfit_qa_m43_owner_projection_v1(text,uuid)
 TO authenticated;

DO $readback$
DECLARE v_oid regprocedure:='public.iberfit_qa_m43_owner_projection_v1(text,uuid)'::regprocedure;
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM false
    OR (SELECT provolatile FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM 's'
    OR (SELECT proconfig FROM pg_proc WHERE oid=v_oid)
       IS DISTINCT FROM ARRAY['search_path=""']::text[]
    OR has_function_privilege('anon',v_oid,'EXECUTE')
    OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
 THEN RAISE EXCEPTION 'P0_QA_M43_OWNER_PROJECTION_READBACK'
      USING ERRCODE='42501';
 END IF;
END
$readback$;
