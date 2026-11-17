-- IBERFIT Free P0 #1209 · restore original IRI issuance SELECT policy, QA-only.
-- No data, functions, grants, indexes, reports or production changes.
BEGIN;
SET LOCAL lock_timeout = '1500ms';
SET LOCAL statement_timeout = '10000ms';
DO $guard$
DECLARE v_count integer;
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
  THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_INITPLAN_ROLLBACK_ENV' USING ERRCODE='42501'; END IF;
  SELECT COUNT(*) INTO v_count FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
   WHERE p.polrelid='public.iri_report_issuances_v1'::regclass
     AND p.polname='iri_report_issuance_read_manager_v1'
     AND p.polcmd='r' AND p.polpermissive AND p.polwithcheck IS NULL
     AND c.relrowsecurity
     AND md5(pg_get_expr(p.polqual,p.polrelid))='0a4730122eda42e36e12c8a4dc8a2220'
     AND ARRAY(SELECT role.rolname FROM pg_roles role WHERE role.oid=ANY(p.polroles)
       ORDER BY role.rolname)=ARRAY['authenticated']::name[];
  IF v_count IS DISTINCT FROM 1
     OR (SELECT COUNT(*) FROM pg_policy WHERE polrelid='public.iri_report_issuances_v1'::regclass) IS DISTINCT FROM 1
  THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_INITPLAN_ROLLBACK_DRIFT' USING ERRCODE='42501'; END IF;
END $guard$;
ALTER POLICY iri_report_issuance_read_manager_v1 ON public.iri_report_issuances_v1
  USING (public.iberfit_can_manage_iri_private_v1(client_id));
DO $verify$
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR (SELECT COUNT(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      WHERE p.polrelid='public.iri_report_issuances_v1'::regclass
        AND p.polname='iri_report_issuance_read_manager_v1'
        AND p.polcmd='r' AND p.polpermissive AND p.polwithcheck IS NULL
        AND c.relrowsecurity
        AND md5(pg_get_expr(p.polqual,p.polrelid))='8e39f8cd8bc1fee7502232acf50aadd9'
        AND ARRAY(SELECT role.rolname FROM pg_roles role WHERE role.oid=ANY(p.polroles)
          ORDER BY role.rolname)=ARRAY['authenticated']::name[]) IS DISTINCT FROM 1
  THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_INITPLAN_ROLLBACK_POSTCHECK' USING ERRCODE='42501'; END IF;
END $verify$;
COMMIT;