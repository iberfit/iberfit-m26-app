-- P0 #1209 · QA-only clean rollback; no table data affected.
DO $preflight$
BEGIN
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings
      WHERE key='environment') IS DISTINCT FROM 'QA' THEN
    RAISE EXCEPTION 'FREE_HISTORY_QA_ONLY' USING ERRCODE='42501';
  END IF;
  IF to_regprocedure('public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,integer)') IS NULL THEN
    RAISE EXCEPTION 'FREE_HISTORY_ROLLBACK_FUNCTION_MISSING' USING ERRCODE='42501';
  END IF;
END $preflight$;
DROP FUNCTION public.iberfit_client_completed_history_page_free_v1(
  text,timestamp with time zone,jsonb,bigint,integer);
