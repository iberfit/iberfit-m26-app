-- IBERFIT U67 QA-ONLY: minimal real-hosted-JWT certification grants.
-- Target project MUST be gjztkdwfmunnzhtvxrsu, supplied via authenticated
-- Supabase management connector. NEVER apply to PROD pjhmrhejsoofmouedavw.
-- Requires the U64/U65 official migration ledger and all U60 closed fences.
-- Roles/owner/canary checks remain INSIDE security-definer RPCs.
DO $u67_go$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE
    version IN ('20261025182000','20261025194000','20261025203500',
      '20261025210500','20261025223000','20261025231500','20261025235500'))<>7
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations
        WHERE version='20261104150000')<>1
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations
        WHERE version='20261105003645')<>0
    OR (SELECT count(*) FROM public.training_session_occurrences_v1)<>0
    OR (SELECT count(*) FROM public.active_execution_locks_v26)<>0
    OR (SELECT count(*) FROM pg_trigger WHERE tgname IN (
        'u60_typed_execution_fence','u60_active_lock_fence',
        'u60_dated_execution_update_identity','u60_dated_execution_update_receipt',
        'u60_occurrence_insert_fence') AND NOT tgisinternal)<>5
    OR to_regprocedure('public.iberfit_occurrence_api_u60_v1(text,jsonb)') IS NULL
    OR to_regprocedure('public.iberfit_occurrence_detail_v1(uuid,uuid)') IS NULL
    OR to_regprocedure('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)') IS NULL
    OR has_function_privilege('authenticated',
      'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon',
      'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=
      to_regclass('public.training_session_occurrences_v1') AND relrowsecurity)
    OR to_regclass('public.m26_canary_clients_v26') IS NULL
  THEN RAISE EXCEPTION 'U67_QA_ONLY_PRE_GRANT_SECURITY_GATE_FAILED'
    USING errcode='42501';
  END IF;
END;
$u67_go$;

-- No direct EXECUTE on U36, private routines, tables or service_role.
-- Host real JWT E2E will verify owner-scope and IDOR before any rollout.
GRANT EXECUTE ON FUNCTION public.iberfit_occurrence_api_u60_v1(text,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)
  TO authenticated;

DO $u67_verify$
BEGIN
  IF NOT has_function_privilege('authenticated',
       'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR NOT has_function_privilege('authenticated',
       'public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon',
       'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('anon',
       'public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
    OR has_function_privilege('service_role',
       'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('service_role',
       'public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated',
       'public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'U67_QA_ONLY_LEAST_PRIVILEGE_POST_GRANT_FAILED'
    USING errcode='42501';
  END IF;
END;
$u67_verify$;

NOTIFY pgrst, 'reload schema';
