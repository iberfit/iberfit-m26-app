-- U38 explicit QA-only rollback. RESTRICT-only; no user data mutation.
BEGIN;
SELECT 1/(CASE WHEN (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')='QA'
 THEN 1 ELSE 0 END) AS u38_qa_only;
DROP FUNCTION IF EXISTS public.iberfit_privileged_history_page_u38_qa(
  uuid,text,timestamptz,jsonb,bigint,integer
) RESTRICT;
DROP FUNCTION IF EXISTS private.iberfit_history_page_internal_u38_qa(
  uuid,text,timestamptz,jsonb,bigint,integer
) RESTRICT;
SELECT 1/(CASE WHEN
 to_regprocedure('public.iberfit_privileged_history_page_u38_qa(uuid,text,timestamptz,jsonb,bigint,integer)') IS NULL
 AND to_regprocedure('private.iberfit_history_page_internal_u38_qa(uuid,text,timestamptz,jsonb,bigint,integer)') IS NULL
 THEN 1 ELSE 0 END) AS u38_rollback_confirmed;
COMMIT;
