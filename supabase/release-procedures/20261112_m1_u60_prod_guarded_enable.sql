-- IBERFIT M1 / U60: PROTECTED PRODUCTION ENABLEMENT (STAGED, NOT APPLIED).
-- Never execute as part of an ordinary frontend deployment.
-- Out-of-band preconditions: exact-SHA authenticated Coach/Client/Coach QA
-- acceptance, negative RLS tests, recent M44 PostgreSQL+Storage restore,
-- independent Auth/Vault recovery plan, signed rollback and operator review.
-- This file grants ONLY the versioned public U60 entrypoints after source,
-- environment, migration, direct-table ACL and execution fences match.
-- Rollback: 20261112_m1_u60_prod_guarded_disable.sql (same SHA).
BEGIN;
DO $u60_preflight$
DECLARE
  v_env text;
  v_real boolean;
  v_blocked boolean;
  v_owner text;
  v_func record;
BEGIN
  SELECT value #>> '{}' INTO v_env
    FROM public.iberfit_system_settings WHERE key='environment';
  SELECT (value #>> '{}')::boolean INTO v_real
    FROM public.iberfit_system_settings WHERE key='real_data_allowed';
  SELECT (value #>> '{}')::boolean INTO v_blocked
    FROM public.iberfit_system_settings WHERE key='production_blocked';
  IF v_env IS DISTINCT FROM 'PRODUCTION'
     OR v_real IS DISTINCT FROM true OR v_blocked IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'U60_PROD_ENVIRONMENT_NOT_CERTIFIED' USING errcode='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('20261025182000'),('20261025194000'),('20261025203500'),
      ('20261025210500'),('20261025223000'),('20261025231500'),
      ('20261025235500'),('20261104150000')
    ) required(version)
    WHERE NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations m
      WHERE m.version=required.version)
  ) THEN
    RAISE EXCEPTION 'U60_REQUIRED_MIGRATION_MISSING' USING errcode='42501';
  END IF;
  FOR v_func IN
    SELECT req.signature,req.expected_hash,p.oid,p.prosecdef,p.proconfig,p.proowner
    FROM (VALUES
      ('public.iberfit_occurrence_api_u60_v1(text,jsonb)',
       '5914acf371015a6bbeeaf95f99e056e3'),
      ('public.iberfit_occurrence_detail_v1(uuid,uuid)',
       '00b8ee39c85fd92f593732c055902cf2')
    ) req(signature,expected_hash)
    LEFT JOIN pg_proc p ON p.oid=to_regprocedure(req.signature)
  LOOP
    IF v_func.oid IS NULL
      OR md5(pg_get_functiondef(v_func.oid)) IS DISTINCT FROM v_func.expected_hash
      OR v_func.prosecdef IS DISTINCT FROM true
      OR NOT (v_func.proconfig @> ARRAY['search_path=""']::text[])
      OR pg_get_userbyid(v_func.proowner) IS DISTINCT FROM 'postgres'
      OR has_function_privilege('authenticated',v_func.oid,'EXECUTE')
      OR has_function_privilege('anon',v_func.oid,'EXECUTE')
      OR has_function_privilege('service_role',v_func.oid,'EXECUTE')
    THEN
      RAISE EXCEPTION 'U60_PROD_SOURCE_ACL_DRIFT:%',v_func.signature
        USING errcode='42501';
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated',
      'public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('anon',
      'public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_class c
      WHERE c.oid=to_regclass('public.training_session_occurrences_v1')
        AND c.relrowsecurity
        AND NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid=to_regclass('public.session_executions')
        AND t.tgname='u60_dated_execution_update_receipt'
        AND t.tgenabled<>'D' AND NOT t.tgisinternal
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid=to_regclass('public.session_executions')
        AND t.tgname='u60_typed_execution_fence'
        AND t.tgenabled<>'D' AND NOT t.tgisinternal
    ) THEN
    RAISE EXCEPTION 'U60_PROD_RLS_EXECUTION_FENCE_DRIFT' USING errcode='42501';
  END IF;
END
$u60_preflight$;

-- Deliberately NO GRANT on public.iberfit_occurrence_api_v1,
-- private executor functions, tables, anon or service_role.
GRANT EXECUTE ON FUNCTION public.iberfit_occurrence_api_u60_v1(text,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)
  TO authenticated;

DO $u60_verify$
BEGIN
  IF NOT has_function_privilege('authenticated',
    'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR NOT has_function_privilege('authenticated',
    'public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
    OR has_function_privilege('anon',
      'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('anon',
      'public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'U60_PROD_POST_GRANT_VERIFICATION_FAILED'
      USING errcode='42501';
  END IF;
END
$u60_verify$;
COMMIT;
