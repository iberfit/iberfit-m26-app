-- QA ONLY, after protected installation. No training or report data writes.
-- Run as postgres; simulated JWT claims check server-side logic, not HTTP authentication.
BEGIN READ ONLY;
DO $probe$
DECLARE
  a record;
  actor record;
  v_old jsonb;
  v_page jsonb;
  v_all jsonb;
  v_cursor uuid;
  v_pages int;
  v_expected jsonb;
  v_actual jsonb;
  v_count bigint;
  v_unique bigint;
  v_roles int:=0;
  v_denied int:=0;
  v_managers int:=0;
  v_coaches int:=0;
  v_admins int:=0;
  v_is_manager boolean;
  v_size integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.iberfit_system_settings WHERE key='environment' AND value#>>'{}'='QA') THEN
    RAISE EXCEPTION 'QA_ONLY';
  END IF;
  IF has_function_privilege('anon','public.iberfit_iri_report_history_v2(uuid,uuid,integer)','execute') OR
     NOT has_function_privilege('authenticated','public.iberfit_iri_report_history_v2(uuid,uuid,integer)','execute') THEN
    RAISE EXCEPTION 'ACL_FAILURE';
  END IF;
  SELECT i.assessment_id,a0.client_id INTO a
    FROM public.iri_report_issuances_v1 i JOIN public.iri_assessments a0 ON a0.id=i.assessment_id
    WHERE a0.assessment_type='inicial' GROUP BY i.assessment_id,a0.client_id ORDER BY count(*) DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'QA_FIXTURE_MISSING'; END IF;
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  BEGIN
    PERFORM public.iberfit_iri_report_history_v2(a.assessment_id);
    RAISE EXCEPTION 'ANONYMOUS_ALLOWED';
  EXCEPTION WHEN SQLSTATE '28000' THEN NULL; END;
  FOR actor IN
    SELECT u.id,p.client_id,lower(p.role::text) role
    FROM auth.users u JOIN public.user_profiles p ON p.user_id=u.id
    WHERE lower(u.email) IN ('qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl','qa.rc74.coach@iberfit.cl')
       OR (lower(p.role::text)='admin' AND lower(u.email) LIKE 'qa.%@iberfit.cl')
  LOOP
    PERFORM set_config('request.jwt.claim.sub',actor.id::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
    v_is_manager:=coalesce(public.iberfit_can_manage_iri_private_v1(a.client_id),false);
    IF actor.role='client' AND actor.client_id IS DISTINCT FROM a.client_id THEN
      IF v_is_manager THEN RAISE EXCEPTION 'CROSS_OWNER_MANAGER'; END IF;
      BEGIN
        PERFORM public.iberfit_iri_report_history_v2(a.assessment_id);
        RAISE EXCEPTION 'OTHER_OWNER_ALLOWED';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      v_denied:=v_denied+1;
      CONTINUE;
    END IF;
    IF v_is_manager IS DISTINCT FROM (actor.role IN ('coach','admin')) THEN RAISE EXCEPTION 'QA_MANAGER_ROLE_MISMATCH'; END IF;
    v_old:=public.iberfit_iri_report_history_v1(a.assessment_id);
    IF (v_old->>'manager')::boolean IS DISTINCT FROM v_is_manager THEN RAISE EXCEPTION 'V1_ROLE_MISMATCH'; END IF;
    FOREACH v_size IN ARRAY ARRAY[1,50,100] LOOP
      v_page:=public.iberfit_iri_report_history_v2(a.assessment_id,NULL,v_size);
      IF jsonb_array_length(v_page->'items')<>least(v_size,jsonb_array_length(v_old->'items'))
         OR (v_page->>'hasMore')::boolean IS DISTINCT FROM (jsonb_array_length(v_old->'items')>v_size) THEN RAISE EXCEPTION 'PAGE_SIZE_BOUNDARY_FAILED'; END IF;
      IF (v_page->>'hasMore')::boolean AND v_page->>'nextCursor' IS DISTINCT FROM (v_page->'items'->(v_size-1)->>'issuanceId') THEN RAISE EXCEPTION 'FIRST_CURSOR_NOT_LAST_ROW'; END IF;
    END LOOP;
    v_all:='[]'::jsonb; v_cursor:=NULL; v_pages:=0;
    LOOP
      v_page:=public.iberfit_iri_report_history_v2(a.assessment_id,v_cursor,50);
      IF v_page->>'manager' IS DISTINCT FROM v_old->>'manager' OR jsonb_array_length(v_page->'items')>50 THEN
        RAISE EXCEPTION 'PAGE_CONTRACT_FAILED';
      END IF;
      v_all:=v_all||(v_page->'items'); v_pages:=v_pages+1;
      EXIT WHEN NOT (v_page->>'hasMore')::boolean;
      IF v_page->>'nextCursor' IS NULL OR (v_page->>'nextCursor')::uuid IS NOT DISTINCT FROM v_cursor OR v_pages>1000 THEN
        RAISE EXCEPTION 'CURSOR_PROGRESS_FAILED';
      END IF;
      v_cursor:=(v_page->>'nextCursor')::uuid;
    END LOOP;
    IF v_page->>'nextCursor' IS NOT NULL THEN RAISE EXCEPTION 'TERMINAL_CURSOR_FAILED'; END IF;
    SELECT coalesce(jsonb_object_agg(x->>'issuanceId',x),'{}'::jsonb) INTO v_expected FROM jsonb_array_elements(v_old->'items') x;
    SELECT coalesce(jsonb_object_agg(x->>'issuanceId',x),'{}'::jsonb),count(*),count(distinct x->>'issuanceId')
      INTO v_actual,v_count,v_unique FROM jsonb_array_elements(v_all) x;
    IF v_actual IS DISTINCT FROM v_expected OR v_count<>v_unique OR v_count<>jsonb_array_length(v_old->'items') THEN
      RAISE EXCEPTION 'HISTORY_PARITY_FAILED';
    END IF;
    IF NOT v_is_manager AND EXISTS(SELECT 1 FROM jsonb_array_elements(v_all) x WHERE x->>'audience'<>'cliente' OR (x->>'withdrawn')::boolean OR x->>'artifactSha256' IS NOT NULL OR x->>'issuedBy' IS NOT NULL OR x->>'withdrawnReason' IS NOT NULL) THEN
      RAISE EXCEPTION 'CLIENT_PRIVACY_FAILED';
    END IF;
    BEGIN
      PERFORM public.iberfit_iri_report_history_v2(a.assessment_id,NULL,101);
      RAISE EXCEPTION 'LIMIT_ALLOWED';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN
      PERFORM public.iberfit_iri_report_history_v2(a.assessment_id,'00000000-0000-0000-0000-000000000000',50);
      RAISE EXCEPTION 'INVALID_CURSOR_ALLOWED';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    IF v_is_manager THEN
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_all) x WHERE x->>'audience'='coach' AND x->>'artifactSha256' IS NOT NULL) THEN RAISE EXCEPTION 'MANAGER_PROJECTION_FAILED'; END IF;
      v_managers:=v_managers+1;
      IF actor.role='coach' THEN v_coaches:=v_coaches+1; ELSE v_admins:=v_admins+1; END IF;
    ELSE
      v_roles:=v_roles+1;
    END IF;
  END LOOP;
  IF v_roles<>1 OR v_denied<>1 OR v_managers<>2 OR v_coaches<>1 OR v_admins<>1 THEN RAISE EXCEPTION 'QA_ROLE_FIXTURES_INCOMPLETE'; END IF;
  RAISE NOTICE 'IRI_HISTORY_V2_QA_OWNER_MANAGER_PARITY_AND_CROSS_OWNER_DENIAL_PASS';
END $probe$;
ROLLBACK;
