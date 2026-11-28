-- Hosted cleanup was originally installed with CRLF inside the function body.
-- Its LF-normalized definition is byte-identical to the historical migration.
-- Reproduce this exact catalog representation ONLY in disposable PG17.
DO $restore$
DECLARE
 d text := pg_get_functiondef('public.m26_wearable_v46_cleanup_prod_v1()'::regprocedure);
 delimiter text := '$function$';
BEGIN
 IF md5(d) = '28bb4b1e77b2d64e2c579e2eeb50eb23' THEN RETURN; END IF;
 IF md5(d) IS DISTINCT FROM '62fe6921b08b96bb51323c49e4ebdbbf'
    OR length(d)-length(replace(d,delimiter,'')) <> 2*length(delimiter)
 THEN RAISE EXCEPTION 'CONNECTED360_CHAIN_CLEANUP_UNEXPECTED_DEFINITION'; END IF;
 EXECUTE split_part(d,delimiter,1)||delimiter||
   replace(split_part(d,delimiter,2),chr(10),chr(13)||chr(10))||
   delimiter||split_part(d,delimiter,3);
END
$restore$;

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
