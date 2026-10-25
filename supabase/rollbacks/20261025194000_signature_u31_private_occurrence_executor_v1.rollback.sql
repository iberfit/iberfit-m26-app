-- U31 staging function rollback. Fail closed if any persisted U31 command
-- exists: removing a live command handler without an explicit replacement
-- would strand per-date executions and queued mobile work.
BEGIN;
SET LOCAL lock_timeout='1500ms';
SELECT 1 / CASE WHEN NOT EXISTS (
  SELECT 1 FROM public.command_receipts_v26
  WHERE entity_type='training_occurrence'
    AND command_type IN (
      'OCURRENCIA_CONFIRMAR','OCURRENCIA_INICIAR','OCURRENCIA_COMPLETAR'
    )
) THEN 1 ELSE 0 END AS u31_rollback_requires_no_persisted_commands;
DROP FUNCTION private.iberfit_u31_occurrence_transition_v1(jsonb);
COMMIT;
