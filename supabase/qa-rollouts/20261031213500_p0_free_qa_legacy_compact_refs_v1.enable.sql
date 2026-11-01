-- Activate only after safe migration and parity preflight on QA Client A.
DO $flag$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')
    IS DISTINCT FROM 'QA' THEN
   RAISE EXCEPTION 'P0_FREE_COMPACT_QA_ONLY' USING ERRCODE='42501';
 END IF;
 IF md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))
    <> '1c7dc6b4f8b79cba0c072323412de9bb' THEN
   RAISE EXCEPTION 'P0_FREE_COMPACT_ACTIVATION_SOURCE_DRIFT' USING ERRCODE='42501';
 END IF;
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings
       WHERE key='free_client_completed_history_demand_qa') IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'P0_FREE_COMPACT_HISTORY_GATE_MISSING' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.iberfit_system_settings(key,value,updated_at)
 VALUES('free_client_compact_legacy_refs_qa','true'::jsonb,now())
 ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
END $flag$;
