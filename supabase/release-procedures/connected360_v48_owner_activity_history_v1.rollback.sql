-- Restore exact checked-in V46 summary. Disable/revert V48 consumer first.
BEGIN;
SET LOCAL lock_timeout='3s';
-- Exact fingerprint-pinned summary transformation; preserve OID, owner and ACL.
DO $patch$
DECLARE d text;
BEGIN
  d:=pg_get_functiondef('public.m26_wearable_v46_my_summary_prod_v1()'::regprocedure);
  IF md5(d) IS DISTINCT FROM '74ce2bde4cb3edef05b2be6e6ed0d071' THEN RAISE EXCEPTION 'M26_V48_SUMMARY_DRIFT'; END IF;
  d:=replace(d,$before$  v_workouts jsonb;
  v_auth jsonb;
  v_history boolean := false;
  v_exercise boolean := false;
  v_pulse boolean := false;
BEGIN$before$,$after$  v_workouts jsonb;
BEGIN$after$);
  d:=replace(d,$before$    RAISE EXCEPTION USING MESSAGE='M26_V46_CLIENT_REQUIRED',ERRCODE='42501';
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
$before$,$after$    RAISE EXCEPTION USING MESSAGE='M26_V46_CLIENT_REQUIRED',ERRCODE='42501';
  END IF;
$after$);
  d:=replace(d,$before$      'heartRateSamples',w.heart_rate_samples,
      'avgBpm',CASE WHEN v_pulse AND w.current_grant AND w.heart_rate_samples>0 THEN w.heart_rate_avg END,
      'authorizationState',CASE WHEN NOT v_history THEN 'unknown' WHEN w.current_grant THEN 'current' ELSE 'retained' END,
      'sourceVerified',false,'linkedToTraining',false)
    ORDER BY w.observed_started_at DESC,w.id DESC
$before$,$after$      'heartRateSamples',w.heart_rate_samples,
      'sourceVerified',false,'linkedToTraining',false)
    ORDER BY w.observed_started_at DESC
$after$);
  d:=replace(d,$before$    SELECT id,sport,observed_started_at,observed_ended_at,
      distance_meters,heart_rate_samples,heart_rate_avg,
      coalesce(v_exercise AND grant_id=(v_auth->>'grantId')::uuid
        AND revocation_cursor=(v_auth->>'revocationCursor')::bigint,false) AS current_grant
    FROM public.m26_wearable_exercise_evidence_v46
    WHERE owner_user_id=v_owner AND client_id=v_client
      AND provider='health_connect' AND link_status='unlinked'
      AND observed_started_at>=now()-interval '7 days'
    ORDER BY observed_started_at DESC,id DESC LIMIT 10$before$,$after$    SELECT sport,observed_started_at,observed_ended_at,
      distance_meters,heart_rate_samples
    FROM public.m26_wearable_exercise_evidence_v46
    WHERE owner_user_id=v_owner AND client_id=v_client
      AND observed_started_at>=now()-interval '7 days'
    ORDER BY observed_started_at DESC LIMIT 10$after$);
  d:=replace(d,$before$    'clinicalInterpretation',false,'activityHistoryAvailable',v_history
$before$,$after$    'clinicalInterpretation',false
$after$);
  IF md5(d) IS DISTINCT FROM '6dbbb0b2fb17b97fb10cdfb4a158dd33' THEN RAISE EXCEPTION 'M26_V48_SUMMARY_TRANSFORM_DRIFT'; END IF;
  EXECUTE d;
  IF md5(pg_get_functiondef('public.m26_wearable_v46_my_summary_prod_v1()'::regprocedure)) IS DISTINCT FROM '6dbbb0b2fb17b97fb10cdfb4a158dd33' THEN
    RAISE EXCEPTION 'M26_V48_SUMMARY_VERIFY_DRIFT';
  END IF;
END $patch$;
REVOKE ALL ON FUNCTION public.m26_wearable_v46_my_summary_prod_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v46_my_summary_prod_v1() TO authenticated;
DROP FUNCTION public.m26_wearable_v48_my_activity_page_prod_v1(timestamptz,uuid);
DROP FUNCTION private.m26_wearable_v48_activity_page_internal(timestamptz,uuid);
COMMIT;
