-- IBERFIT C / Connected360 V47: last seven available owner-scoped observations.
-- No arbitrary age expiry: stale samples remain dated historical context only.
-- No new requests, grants, data writes, tables, or indexes. This is NOT an
-- expansion of native Health Connect collection or consent permissions.
-- Indexed lookup uses existing unique (owner_user_id,client_id,provider,record_date).
-- Never apply directly in PROD: require M44 fresh restored backup, QA equivalence,
-- protected SQL release, authenticated negative role/tenant tests and rollback.
-- Revert with supabase/rollbacks/20261111131000_connected360_v47_last_seven_owner_history.rollback.sql.
CREATE OR REPLACE FUNCTION public.m26_wearable_v47_my_daily_prod_v1()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $v47_read$
DECLARE
  v_owner uuid:=(SELECT auth.uid());
  v_client uuid:=public.iberfit_client_id();
  v_rows jsonb;
BEGIN
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF v_owner IS NULL OR v_client IS NULL THEN
    RAISE EXCEPTION USING MESSAGE='M26_V47_CLIENT_REQUIRED',ERRCODE='42501';
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'date',q.record_date,
    'steps',q.steps,'sleepMinutes',q.sleep_minutes,
    'restingHeartRate',q.resting_heart_rate,
    'acquiredAt',q.acquired_at,'sourceVerified',false
  ) ORDER BY q.record_date DESC),'[]'::jsonb) INTO v_rows
  FROM (
    SELECT record_date,steps,sleep_minutes,resting_heart_rate,acquired_at
    FROM public.m26_wearable_daily_health_v47
    WHERE owner_user_id=v_owner AND client_id=v_client
      AND provider='health_connect'
      AND record_date<=(now() AT TIME ZONE aggregation_time_zone)::date
    ORDER BY record_date DESC LIMIT 7
  ) q;
  RETURN pg_catalog.jsonb_build_object('ok',true,'provider','health_connect',
    'dailyHealth',v_rows,'sourceIdentityVerified',false);
END;
$v47_read$;
REVOKE ALL ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() TO authenticated;
