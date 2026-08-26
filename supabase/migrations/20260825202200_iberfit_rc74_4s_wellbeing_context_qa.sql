-- IBERFIT M26 RC74.4S · QA-ONLY HISTORICAL WELLBEING PORT
-- Native, nullable 0–10 fatigue + motivation on the existing check-in contract.
-- No command-registry expansion. No direct-write RLS. No business-data writes.
-- Git-first: apply to QA only after this exact migration is versioned and CI is green.

DO $guard$
DECLARE
  v_env jsonb := public.iberfit_environment();
BEGIN
  IF coalesce(v_env->>'environment','') <> 'QA'
     OR coalesce((v_env->>'realDataAllowed')::boolean,true) IS NOT FALSE
     OR coalesce((v_env->>'productionBlocked')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'RC74_4S_QA_ENVIRONMENT_REQUIRED' USING errcode='42501';
  END IF;

  IF to_regclass('public.client_checkins_v26') IS NULL
     OR to_regprocedure('public.iberfit_prepare_command_rc30_v26(jsonb)') IS NULL
     OR to_regprocedure('public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb)') IS NULL
     OR to_regprocedure('public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'RC74_4S_REQUIRED_CONTRACT_MISSING';
  END IF;

  IF md5(pg_get_functiondef('public.iberfit_prepare_command_rc30_v26(jsonb)'::regprocedure))
       <> 'c537ea5a40bee3a4e06456dccc8240b3' THEN
    RAISE EXCEPTION 'RC74_4S_PREPARE_BASELINE_DRIFT';
  END IF;

  IF md5(pg_get_functiondef('public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb)'::regprocedure))
       <> '2414ce7aaa3c89227590bd366aee40e9' THEN
    RAISE EXCEPTION 'RC74_4S_PRE_RC74_4_HELPER_DRIFT';
  END IF;

  IF md5(pg_get_functiondef('public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)'::regprocedure))
       <> '7cf1b87c9f6c26f9a9a2b30da08114bb' THEN
    RAISE EXCEPTION 'RC74_4S_PERSIST_BASELINE_DRIFT';
  END IF;
END
$guard$;

ALTER TABLE public.client_checkins_v26
  ADD COLUMN IF NOT EXISTS fatigue numeric(4,1),
  ADD COLUMN IF NOT EXISTS motivation numeric(4,1);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.client_checkins_v26'::regclass
      AND conname='client_checkins_v26_fatigue_check'
  ) THEN
    ALTER TABLE public.client_checkins_v26
      ADD CONSTRAINT client_checkins_v26_fatigue_check
      CHECK (fatigue IS NULL OR fatigue BETWEEN 0 AND 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.client_checkins_v26'::regclass
      AND conname='client_checkins_v26_motivation_check'
  ) THEN
    ALTER TABLE public.client_checkins_v26
      ADD CONSTRAINT client_checkins_v26_motivation_check
      CHECK (motivation IS NULL OR motivation BETWEEN 0 AND 10);
  END IF;
END
$constraints$;

-- Preserve the stable pre-RC74.4 helper byte-for-byte. Extend only the current wrapper.
CREATE OR REPLACE FUNCTION public.iberfit_prepare_command_rc30_v26(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_command jsonb;
  v_payload jsonb;
  v_patch jsonb;
  v_input_patch jsonb;
  v_feedback jsonb;
  v_session_rpe numeric;
  v_comment text;
  v_pain boolean;
  v_pain_notes text;
  v_fatigue numeric;
  v_motivation numeric;
BEGIN
  v_command := public.iberfit_prepare_command_rc30_v26_pre_rc74_4(p_command);

  IF v_command->>'type' = 'CHECKIN_REGISTRAR' THEN
    v_payload := coalesce(v_command->'payload', '{}'::jsonb);
    v_patch := coalesce(v_payload->'patch', '{}'::jsonb);
    v_input_patch := coalesce(p_command->'payload'->'patch', '{}'::jsonb);

    IF jsonb_typeof(v_input_patch) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'INVALID_CHECKIN_PAYLOAD' USING errcode='22023';
    END IF;

    IF v_input_patch ? 'fatigue' THEN
      IF jsonb_typeof(v_input_patch->'fatigue') = 'null'
         OR nullif(btrim(coalesce(v_input_patch->>'fatigue','')),'') IS NULL THEN
        v_patch := jsonb_set(v_patch,'{fatigue}','null'::jsonb,true);
      ELSE
        BEGIN
          v_fatigue := (v_input_patch->>'fatigue')::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION 'INVALID_CHECKIN_PAYLOAD' USING errcode='22023';
        END;
        IF v_fatigue NOT BETWEEN 0 AND 10 THEN
          RAISE EXCEPTION 'INVALID_CHECKIN_PAYLOAD' USING errcode='22023';
        END IF;
        v_patch := jsonb_set(v_patch,'{fatigue}',to_jsonb(v_fatigue),true);
      END IF;
    END IF;

    IF v_input_patch ? 'motivation' THEN
      IF jsonb_typeof(v_input_patch->'motivation') = 'null'
         OR nullif(btrim(coalesce(v_input_patch->>'motivation','')),'') IS NULL THEN
        v_patch := jsonb_set(v_patch,'{motivation}','null'::jsonb,true);
      ELSE
        BEGIN
          v_motivation := (v_input_patch->>'motivation')::numeric;
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION 'INVALID_CHECKIN_PAYLOAD' USING errcode='22023';
        END;
        IF v_motivation NOT BETWEEN 0 AND 10 THEN
          RAISE EXCEPTION 'INVALID_CHECKIN_PAYLOAD' USING errcode='22023';
        END IF;
        v_patch := jsonb_set(v_patch,'{motivation}',to_jsonb(v_motivation),true);
      END IF;
    END IF;

    v_payload := jsonb_set(v_payload,'{patch}',v_patch,true);
    RETURN jsonb_set(v_command,'{payload}',v_payload,true);
  END IF;

  IF v_command->>'type' <> 'EJECUCION_COMPLETAR' THEN
    RETURN v_command;
  END IF;

  IF v_command->>'entityType' <> 'session_execution' THEN
    RAISE EXCEPTION 'INVALID_EXECUTION_FEEDBACK_PAYLOAD' USING errcode='22023';
  END IF;
  v_payload := coalesce(v_command->'payload', '{}'::jsonb);
  v_patch := coalesce(v_payload->'patch', '{}'::jsonb);
  IF jsonb_typeof(v_payload->'feedback') = 'object' THEN
    v_feedback := v_payload->'feedback';
  ELSIF jsonb_typeof(v_patch->'feedback') = 'object' THEN
    v_feedback := v_patch->'feedback';
  ELSE
    RAISE EXCEPTION 'INVALID_EXECUTION_FEEDBACK_PAYLOAD' USING errcode='22023';
  END IF;
  v_session_rpe := nullif(v_feedback->>'sessionRpe','')::numeric;
  v_comment := btrim(coalesce(v_feedback->>'comment',''));
  v_pain := coalesce(nullif(v_feedback->>'pain','')::boolean,false);
  v_pain_notes := btrim(coalesce(v_feedback->>'painNotes',''));
  IF v_session_rpe IS NULL OR v_session_rpe NOT BETWEEN 1 AND 10
     OR length(v_comment) < 1
     OR (v_pain AND length(v_pain_notes) < 1) THEN
    RAISE EXCEPTION 'INVALID_EXECUTION_FEEDBACK_PAYLOAD' USING errcode='22023';
  END IF;
  v_feedback := v_feedback || jsonb_build_object(
    'sessionRpe',v_session_rpe,
    'comment',left(v_comment,2000),
    'pain',v_pain,
    'painNotes',left(v_pain_notes,1000)
  );
  v_patch := jsonb_set(v_patch,'{feedback}',v_feedback,true);
  v_payload := jsonb_set(v_payload,'{patch}',v_patch,true);
  v_payload := jsonb_set(v_payload,'{feedback}',v_feedback,true);
  RETURN jsonb_set(v_command,'{payload}',v_payload,true);
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'INVALID_EXECUTION_FEEDBACK_PAYLOAD' USING errcode='22023';
END
$function$;

REVOKE ALL ON FUNCTION public.iberfit_prepare_command_rc30_v26(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_prepare_command_rc30_v26(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_persist_entity_v26(
  p_entity_type text,
  p_entity_id uuid,
  p_client_id uuid,
  p_status text,
  p_revision bigint,
  p_body jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_safe_body jsonb := p_body;
  v_completion_check jsonb;
BEGIN
  IF p_entity_type = 'session_execution' AND p_status = 'completada' THEN
    v_completion_check := public.iberfit_validate_execution_completion_v26(p_body);
    IF coalesce((v_completion_check->>'ok')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', coalesce(v_completion_check->>'reason','M26_EXECUTION_COMPLETION_INVALID')
        USING errcode = '22023', detail = coalesce(v_completion_check->>'missingResultKey','');
    END IF;
    v_safe_body := jsonb_set(p_body, '{feedback}', v_completion_check->'feedback', true);
  END IF;

  IF p_entity_type = ANY(array['checkin','habit','habit_log','private_note']) AND EXISTS (
    SELECT 1 FROM public.domain_entities_v26
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND client_id <> p_client_id
  ) THEN
    RAISE EXCEPTION 'ENTITY_CLIENT_MISMATCH' USING errcode = '42501';
  END IF;

  PERFORM public.iberfit_persist_entity_v26_rc29(
    p_entity_type, p_entity_id, p_client_id, p_status, p_revision, v_safe_body
  );

  IF p_entity_type = 'checkin' THEN
    INSERT INTO public.client_checkins_v26(
      id, client_id, energy, sleep, stress, pain, fatigue, motivation,
      notes, status, revision, recorded_at, created_by, created_at, updated_at
    ) VALUES (
      p_entity_id, p_client_id,
      (v_safe_body->>'energy')::numeric,
      (v_safe_body->>'sleep')::numeric,
      (v_safe_body->>'stress')::numeric,
      (v_safe_body->>'pain')::numeric,
      CASE WHEN v_safe_body ? 'fatigue' THEN nullif(v_safe_body->>'fatigue','')::numeric ELSE NULL END,
      CASE WHEN v_safe_body ? 'motivation' THEN nullif(v_safe_body->>'motivation','')::numeric ELSE NULL END,
      coalesce(v_safe_body->>'notes',''), p_status, p_revision,
      (v_safe_body->>'recordedAt')::timestamptz,
      coalesce(nullif(v_safe_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(v_safe_body->>'createdAt','')::timestamptz, now()), now()
    ) ON CONFLICT(id) DO UPDATE SET
      energy = excluded.energy,
      sleep = excluded.sleep,
      stress = excluded.stress,
      pain = excluded.pain,
      fatigue = CASE
        WHEN v_safe_body ? 'fatigue' THEN excluded.fatigue
        ELSE client_checkins_v26.fatigue
      END,
      motivation = CASE
        WHEN v_safe_body ? 'motivation' THEN excluded.motivation
        ELSE client_checkins_v26.motivation
      END,
      notes = excluded.notes,
      status = excluded.status,
      revision = excluded.revision,
      recorded_at = excluded.recorded_at,
      updated_at = now()
    WHERE client_checkins_v26.client_id = excluded.client_id;

  ELSIF p_entity_type = 'habit' THEN
    INSERT INTO public.client_habits_v26(
      id, client_id, title, description, target, unit, frequency, status,
      revision, created_by, created_at, updated_at
    ) VALUES (
      p_entity_id, p_client_id, v_safe_body->>'title', coalesce(v_safe_body->>'description',''),
      (v_safe_body->>'target')::numeric, v_safe_body->>'unit', v_safe_body->>'frequency',
      p_status, p_revision, coalesce(nullif(v_safe_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(v_safe_body->>'createdAt','')::timestamptz, now()), now()
    ) ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, description = excluded.description, target = excluded.target,
      unit = excluded.unit, frequency = excluded.frequency, status = excluded.status,
      revision = excluded.revision, updated_at = now()
    WHERE client_habits_v26.client_id = excluded.client_id;

  ELSIF p_entity_type = 'habit_log' THEN
    INSERT INTO public.client_habit_logs_v26(
      id, client_id, habit_id, completed, value, notes, status, revision,
      recorded_at, created_by, created_at, updated_at
    ) VALUES (
      p_entity_id, p_client_id, (v_safe_body->>'habitId')::uuid,
      coalesce((v_safe_body->>'completed')::boolean, false), v_safe_body->'value',
      coalesce(v_safe_body->>'notes',''), p_status, p_revision,
      (v_safe_body->>'recordedAt')::timestamptz,
      coalesce(nullif(v_safe_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(v_safe_body->>'createdAt','')::timestamptz, now()), now()
    ) ON CONFLICT(id) DO UPDATE SET
      completed = excluded.completed, value = excluded.value, notes = excluded.notes,
      status = excluded.status, revision = excluded.revision,
      recorded_at = excluded.recorded_at, updated_at = now()
    WHERE client_habit_logs_v26.client_id = excluded.client_id;

  ELSIF p_entity_type = 'private_note' THEN
    INSERT INTO public.coach_private_notes_v26(
      id, client_id, body, visibility, status, revision,
      created_by, created_at, updated_at
    ) VALUES (
      p_entity_id, p_client_id, v_safe_body->>'body', 'coach_only', p_status, p_revision,
      coalesce(nullif(v_safe_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(v_safe_body->>'createdAt','')::timestamptz, now()), now()
    ) ON CONFLICT(id) DO UPDATE SET
      body = excluded.body, visibility = 'coach_only', status = excluded.status,
      revision = excluded.revision, updated_at = now()
    WHERE coach_private_notes_v26.client_id = excluded.client_id;
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb) TO service_role;

DO $postcheck$
DECLARE
  v_env jsonb := public.iberfit_environment();
  v_old jsonb;
  v_new jsonb;
  v_null jsonb;
  v_bad_ok boolean := false;
  v_registry_count integer;
  v_direct_write_count integer;
BEGIN
  IF coalesce(v_env->>'environment','') <> 'QA'
     OR coalesce((v_env->>'realDataAllowed')::boolean,true) IS NOT FALSE
     OR coalesce((v_env->>'productionBlocked')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'RC74_4S_POSTCHECK_QA_ENVIRONMENT_FAILED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_checkins_v26'
      AND column_name='fatigue' AND is_nullable='YES'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='client_checkins_v26'
      AND column_name='motivation' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'RC74_4S_OPTIONAL_COLUMNS_MISSING';
  END IF;

  IF md5(pg_get_functiondef('public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb)'::regprocedure))
       <> '2414ce7aaa3c89227590bd366aee40e9' THEN
    RAISE EXCEPTION 'RC74_4S_PRE_RC74_4_HELPER_MUTATED';
  END IF;

  SELECT count(*) INTO v_registry_count FROM public.domain_command_registry_v26;
  IF v_registry_count <> 52 THEN
    RAISE EXCEPTION 'RC74_4S_COMMAND_REGISTRY_DRIFT:%',v_registry_count;
  END IF;

  SELECT count(*) INTO v_direct_write_count
  FROM pg_policies
  WHERE schemaname='public' AND tablename='client_checkins_v26'
    AND cmd IN ('INSERT','UPDATE','DELETE');
  IF v_direct_write_count <> 0 THEN
    RAISE EXCEPTION 'RC74_4S_DIRECT_CHECKIN_WRITE_POLICY_DRIFT:%',v_direct_write_count;
  END IF;

  v_old := public.iberfit_prepare_command_rc30_v26(jsonb_build_object(
    'type','CHECKIN_REGISTRAR','entityType','checkin',
    'clientId','00000000-0000-0000-0000-000000000001',
    'payload',jsonb_build_object('patch',jsonb_build_object(
      'energy',5,'sleep',6,'stress',3,'pain',0,'notes','',
      'recordedAt',now()
    ))
  ));
  IF (v_old->'payload'->'patch') ? 'fatigue'
     OR (v_old->'payload'->'patch') ? 'motivation' THEN
    RAISE EXCEPTION 'RC74_4S_LEGACY_OMISSION_NOT_PRESERVED';
  END IF;

  v_new := public.iberfit_prepare_command_rc30_v26(jsonb_build_object(
    'type','CHECKIN_REGISTRAR','entityType','checkin',
    'clientId','00000000-0000-0000-0000-000000000001',
    'payload',jsonb_build_object('patch',jsonb_build_object(
      'energy',5,'sleep',6,'stress',3,'pain',0,
      'fatigue',0,'motivation',10,'notes','',
      'recordedAt',now()
    ))
  ));
  IF (v_new->'payload'->'patch'->>'fatigue')::numeric <> 0
     OR (v_new->'payload'->'patch'->>'motivation')::numeric <> 10 THEN
    RAISE EXCEPTION 'RC74_4S_OPTIONAL_BOUNDARIES_FAILED';
  END IF;

  v_null := public.iberfit_prepare_command_rc30_v26(jsonb_build_object(
    'type','CHECKIN_REGISTRAR','entityType','checkin',
    'clientId','00000000-0000-0000-0000-000000000001',
    'payload',jsonb_build_object('patch',jsonb_build_object(
      'energy',5,'sleep',6,'stress',3,'pain',0,
      'fatigue',NULL,'motivation',NULL,'notes','',
      'recordedAt',now()
    ))
  ));
  IF jsonb_typeof(v_null->'payload'->'patch'->'fatigue') IS DISTINCT FROM 'null'
     OR jsonb_typeof(v_null->'payload'->'patch'->'motivation') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION 'RC74_4S_EXPLICIT_NULL_FAILED';
  END IF;

  BEGIN
    PERFORM public.iberfit_prepare_command_rc30_v26(jsonb_build_object(
      'type','CHECKIN_REGISTRAR','entityType','checkin',
      'clientId','00000000-0000-0000-0000-000000000001',
      'payload',jsonb_build_object('patch',jsonb_build_object(
        'energy',5,'sleep',6,'stress',3,'pain',0,
        'fatigue',11,'notes','', 'recordedAt',now()
      ))
    ));
  EXCEPTION WHEN SQLSTATE '22023' THEN
    v_bad_ok := true;
  END;
  IF NOT v_bad_ok THEN
    RAISE EXCEPTION 'RC74_4S_INVALID_OPTIONAL_SCORE_ACCEPTED';
  END IF;

  IF has_function_privilege('anon','public.iberfit_prepare_command_rc30_v26(jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.iberfit_prepare_command_rc30_v26(jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'RC74_4S_INTERNAL_EXECUTE_EXPOSED';
  END IF;
END
$postcheck$;
