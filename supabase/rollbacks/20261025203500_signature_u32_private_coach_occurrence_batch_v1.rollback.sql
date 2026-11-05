-- SIGNATURE U32 staging-only handler rollback; never orphan persisted batches.
-- Release blocker: do not remove an active scheduling command handler when
-- any successful Coach batch is recorded; keep all training/date history.
BEGIN;
SET LOCAL lock_timeout='1500ms';
SELECT 1 / CASE WHEN NOT EXISTS(
  SELECT 1 FROM public.command_receipts_v26
  WHERE entity_type='training_occurrence_batch'
    AND command_type='OCURRENCIAS_CREAR_LOTE'
) THEN 1 ELSE 0 END AS u32_rollback_requires_no_batch_receipts;
DROP FUNCTION private.iberfit_u32_create_occurrences_batch_v1(jsonb);
DROP FUNCTION private.iberfit_u32_build_execution_queue_v1(jsonb);
COMMIT;
