-- IBERFIT P0 #1209 · QA ONLY · no grants, no row changes · exact policy semantic parity.
BEGIN;
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='8000ms';
DO $guard$
DECLARE p record; env text;
BEGIN
  SELECT value#>>'{}' INTO env FROM public.iberfit_system_settings WHERE key='environment';
  SELECT x.polcmd,x.polpermissive,x.polwithcheck,x.polroles,c.relrowsecurity,
         md5(pg_get_expr(x.polqual,x.polrelid)) AS digest,
         array(SELECT r.rolname FROM pg_roles r WHERE r.oid=ANY(x.polroles) ORDER BY r.rolname) AS role_names
    INTO p
  FROM pg_policy x JOIN pg_class c ON c.oid=x.polrelid
  WHERE x.polrelid='public.m26_wearable_consents_v44'::regclass
    AND x.polname='m26_wearable_consents_read_v44';
  IF env IS DISTINCT FROM 'QA'
    OR p.digest IS DISTINCT FROM '0b38f8e1d6bf70894f2e33f29ee36e5c'
    OR p.polcmd IS DISTINCT FROM 'r'
    OR p.polpermissive IS DISTINCT FROM true
    OR p.polwithcheck IS NOT NULL
    OR p.relrowsecurity IS DISTINCT FROM true
    OR p.role_names IS DISTINCT FROM ARRAY['authenticated']::name[]
    OR (SELECT provolatile FROM pg_proc WHERE oid='public.iberfit_client_id()'::regprocedure) IS DISTINCT FROM 's'
    OR (SELECT provolatile FROM pg_proc WHERE oid='public.is_assigned_coach(uuid)'::regprocedure) IS DISTINCT FROM 's'
  THEN RAISE EXCEPTION 'P0_FREE_QA_CONSENT_RLS_PREFLIGHT_DRIFT' USING ERRCODE='42501';
  END IF;
END $guard$;
-- Exactly the same WHERE/OR authorization. SELECT makes the stable zero-argument
-- client identity calculation an InitPlan once per statement instead of per consent row.
ALTER POLICY m26_wearable_consents_read_v44
  ON public.m26_wearable_consents_v44
  USING ((client_id = (SELECT public.iberfit_client_id()))
         OR public.is_assigned_coach(client_id));
DO $verify$
DECLARE p record; env text;
BEGIN
  SELECT value#>>'{}' INTO env FROM public.iberfit_system_settings WHERE key='environment';
  SELECT x.polcmd,x.polpermissive,x.polwithcheck,c.relrowsecurity,
         md5(pg_get_expr(x.polqual,x.polrelid)) AS digest,
         array(SELECT r.rolname FROM pg_roles r WHERE r.oid=ANY(x.polroles) ORDER BY r.rolname) AS role_names
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
  THEN RAISE EXCEPTION 'P0_FREE_QA_CONSENT_RLS_POSTCHECK_FAILED' USING ERRCODE='42501';
  END IF;
END $verify$;
COMMIT;