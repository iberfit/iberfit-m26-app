-- IBERFIT Free P0 #1209, QA-only undo duplicate IRI-withdrawal SELECT policy.
BEGIN;
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='8000ms';
DO $guard$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
 OR (SELECT COUNT(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  WHERE p.polrelid='public.iri_report_withdrawals_v1'::regclass
    AND p.polname='iri_report_withdrawal_read_manager_v1'
    AND p.polcmd='r' AND p.polpermissive AND p.polwithcheck IS NULL
    AND c.relrowsecurity
    AND md5(pg_get_expr(p.polqual,p.polrelid))='250d86448fd9a39e4ee38e33d17f03c5'
    AND ARRAY(SELECT role.rolname FROM pg_roles role WHERE role.oid=ANY(p.polroles)
      ORDER BY role.rolname)=ARRAY['authenticated']::name[]) IS DISTINCT FROM 1
 OR (SELECT COUNT(*) FROM pg_policy WHERE polrelid='public.iri_report_withdrawals_v1'::regclass) IS DISTINCT FROM 1
 THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_WITHDRAW_ROLLBACK_DRIFT' USING ERRCODE='42501'; END IF;
END $guard$;
CREATE POLICY iri_report_withdrawal_read_manager_v2 ON public.iri_report_withdrawals_v1
 FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.iri_report_issuances_v1 i
   WHERE i.id=issuance_id AND public.iberfit_can_manage_iri_private_v1(i.client_id)));
DO $verify$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
 OR (SELECT COUNT(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  WHERE p.polrelid='public.iri_report_withdrawals_v1'::regclass
    AND p.polname IN ('iri_report_withdrawal_read_manager_v1','iri_report_withdrawal_read_manager_v2')
    AND p.polcmd='r' AND p.polpermissive AND p.polwithcheck IS NULL
    AND c.relrowsecurity
    AND md5(pg_get_expr(p.polqual,p.polrelid))='250d86448fd9a39e4ee38e33d17f03c5'
    AND ARRAY(SELECT role.rolname FROM pg_roles role WHERE role.oid=ANY(p.polroles)
      ORDER BY role.rolname)=ARRAY['authenticated']::name[]) IS DISTINCT FROM 2
 THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_WITHDRAW_ROLLBACK_POSTCHECK' USING ERRCODE='42501'; END IF;
END $verify$;
COMMIT;