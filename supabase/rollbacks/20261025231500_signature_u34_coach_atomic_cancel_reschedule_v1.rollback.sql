DO $rollback$
BEGIN
 IF EXISTS(SELECT 1 FROM public.command_receipts_v26
 WHERE command_type IN ('OCURRENCIA_CANCELAR','OCURRENCIA_REPROGRAMAR')
 AND entity_type='training_occurrence')
 THEN RAISE EXCEPTION 'u34_rollback_requires_no_persisted_change_receipts';END IF;
END $rollback$;
DROP FUNCTION IF EXISTS private.iberfit_u34_coach_occurrence_change_v1(jsonb);
