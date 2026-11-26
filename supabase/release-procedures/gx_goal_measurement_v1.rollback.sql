-- Rollback only after reverting the compatible frontend and fencing new writes.
-- Does not delete or rewrite goalMeasurement data. Existing goal records remain private.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.domain_entities_v26 IN SHARE ROW EXCLUSIVE MODE;
DO $gx_rollback$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.iberfit_m43_client_safe_plan_v2(jsonb)') AND md5(prosrc)='f3d8c51d0f6fecacff08270385bb31da' AND proacl::text='{postgres=X/postgres,service_role=X/postgres}' AND NOT prosecdef) THEN
   RAISE EXCEPTION 'GX_GOAL_ROLLBACK_PROJECTION_DRIFT';
 END IF;
END;
$gx_rollback$;
CREATE OR REPLACE FUNCTION public.iberfit_m43_client_safe_plan_v2(p_body jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT public.iberfit_m43_client_scalar_fields_v1(p_body,
   ARRAY['id','clientId','name','title','goal','summary','startDate','endDate',
         'modality','weeklyFrequency','sessionDurationMinutes','status','createdAt',
         'updatedAt','approvedAt','publishedAt','revision','publishedRevision',
         'visibleToClient']::text[]);
$function$;
DROP TRIGGER iberfit_gx_goal_guard_v1 ON public.domain_entities_v26;
DROP FUNCTION private.iberfit_gx_goal_guard_v1();
DROP FUNCTION private.iberfit_gx_goal_anchor_measurement_v1(jsonb,jsonb);
DROP FUNCTION private.iberfit_gx_goal_definition_v1(jsonb,date);
DO $gx_after_rollback$
BEGIN
 IF md5(pg_get_functiondef('public.iberfit_m43_client_safe_plan_v2(jsonb)'::regprocedure))<>'56ee5426a2a83ea3ad00fd863f65e007' THEN RAISE EXCEPTION 'GX_GOAL_ROLLBACK_NOT_EXACT'; END IF;
END;
$gx_after_rollback$;
COMMIT;
