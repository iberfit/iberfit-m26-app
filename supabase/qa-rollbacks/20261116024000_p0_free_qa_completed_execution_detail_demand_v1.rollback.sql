-- QA ONLY. Fail closed if any function drifted; disable rollout and restore exact definitions.
DO $rollback$
DECLARE
  v_rc text := pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure);
  v_outer text := pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure);
  v_old_decl text := $old_decl$  v_keep_completed_sessions uuid[] := '{}'::uuid[];$old_decl$;
  v_new_decl text := $new_decl$  v_keep_completed_sessions uuid[] := '{}'::uuid[];
  v_keep_completed_executions uuid[] := '{}'::uuid[];
  v_defer_completed_execution_details boolean := false;$new_decl$;
  v_old_hook text := $old_hook$  select jsonb_build_object($old_hook$;
  v_new_hook text := $new_hook$  -- P0 FREE 360: Client A only, after QA-only explicit setting and
  -- immutable owner-scoped paged history reader hash are verified.
  v_defer_completed_execution_details := v_defer_completed_blocks
    AND EXISTS (SELECT 1 FROM public.iberfit_system_settings setting
      WHERE setting.key='environment' AND setting.value#>>'{}'='QA')
    AND EXISTS (SELECT 1 FROM public.iberfit_system_settings setting
      WHERE setting.key='free_client_completed_execution_details_demand_qa_v1'
        AND setting.value#>>'{}'='true')
    AND md5(pg_get_functiondef(
      'public.iberfit_client_completed_history_page_free_v1(text,timestamptz,jsonb,bigint,text,integer)'::regprocedure
    ))='ae01c1771319b99f0404612a4b84fd2a';
  IF v_defer_completed_execution_details THEN
    SELECT coalesce(array_agg(keep.entity_id),'{}'::uuid[])
      INTO v_keep_completed_executions
    FROM (
      SELECT e.entity_id FROM public.domain_entities_v26 e
      WHERE e.client_id=ANY(v_allowed_client_ids)
        AND e.entity_type='session_execution'
        AND lower(coalesce(e.status,e.body->>'status',''))
          IN ('completado','completada','completed')
      ORDER BY e.updated_at DESC,e.entity_id DESC LIMIT 12
    ) keep;
  END IF;

  select jsonb_build_object($new_hook$;
  v_old_arm text := $old_arm$when v_role='cliente' and e.entity_type='session_execution' then public.iberfit_m43_client_safe_execution_v1(e.body)$old_arm$;
  v_new_arm text := $new_arm$when v_role='cliente' and e.entity_type='session_execution' then
        case when v_defer_completed_execution_details
          AND NOT (e.entity_id=ANY(v_keep_completed_executions))
          AND lower(coalesce(e.status,e.body->>'status',''))
            IN ('completado','completada','completed')
          AND jsonb_typeof(e.body)='object'
          AND e.body->>'id'=e.entity_id::text
          AND e.body->>'clientId'=e.client_id::text
          AND e.body->>'revision'=e.revision::text
          AND lower(coalesce(e.body->>'visibleToClient','true')) NOT IN ('false','0','no')
          AND lower(btrim(coalesce(e.body->>'clientVisibilityLevel',''))) NOT IN ('hidden','oculta','oculto','private')
          AND lower(btrim(coalesce(e.body->>'client_visibility_level',''))) NOT IN ('hidden','oculta','oculto','private')
          AND lower(btrim(coalesce(e.body->>'visibilityLevel',''))) NOT IN ('hidden','oculta','oculto','private')
          AND lower(btrim(coalesce(e.body->>'visibility_level',''))) NOT IN ('hidden','oculta','oculto','private')
          AND lower(btrim(coalesce(e.body->>'visible_to_client',''))) NOT IN ('false','0','no')
          AND lower(btrim(coalesce(e.body->>'clientVisible',''))) NOT IN ('false','0','no')
          AND lower(btrim(coalesce(e.body->>'client_visible',''))) NOT IN ('false','0','no')
          AND EXISTS (
            SELECT 1 FROM public.domain_entities_v26 source_session
            WHERE source_session.client_id=e.client_id
              AND source_session.entity_type='session'
              AND source_session.entity_id=(CASE
                WHEN e.body->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN (e.body->>'sessionId')::uuid ELSE NULL::uuid END)
              AND lower(coalesce(source_session.status,source_session.body->>'status',''))
                IN ('disponible','completado','completada','completed','cancelada','cancelado','cancelled')
              AND lower(btrim(coalesce(source_session.body->>'clientVisibilityLevel',''))) NOT IN ('hidden','oculta','oculto','private')
              AND lower(btrim(coalesce(source_session.body->>'client_visibility_level',''))) NOT IN ('hidden','oculta','oculto','private')
              AND lower(btrim(coalesce(source_session.body->>'visibilityLevel',''))) NOT IN ('hidden','oculta','oculto','private')
              AND lower(btrim(coalesce(source_session.body->>'visibility_level',''))) NOT IN ('hidden','oculta','oculto','private')
              AND lower(btrim(coalesce(source_session.body->>'visibleToClient',''))) NOT IN ('false','0','no')
              AND lower(btrim(coalesce(source_session.body->>'visible_to_client',''))) NOT IN ('false','0','no')
              AND lower(btrim(coalesce(source_session.body->>'clientVisible',''))) NOT IN ('false','0','no')
              AND lower(btrim(coalesce(source_session.body->>'client_visible',''))) NOT IN ('false','0','no')
          )
          THEN public.iberfit_m43_client_safe_execution_v1(
             jsonb_set(jsonb_set(jsonb_set(jsonb_set(
               e.body,'{results}','[]'::jsonb,true),
               '{feedback}','{}'::jsonb,true),
               '{sourceSnapshot}','{}'::jsonb,true),
               '{planSnapshot}','{}'::jsonb,true))
          ELSE public.iberfit_m43_client_safe_execution_v1(e.body)
        end$new_arm$;
  v_old_guard text := $old_guard$md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))='6e738331104794833987e82b6b6d105f'$old_guard$;
  v_new_guard text := $new_guard$md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) IN ('6e738331104794833987e82b6b6d105f','88220acc54e26bb1ee91332d9b89a3b3')$new_guard$;
  v_previous_acl_rc aclitem[];
  v_previous_acl_outer aclitem[];
BEGIN
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    OR md5(v_rc) IS DISTINCT FROM '88220acc54e26bb1ee91332d9b89a3b3'
    OR md5(v_outer) IS DISTINCT FROM '0813cbe612bf24b2f08f99bf42a96662'
  THEN RAISE EXCEPTION 'P0_FREE_QA_ROLLBACK_SOURCE_OR_PROJECT_DRIFT' USING ERRCODE='42501'; END IF;
  SELECT proacl INTO v_previous_acl_rc FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure;
  SELECT proacl INTO v_previous_acl_outer FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure;
  IF (length(v_rc)-length(replace(v_rc,v_new_decl,'')))<>length(v_new_decl)
     OR (length(v_rc)-length(replace(v_rc,v_new_hook,'')))<>length(v_new_hook)
     OR (length(v_rc)-length(replace(v_rc,v_new_arm,'')))<>length(v_new_arm)
     OR (length(v_outer)-length(replace(v_outer,v_new_guard,'')))<>length(v_new_guard)
  THEN RAISE EXCEPTION 'P0_FREE_QA_ROLLBACK_ANCHOR_DRIFT' USING ERRCODE='22023'; END IF;
  EXECUTE replace(replace(replace(v_rc,v_new_decl,v_old_decl),v_new_hook,v_old_hook),v_new_arm,v_old_arm);
  EXECUTE replace(v_outer,v_new_guard,v_old_guard);
  IF md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) IS DISTINCT FROM '6e738331104794833987e82b6b6d105f'
     OR md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)) IS DISTINCT FROM '5d3e13ffc4f00c1e5f29d61fb81cd6e3'
     OR (SELECT proacl FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure) IS DISTINCT FROM v_previous_acl_rc
     OR (SELECT proacl FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26()'::regprocedure) IS DISTINCT FROM v_previous_acl_outer
  THEN RAISE EXCEPTION 'P0_FREE_QA_ROLLBACK_VERIFICATION_FAILED' USING ERRCODE='42501'; END IF;
  UPDATE public.iberfit_system_settings SET value='false'::jsonb,updated_at=now()
   WHERE key='free_client_completed_execution_details_demand_qa_v1';
END
$rollback$;
