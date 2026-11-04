-- U30 staging-only controlled rollback. Never execute after real
-- occurrences/executions exist: preserves every history row or fails closed.
-- Leaves PR #1072 same-Client invariant and all legacy tables intact.
BEGIN;
SET LOCAL lock_timeout='1500ms';

SELECT 1 / CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.training_session_occurrences_v1)
  AND NOT EXISTS (
    SELECT 1 FROM public.session_executions
    WHERE occurrence_id IS NOT NULL
  )
THEN 1 ELSE 0 END AS u30_rollback_requires_zero_occurrence_history;

ALTER TABLE public.session_executions
  DROP CONSTRAINT u30_execution_occurrence_client_session_fk;
DROP INDEX public.u30_execution_one_per_occurrence;
ALTER TABLE public.session_executions DROP COLUMN occurrence_id;
DROP TABLE public.training_session_occurrences_v1;
DROP FUNCTION public.iberfit_u30_occurrence_snapshot_guard_v1();
ALTER TABLE public.appointments DROP CONSTRAINT appointments_id_client_session_u30_key;
COMMIT;
