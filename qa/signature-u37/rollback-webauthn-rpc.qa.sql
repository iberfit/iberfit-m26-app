-- IBERFIT U37 QA-only rollback for the seven versioned candidate functions.
-- Must be used ONLY with explicit QA environment, source signatures and
-- a verified current deployment where no dependent objects exist.
-- Removes only functions introduced by U37; never touches tables,
-- sessions, auth, RLS, grants of existing functions or user data.
BEGIN;
SELECT 1/(CASE WHEN EXISTS (
  SELECT 1 FROM public.iberfit_system_settings
  WHERE key='environment' AND value#>>'{}'='QA'
) THEN 1 ELSE 0 END) AS u37_rollback_must_be_qa;
DROP FUNCTION IF EXISTS public.iberfit_privileged_history_page_u37_qa(
  uuid,text,timestamptz,jsonb,bigint,integer
) RESTRICT;
DROP FUNCTION IF EXISTS public.iberfit_bootstrap_v26_core_u37_qa() RESTRICT;
DROP FUNCTION IF EXISTS private.iberfit_history_page_internal_u37_qa(
  uuid,text,timestamptz,jsonb,bigint,integer
) RESTRICT;
DROP FUNCTION IF EXISTS private.iberfit_bootstrap_v26_full_core_internal_u37_qa() RESTRICT;
DROP FUNCTION IF EXISTS private.iberfit_bootstrap_v26_pre_person_service_core_u37_qa() RESTRICT;
DROP FUNCTION IF EXISTS private.iberfit_bootstrap_v26_pre_v65e_core_u37_qa() RESTRICT;
DROP FUNCTION IF EXISTS private.iberfit_bootstrap_v26_rc29_core_u37_qa() RESTRICT;
SELECT 1/(CASE WHEN
  to_regprocedure('public.iberfit_bootstrap_v26_core_u37_qa()') IS NULL
  AND to_regprocedure('public.iberfit_privileged_history_page_u37_qa(uuid,text,timestamptz,jsonb,bigint,integer)') IS NULL
  AND to_regprocedure('private.iberfit_bootstrap_v26_rc29_core_u37_qa()') IS NULL
THEN 1 ELSE 0 END) AS u37_rollback_confirmed;
COMMIT;
