-- P0 #1209 · QA-only fast completed-session scalar, reversible and immutable-hash pinned.
-- Live read-only proof: 714 aged synthetic Client A sessions, 0 JSON mismatches;
-- EXPLAIN isolated sanitizer 143.311ms -> 62.531ms (NOT full bootstrap).
-- Never change Coach/Admin, Client B, production, ACL/RLS or any historical row.
DO $m26_scalar_migration$
DECLARE
  v_rc text := pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure);
  v_outer text := pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure);
  v_next_rc text;
  v_next_outer text;
  v_rc_acl aclitem[];
  v_outer_acl aclitem[];
  v_rc_owner oid;
  v_outer_owner oid;
  v_rc_config text[];
  v_outer_config text[];
  v_before_decl text := $p0_before_decl$  v_defer_completed_execution_details boolean := false;
  v_fast_completed_session_scalar boolean := false; -- P0 QA ONLY, default OFF$p0_before_decl$;
  v_after_decl text := $p0_after_decl$  v_defer_completed_execution_details boolean := false;$p0_after_decl$;
  v_before_hook text := $p0_before_hook$  -- P0 #1209: skip redundant block sanitizer ONLY when source-pinned
  -- QA Client A already has completed blocks intentionally deferred.
  -- The original full sanitizer remains the runtime drift fallback.
  v_fast_completed_session_scalar := v_defer_completed_blocks
    AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
      WHERE s.key='environment' AND s.value#>>'{}'='QA')
    AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
      WHERE s.key='free_client_completed_session_scalar_fast_v1'
        AND s.value#>>'{}'='true')
    AND md5(pg_get_functiondef(
      'public.iberfit_m43_client_safe_session_v2(jsonb)'::regprocedure
    ))='2c0f16829cd8731af964f107969f025a'
    AND md5(pg_get_functiondef(
      'public.iberfit_m43_client_scalar_fields_v1(jsonb,text[])'::regprocedure
    ))='34df411a2b9ce5b60635d6db84ecd240'
    AND md5(pg_get_functiondef(
      'public.iberfit_client_completed_history_page_free_v1(text,timestamptz,jsonb,bigint,text,integer)'::regprocedure
    ))='a254291ca0e199d176b10aefa8b2fd61';
  -- Independent QA-only kill switch; installation alone changes no response.$p0_before_hook$;
  v_after_hook text := $p0_after_hook$  -- Independent QA-only kill switch; installation alone changes no response.$p0_after_hook$;
  v_before_arm text := $p0_before_arm$                         then case when v_fast_completed_session_scalar then
                           public.iberfit_m43_client_scalar_fields_v1(
                             jsonb_set(CASE WHEN jsonb_typeof(e.body)='object'
                               THEN e.body ELSE '{}'::jsonb END,
                               '{blocks}','[]'::jsonb,true),
                             ARRAY['id','clientId','cycleId','appointmentId','title',
                               'objective','summary','durationMinutes','deliveryModality',
                               'deliveryOwnership','clientVisibilityLevel','status',
                               'visibleToClient','createdAt','updatedAt','publishedAt',
                               'enabledAt','startedAt','completedAt','revision',
                               'publishedRevision','startDate','endDate',
                               'autoEnabledAfterPublish']::text[])
                             || jsonb_build_object('blocks','[]'::jsonb)
                           else public.iberfit_m43_client_safe_session_v2(
                             jsonb_set(CASE WHEN jsonb_typeof(e.body)='object'
                               THEN e.body ELSE '{}'::jsonb END,
                               '{blocks}','[]'::jsonb,true))
                           end
$p0_before_arm$;
  v_after_arm text := $p0_after_arm$                         then public.iberfit_m43_client_safe_session_v2(
                           jsonb_set(CASE WHEN jsonb_typeof(e.body)='object'
                             THEN e.body ELSE '{}'::jsonb END,
                             '{blocks}','[]'::jsonb,true))
