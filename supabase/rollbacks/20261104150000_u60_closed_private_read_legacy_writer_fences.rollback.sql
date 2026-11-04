-- IBERFIT U60 closed-stage rollback; run only through protected QA/release process.
-- Idempotently remove only U60 functions and triggers. Never delete data,
-- undo U30-U36, change canonical V26 commands, alter RLS or permissions.
DROP TRIGGER IF EXISTS u60_dated_execution_update_receipt
  ON public.session_executions;
DROP TRIGGER IF EXISTS u60_dated_execution_update_identity
  ON public.session_executions;
DROP TRIGGER IF EXISTS u60_occurrence_insert_fence
  ON public.training_session_occurrences_v1;
DROP TRIGGER IF EXISTS u60_active_lock_fence
  ON public.active_execution_locks_v26;
DROP TRIGGER IF EXISTS u60_typed_execution_fence
  ON public.session_executions;
DROP FUNCTION IF EXISTS private.iberfit_u60_dated_mirror_receipt_guard_v1();
DROP FUNCTION IF EXISTS private.iberfit_u60_dated_execution_identity_guard_v1();
DROP FUNCTION IF EXISTS private.iberfit_u60_occurrence_insert_fence_v1();
DROP FUNCTION IF EXISTS private.iberfit_u60_active_lock_fence_v1();
DROP FUNCTION IF EXISTS private.iberfit_u60_typed_execution_fence_v1();
DROP FUNCTION IF EXISTS public.iberfit_occurrence_api_u60_v1(text,jsonb);
DROP FUNCTION IF EXISTS public.iberfit_occurrence_detail_v1(uuid,uuid);
DROP FUNCTION IF EXISTS private.iberfit_u60_occurrence_detail_v1(uuid,uuid);
