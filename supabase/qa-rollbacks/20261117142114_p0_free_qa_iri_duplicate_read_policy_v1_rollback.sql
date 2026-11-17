-- IBERFIT #1209 · QA rollback of exact redundant RLS rule (no data changes).
BEGIN;
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='8000ms';
DO $preflight$
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
 THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_ROLLBACK_DRIFT' USING ERRCODE='42501';
 END IF;
END $preflight$;
CREATE POLICY iri_report_issuance_read_manager_v2
  ON public.iri_report_issuances_v1
  FOR SELECT TO authenticated
  USING (public.iberfit_can_manage_iri_private_v1(client_id));
DO $verify$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR (SELECT COUNT(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
        WHERE p.polrelid='public.iri_report_issuances_v1'::regclass
          AND p.polname IN ('iri_report_issuance_read_manager_v1','iri_report_issuance_read_manager_v2')
          AND p.polcmd='r' AND p.polpermissive=true AND p.polwithcheck IS NULL
          AND c.relrowsecurity=true
          AND md5(pg_get_expr(p.polqual,p.polrelid))='8e39f8cd8bc1fee7502232acf50aadd9'
          AND ARRAY(SELECT r.rolname FROM pg_roles r
             WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname)=ARRAY['authenticated']::name[]) IS DISTINCT FROM 2
 THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_ROLLBACK_POSTCHECK' USING ERRCODE='42501';
 END IF;
END $verify$;
COMMIT;