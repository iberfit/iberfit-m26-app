-- CANDIDATE ONLY. Not a migration, not applied. Generate protected migration
-- with Supabase CLI after testing on restored PROD schema. QA lacks the V46 PROD gate.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
  IF to_regclass('public.m26_wearable_v46_release_control_prod') IS NULL
     OR to_regprocedure('public.m26_wearable_v46_my_summary_prod_v1()') IS NULL THEN
    RAISE EXCEPTION 'M26_V48_BASELINE_REQUIRED';
  END IF;
  IF md5(pg_get_functiondef('public.m26_wearable_v46_my_summary_prod_v1()'::regprocedure))
      <> '6dbbb0b2fb17b97fb10cdfb4a158dd33' THEN
    RAISE EXCEPTION 'M26_V48_SUMMARY_DRIFT';
  END IF;
  IF to_regprocedure('public.m26_wearable_v48_my_activity_page_prod_v1(timestamptz,uuid)') IS NOT NULL
     OR to_regprocedure('private.m26_wearable_v48_activity_page_internal(timestamptz,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'M26_V48_ALREADY_INSTALLED';
  END IF;
END $guard$;

CREATE FUNCTION private.m26_wearable_v48_activity_page_internal(
  p_before_started_at timestamptz,p_before_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_owner uuid := (SELECT auth.uid());
  v_client uuid := public.iberfit_client_id();
  v_auth jsonb;
  v_exercise boolean;
  v_hr boolean;
  v_result jsonb;
BEGIN
  IF v_owner IS NULL OR v_client IS NULL
    OR public.iberfit_current_role_v26() IS DISTINCT FROM 'cliente'
    OR NOT EXISTS(SELECT 1 FROM public.user_profiles p
      WHERE p.user_id=v_owner AND p.client_id=v_client AND p.role::text='client')
    OR ((p_before_started_at IS NULL) <> (p_before_id IS NULL))
    OR (p_before_started_at IS NOT NULL AND NOT pg_catalog.isfinite(p_before_started_at)) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V48_ACTIVITY_FORBIDDEN';
  END IF;
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF NOT EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod
    WHERE id=true AND enabled=true) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='M26_V48_ACTIVITY_DISABLED';
  END IF;
  -- Non-blocking serialization with the existing import/revoke/delete fence.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint)) THEN
    RAISE EXCEPTION USING ERRCODE='55P03',MESSAGE='M26_V48_ACTIVITY_RETRY';
  END IF;
  v_auth:=public.m26_wearable_authorization_status_v2('health_connect');
  v_exercise:=coalesce(v_auth->>'authorized'='true',false)
    AND coalesce((v_auth->'scopes')?'exerciseSessions',false);
  v_hr:=v_exercise AND coalesce((v_auth->'scopes')?'generalHeartRate',false);
  -- Disconnect preserves the owner's retained observations. They are labeled
  -- historical, never promoted to current authorization; no professional access.
  WITH candidates AS (
    SELECT w.id,w.sport,w.observed_started_at,w.observed_ended_at,
      w.distance_meters,w.heart_rate_samples,w.heart_rate_avg,
      coalesce(v_exercise AND w.grant_id=(v_auth->>'grantId')::uuid
        AND w.revocation_cursor=(v_auth->>'revocationCursor')::bigint,false) AS current_grant
    FROM public.m26_wearable_exercise_evidence_v46 w
    WHERE w.owner_user_id=v_owner AND w.client_id=v_client
      AND w.provider='health_connect' AND w.link_status='unlinked'
      AND (p_before_started_at IS NULL OR
        (w.observed_started_at,w.id)<(p_before_started_at,p_before_id))
    ORDER BY w.observed_started_at DESC,w.id DESC LIMIT 21
  ), page AS (
    SELECT * FROM candidates ORDER BY observed_started_at DESC,id DESC LIMIT 20
  ), last_row AS (
    SELECT * FROM page ORDER BY observed_started_at ASC,id ASC LIMIT 1
  )
  SELECT pg_catalog.jsonb_build_object(
    'ok',true,'schema','iberfit.connected360.activity-page.v1','provider','health_connect',
    'exerciseEvidence',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',id,'sport',sport,
        'startedAt',pg_catalog.to_char(observed_started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'endedAt',pg_catalog.to_char(observed_ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'distanceMeters',distance_meters,
        'heartRateSamples',CASE WHEN v_hr AND current_grant THEN heart_rate_samples END,
        'avgBpm',CASE WHEN v_hr AND current_grant AND heart_rate_samples>0 THEN heart_rate_avg END,
        'authorizationState',CASE WHEN current_grant THEN 'current' ELSE 'retained' END,
        'linkedToTraining',false
      ) ORDER BY observed_started_at DESC,id DESC) FROM page
    ),'[]'::jsonb),
    'nextCursor',CASE WHEN (SELECT count(*) FROM candidates)>20 THEN (
      SELECT pg_catalog.jsonb_build_object('id',id,'startedAt',
        pg_catalog.to_char(observed_started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
      FROM last_row
    ) ELSE NULL END
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION private.m26_wearable_v48_activity_page_internal(timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.m26_wearable_v48_activity_page_internal(timestamptz,uuid) TO authenticated;
CREATE FUNCTION public.m26_wearable_v48_my_activity_page_prod_v1(
  p_before_started_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$
  SELECT private.m26_wearable_v48_activity_page_internal(p_before_started_at,p_before_id)
$function$;
REVOKE ALL ON FUNCTION public.m26_wearable_v48_my_activity_page_prod_v1(timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v48_my_activity_page_prod_v1(timestamptz,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.m26_wearable_v46_my_summary_prod_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $my_summary$
DECLARE
  v_owner uuid:=(SELECT auth.uid());
  v_client uuid:=public.iberfit_client_id();
  v_hr jsonb;
  v_workouts jsonb;
  v_auth jsonb;
  v_history boolean := false;
  v_exercise boolean := false;
  v_pulse boolean := false;
BEGIN
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF v_owner IS NULL OR v_client IS NULL THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_CLIENT_REQUIRED',ERRCODE='42501';
  END IF;
  -- Additive capability: the legacy owner summary remains usable if the
  -- new history feature is disabled. Require the live profile as well as JWT.
  v_history:=public.iberfit_current_role_v26()='cliente'
    AND EXISTS (SELECT 1 FROM public.user_profiles p
      WHERE p.user_id=v_owner AND p.client_id=v_client AND p.role::text='client')
    AND EXISTS (SELECT 1 FROM public.m26_wearable_v46_release_control_prod
      WHERE id=true AND enabled=true);
  IF v_history THEN
    v_auth:=public.m26_wearable_authorization_status_v2('health_connect');
    v_exercise:=coalesce(v_auth->>'authorized'='true',false)
      AND coalesce((v_auth->'scopes')?'exerciseSessions',false);
    v_pulse:=v_exercise AND coalesce((v_auth->'scopes')?'generalHeartRate',false);
  END IF;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('date',q.record_date,'samples',q.sample_count,
      'minBpm',q.heart_rate_min,'maxBpm',q.heart_rate_max,
      'sourceVerified',q.source_identity_verified)
    ORDER BY q.record_date DESC,q.imported_at DESC
  ),'[]'::jsonb) INTO v_hr
  FROM (
    SELECT record_date,sample_count,heart_rate_min,heart_rate_max,
           source_identity_verified,imported_at
    FROM public.m26_wearable_heart_rate_daily_v46
    WHERE owner_user_id=v_owner AND client_id=v_client
      AND record_date>=((now() AT TIME ZONE 'America/Santiago')::date-6)
    ORDER BY record_date DESC,imported_at DESC LIMIT 7
  ) q;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('sport',w.sport,'startedAt',w.observed_started_at,
      'endedAt',w.observed_ended_at,'distanceMeters',w.distance_meters,
      'heartRateSamples',w.heart_rate_samples,
      'avgBpm',CASE WHEN v_pulse AND w.current_grant AND w.heart_rate_samples>0 THEN w.heart_rate_avg END,
      'authorizationState',CASE WHEN NOT v_history THEN 'unknown' WHEN w.current_grant THEN 'current' ELSE 'retained' END,
      'sourceVerified',false,'linkedToTraining',false)
    ORDER BY w.observed_started_at DESC,w.id DESC
  ),'[]'::jsonb) INTO v_workouts
  FROM (
    SELECT id,sport,observed_started_at,observed_ended_at,
      distance_meters,heart_rate_samples,heart_rate_avg,
      coalesce(v_exercise AND grant_id=(v_auth->>'grantId')::uuid
        AND revocation_cursor=(v_auth->>'revocationCursor')::bigint,false) AS current_grant
    FROM public.m26_wearable_exercise_evidence_v46
    WHERE owner_user_id=v_owner AND client_id=v_client
      AND observed_started_at>=now()-interval '7 days'
    ORDER BY observed_started_at DESC,id DESC LIMIT 10
  ) w;
  RETURN jsonb_build_object(
    'ok',true,'provider','health_connect','heartRateDaily',v_hr,
    'exerciseEvidence',v_workouts,'restingHeartRate',null,
    'clinicalInterpretation',false,'activityHistoryAvailable',v_history
  );
END;
$my_summary$;
REVOKE ALL ON FUNCTION public.m26_wearable_v46_my_summary_prod_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v46_my_summary_prod_v1() TO authenticated;
COMMIT;
