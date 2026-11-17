-- IBERFIT #1209 · QA ONLY · Remove exactly one semantically duplicated read policy.
-- Both source policies had the same SELECT predicate, role and permissive kind.
-- No data, privilege, report issuance or authorization changes.
BEGIN;
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='8000ms';
DO $preflight$
DECLARE v_count integer;
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')
    IS DISTINCT FROM 'QA'
 THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_ENV_DRIFT' USING ERRCODE='42501'; END IF;
 SELECT COUNT(*) INTO v_count
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
 WHERE p.polrelid='public.iri_report_issuances_v1'::regclass
   AND p.polname IN ('iri_report_issuance_read_manager_v1','iri_report_issuance_read_manager_v2')
   AND md5(pg_get_expr(p.polqual,p.polrelid))='8e39f8cd8bc1fee7502232acf50aadd9'
   AND p.polcmd='r' AND p.polpermissive=true AND p.polwithcheck IS NULL
   AND c.relrowsecurity=true
   AND ARRAY(SELECT r.rolname FROM pg_roles r
      WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname)=ARRAY['authenticated']::name[];
 IF v_count IS DISTINCT FROM 2
 THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_POLICY_DRIFT' USING ERRCODE='42501'; END IF;
 IF (SELECT COUNT(*) FROM pg_policy WHERE polrelid='public.iri_report_issuances_v1'::regclass) IS DISTINCT FROM 2
 THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_EXTRA_POLICIES' USING ERRCODE='42501'; END IF;
END $preflight$;
DROP POLICY iri_report_issuance_read_manager_v2 ON public.iri_report_issuances_v1;
DO $verify$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')
    IS DISTINCT FROM 'QA'
    OR (SELECT COUNT(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
       WHERE p.polrelid='public.iri_report_issuances_v1'::regclass
         AND p.polname='iri_report_issuance_read_manager_v1'
         AND p.polcmd='r' AND p.polpermissive=true AND p.polwithcheck IS NULL
         AND c.relrowsecurity=true
         AND md5(pg_get_expr(p.polqual,p.polrelid))='8e39f8cd8bc1fee7502232acf50aadd9'
         AND ARRAY(SELECT r.rolname FROM pg_roles r
            WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname)=ARRAY['authenticated']::name[]) IS DISTINCT FROM 1
    OR (SELECT COUNT(*) FROM pg_policy
       WHERE polrelid='public.iri_report_issuances_v1'::regclass) IS DISTINCT FROM 1
 THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_POSTCHECK_FAILED' USING ERRCODE='42501';
 END IF;
END $verify$;
COMMIT;