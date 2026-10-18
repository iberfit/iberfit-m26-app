-- P0 bootstrap authorization evaluation cache.
-- QA migration ledger version: 20261018214135.
-- Reduce repeated role lookups inside authenticated bootstrap authorization.
-- Preserve role decisions, assignment scope, SECURITY DEFINER attributes and EXECUTE ACL.
-- Do not alter RLS, grants, ownership, Auth/WebAuthn or statement_timeout.

SELECT 1 / (CASE WHEN
  md5(replace(pg_get_functiondef('public.iberfit_current_role_v26()'::regprocedure), E'\\r',''))
    = 'b4cdfd4d8ce6d71e87a512ec626426b6'
  THEN 1 ELSE 0 END)
AS "P0_BOOTSTRAP_ROLE_BASELINE_CHANGED_REVIEW_REQUIRED";

SELECT 1 / (CASE WHEN
  md5(replace(pg_get_functiondef('public.iberfit_can_access_client_v26(uuid)'::regprocedure), E'\\r',''))
    = 'b2bec4b31c6edbc6bd21fe40253c752a'
  THEN 1 ELSE 0 END)
AS "P0_BOOTSTRAP_ACCESS_BASELINE_CHANGED_REVIEW_REQUIRED";

SELECT 1 / (CASE WHEN NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_roles r ON r.oid=p.proowner
  WHERE p.oid IN (
    'public.iberfit_current_role_v26()'::regprocedure,
    'public.iberfit_can_access_client_v26(uuid)'::regprocedure
  )
    AND (
      r.rolname <> 'postgres'
      OR NOT p.prosecdef
      OR p.provolatile <> 's'
      OR NOT (p.proconfig @> ARRAY['search_path=""']::text[])
      OR NOT (coalesce(p.proacl,'{}'::aclitem[]) @> ARRAY[
        'postgres=X/postgres'::aclitem,
        'service_role=X/postgres'::aclitem,
        'authenticated=X/postgres'::aclitem
      ])
      OR coalesce(p.proacl,'{}'::aclitem[]) @> ARRAY['anon=X/postgres'::aclitem]
    )
  )
  THEN 1 ELSE 0 END)
AS "P0_BOOTSTRAP_AUTHORIZATION_SECURITY_ATTRIBUTES_CHANGED";

CREATE OR REPLACE FUNCTION public.iberfit_current_role_v26()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role:=public.iberfit_role()::text;
  RETURN CASE v_role
    WHEN 'client' THEN 'cliente'
    ELSE coalesce(v_role,'sin_rol')
  END;
END
$function$
;

CREATE OR REPLACE FUNCTION public.iberfit_can_access_client_v26(p_client_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  v_role:=public.iberfit_current_role_v26();

  IF v_role='admin' THEN
    RETURN true;
  ELSIF v_role='coach' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.client_assignments a
      WHERE a.client_id=p_client_id
        AND a.coach_user_id=auth.uid()
        AND a.active
    );
  ELSIF v_role='cliente' THEN
    RETURN public.iberfit_client_id()=p_client_id;
  END IF;

  RETURN false;
END
$function$
;

SELECT 1 / (CASE WHEN
  md5(pg_get_functiondef('public.iberfit_current_role_v26()'::regprocedure))
    = 'aa12f60d12892506c8e08b0717aa8ee2'
  THEN 1 ELSE 0 END)
AS "P0_BOOTSTRAP_ROLE_OPTIMIZED_DEFINITION_MISMATCH";

SELECT 1 / (CASE WHEN
  md5(pg_get_functiondef('public.iberfit_can_access_client_v26(uuid)'::regprocedure))
    = 'c6e7dc2917170e35f7ec23dc31d8f964'
  THEN 1 ELSE 0 END)
AS "P0_BOOTSTRAP_ACCESS_OPTIMIZED_DEFINITION_MISMATCH";
