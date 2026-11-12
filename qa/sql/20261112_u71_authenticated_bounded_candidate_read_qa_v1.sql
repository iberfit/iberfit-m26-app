-- IBERFIT M1 / U71 - QA ONLY. This is a bounded, read-only synthetic
-- test-fixture selector. It is NOT a replacement for normal app bootstrap.
-- Install only in gjztkdwfmunnzhtvxrsu; never copy to PROD.
-- No mutations, no extended timeout, no grant on domain_entities_v26.
-- Rollback: REVOKE EXECUTE and DROP FUNCTION public.iberfit_u71_dated_candidates_qa_v1().
CREATE OR REPLACE FUNCTION public.iberfit_u71_dated_candidates_qa_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_today date := (now() AT TIME ZONE 'America/Santiago')::date;
  v_candidates jsonb;
BEGIN
  -- Authenticate and scope on the server. user_metadata and input client IDs
  -- are never authorization material, and no caller can choose another owner.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'U71_AUTH_REQUIRED' USING errcode='42501';
  END IF;
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings
      WHERE key='environment') IS DISTINCT FROM 'QA' THEN
    RAISE EXCEPTION 'U71_QA_ONLY' USING errcode='42501';
  END IF;
  IF public.iberfit_current_role_v26() <> 'cliente'
     OR NOT EXISTS (SELECT 1 FROM auth.users u
                    WHERE u.id=v_actor
                      AND lower(u.email)='qa.rc74.client-a@iberfit.cl') THEN
    RAISE EXCEPTION 'U71_FIXTURE_ROLE_FORBIDDEN' USING errcode='42501';
  END IF;
  v_owner := public.iberfit_client_id();
  IF v_owner IS NULL OR NOT public.iberfit_can_access_client_v26(v_owner) THEN
    RAISE EXCEPTION 'U71_OWNER_FORBIDDEN' USING errcode='42501';
  END IF;

  -- Minimum payload: no raw prescription, body, history, email, notes,
  -- private events, token, or other person's data ever leaves this function.
  -- Identical SOURCE eligibility to U69 candidateList; no SQL write path.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',chosen.id,
      'clientId',v_owner,
      'revision',chosen.revision,
      'duration',chosen.duration,
      'cycleId',chosen.cycle_id,
      'sets',chosen.sets
    ) ORDER BY chosen.id),'[]'::jsonb)
    INTO v_candidates
  FROM (
    SELECT s.entity_id AS id, s.revision,
      (s.body->>'durationMinutes')::numeric AS duration,
      s.body->>'cycleId' AS cycle_id,
      (s.body#>>'{blocks,0,sets}')::integer AS sets
    FROM public.domain_entities_v26 s
    JOIN public.domain_entities_v26 p
      ON p.entity_type='planning'
      AND p.client_id=v_owner
      AND p.entity_id::text=s.body->>'cycleId'
    WHERE s.entity_type='session'
      AND s.client_id=v_owner
      AND s.status='disponible'
      AND s.revision>=1
      AND s.body->>'clientId'=v_owner::text
      AND s.body->>'id'=s.entity_id::text
      AND s.body->>'deliveryModality'='guiada_en_app'
      AND s.body->>'deliveryOwnership'='guided_in_app'
      AND s.body->>'visibleToClient'='true'
      AND s.body->>'clientVisibilityLevel'='full'
      AND CASE WHEN jsonb_typeof(s.body->'blocks')='array'
         THEN jsonb_array_length(s.body->'blocks')=1 ELSE false END
      AND coalesce(s.body#>>'{blocks,0,exerciseId}','')<>''
      AND CASE WHEN coalesce(s.body#>>'{blocks,0,sets}','') ~ '^[0-9]{1,2}$'
         THEN (s.body#>>'{blocks,0,sets}')::integer BETWEEN 1 AND 15
         ELSE false END
      AND CASE WHEN coalesce(s.body->>'durationMinutes','')
           ~ '^[0-9]{1,3}([.][0-9]+)?$'
         THEN (s.body->>'durationMinutes')::numeric BETWEEN 10 AND 240
         ELSE false END
      AND p.status='publicado'
      AND p.body->>'startDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND p.body->>'endDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND p.body->>'startDate'<=v_today::text
      AND p.body->>'endDate'>=(v_today+8)::text
    ORDER BY s.entity_id
    LIMIT 50
  ) chosen;

  RETURN jsonb_build_object(
    'schema','iberfit.u71.qa.dated-candidates.v1',
    'project','QA',
    'day',v_today::text,
    'clientId',v_owner,
    'count',jsonb_array_length(v_candidates),
    'candidates',v_candidates
  );
END;
$function$;

-- PostgreSQL grants function EXECUTE to PUBLIC by default unless revoked.
REVOKE ALL ON FUNCTION public.iberfit_u71_dated_candidates_qa_v1()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_u71_dated_candidates_qa_v1()
  TO authenticated;

COMMENT ON FUNCTION public.iberfit_u71_dated_candidates_qa_v1()
IS 'QA-only read-only fixed-fixture U71 selector, owner scoped, 50-row/7-field maximum, no production or service-role use';
