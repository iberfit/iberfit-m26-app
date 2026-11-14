-- IBERFIT M1 U72 QA rollback; fail if active paused dated executions.
-- Restores exact prior function definitions, then removes private U72 engine.
DO $m1_rollback_guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.iberfit_system_settings
   WHERE key='environment' AND value#>>'{}'='QA')
 OR EXISTS (SELECT 1 FROM public.domain_entities_v26
     WHERE entity_type='session_execution' AND status='pausada'
       AND body ? 'occurrenceId')
 OR to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NULL
 THEN RAISE EXCEPTION 'M1_U72_QA_ROLLBACK_UNSAFE'; END IF;
END $m1_rollback_guard$;
DO $m1_qa_rollback_unmaterialized$ BEGIN RAISE EXCEPTION 'M1_U72_QA_ROLLBACK_MATERIALIZATION_REQUIRED'; END $m1_qa_rollback_unmaterialized$;
DO $m1_rollback_readback$
BEGIN
 IF md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))<>'5914acf371015a6bbeeaf95f99e056e3'
 OR md5(pg_get_functiondef('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure))<>'35862b8e4977fcf0c3d611937fe83126'
 OR md5(pg_get_functiondef('private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure))<>'f97d7df4fdd510b63ac1249352273927'
 THEN RAISE EXCEPTION 'M1_U72_QA_ROLLBACK_DRIFT'; END IF;
END $m1_rollback_readback$;
