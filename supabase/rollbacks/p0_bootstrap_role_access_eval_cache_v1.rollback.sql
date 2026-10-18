-- Roll back only the P0 role/access evaluation-cache optimization.
-- Restore the exact pre-change authorization logic without changing ACL/RLS/timeouts.

SELECT 1 / (CASE WHEN
  md5(pg_get_functiondef('public.iberfit_current_role_v26()'::regprocedure))
    = 'aa12f60d12892506c8e08b0717aa8ee2'
  THEN 1 ELSE 0 END)
AS "P0_BOOTSTRAP_ROLE_ROLLBACK_REVIEW_REQUIRED";

SELECT 1 / (CASE WHEN
  md5(pg_get_functiondef('public.iberfit_can_access_client_v26(uuid)'::regprocedure))
    = 'c6e7dc2917170e35f7ec23dc31d8f964'
  THEN 1 ELSE 0 END)
AS "P0_BOOTSTRAP_ACCESS_ROLLBACK_REVIEW_REQUIRED";

CREATE OR REPLACE FUNCTION public.iberfit_current_role_v26()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case coalesce(public.iberfit_role()::text,'sin_rol')
    when 'client' then 'cliente'
    else coalesce(public.iberfit_role()::text,'sin_rol')
  end
$function$
;

CREATE OR REPLACE FUNCTION public.iberfit_can_access_client_v26(p_client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when auth.uid() is null then false
    when public.iberfit_current_role_v26()='admin' then true
    when public.iberfit_current_role_v26()='coach' then public.is_assigned_coach(p_client_id)
    when public.iberfit_current_role_v26()='cliente' then public.iberfit_client_id()=p_client_id
    else false
  end
$function$
;

SELECT 1 / (CASE WHEN
  md5(pg_get_functiondef('public.iberfit_current_role_v26()'::regprocedure))
    = 'b4cdfd4d8ce6d71e87a512ec626426b6'
  THEN 1 ELSE 0 END)
AS "P0_BOOTSTRAP_ROLE_BASELINE_RESTORE_MISMATCH";

SELECT 1 / (CASE WHEN
  md5(pg_get_functiondef('public.iberfit_can_access_client_v26(uuid)'::regprocedure))
    = 'b2bec4b31c6edbc6bd21fe40253c752a'
  THEN 1 ELSE 0 END)
AS "P0_BOOTSTRAP_ACCESS_BASELINE_RESTORE_MISMATCH";
