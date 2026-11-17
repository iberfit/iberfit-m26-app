-- P0 FREE QA: optimize assigned-coach consent RLS by cached role and set membership.
-- This is equivalent ONLY while the pinned private role/assignment functions
-- and the client_assignments RLS contract remain unchanged. Fail closed on drift.
BEGIN;
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='8000ms';
DO $guard$
DECLARE p record; env text;
BEGIN
  SELECT value#>>'{}' INTO env FROM public.iberfit_system_settings WHERE key='environment';
  SELECT x.polcmd,x.polpermissive,x.polwithcheck,c.relrowsecurity,
    md5(pg_get_expr(x.polqual,x.polrelid)) digest,
    array(SELECT r.rolname FROM pg_roles r WHERE r.oid=ANY(x.polroles) ORDER BY r.rolname) role_names
  INTO p
  FROM pg_policy x JOIN pg_class c ON c.oid=x.polrelid
  WHERE x.polrelid='public.m26_wearable_consents_v44'::regclass
    AND x.polname='m26_wearable_consents_read_v44';
  IF env IS DISTINCT FROM 'QA'
    OR p.digest IS DISTINCT FROM 'a6ea1799ffd432d13b6b607612f40f52'
    OR p.polcmd IS DISTINCT FROM 'r'
    OR p.polpermissive IS DISTINCT FROM true
    OR p.polwithcheck IS NOT NULL
    OR p.relrowsecurity IS DISTINCT FROM true
    OR p.role_names IS DISTINCT FROM ARRAY['authenticated']::name[]
    OR md5(pg_get_functiondef('private.is_assigned_coach(uuid)'::regprocedure)) IS DISTINCT FROM '9babfaec3d7b2dac9cd6f963fd6dde3b'
    OR md5(pg_get_functiondef('private.iberfit_role()'::regprocedure)) IS DISTINCT FROM '4975cfaf94b33c026a63526b74ecd138'
    OR md5(pg_get_functiondef('public.iberfit_role()'::regprocedure)) IS DISTINCT FROM '7ab65588573cb47a275383cad7cddf6c'
    OR (SELECT md5(pg_get_expr(polqual,polrelid)) FROM pg_policy
        WHERE polrelid='public.client_assignments'::regclass
          AND polname='assignments_admin_coach_read') IS DISTINCT FROM '73c04c694f4c69c2005e27e17dfc0a08'
    OR (SELECT relrowsecurity FROM pg_class WHERE oid='public.client_assignments'::regclass) IS DISTINCT FROM true
    OR has_table_privilege('authenticated','public.client_assignments','SELECT') IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'P0_FREE_QA_WEARABLE_COACH_POLICY_DEPENDENCY_DRIFT' USING ERRCODE='42501';
  END IF;
END $guard$;
-- private.is_assigned_coach checks role=admin OR (role=coach AND exists
-- active assignment to auth.uid()). Reproduce the SAME boolean expression
-- without invoking a SECURITY DEFINER helper for every consent row:
-- Postgres RLS on client_assignments remains active as defense in depth.
ALTER POLICY m26_wearable_consents_read_v44 ON public.m26_wearable_consents_v44
  USING (
    client_id = (SELECT public.iberfit_client_id())
    OR (SELECT public.iberfit_role()) = 'admin'::public.iberfit_role
    OR (
      (SELECT public.iberfit_role()) = 'coach'::public.iberfit_role
      AND client_id IN (
        SELECT a.client_id
        FROM public.client_assignments a
        WHERE a.coach_user_id = (SELECT auth.uid())
          AND a.active
      )
    )
  );
DO $verify$
DECLARE p record;
BEGIN
  SELECT x.polcmd,x.polpermissive,x.polwithcheck,c.relrowsecurity,
     md5(pg_get_expr(x.polqual,x.polrelid)) digest,
     array(SELECT r.rolname FROM pg_roles r WHERE r.oid=ANY(x.polroles) ORDER BY r.rolname) role_names
  INTO p FROM pg_policy x JOIN pg_class c ON c.oid=x.polrelid
  WHERE x.polrelid='public.m26_wearable_consents_v44'::regclass
    AND x.polname='m26_wearable_consents_read_v44';
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR p.digest IS DISTINCT FROM 'de7d8cbf0792c431eedae9a9591a212a'
    OR p.polcmd IS DISTINCT FROM 'r'
    OR p.polpermissive IS DISTINCT FROM true
    OR p.polwithcheck IS NOT NULL
    OR p.relrowsecurity IS DISTINCT FROM true
    OR p.role_names IS DISTINCT FROM ARRAY['authenticated']::name[]
  THEN RAISE EXCEPTION 'P0_FREE_QA_WEARABLE_COACH_POLICY_POSTCHECK' USING ERRCODE='42501';
  END IF;
END $verify$;
COMMIT;