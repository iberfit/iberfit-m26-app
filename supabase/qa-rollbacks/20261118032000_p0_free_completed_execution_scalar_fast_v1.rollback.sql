-- IBERFIT #1209 QA-only fast completed execution scalar, strict revert.
-- 748 synthetic execution objects are JSON-identical, 303273 bytes each path.
-- No PROD, no public grants, no historical rows changed. Default OFF.
DO $p0_exec$
DECLARE
 v_rc text := pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure);
 v_outer text := pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure);
 v_newrc text; v_newouter text;
 v_ra aclitem[];v_oa aclitem[];v_ro oid;v_oo oid;v_rconf text[];v_oconf text[];
 v_d text := $p0d$  v_fast_completed_session_scalar boolean := false; -- P0 QA ONLY, default OFF
  v_fast_completed_execution_scalar boolean := false; -- P0 QA ONLY, default OFF$p0d$;
 v_e text := $p0e$  v_fast_completed_session_scalar boolean := false; -- P0 QA ONLY, default OFF$p0e$;
 v_h text := $p0h$  -- P0 #1209: scalar only for previously deferred, completed execution.
  -- Original authorisation and sanitiser are preserved as fallback.
  v_fast_completed_execution_scalar := v_defer_completed_execution_details
    AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s WHERE s.key='environment' AND s.value#>>'{}'='QA')
    AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s WHERE s.key='free_client_completed_execution_scalar_fast_v1' AND s.value#>>'{}'='true')
    AND md5(pg_get_functiondef('public.iberfit_m43_client_safe_execution_v1(jsonb)'::regprocedure))='29f09c54467ac50aaa91bce79ebe5680'
    AND md5(pg_get_functiondef('public.iberfit_m43_client_scalar_fields_v1(jsonb,text[])'::regprocedure))='34df411a2b9ce5b60635d6db84ecd240'
    AND md5(pg_get_functiondef('public.iberfit_client_completed_history_page_free_v1(text,timestamptz,jsonb,bigint,text,integer)'::regprocedure))='a254291ca0e199d176b10aefa8b2fd61';
  select jsonb_build_object(
    'clients',coalesce(($p0h$;
 v_i text := $p0i$  select jsonb_build_object(
    'clients',coalesce(($p0i$;
 v_a text := $p0a$          THEN case when v_fast_completed_execution_scalar then
             public.iberfit_m43_client_scalar_fields_v1(e.body,
               ARRAY['id','clientId','sessionId','appointmentId','status','revision','title',
                 'startedAt','completedAt','remoteConfirmedAt','localClosedAt','updatedAt',
                 'executionStatus','currentBlockIndex','currentSetIndex']::text[])
             || jsonb_build_object('feedback','{}'::jsonb,'results','[]'::jsonb,
                 'sourceSnapshot','{}'::jsonb,'planSnapshot','{}'::jsonb)
          else public.iberfit_m43_client_safe_execution_v1(
             jsonb_set(jsonb_set(jsonb_set(jsonb_set(
               e.body,'{results}','[]'::jsonb,true),
               '{feedback}','{}'::jsonb,true),
               '{sourceSnapshot}','{}'::jsonb,true),
               '{planSnapshot}','{}'::jsonb,true))
          end
$p0a$;
 v_b text := $p0b$          THEN public.iberfit_m43_client_safe_execution_v1(
             jsonb_set(jsonb_set(jsonb_set(jsonb_set(
               e.body,'{results}','[]'::jsonb,true),
               '{feedback}','{}'::jsonb,true),
               '{sourceSnapshot}','{}'::jsonb,true),
               '{planSnapshot}','{}'::jsonb,true))
$p0b$;
 v_g text := $p0g$IN ('6e738331104794833987e82b6b6d105f','25c8ff090b162f23fd818d12e8eb9843','edeb0f40727e033ff0f85721fd6f7b93','2dd44be13127df848e335c33febfd183')$p0g$;
 v_j text := $p0j$IN ('6e738331104794833987e82b6b6d105f','25c8ff090b162f23fd818d12e8eb9843','edeb0f40727e033ff0f85721fd6f7b93')$p0j$;
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
 OR md5(v_rc) IS DISTINCT FROM '2dd44be13127df848e335c33febfd183' OR md5(v_outer) IS DISTINCT FROM 'e460264e965db3688709101bc30e10fa'
 THEN RAISE EXCEPTION 'P0_QA_EXEC_SOURCE_DRIFT' USING ERRCODE='42501'; END IF;
 IF (length(v_rc)-length(replace(v_rc,v_d,'')))<>length(v_d)
 OR (length(v_rc)-length(replace(v_rc,v_h,'')))<>length(v_h)
 OR (length(v_rc)-length(replace(v_rc,v_a,'')))<>length(v_a)
 OR (length(v_outer)-length(replace(v_outer,v_g,'')))<>length(v_g)
 THEN RAISE EXCEPTION 'P0_QA_EXEC_ANCHOR_NOT_UNIQUE' USING ERRCODE='22023'; END IF;
 SELECT proacl,proowner,proconfig INTO v_ra,v_ro,v_rconf FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure;
 SELECT proacl,proowner,proconfig INTO v_oa,v_oo,v_oconf FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.iberfit_bootstrap_v26_rc29()'::regprocedure,
 'public.iberfit_bootstrap_v26()'::regprocedure) GROUP BY 1=1 HAVING count(*)=2
 AND bool_and(prosecdef AND provolatile='s' AND pg_get_userbyid(proowner)='postgres'
 AND proconfig @> ARRAY['search_path=""']::text[]))
 THEN RAISE EXCEPTION 'P0_QA_EXEC_SECURITY_METADATA_INVALID' USING ERRCODE='42501'; END IF;
 v_newrc:=replace(replace(replace(v_rc,v_d,v_e),v_h,v_i),v_a,v_b);
 v_newouter:=replace(v_outer,v_g,v_j);
 IF md5(v_newrc) IS DISTINCT FROM 'edeb0f40727e033ff0f85721fd6f7b93' OR md5(v_newouter) IS DISTINCT FROM '004eadbeb59ef8e45a74327ce3b66aba'
 THEN RAISE EXCEPTION 'P0_QA_EXEC_CANDIDATE_HASH_MISMATCH' USING ERRCODE='22023'; END IF;
 EXECUTE v_newrc; EXECUTE v_newouter;
 IF md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) IS DISTINCT FROM 'edeb0f40727e033ff0f85721fd6f7b93'
 OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)) IS DISTINCT FROM '004eadbeb59ef8e45a74327ce3b66aba'
 OR (SELECT proacl FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure) IS DISTINCT FROM v_ra
 OR (SELECT proacl FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure) IS DISTINCT FROM v_oa
 OR (SELECT proowner FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure) IS DISTINCT FROM v_ro
 OR (SELECT proowner FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure) IS DISTINCT FROM v_oo
 OR (SELECT proconfig FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure) IS DISTINCT FROM v_rconf
 OR (SELECT proconfig FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure) IS DISTINCT FROM v_oconf
 THEN RAISE EXCEPTION 'P0_QA_EXEC_POST_DDL_SECURITY_DRIFT' USING ERRCODE='42501'; END IF;
END
$p0_exec$;
