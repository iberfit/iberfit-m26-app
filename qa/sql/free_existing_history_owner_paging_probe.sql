-- FREE 360: read-only QA probe of existing completed-history paging.
-- Executed successfully 2026-11-23 CLT against hosted QA, no HTTP or new Auth sessions.
-- Run with privileged SQL access, never in PROD. Simulated JWT claims are not end-to-end login certification.
BEGIN READ ONLY;
DO $check$
DECLARE a record; p jsonb; r jsonb; n int:=0; has_rows int:=0;
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA' THEN RAISE EXCEPTION 'QA_ONLY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.iberfit_system_settings WHERE key='free_client_completed_history_demand_qa' AND value='true'::jsonb) THEN RAISE EXCEPTION 'QA_PILOT_NOT_ENABLED'; END IF;
  FOR a IN SELECT u.id,p.client_id FROM auth.users u JOIN public.user_profiles p ON p.user_id=u.id WHERE lower(u.email) IN ('qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl') AND lower(p.role::text)='client' LOOP
    PERFORM set_config('request.jwt.claim.sub',a.id::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'role','authenticated')::text,true);
    IF auth.uid() IS DISTINCT FROM a.id OR public.iberfit_client_id() IS DISTINCT FROM a.client_id THEN RAISE EXCEPTION 'QA_SCOPE_MISMATCH'; END IF;
    p:=public.iberfit_client_completed_history_page_free_v1('session_execution',NULL,NULL,NULL,NULL,24);
    IF jsonb_typeof(p->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rows')>24 THEN RAISE EXCEPTION 'PAGE_LIMIT_FAILED'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') x WHERE x->>'clientId' IS DISTINCT FROM a.client_id::text OR x->>'entityType' IS DISTINCT FROM 'session_execution') THEN RAISE EXCEPTION 'PAGE_OWNER_FAILED'; END IF;
    IF (p->>'hasMore')::boolean THEN
      IF p->'nextCursor' IS NULL OR p->'nextCursor'='null'::jsonb THEN RAISE EXCEPTION 'CURSOR_MISSING'; END IF;
      r:=public.iberfit_client_completed_history_page_free_v1('session_execution',(p->>'snapshotAt')::timestamptz,p->'nextCursor',(p->>'total')::bigint,p->>'fingerprint',24);
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') x WHERE x->>'clientId' IS DISTINCT FROM a.client_id::text OR x->>'entityType' IS DISTINCT FROM 'session_execution') OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rows') x JOIN jsonb_array_elements(r->'rows') y ON x->>'entityId'=y->>'entityId') THEN RAISE EXCEPTION 'PAGE_CONTINUATION_FAILED'; END IF;
    END IF;
    n:=n+1; IF jsonb_array_length(p->'rows')>0 THEN has_rows:=has_rows+1; END IF;
  END LOOP;
  IF n<>2 OR has_rows=0 THEN RAISE EXCEPTION 'FIXTURE_INCOMPLETE'; END IF;
  RAISE NOTICE 'FREE_HISTORY_QA_OWNER_PAGING_PASS';
END $check$;
ROLLBACK;
