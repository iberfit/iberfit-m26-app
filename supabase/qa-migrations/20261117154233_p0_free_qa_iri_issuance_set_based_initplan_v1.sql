-- IBERFIT Free P0 #1209 · QA-only IRI SELECT RLS InitPlan/set-based authorization.
-- Preserves the full existing private helper as a fallback for historical assignments.
-- Before applying: 4/4 actor result-set hashes equal in BEGIN...ROLLBACK.
-- See docs/PRODUCTION_STATE.md, linked PR and exact-SHA browser certification.
BEGIN;
SET LOCAL lock_timeout = '1500ms';
SET LOCAL statement_timeout = '10000ms';
DO $guard$
DECLARE v_count integer;
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR md5(pg_get_functiondef('public.iberfit_can_manage_iri_external_report_v12(uuid)'::regprocedure)) IS DISTINCT FROM '06ba4871f36f508b6b0852bcbe6111e2'
    OR md5(pg_get_functiondef('public.iberfit_can_manage_iri_private_v1(uuid)'::regprocedure)) IS DISTINCT FROM '34139425dd7b0b212aed1f43108764cb'
    OR md5(pg_get_functiondef('private.iberfit_role()'::regprocedure)) IS DISTINCT FROM '4975cfaf94b33c026a63526b74ecd138'
    OR md5(pg_get_functiondef('private.is_assigned_coach(uuid)'::regprocedure)) IS DISTINCT FROM '9babfaec3d7b2dac9cd6f963fd6dde3b'
    OR md5(pg_get_functiondef('public.iberfit_role()'::regprocedure)) IS DISTINCT FROM '7ab65588573cb47a275383cad7cddf6c'
    OR (SELECT md5(pg_get_expr(polqual,polrelid)) FROM pg_policy WHERE polrelid='public.client_assignments'::regclass AND polname='assignments_admin_coach_read') IS DISTINCT FROM '73c04c694f4c69c2005e27e17dfc0a08'
    OR has_table_privilege('authenticated','public.client_assignments','SELECT') IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_INITPLAN_DEPENDENCY_DRIFT' USING ERRCODE='42501'; END IF;
  SELECT COUNT(*) INTO v_count FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
   WHERE p.polrelid='public.iri_report_issuances_v1'::regclass
     AND p.polname='iri_report_issuance_read_manager_v1'
     AND p.polcmd='r' AND p.polpermissive AND p.polwithcheck IS NULL
     AND c.relrowsecurity
     AND md5(pg_get_expr(p.polqual,p.polrelid))='8e39f8cd8bc1fee7502232acf50aadd9'
     AND ARRAY(SELECT role.rolname FROM pg_roles role WHERE role.oid=ANY(p.polroles)
       ORDER BY role.rolname)=ARRAY['authenticated']::name[];
  IF v_count IS DISTINCT FROM 1
    OR (SELECT COUNT(*) FROM pg_policy WHERE polrelid='public.iri_report_issuances_v1'::regclass) IS DISTINCT FROM 1
  THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_INITPLAN_POLICY_DRIFT' USING ERRCODE='42501'; END IF;
END $guard$;

ALTER POLICY iri_report_issuance_read_manager_v1 ON public.iri_report_issuances_v1
  USING (
    ((SELECT public.iberfit_role())='admin'::public.iberfit_role)
    OR (
      ((SELECT public.iberfit_role())='coach'::public.iberfit_role)
      AND (
        client_id IN (
          SELECT a.client_id FROM public.client_assignments a
          WHERE a.coach_user_id=(SELECT auth.uid()) AND a.active
        )
        -- Same original private helper: preserves any historical/legacy
        -- assignment semantics, including RLS-invisible legacy records.
        OR public.iberfit_can_manage_iri_private_v1(client_id)
      )
    )
  );

DO $verify$
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR (SELECT COUNT(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      WHERE p.polrelid='public.iri_report_issuances_v1'::regclass
        AND p.polname='iri_report_issuance_read_manager_v1'
        AND p.polcmd='r' AND p.polpermissive AND p.polwithcheck IS NULL
        AND c.relrowsecurity
        AND md5(pg_get_expr(p.polqual,p.polrelid))='0a4730122eda42e36e12c8a4dc8a2220'
        AND ARRAY(SELECT role.rolname FROM pg_roles role WHERE role.oid=ANY(p.polroles)
          ORDER BY role.rolname)=ARRAY['authenticated']::name[]) IS DISTINCT FROM 1
    OR (SELECT COUNT(*) FROM pg_policy WHERE polrelid='public.iri_report_issuances_v1'::regclass) IS DISTINCT FROM 1
  THEN RAISE EXCEPTION 'P0_FREE_QA_IRI_INITPLAN_POSTCHECK_FAILED' USING ERRCODE='42501'; END IF;
END $verify$;
COMMIT;