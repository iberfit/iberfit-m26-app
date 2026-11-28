-- CANDIDATE ONLY; requires certified V48–V54. No activation or writes.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
 IF to_regprocedure('private.m26_v53_apple_exercise_status()') IS NULL
 OR to_regprocedure('private.m26_v54_import_apple_exercise(uuid,jsonb)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.m26_wearable_exercise_evidence_v46'::regclass AND conname='m26_v51_apple_workout_minimal_check' AND convalidated)
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.m26_wearable_exercise_evidence_v46'::regclass AND relrowsecurity AND relforcerowsecurity)
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(role_name)
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) a(action)
 WHERE has_table_privilege(r.role_name,'public.m26_wearable_exercise_evidence_v46',a.action))
 OR EXISTS(SELECT 1 FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='m26_wearable_exercise_evidence_v46' AND grantee IN ('anon','authenticated','PUBLIC'))
 THEN RAISE EXCEPTION 'M26_V55_PREREQUISITES_REQUIRED'; END IF;
END $guard$;
-- Reuse the V53 status function and its owner/client transaction fence.
-- Retained history stays readable to its owner after source disconnect or
-- disabling the writer; it never becomes current professional evidence.
CREATE FUNCTION private.m26_v55_apple_owner_history(p_before_started_at timestamptz,p_before_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_owner uuid:=auth.uid(); v_client uuid:=private.m26_v53_apple_client_context();
 v_status jsonb; v_result jsonb;
BEGIN
 IF ((p_before_started_at IS NULL)<>(p_before_id IS NULL))
 OR (p_before_started_at IS NOT NULL AND NOT pg_catalog.isfinite(p_before_started_at))
 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='M26_V55_CURSOR_INVALID'; END IF;
 v_status:=private.m26_v53_apple_exercise_status();
 IF private.m26_v53_apple_client_context() IS DISTINCT FROM v_client
 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V55_OWNER_CHANGED'; END IF;
 WITH candidates AS (
  SELECT w.id,w.sport,w.observed_started_at,w.observed_ended_at,w.active_seconds,w.distance_meters,
   coalesce(v_status->>'authorized'='true' AND w.grant_id=(v_status->>'grantId')::uuid
   AND w.revocation_cursor=(v_status->>'revocationCursor')::bigint,false) AS current_grant
  FROM public.m26_wearable_exercise_evidence_v46 w
  WHERE w.owner_user_id=v_owner AND w.client_id=v_client AND w.provider='apple_health'
   AND w.link_status='unlinked' AND w.observed_ended_at<=pg_catalog.now()
   AND (p_before_started_at IS NULL OR (w.observed_started_at,w.id)<(p_before_started_at,p_before_id))
  ORDER BY w.observed_started_at DESC,w.id DESC LIMIT 21
 ), page AS (
  SELECT * FROM candidates ORDER BY observed_started_at DESC,id DESC LIMIT 20
 ), last_row AS (
  SELECT * FROM page ORDER BY observed_started_at ASC,id ASC LIMIT 1
 )
 SELECT jsonb_build_object('ok',true,'schema','iberfit.connected360.apple.activity-page.v1','provider','apple_health',
 'exerciseEvidence',coalesce((SELECT jsonb_agg(jsonb_build_object(
 'id',id,'sport',sport,
 'startedAt',pg_catalog.to_char(observed_started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'endedAt',pg_catalog.to_char(observed_ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'activeSeconds',active_seconds,'distanceMeters',distance_meters,
 'authorizationState',CASE WHEN current_grant THEN 'current' ELSE 'retained' END,
 'linkedToTraining',false) ORDER BY observed_started_at DESC,id DESC) FROM page),'[]'::jsonb),
 'nextCursor',CASE WHEN (SELECT count(*) FROM candidates)>20 THEN
 (SELECT jsonb_build_object('id',id,'startedAt',pg_catalog.to_char(observed_started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) FROM last_row)
 ELSE NULL END) INTO v_result;
 RETURN v_result;
END;
$f$;
REVOKE ALL ON FUNCTION private.m26_v55_apple_owner_history(timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.m26_v55_apple_owner_history(timestamptz,uuid) TO authenticated;
CREATE FUNCTION public.m26_wearable_v55_apple_owner_history_v1(p_before_started_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $f$ SELECT private.m26_v55_apple_owner_history(p_before_started_at,p_before_id) $f$;
REVOKE ALL ON FUNCTION public.m26_wearable_v55_apple_owner_history_v1(timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v55_apple_owner_history_v1(timestamptz,uuid) TO authenticated;
COMMIT;
