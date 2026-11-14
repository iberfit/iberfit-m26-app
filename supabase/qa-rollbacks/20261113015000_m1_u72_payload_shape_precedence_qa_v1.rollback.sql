-- M1 U72 QA-only precedence rollback. Never run against PROD.
-- The full U72 rollback (prior migration) is preferred if disabling U72.
DO $m1_u72_fix_rollback$
DECLARE
  v_old text:=$m1_old$((p_command->'payload')-'executionId'-'executionBaseRevision')$m1_old$;
  v_new text:=$m1_new$(p_command->'payload'-'executionId'-'executionBaseRevision')$m1_new$;
  v_def text;
  v_oid oid:='private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.iberfit_system_settings
   WHERE key='environment' AND value#>>'{}'='QA')
  OR EXISTS(SELECT 1 FROM public.domain_entities_v26
    WHERE entity_type='session_execution' AND status='pausada' AND body ? 'occurrenceId')
 THEN RAISE EXCEPTION 'U72_PRECEDENCE_ROLLBACK_UNSAFE';END IF;
 v_def:=pg_get_functiondef(v_oid);
 IF md5(v_def)<>'1270cf1db8c9a162ccc5736207a258e1'
 THEN RAISE EXCEPTION 'U72_PRECEDENCE_ROLLBACK_DRIFT'; END IF;
 EXECUTE replace(v_def,v_old,v_new);
 IF md5(pg_get_functiondef(v_oid))<>'6bf519269eaf9891793b5b32405a3224'
 THEN RAISE EXCEPTION 'U72_PRECEDENCE_ROLLBACK_READBACK_FAILED';END IF;
END $m1_u72_fix_rollback$;