$p0_after_arm$;
  v_before_guard text := $p0_before_guard$md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) IN ('6e738331104794833987e82b6b6d105f','25c8ff090b162f23fd818d12e8eb9843','edeb0f40727e033ff0f85721fd6f7b93')$p0_before_guard$;
  v_after_guard text := $p0_after_guard$md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) IN ('6e738331104794833987e82b6b6d105f','25c8ff090b162f23fd818d12e8eb9843')$p0_after_guard$;
BEGIN
  IF (SELECT s.value#>>'{}' FROM public.iberfit_system_settings s WHERE s.key='environment') IS DISTINCT FROM 'QA'
    OR md5(v_rc) IS DISTINCT FROM 'edeb0f40727e033ff0f85721fd6f7b93'
    OR md5(v_outer) IS DISTINCT FROM '004eadbeb59ef8e45a74327ce3b66aba'
  THEN RAISE EXCEPTION 'P0_QA_SCALAR_SOURCE_OR_ENVIRONMENT_DRIFT' USING ERRCODE='42501'; END IF;
  IF (length(v_rc)-length(replace(v_rc,v_before_decl,'')))<>length(v_before_decl)
     OR (length(v_rc)-length(replace(v_rc,v_before_hook,'')))<>length(v_before_hook)
     OR (length(v_rc)-length(replace(v_rc,v_before_arm,'')))<>length(v_before_arm)
     OR (length(v_outer)-length(replace(v_outer,v_before_guard,'')))<>length(v_before_guard)
  THEN RAISE EXCEPTION 'P0_QA_SCALAR_ANCHOR_NOT_UNIQUE' USING ERRCODE='22023'; END IF;
  SELECT proacl,proowner,proconfig INTO v_rc_acl,v_rc_owner,v_rc_config
    FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure;
  SELECT proacl,proowner,proconfig INTO v_outer_acl,v_outer_owner,v_outer_config
    FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN (
       'public.iberfit_bootstrap_v26_rc29()'::regprocedure,
       'public.iberfit_bootstrap_v26()'::regprocedure)
      GROUP BY 1=1 HAVING count(*)=2 AND bool_and(p.prosecdef AND p.provolatile='s'
      AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig @> ARRAY['search_path=']::text[]))
  THEN RAISE EXCEPTION 'P0_QA_SCALAR_SECURITY_METADATA_INVALID' USING ERRCODE='42501'; END IF;
  v_next_rc := replace(replace(replace(v_rc,v_before_decl,v_after_decl),v_before_hook,v_after_hook),v_before_arm,v_after_arm);
  v_next_outer := replace(v_outer,v_before_guard,v_after_guard);
  IF md5(v_next_rc) IS DISTINCT FROM '25c8ff090b162f23fd818d12e8eb9843'
     OR md5(v_next_outer) IS DISTINCT FROM '9c83765e0a36b0144fde2dca4a0cdcba'
  THEN RAISE EXCEPTION 'P0_QA_SCALAR_CANDIDATE_HASH_MISMATCH' USING ERRCODE='22023'; END IF;
  EXECUTE v_next_rc;
  EXECUTE v_next_outer;
  IF md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) IS DISTINCT FROM '25c8ff090b162f23fd818d12e8eb9843'
    OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)) IS DISTINCT FROM '9c83765e0a36b0144fde2dca4a0cdcba'
    OR (SELECT proacl FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure) IS DISTINCT FROM v_rc_acl
    OR (SELECT proacl FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure) IS DISTINCT FROM v_outer_acl
    OR (SELECT proowner FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure) IS DISTINCT FROM v_rc_owner
    OR (SELECT proowner FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure) IS DISTINCT FROM v_outer_owner
    OR (SELECT proconfig FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure) IS DISTINCT FROM v_rc_config
    OR (SELECT proconfig FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure) IS DISTINCT FROM v_outer_config
  THEN RAISE EXCEPTION 'P0_QA_SCALAR_POST_DDL_SECURITY_DRIFT' USING ERRCODE='42501'; END IF;
END
$m26_scalar_migration$;
