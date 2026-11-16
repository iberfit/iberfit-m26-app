-- P0 #1209 · exact source/ACL inverse. QA ONLY, no data mutations.
-- Must run BEFORE rolling back P0 QA history page64, because its MD5 expects old outer function.
DO $free_workmem_revert$
DECLARE
  target constant regprocedure := 'public.iberfit_bootstrap_v26()'::regprocedure;
  before_acl aclitem[];
  before_owner oid;
  before_security boolean;
  before_volatility "char";
  before_parallel "char";
BEGIN
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
  THEN RAISE EXCEPTION 'FREE_WORKMEM_ROLLBACK_QA_ONLY' USING ERRCODE='42501'; END IF;
  SELECT proacl,proowner,prosecdef,provolatile,proparallel
  INTO before_acl,before_owner,before_security,before_volatility,before_parallel
  FROM pg_proc WHERE oid=target;
  IF md5(pg_get_functiondef(target)) IS DISTINCT FROM '9c83765e0a36b0144fde2dca4a0cdcba'
     OR (SELECT proconfig FROM pg_proc WHERE oid=target) IS DISTINCT FROM ARRAY['search_path=""','work_mem=4MB']::text[]
     OR before_security IS DISTINCT FROM true OR before_volatility IS DISTINCT FROM 's'
     OR has_function_privilege('anon',target,'EXECUTE')
  THEN RAISE EXCEPTION 'FREE_WORKMEM_ROLLBACK_SOURCE_DRIFT' USING ERRCODE='42501'; END IF;
  EXECUTE 'ALTER FUNCTION public.iberfit_bootstrap_v26() RESET work_mem';
  IF md5(pg_get_functiondef(target)) IS DISTINCT FROM 'a71e8ccd806ae1e783799cc1a6e2efce'
     OR (SELECT proconfig FROM pg_proc WHERE oid=target) IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=target AND
       (p.proacl IS DISTINCT FROM before_acl OR p.proowner IS DISTINCT FROM before_owner
        OR p.prosecdef IS DISTINCT FROM before_security
        OR p.provolatile IS DISTINCT FROM before_volatility
        OR p.proparallel IS DISTINCT FROM before_parallel))
     OR has_function_privilege('anon',target,'EXECUTE')
  THEN RAISE EXCEPTION 'FREE_WORKMEM_ROLLBACK_VERIFICATION_FAILED' USING ERRCODE='42501'; END IF;
END
$free_workmem_revert$;
