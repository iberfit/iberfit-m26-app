-- Connected360 V47 P0: bounded own history without additional RPC requests.
-- Existing Client authenticated function, no arguments and same JSON shape.
-- Safely includes up to seven actual observation dates within the last 30
-- local civil days. No new category, grant, write, table or PII capability.
-- Rollback: replace date window -29 with original -6 and keep the same
-- owner/privileged-assurance and seven-row clauses (old migration 20261012230000).
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
      AND record_date>=(now() AT TIME ZONE aggregation_time_zone)::date-29
      AND record_date<=(now() AT TIME ZONE aggregation_time_zone)::date
    ORDER BY record_date DESC LIMIT 7
  ) q;
  RETURN pg_catalog.jsonb_build_object('ok',true,'provider','health_connect',
    'dailyHealth',v_rows,'sourceIdentityVerified',false);
END;
$v47_read$;
REVOKE ALL ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() TO authenticated;
