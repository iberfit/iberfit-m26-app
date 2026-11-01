-- Turn on only after QA migration, source hash and E2E gates pass.
DO $flag$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')
   IS DISTINCT FROM 'QA' THEN RAISE EXCEPTION 'P0_QA_ONLY' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_v65e()'::regprocedure))
   <> '384fc9f71774e79a6aad987ad67a0c9a' THEN RAISE EXCEPTION 'P0_QA_SOURCE_DRIFT' USING ERRCODE='42501'; END IF;
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings
      WHERE key='free_client_compact_legacy_refs_qa') IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'P0_QA_EXISTING_PILOT_REQUIRED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.iberfit_system_settings(key,value,updated_at)
 VALUES('free_client_hide_qa_fixture_checkin_revisions_v1','true'::jsonb,now())
 ON CONFLICT (key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
END $flag$;
