-- Restore exact checked-in V46 summary. Disable/revert V48 consumer first.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE OR REPLACE FUNCTION public.m26_wearable_v46_my_summary_prod_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $my_summary$
DECLARE
  v_owner uuid:=(SELECT auth.uid());
  v_client uuid:=public.iberfit_client_id();
  v_hr jsonb;
  v_workouts jsonb;
BEGIN
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF v_owner IS NULL OR v_client IS NULL THEN
    RAISE EXCEPTION USING MESSAGE='M26_V46_CLIENT_REQUIRED',ERRCODE='42501';
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
      'sourceVerified',false,'linkedToTraining',false)
    ORDER BY w.observed_started_at DESC
  ),'[]'::jsonb) INTO v_workouts
  FROM (
    SELECT sport,observed_started_at,observed_ended_at,
      distance_meters,heart_rate_samples
    FROM public.m26_wearable_exercise_evidence_v46
    WHERE owner_user_id=v_owner AND client_id=v_client
      AND observed_started_at>=now()-interval '7 days'
    ORDER BY observed_started_at DESC LIMIT 10
  ) w;
  RETURN jsonb_build_object(
    'ok',true,'provider','health_connect','heartRateDaily',v_hr,
    'exerciseEvidence',v_workouts,'restingHeartRate',null,
    'clinicalInterpretation',false
  );
END;
$my_summary$;
REVOKE ALL ON FUNCTION public.m26_wearable_v46_my_summary_prod_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v46_my_summary_prod_v1() TO authenticated;
DROP FUNCTION public.m26_wearable_v48_my_activity_page_prod_v1(timestamptz,uuid);
DROP FUNCTION private.m26_wearable_v48_activity_page_internal(timestamptz,uuid);
COMMIT;
