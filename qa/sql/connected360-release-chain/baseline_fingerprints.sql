-- Four prerequisite fingerprints must match the actual hosted V46 baseline.
-- Do not replace expected hashes with hashes of the fixture.
DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.m26_wearable_v46_my_summary_prod_v1()'::regprocedure)) IS DISTINCT FROM '6dbbb0b2fb17b97fb10cdfb4a158dd33'
 OR md5(pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure)) IS DISTINCT FROM '28bb4b1e77b2d64e2c579e2eeb50eb23'
 OR md5(pg_get_functiondef('public.m26_wearable_v46_import_prod_v1(uuid,jsonb)'::regprocedure)) IS DISTINCT FROM '01e380756bb0bb584b95459e16bad689'
 OR md5(pg_get_functiondef('public.m26_wearable_v46_capabilities_prod_v1()'::regprocedure)) IS DISTINCT FROM '0049ade9c829d330ba8db94381a35666'
 THEN RAISE EXCEPTION 'CONNECTED360_CHAIN_V46_BASELINE_DRIFT'; END IF;
END
$guard$;
