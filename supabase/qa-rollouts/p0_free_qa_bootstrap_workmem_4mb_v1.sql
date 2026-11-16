-- P0 #1209 · QA ONLY · PostgreSQL 17 function-local work_mem, max 4 MB.
-- Eliminates spilling of synthetic QA Client A large bootstrap while preserving RLS/ACL.
-- No global GUC, no user table change, no PROD deployment.
DO $free_workmem$
DECLARE
  target constant regprocedure := 'public.iberfit_bootstrap_v26()'::regprocedure;
  old_definition text;
  before_acl aclitem[];
  before_owner oid;
  before_security boolean;
  before_volatility "char";
  before_parallel "char";
BEGIN
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
     OR (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='free_client_completed_execution_details_demand_qa_v1') IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'FREE_WORKMEM_QA_ONLY_NO_OPTIN' USING ERRCODE='42501'; END IF;
  old_definition:=pg_get_functiondef(target);
  SELECT proacl,proowner,prosecdef,provolatile,proparallel
  INTO before_acl,before_owner,before_security,before_volatility,before_parallel
  FROM pg_proc WHERE oid=target;
  IF md5(old_definition) IS DISTINCT FROM 'a71e8ccd806ae1e783799cc1a6e2efce'
     OR (SELECT proconfig FROM pg_proc WHERE oid=target) IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR before_security IS DISTINCT FROM true
     OR before_volatility IS DISTINCT FROM 's'
     OR has_function_privilege('anon',target,'EXECUTE')
     OR NOT has_function_privilege('authenticated',target,'EXECUTE')
  THEN RAISE EXCEPTION 'FREE_WORKMEM_BOOTSTRAP_BASELINE_DRIFT' USING ERRCODE='42501'; END IF;
  EXECUTE 'ALTER FUNCTION public.iberfit_bootstrap_v26() SET work_mem TO ''4MB''';
  IF md5(pg_get_functiondef(target)) IS DISTINCT FROM '9c83765e0a36b0144fde2dca4a0cdcba'
     OR (SELECT proconfig FROM pg_proc WHERE oid=target) IS DISTINCT FROM ARRAY['search_path=""','work_mem=4MB']::text[]
     OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=target AND
       (p.proacl IS DISTINCT FROM before_acl OR p.proowner IS DISTINCT FROM before_owner
        OR p.prosecdef IS DISTINCT FROM before_security
        OR p.provolatile IS DISTINCT FROM before_volatility
        OR p.proparallel IS DISTINCT FROM before_parallel))
     OR has_function_privilege('anon',target,'EXECUTE')
     OR NOT has_function_privilege('authenticated',target,'EXECUTE')
  THEN RAISE EXCEPTION 'FREE_WORKMEM_AFTER_APPLY_VERIFICATION_FAILED' USING ERRCODE='42501'; END IF;
END
$free_workmem$;
