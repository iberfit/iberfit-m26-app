-- First aid: restores full remote revision map without touching actual check-ins.
DO $flag$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')
   IS DISTINCT FROM 'QA' THEN RAISE EXCEPTION 'P0_QA_ONLY' USING ERRCODE='42501'; END IF;
 DELETE FROM public.iberfit_system_settings
 WHERE key='free_client_hide_qa_fixture_checkin_revisions_v1';
END $flag$;
