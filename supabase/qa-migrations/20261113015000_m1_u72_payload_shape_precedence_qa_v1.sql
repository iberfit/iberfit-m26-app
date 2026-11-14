-- M1 U72 · QA-only parser precedence correction, after initial migration.
-- An explicit parenthesis prevents PostgreSQL from evaluating unknown - unknown.
-- One surgical source replacement. No rows, role grants, RLS or PROD changes.
DO $m1_u72_fix$
DECLARE
  v_old text:=$m1_old$(p_command->'payload'-'executionId'-'executionBaseRevision')$m1_old$;
  v_new text:=$m1_new$((p_command->'payload')-'executionId'-'executionBaseRevision')$m1_new$;
  v_def text;
  v_oid oid:='private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure;
  v_owner oid;
  v_acl aclitem[];
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.iberfit_system_settings
    WHERE key='environment' AND value#>>'{}'='QA') THEN
    RAISE EXCEPTION 'U72_QA_ONLY';
  END IF;
  SELECT proowner,proacl INTO v_owner,v_acl FROM pg_proc WHERE oid=v_oid;
  v_def:=pg_get_functiondef(v_oid);
  IF md5(v_def)<>'6bf519269eaf9891793b5b32405a3224'
    OR (length(v_def)-length(replace(v_def,v_old,'')))<>length(v_old) THEN
    RAISE EXCEPTION 'U72_PRECEDENCE_SOURCE_DRIFT';
  END IF;
  v_def:=replace(v_def,v_old,v_new);
  IF md5(v_def)<>'1270cf1db8c9a162ccc5736207a258e1' THEN
    RAISE EXCEPTION 'U72_PRECEDENCE_CANDIDATE_DRIFT';
  END IF;
  EXECUTE v_def;
  IF md5(pg_get_functiondef(v_oid))<>'1270cf1db8c9a162ccc5736207a258e1'
    OR EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_oid
      AND (proowner IS DISTINCT FROM v_owner OR proacl IS DISTINCT FROM v_acl))
    OR has_function_privilege('authenticated',v_oid,'EXECUTE')
    OR has_function_privilege('anon',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'U72_PRECEDENCE_READBACK_OR_ACL_DRIFT';
  END IF;
END $m1_u72_fix$;
