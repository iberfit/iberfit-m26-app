-- First aid: disable only the compact pilot, leave complete-history paging intact.
-- This changes one QA feature flag, never sessions/records/RLS.
DO $flag$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')
    IS DISTINCT FROM 'QA' THEN
   RAISE EXCEPTION 'P0_FREE_COMPACT_QA_ONLY' USING ERRCODE='42501';
 END IF;
 DELETE FROM public.iberfit_system_settings
 WHERE key='free_client_compact_legacy_refs_qa';
END $flag$;
