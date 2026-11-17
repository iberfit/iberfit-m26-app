-- P0 FREE QA rollback 2/2: restore the first InitPlan policy.
-- Then, only if necessary, apply the earlier rollback 1/2.
BEGIN;
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='8000ms';
DO $guard$
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
  THEN RAISE EXCEPTION 'P0_FREE_QA_WEARABLE_COACH_POLICY_ROLLBACK_DRIFT' USING ERRCODE='42501';
  END IF;
END $guard$;
ALTER POLICY m26_wearable_consents_read_v44 ON public.m26_wearable_consents_v44
  USING ((client_id = (SELECT public.iberfit_client_id()))
         OR public.is_assigned_coach(client_id));
DO $verify$
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR (SELECT md5(pg_get_expr(polqual,polrelid)) FROM pg_policy
        WHERE polrelid='public.m26_wearable_consents_v44'::regclass
          AND polname='m26_wearable_consents_read_v44') IS DISTINCT FROM 'a6ea1799ffd432d13b6b607612f40f52'
  THEN RAISE EXCEPTION 'P0_FREE_QA_WEARABLE_COACH_POLICY_ROLLBACK_POSTCHECK' USING ERRCODE='42501';
  END IF;
END $verify$;
COMMIT;