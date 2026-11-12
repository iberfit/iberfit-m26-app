-- IBERFIT M1 / U60: guarded emergency rollback of both public U60
-- entrypoints. Existing confirmed executions remain intact; do NOT delete
-- training/session occurrences, reports or history.
BEGIN;
DO $u60_rollback$
DECLARE
  v_source record;
BEGIN
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings
      WHERE key='environment') IS DISTINCT FROM 'PRODUCTION' THEN
    RAISE EXCEPTION 'U60_ROLLBACK_PROD_ONLY' USING errcode='42501';
  END IF;
  FOR v_source IN
    SELECT req.signature,req.expected_hash,p.oid
    FROM (VALUES
      ('public.iberfit_occurrence_api_u60_v1(text,jsonb)',
       '5914acf371015a6bbeeaf95f99e056e3'),
      ('public.iberfit_occurrence_detail_v1(uuid,uuid)',
       '00b8ee39c85fd92f593732c055902cf2')
    ) req(signature,expected_hash)
    LEFT JOIN pg_proc p ON p.oid=to_regprocedure(req.signature)
  LOOP
    IF v_source.oid IS NULL
      OR md5(pg_get_functiondef(v_source.oid)) IS DISTINCT FROM v_source.expected_hash
      OR NOT has_function_privilege('authenticated',v_source.oid,'EXECUTE')
      OR has_function_privilege('anon',v_source.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'U60_ROLLBACK_SOURCE_OR_ACL_DRIFT:%',v_source.signature
        USING errcode='42501';
    END IF;
  END LOOP;
END
$u60_rollback$;
REVOKE EXECUTE ON FUNCTION public.iberfit_occurrence_api_u60_v1(text,jsonb)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)
  FROM authenticated;
DO $u60_check$
BEGIN
  IF has_function_privilege('authenticated',
    'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated',
    'public.iberfit_occurrence_detail_v1(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'U60_ROLLBACK_NOT_CLOSED' USING errcode='42501';
  END IF;
END
$u60_check$;
COMMIT;
