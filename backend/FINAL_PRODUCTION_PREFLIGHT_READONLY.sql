-- IBERFIT M26 · FINAL PRODUCTION PREFLIGHT · READ ONLY
-- Target: production only. This file performs no DDL and no business-data writes.
-- It intentionally fails closed unless the live production baseline matches the
-- reviewed pre-promotion state from 2026-08-31.

DO $preflight$
DECLARE
  v_env jsonb;
  v_count bigint;
  v_flag boolean;
  v_hash text;
BEGIN
  v_env := public.iberfit_environment();

  IF coalesce(v_env->>'environment','') <> 'PRODUCTION'
     OR coalesce((v_env->>'realDataAllowed')::boolean,false) IS NOT TRUE
     OR coalesce((v_env->>'productionBlocked')::boolean,true) IS NOT FALSE THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_ENVIRONMENT_MISMATCH';
  END IF;

  -- Production already carries the complete 52-command registry baseline.
  SELECT count(*) INTO v_count
  FROM public.domain_command_registry_v26
  WHERE enabled = true;
  IF v_count <> 52 THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_COMMAND_COUNT:%', v_count;
  END IF;

  -- RC74.4E engagement is already present in production. Do not replay its QA-only
  -- migration; prove the eight command contracts and transitions instead.
  SELECT count(*) INTO v_count
  FROM (
    VALUES
      ('CHECKIN_REGISTRAR','checkin','REGISTRAR',array['admin','coach','cliente']::text[],false,true),
      ('CHECKIN_ANULAR','checkin','ANULAR',array['admin','coach']::text[],true,true),
      ('HABITO_DEFINIR','habit','DEFINIR',array['admin','coach']::text[],true,true),
      ('HABITO_REGISTRAR','habit_log','REGISTRAR',array['admin','coach','cliente']::text[],false,true),
      ('HABITO_ARCHIVAR','habit','ARCHIVAR',array['admin','coach']::text[],true,true),
      ('NOTA_PRIVADA_CREAR','private_note','CREAR',array['admin','coach']::text[],true,false),
      ('NOTA_PRIVADA_ACTUALIZAR','private_note','ACTUALIZAR',array['admin','coach']::text[],true,false),
      ('NOTA_PRIVADA_ARCHIVAR','private_note','ARCHIVAR',array['admin','coach']::text[],true,false)
  ) expected(command_type,entity_type,event_name,allowed_roles,conflict_sensitive,bootstrap_allowed)
  LEFT JOIN public.domain_command_registry_v26 actual USING(command_type)
  WHERE actual.command_type IS NULL
     OR actual.entity_type <> expected.entity_type
     OR actual.event_name <> expected.event_name
     OR array(SELECT unnest(actual.allowed_roles) ORDER BY 1)
        <> array(SELECT unnest(expected.allowed_roles) ORDER BY 1)
     OR actual.conflict_sensitive <> expected.conflict_sensitive
     OR actual.bootstrap_allowed <> expected.bootstrap_allowed
     OR actual.enabled IS DISTINCT FROM true;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_ENGAGEMENT_COMMAND_DRIFT:%', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    VALUES
      ('checkin','borrador','REGISTRAR','confirmado'),
      ('checkin','confirmado','ANULAR','anulado'),
      ('habit','borrador','DEFINIR','activo'),
      ('habit','activo','ARCHIVAR','archivado'),
      ('habit_log','borrador','REGISTRAR','confirmado'),
      ('private_note','borrador','CREAR','activo'),
      ('private_note','activo','ACTUALIZAR','activo'),
      ('private_note','activo','ARCHIVAR','archivado')
  ) expected(entity_type,from_status,event_name,to_status)
  LEFT JOIN public.domain_transitions_v26 actual
    USING(entity_type,from_status,event_name)
  WHERE actual.entity_type IS NULL OR actual.to_status <> expected.to_status;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_ENGAGEMENT_TRANSITION_DRIFT:%', v_count;
  END IF;

  -- Exact pre-4C role baseline. The production promotion intentionally removes
  -- Admin from these live session/execution commands as already proven in QA.
  SELECT count(*) INTO v_count
  FROM (
    VALUES
      ('SESION_INICIAR',array['admin','coach','cliente']::text[]),
      ('SESION_COMPLETAR',array['admin','coach','sistema']::text[]),
      ('SESION_CANCELAR',array['admin','coach']::text[]),
      ('EJECUCION_INICIAR',array['admin','coach','cliente']::text[]),
      ('EJECUCION_GUARDAR_PROGRESO',array['admin','coach','cliente']::text[]),
      ('EJECUCION_PAUSAR',array['admin','coach','cliente']::text[]),
      ('EJECUCION_REANUDAR',array['admin','coach','cliente']::text[]),
      ('EJECUCION_COMPLETAR',array['admin','coach','cliente']::text[]),
      ('EJECUCION_CANCELAR',array['admin','coach']::text[])
  ) expected(command_type,allowed_roles)
  LEFT JOIN public.domain_command_registry_v26 actual USING(command_type)
  WHERE actual.command_type IS NULL
     OR array(SELECT unnest(actual.allowed_roles) ORDER BY 1)
        <> array(SELECT unnest(expected.allowed_roles) ORDER BY 1);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_PRE_4C_ROLE_DRIFT:%', v_count;
  END IF;

  SELECT conflict_sensitive INTO v_flag
  FROM public.domain_command_registry_v26
  WHERE command_type='EJECUCION_GUARDAR_PROGRESO'
    AND entity_type='session_execution'
    AND enabled=true;
  IF v_flag IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_PROGRESS_POLICY_DRIFT';
  END IF;

  -- Cut over only while no execution is live.
  SELECT count(*) INTO v_count FROM public.active_execution_locks_v26;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_ACTIVE_LOCKS:%', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.domain_entities_v26
  WHERE entity_type='session_execution'
    AND status IN ('en_curso','pausada');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_ACTIVE_EXECUTIONS:%', v_count;
  END IF;

  -- RC74.4 production delta must not have been partially applied.
  IF to_regclass('public.command_operation_identities_v26') IS NOT NULL
     OR to_regprocedure('public.iberfit_operation_identity_guard_v26(jsonb,boolean)') IS NOT NULL
     OR to_regprocedure('private.iberfit_apply_registry_conflict_policy_v26(jsonb)') IS NOT NULL
     OR to_regprocedure('private.iberfit_finalize_execution_cancel_v26(jsonb)') IS NOT NULL
     OR to_regprocedure('private.iberfit_active_execution_command_guard_v26(jsonb)') IS NOT NULL
     OR to_regprocedure('public.iberfit_validate_execution_completion_v26(jsonb)') IS NOT NULL
     OR to_regprocedure('public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_RC74_PARTIAL_APPLICATION';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_checkins_v26'
      AND column_name IN ('fatigue','motivation')
  ) THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_WELLBEING_PARTIAL_APPLICATION';
  END IF;

  -- Exact reviewed function baselines before the RC74.4 reproducibility port.
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_hash
  FROM pg_proc p
  WHERE p.oid=to_regprocedure('public.iberfit_prepare_command_rc30_v26(jsonb)');
  IF v_hash IS DISTINCT FROM '2f487d3092207cc0eb86d103f53cb270' THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_PREPARE_DRIFT:%', coalesce(v_hash,'missing');
  END IF;

  SELECT md5(pg_get_functiondef(p.oid)) INTO v_hash
  FROM pg_proc p
  WHERE p.oid=to_regprocedure('public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)');
  IF v_hash IS DISTINCT FROM 'a8833db66292357bff900f9ffd958dfe' THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_PERSIST_DRIFT:%', coalesce(v_hash,'missing');
  END IF;

  -- 4T/4T2 final authorization hardening has not yet landed in production: the
  -- legacy role resolver still trusts app_metadata first. Fail if that baseline changes.
  SELECT md5(replace(pg_get_functiondef(p.oid),E'\r','')) INTO v_hash
  FROM pg_proc p
  WHERE p.oid=to_regprocedure('private.iberfit_role()');
  IF v_hash IS DISTINCT FROM '568c97b02e579dce27f438848aaf8972' THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_PRIVATE_ROLE_DRIFT:%', coalesce(v_hash,'missing');
  END IF;

  -- WebAuthn/RC65 must also be completely absent before its production-specific port.
  IF to_regclass('public.iberfit_webauthn_credentials_v1') IS NOT NULL
     OR to_regclass('public.iberfit_webauthn_challenges_v1') IS NOT NULL
     OR to_regclass('public.iberfit_privileged_assurance_v1') IS NOT NULL
     OR to_regprocedure('public.iberfit_privileged_assurance_context_v65d()') IS NOT NULL
     OR to_regprocedure('public.iberfit_require_privileged_assurance_v65d()') IS NOT NULL
     OR to_regprocedure('public.iberfit_create_client_draft_v12_pre_v65e(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_RC65_PARTIAL_APPLICATION';
  END IF;

  -- Existing public contract before P0: canonical v12 and legacy path are both callable.
  IF NOT has_function_privilege(
       'authenticated','public.iberfit_create_client_draft_v12(jsonb)','EXECUTE'
     ) THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_CANONICAL_V12_UNAVAILABLE';
  END IF;

  IF NOT has_function_privilege(
       'authenticated','public.iberfit_create_client_draft(jsonb)','EXECUTE'
     ) THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_LEGACY_ALREADY_CHANGED';
  END IF;

  -- Environment RPC is authenticated-only at baseline. A later production port may
  -- harden its execution context, but must never expose it to anon/public.
  IF has_function_privilege('anon','public.iberfit_environment()','EXECUTE')
     OR has_function_privilege('public','public.iberfit_environment()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.iberfit_environment()','EXECUTE') THEN
    RAISE EXCEPTION 'FINAL_PROD_PREFLIGHT_ENVIRONMENT_RPC_PRIVILEGE_DRIFT';
  END IF;
END
$preflight$;
