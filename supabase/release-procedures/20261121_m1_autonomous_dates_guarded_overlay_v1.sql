-- IBERFIT M1 · ONE PROTECTED RELEASE · date-only and timed autonomous training WITHOUT fake appointments.
-- Apply only AFTER U72 has been installed while U60 public API is CLOSED.
-- QA: authorized synthetic recovery lane; PROD: protected single-transaction cutover with rollback and M44 DR.
-- The public U60 gateway ACL is intentionally not opened by this overlay.
-- Linked-appointment paths and all U31/U33/U60 auth, CAS, RLS, locks, audit and server-time windows remain.
-- Execute via psql --single-transaction with exact U72 installer + overlay + authorized U60 enable in one release window.

DO $m1_autonomous_preflight$
DECLARE v_env text := public.iberfit_environment()->>'environment';
BEGIN
  IF v_env NOT IN ('QA','PRODUCTION')
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_ENVIRONMENT_DENIED'; END IF;
  -- PROD must enter while U60 is still completely closed; never enable via DDL.
  IF to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NULL
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_U72_PREREQUISITE_MISSING'; END IF;
  IF v_env='PRODUCTION' AND (
    has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE'))
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROD_MUST_BE_CLOSED'; END IF;
  IF md5(pg_get_functiondef(to_regprocedure('private.iberfit_u31_occurrence_transition_v1(jsonb)'))) IS DISTINCT FROM '1fd072d7001d0a7ccc3129af3aa706dd'
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_U31_BASELINE_DRIFT'; END IF;
  IF md5(pg_get_functiondef(to_regprocedure('private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)'))) IS DISTINCT FROM '407cb324467ede6801d23ff458236fb5'
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_U33_BASELINE_DRIFT'; END IF;
  IF md5(pg_get_functiondef(to_regprocedure('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'))) IS DISTINCT FROM 'dd1027122e0843b44529cf87dad746b5'
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_U60_BASELINE_DRIFT'; END IF;
  IF (SELECT relrowsecurity FROM pg_class WHERE oid='public.training_session_occurrences_v1'::regclass) IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_OCCURRENCE_RLS_MISSING'; END IF;
END $m1_autonomous_preflight$;

CREATE OR REPLACE FUNCTION private.iberfit_u31_occurrence_transition_v1(p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_operation uuid;
  v_client uuid;
  v_occurrence uuid;
  v_execution uuid;
  v_type text;
  v_role text;
  v_base bigint;
  v_revision bigint;
  v_execution_base bigint;
  v_execution_ack_revision bigint;
  v_receipt public.command_receipts_v26%rowtype;
  v_occ public.training_session_occurrences_v1%rowtype;
  v_source public.domain_entities_v26%rowtype;
  v_appointment public.appointments%rowtype;
  v_appointment_body jsonb;
  v_appointment_domain_revision bigint;
  v_appointment_completion_state text;
  v_execution_body jsonb;
  v_execution_state public.domain_entities_v26%rowtype;
  v_queue jsonb;
  v_validation jsonb;
  v_results jsonb;
  v_skipped jsonb;
  v_events jsonb;
  v_feedback jsonb;
  v_service_guard jsonb;
  v_delivery_guard jsonb;
  v_status text;
  v_ack jsonb;
  v_request_hash text;
  v_now timestamptz := clock_timestamp();
  v_next bigint;
BEGIN
  -- IBERFIT_M1_AUTONOMOUS_DATES_V1: no-cita only for a signed, published guided prescription.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';
  END IF;
  IF jsonb_typeof(p_command) IS DISTINCT FROM 'object'
     OR octet_length(p_command::text)>524288 THEN
    RAISE EXCEPTION 'U31_INVALID_COMMAND' USING errcode='22023';
  END IF;
  BEGIN
    v_operation := nullif(p_command->>'operationId','')::uuid;
    v_client := nullif(p_command->>'clientId','')::uuid;
    v_occurrence := nullif(p_command->>'entityId','')::uuid;
    v_base := nullif(p_command->>'baseRevision','')::bigint;
    v_type := nullif(p_command->>'type','');
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'U31_INVALID_IDENTIFIERS' USING errcode='22023';
  END;
  IF v_operation IS NULL OR v_client IS NULL OR v_occurrence IS NULL
    OR v_base IS NULL OR v_base < 0
    OR v_type IS NULL
    OR v_type NOT IN ('OCURRENCIA_CONFIRMAR','OCURRENCIA_INICIAR','OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR')
    OR jsonb_typeof(coalesce(p_command->'payload','{}'::jsonb)) <> 'object'
  THEN
    RAISE EXCEPTION 'U31_INVALID_COMMAND' USING errcode='22023';
  END IF;
  -- Stable SHA256 canonical JSONB serialization detects operationId reuse
  -- with a different execution ID, results or feedback on a retried request.
  v_request_hash:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  v_role := public.iberfit_current_role_v26();
  IF NOT public.iberfit_can_access_client_v26(v_client)
     OR NOT public.iberfit_canary_enabled_v26(v_client) THEN
    RAISE EXCEPTION 'CLIENT_ACCESS_DENIED' USING errcode='42501';
  END IF;
  IF (v_type='OCURRENCIA_CONFIRMAR' AND v_role NOT IN ('coach','admin'))
     OR (v_type IN ('OCURRENCIA_INICIAR','OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR')
         AND v_role NOT IN ('coach','cliente')) THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED' USING errcode='42501';
  END IF;

  -- Same advisory key as the LIVE v26 executor prevents multi-device and
  -- mixed legacy/new execution races for the same Client.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('active_execution_client:'||v_client::text,0)
  );
  SELECT * INTO v_receipt FROM public.command_receipts_v26
    WHERE operation_id=v_operation FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.command_type <> v_type OR v_receipt.entity_type <> 'training_occurrence'
      OR v_receipt.entity_id<>v_occurrence OR v_receipt.client_id<>v_client
      OR v_receipt.actor_user_id<>v_actor OR v_receipt.base_revision<>v_base
      OR v_receipt.response->>'requestHash' IS DISTINCT FROM v_request_hash THEN
      RETURN jsonb_build_object('kind','rejected','reason','OPERATION_ID_REUSED',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    RETURN (v_receipt.response-'requestHash') || jsonb_build_object('duplicate',true);
  END IF;

  SELECT * INTO v_occ FROM public.training_session_occurrences_v1
  WHERE id=v_occurrence AND client_id=v_client FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind','rejected','reason','OCCURRENCE_NOT_FOUND',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  IF v_base<>v_occ.revision THEN
    RETURN jsonb_build_object('kind','conflict','reason','REVISION_MISMATCH',
      'operationId',v_operation,'remoteRevision',v_occ.revision,'serverAt',v_now);
  END IF;
  SELECT * INTO v_source FROM public.domain_entities_v26
  WHERE entity_type='session' AND entity_id=v_occ.session_id AND client_id=v_client;
  IF NOT FOUND OR v_source.status <> 'disponible' THEN
    RETURN jsonb_build_object('kind','rejected','reason','SOURCE_NOT_AVAILABLE',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  IF v_occ.prescription_revision>v_source.revision THEN
    RETURN jsonb_build_object('kind','rejected','reason','SOURCE_REVISION_INVALID',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  -- The source is a published guided prescription, not a mutable draft.
  IF v_source.body->>'deliveryModality'<>'guiada_en_app'
    OR jsonb_typeof(v_source.body->'blocks')<>'array'
    OR jsonb_array_length(v_source.body->'blocks')=0 THEN
    RETURN jsonb_build_object('kind','rejected','reason','SOURCE_NOT_GUIDED',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  v_next := v_occ.revision+1;

  IF v_type='OCURRENCIA_CONFIRMAR' THEN
    IF v_occ.status<>'planificada' THEN
      RETURN jsonb_build_object('kind','rejected','reason','TRANSITION_FORBIDDEN',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    UPDATE public.training_session_occurrences_v1 SET
      status='confirmada',revision=v_next,updated_at=v_now
    WHERE id=v_occ.id AND client_id=v_client AND revision=v_occ.revision;
    v_status:='confirmada';

  ELSIF v_type='OCURRENCIA_INICIAR' THEN
    IF v_occ.status<>'confirmada' THEN
      RETURN jsonb_build_object('kind','rejected','reason','TRANSITION_FORBIDDEN',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    BEGIN
      v_execution:=nullif(p_command#>>'{payload,executionId}','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'U31_EXECUTION_ID_INVALID' USING errcode='22023';
    END;
    IF v_execution IS NULL THEN
      RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_ID_REQUIRED',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    IF v_occ.appointment_id IS NOT NULL THEN
      SELECT * INTO v_appointment FROM public.appointments
      WHERE id=v_occ.appointment_id AND client_id=v_client
        AND session_id=v_occ.session_id AND status='confirmada';
      IF NOT FOUND OR (v_occ.starts_at IS NOT NULL
        AND v_appointment.start_at IS DISTINCT FROM v_occ.starts_at) THEN
        RETURN jsonb_build_object('kind','rejected','reason','CONFIRMED_APPOINTMENT_REQUIRED',
          'operationId',v_operation,'serverAt',v_now);
      END IF;
    ELSIF v_role='cliente' AND NOT (
      v_source.body->>'deliveryModality'='guiada_en_app'
      AND v_source.body->>'deliveryOwnership' IN ('guided_in_app','client_autonomous')
      AND v_source.body->>'clientVisibilityLevel'='full'
      AND v_source.body->>'visibleToClient'='true'
      AND v_occ.prescription_revision<=v_source.revision
      AND v_occ.prescription_snapshot->>'clientId'=v_client::text
      AND v_occ.prescription_snapshot->>'sessionId'=v_occ.session_id::text
    ) THEN
      RETURN jsonb_build_object('kind','rejected','reason','CONFIRMED_APPOINTMENT_REQUIRED',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    -- For any dated start, prevent unintended opening of a future week.
    IF v_occ.starts_at IS NOT NULL AND (
      v_now < v_occ.starts_at-interval '6 hours'
      OR v_now > v_occ.ends_at+interval '30 days'
    ) THEN
      RETURN jsonb_build_object('kind','rejected','reason','START_WINDOW_INVALID',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    IF v_occ.starts_at IS NULL
      AND v_occ.local_date > (v_now AT TIME ZONE v_occ.time_zone)::date THEN
      RETURN jsonb_build_object('kind','rejected','reason','FUTURE_DATE',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    IF EXISTS (SELECT 1 FROM public.active_execution_locks_v26
      WHERE client_id=v_client) THEN
      RETURN jsonb_build_object('kind','conflict','reason','ACTIVE_EXECUTION_EXISTS',
        'operationId',v_operation,'remoteRevision',v_occ.revision,'serverAt',v_now);
    END IF;
    -- Reapply existing LIVE guards using server-owned session/appointment
    -- identifiers. No untrusted modality or session metadata can bypass them.
    v_service_guard:=private.iberfit_training_command_guard_v1(
      jsonb_build_object('type','SESION_INICIAR','clientId',v_client,
        'entityId',v_occ.session_id,'payload',
        jsonb_build_object('appointmentId',v_occ.appointment_id))
    );
    IF coalesce((v_service_guard->>'allowed')::boolean,false) IS NOT TRUE THEN
      RETURN jsonb_build_object('kind','rejected','reason','TRAINING_SERVICE_NOT_ACTIVE',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    v_delivery_guard:=private.iberfit_session_delivery_guard_m28(
      jsonb_build_object('type','SESION_INICIAR','clientId',v_client,
        'entityId',v_occ.session_id,'payload',
        jsonb_build_object('appointmentId',v_occ.appointment_id))
    );
    IF coalesce((v_delivery_guard->>'allowed')::boolean,false) IS NOT TRUE THEN
      RETURN jsonb_build_object('kind','rejected',
        'reason',coalesce(v_delivery_guard->>'reason','DELIVERY_FORBIDDEN'),
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    IF v_role='cliente' AND (
      v_source.body->>'deliveryOwnership' NOT IN ('guided_in_app','client_autonomous')
      OR v_source.body->>'clientVisibilityLevel'<>'full'
      OR v_source.body->>'visibleToClient'<>'true'
    ) THEN
      RETURN jsonb_build_object('kind','rejected','reason','CLIENT_DELIVERY_FORBIDDEN',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    v_queue:=coalesce(
      v_occ.prescription_snapshot->'queue',
      v_occ.prescription_snapshot->'items',
      v_occ.prescription_snapshot->'blocks'
    );
    IF jsonb_typeof(v_queue) IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_queue)=0 THEN
      RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_QUEUE_REQUIRED',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_queue) item
      WHERE nullif(item->>'exerciseId','') IS NULL
        OR (item->>'sets') !~ '^[0-9]{1,3}$'
        OR (item->>'sets')::integer NOT BETWEEN 1 AND 100) THEN
      RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_QUEUE_INVALID',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    IF EXISTS (SELECT 1 FROM public.domain_entities_v26
      WHERE entity_type='session_execution' AND entity_id=v_execution)
      OR EXISTS (SELECT 1 FROM public.session_executions WHERE id=v_execution) THEN
      RETURN jsonb_build_object('kind','conflict','reason','EXECUTION_ID_ALREADY_USED',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    v_execution_body:=jsonb_build_object(
      'id',v_execution,'clientId',v_client,'sessionId',v_occ.session_id,
      'occurrenceId',v_occ.id,'appointmentId',v_occ.appointment_id,
      'status','en_curso','revision',1,'startedAt',v_now,'startedBy',v_actor,
      'sourceRevision',v_occ.prescription_revision,
      'sourceSnapshot',v_occ.prescription_snapshot,
      'queue',v_queue,'results','{}'::jsonb,'skippedSets','{}'::jsonb,
      'events','[]'::jsonb,'items',v_queue);
    INSERT INTO public.domain_entities_v26(
      entity_type,entity_id,client_id,status,revision,body
    ) VALUES ('session_execution',v_execution,v_client,'en_curso',1,v_execution_body);
    INSERT INTO public.session_executions(
      id,client_id,session_id,occurrence_id,execution_status,
      summary,started_by,revision
    ) VALUES (v_execution,v_client,v_occ.session_id,v_occ.id,'activa',
      v_execution_body,v_actor,1);
    INSERT INTO public.active_execution_locks_v26(
      client_id,session_id,execution_id,acquired_by
    ) VALUES (v_client,v_occ.session_id,v_execution,v_actor);
    UPDATE public.training_session_occurrences_v1 SET
      status='en_curso',execution_id=v_execution,
      start_operation_id=v_operation,revision=v_next,updated_at=v_now
    WHERE id=v_occ.id AND client_id=v_client AND revision=v_occ.revision;
    v_status:='en_curso';
    v_execution_ack_revision:=1;

  ELSIF v_type='OCURRENCIA_GUARDAR_PROGRESO' THEN
    IF v_occ.status<>'en_curso' OR v_occ.execution_id IS NULL THEN
      RETURN jsonb_build_object('kind','rejected','reason','TRANSITION_FORBIDDEN',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    BEGIN
      v_execution:=nullif(p_command#>>'{payload,executionId}','')::uuid;
      v_execution_base:=nullif(p_command#>>'{payload,executionBaseRevision}','')::bigint;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'U31_EXECUTION_IDENTIFIERS_INVALID' USING errcode='22023';
    END;
    IF v_execution IS DISTINCT FROM v_occ.execution_id THEN
      RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_MISMATCH',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    SELECT * INTO v_execution_state FROM public.domain_entities_v26
      WHERE entity_type='session_execution' AND entity_id=v_execution
        AND client_id=v_client FOR UPDATE;
    IF NOT FOUND OR v_execution_state.status NOT IN ('en_curso','pausada') THEN
      RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_NOT_ACTIVE',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    IF v_execution_base IS NULL OR v_execution_state.revision<>v_execution_base THEN
      RETURN jsonb_build_object('kind','conflict','reason','EXECUTION_REVISION_MISMATCH',
        'operationId',v_operation,'remoteRevision',v_occ.revision,
        'executionRevision',v_execution_state.revision,'serverAt',v_now);
    END IF;
    IF v_execution_state.body->>'occurrenceId' IS DISTINCT FROM v_occ.id::text
      OR v_execution_state.body->>'sessionId' IS DISTINCT FROM v_occ.session_id::text THEN
      RAISE EXCEPTION 'U31_EXECUTION_OWNER_MISMATCH' USING errcode='42501';
    END IF;
    v_results:=p_command#>'{payload,results}';
    v_skipped:=coalesce(p_command#>'{payload,skippedSets}','{}'::jsonb);
    IF jsonb_typeof(v_results) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_skipped) IS DISTINCT FROM 'object'
      OR octet_length(v_results::text)>262144
      OR octet_length(v_skipped::text)>262144 THEN
      RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_CONTENT_INVALID',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    v_execution_body:=v_execution_state.body || jsonb_build_object(
      'revision',v_execution_base+1,'results',v_results,
      'skippedSets',v_skipped,'updatedAt',v_now);
    UPDATE public.domain_entities_v26 SET
      revision=v_execution_base+1,body=v_execution_body,updated_at=v_now
    WHERE entity_type='session_execution' AND entity_id=v_execution
      AND client_id=v_client AND revision=v_execution_base;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'U31_PROGRESS_CAS_LOST' USING errcode='40001';
    END IF;
    UPDATE public.session_executions SET
      revision=v_execution_base+1,summary=v_execution_body,updated_at=v_now
    WHERE id=v_execution AND session_id=v_occ.session_id
      AND client_id=v_client AND occurrence_id=v_occ.id
      AND revision=v_execution_base;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'U31_PROGRESS_MIRROR_CAS_LOST' USING errcode='40001';
    END IF;
    -- Progress advances only execution revision; the occurrence remains
    -- en_curso/revision=2 until the eventual validated completion.
    v_next:=v_occ.revision;
    v_execution_ack_revision:=v_execution_base+1;
    v_status:='en_curso';

  ELSE -- OCURRENCIA_COMPLETAR: validate the EXACT existing completion contract.
    v_appointment_completion_state:='no_appointment';
    IF v_occ.status<>'en_curso' OR v_occ.execution_id IS NULL THEN
      RETURN jsonb_build_object('kind','rejected','reason','TRANSITION_FORBIDDEN',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    BEGIN
      v_execution:=nullif(p_command#>>'{payload,executionId}','')::uuid;
      v_execution_base:=nullif(p_command#>>'{payload,executionBaseRevision}','')::bigint;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'U31_EXECUTION_IDENTIFIERS_INVALID' USING errcode='22023';
    END;
    IF v_execution IS DISTINCT FROM v_occ.execution_id THEN
      RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_MISMATCH',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    SELECT * INTO v_execution_state FROM public.domain_entities_v26
      WHERE entity_type='session_execution' AND entity_id=v_execution
        AND client_id=v_client FOR UPDATE;
    IF NOT FOUND OR v_execution_state.status NOT IN ('en_curso','pausada') THEN
      RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_NOT_ACTIVE',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    IF v_execution_base IS NULL OR v_execution_state.revision<>v_execution_base THEN
      RETURN jsonb_build_object('kind','conflict','reason','EXECUTION_REVISION_MISMATCH',
        'operationId',v_operation,'remoteRevision',v_occ.revision,
        'executionRevision',v_execution_state.revision,'serverAt',v_now);
    END IF;
    IF v_execution_state.body->>'occurrenceId' IS DISTINCT FROM v_occ.id::text
      OR v_execution_state.body->>'sessionId' IS DISTINCT FROM v_occ.session_id::text
    THEN
      RAISE EXCEPTION 'U31_EXECUTION_OWNER_MISMATCH' USING errcode='42501';
    END IF;
    v_results:=p_command#>'{payload,results}';
    v_skipped:=coalesce(p_command#>'{payload,skippedSets}','{}'::jsonb);
    v_feedback:=p_command#>'{payload,feedback}';
    IF jsonb_typeof(v_results) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_skipped) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_feedback) IS DISTINCT FROM 'object' THEN
      RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_CONTENT_INVALID',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    v_events:=coalesce(v_execution_state.body->'events','[]'::jsonb)
      || jsonb_build_array(jsonb_build_object(
        'type','SESSION_COMPLETED','payload',v_feedback,'occurredAt',v_now));
    v_execution_body:=v_execution_state.body || jsonb_build_object(
      'status','completada','revision',v_execution_base+1,
      'results',v_results,'skippedSets',v_skipped,'events',v_events,
      'completedAt',v_now,'completedBy',v_actor,'updatedAt',v_now);
    v_validation:=public.iberfit_validate_execution_completion_v26(v_execution_body);
    IF coalesce((v_validation->>'ok')::boolean,false) IS NOT TRUE THEN
      RETURN jsonb_build_object('kind','rejected',
        'reason',coalesce(v_validation->>'reason','EXECUTION_INVALID'),
        'operationId',v_operation,'missingResultKey',v_validation->>'missingResultKey',
        'serverAt',v_now);
    END IF;
    v_execution_body:=jsonb_set(
      v_execution_body,'{feedback}',v_validation->'feedback',true);
    IF v_occ.appointment_id IS NOT NULL THEN
      -- A cancelled appointment must NEVER be resurrected simply because
      -- the workout finishes later. An active confirmed appointment should
      -- be completed atomically with the dated execution, not left open.
      SELECT * INTO v_appointment FROM public.appointments
        WHERE id=v_occ.appointment_id AND client_id=v_client
          AND session_id=v_occ.session_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'U31_APPOINTMENT_OWNERSHIP_DRIFT'
          USING errcode='23503';
      END IF;
      v_appointment_completion_state:='preserved_'||v_appointment.status;
      IF v_appointment.status='confirmada' THEN
        SELECT body,revision INTO v_appointment_body,v_appointment_domain_revision
          FROM public.domain_entities_v26
          WHERE entity_type='appointment'
            AND entity_id=v_occ.appointment_id AND client_id=v_client FOR UPDATE;
        IF v_appointment_body IS NULL THEN
          v_appointment_body:=public.iberfit_base_entity_v26(
            'appointment',v_occ.appointment_id,v_client);
          v_appointment_domain_revision:=v_appointment.revision;
        END IF;
        IF v_appointment_domain_revision IS DISTINCT FROM v_appointment.revision
          OR v_appointment_body IS NULL THEN
          -- Never overwrite an appointment whose canonical and typed
          -- revisions disagree; return a recoverable conflict without
          -- recording an incorrect completion.
          RETURN jsonb_build_object('kind','conflict',
            'reason','U31_APPOINTMENT_REVISION_DRIFT',
            'operationId',v_operation,'remoteRevision',v_occ.revision,
            'appointmentRevision',v_appointment.revision,'serverAt',v_now);
        END IF;
        v_appointment_body:=v_appointment_body||jsonb_build_object(
          'status','completada',
          'revision',v_appointment_domain_revision+1,
          'completedAt',v_now,'completedBy',v_actor,'updatedAt',v_now);
        PERFORM public.iberfit_persist_entity_v26(
          'appointment',v_occ.appointment_id,v_client,'completada',
          v_appointment_domain_revision+1,v_appointment_body);
        v_appointment_completion_state:='completed';
      END IF;
      v_execution_body:=v_execution_body||jsonb_build_object(
        'appointmentCompletionState',v_appointment_completion_state);
    END IF;
    UPDATE public.domain_entities_v26 SET
      status='completada',revision=v_execution_base+1,
      body=v_execution_body,updated_at=v_now
    WHERE entity_type='session_execution' AND entity_id=v_execution
      AND client_id=v_client AND revision=v_execution_base;
    UPDATE public.session_executions SET
      execution_status='cerrada_confirmada',close_operation_id=v_operation,
      remote_confirmed_at=v_now,summary=v_execution_body,
      revision=v_execution_base+1,updated_at=v_now
    WHERE id=v_execution AND session_id=v_occ.session_id
      AND client_id=v_client AND occurrence_id=v_occ.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'U31_MIRROR_EXECUTION_MISSING' USING errcode='23503';
    END IF;
    DELETE FROM public.active_execution_locks_v26
      WHERE client_id=v_client AND execution_id=v_execution;
    UPDATE public.training_session_occurrences_v1 SET
      status='completada',close_operation_id=v_operation,
      revision=v_next,updated_at=v_now
    WHERE id=v_occ.id AND client_id=v_client AND revision=v_occ.revision;
    -- NEVER call iberfit_persist_entity_v26('session',...) here.
    -- The next scheduled occurrence must retain the source prescription.
    v_status:='completada';
    v_execution_ack_revision:=v_execution_base+1;
  END IF;

  v_ack:=jsonb_build_object(
    'kind','ack','operationId',v_operation,
    'entityId',v_occ.id,'entityType','training_occurrence',
    'remoteRevision',v_next,'status',v_status,'executionId',v_execution,
    'executionRevision',v_execution_ack_revision,
    'appointmentCompletionState',v_appointment_completion_state,
    'serverAt',v_now,'duplicate',false);
  INSERT INTO public.command_receipts_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,base_revision,remote_revision,response,processed_at
  ) VALUES (
    v_operation,v_type,'training_occurrence',v_occ.id,v_client,
    v_actor,v_base,v_next,
    v_ack || jsonb_build_object('requestHash',v_request_hash),v_now
  );
  INSERT INTO public.command_events_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,phase,base_revision,remote_revision,payload_hash
  ) VALUES (v_operation,v_type,'training_occurrence',v_occ.id,v_client,
    v_actor,'applied',v_base,v_next,v_request_hash);
  INSERT INTO public.domain_events_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,actor_role,phase,from_status,to_status,
    base_revision,remote_revision,details
  ) VALUES (v_operation,v_type,'training_occurrence',v_occ.id,v_client,
    v_actor,v_role,'applied',v_occ.status,v_status,
    v_base,v_next,jsonb_build_object('sessionId',v_occ.session_id,
      'occurrenceId',v_occ.id,'executionId',v_execution));
  RETURN v_ack;
END;
$function$;

CREATE OR REPLACE FUNCTION private.iberfit_u33_occurrence_calendar_v1(p_client_id uuid, p_start_date date, p_end_date date, p_after_date date DEFAULT NULL::date, p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_rows jsonb;
  v_last jsonb;
  v_n integer;
  v_more boolean;
BEGIN
  -- IBERFIT_M1_AUTONOMOUS_DATES_V1: no-cita only for a signed, published guided prescription.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';
  END IF;
  IF p_client_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL
    OR p_end_date < p_start_date OR p_end_date > p_start_date + 92
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR ((p_after_date IS NULL) <> (p_after_id IS NULL))
  THEN
    RAISE EXCEPTION 'U33_INVALID_CALENDAR_QUERY' USING errcode='22023';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role NOT IN ('coach','cliente')
    OR NOT public.iberfit_can_access_client_v26(p_client_id)
    OR NOT public.iberfit_canary_enabled_v26(p_client_id)
  THEN
    RAISE EXCEPTION 'CLIENT_ACCESS_DENIED' USING errcode='42501';
  END IF;

  -- Cursor uses the immutable (local_date,id) pair, never OFFSET. A Client
  -- only sees a linked appointment for a currently visible, published source;
  -- unconfirmed Coach drafts and unlinked occurrences are never projected.
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',s.id,'clientId',s.client_id,'sessionId',s.session_id,
      'appointmentId',s.appointment_id,'appointmentStatus',s.appointment_status,
      'localDate',s.local_date,'localTime',s.local_time,
      'timeZone',s.time_zone,'startsAt',s.starts_at,'endsAt',s.ends_at,
      'durationMinutes',s.duration_minutes,'status',s.status,
      'revision',s.revision,'executionId',
        CASE WHEN s.status='en_curso' THEN s.execution_id ELSE NULL END,
      'title',s.session_title
    ) ORDER BY s.local_date,s.id
  ),'[]'::jsonb) INTO v_rows
  FROM (
    SELECT o.id,o.client_id,o.session_id,o.appointment_id,
      ap.status AS appointment_status,o.local_date,o.local_time,o.time_zone,
      o.starts_at,o.ends_at,o.duration_minutes,o.status,o.revision,
      o.execution_id,o.prescription_snapshot->>'title' AS session_title
    FROM public.training_session_occurrences_v1 o
    LEFT JOIN public.appointments ap
      ON ap.id=o.appointment_id AND ap.client_id=o.client_id
        AND ap.session_id=o.session_id
    WHERE o.client_id=p_client_id
      AND o.local_date BETWEEN p_start_date AND p_end_date
      AND (p_after_date IS NULL OR (o.local_date,o.id)>(p_after_date,p_after_id))
      AND (v_role='coach' OR (
        o.status IN ('confirmada','en_curso','completada','cancelada')
        AND (
          (o.appointment_id IS NULL AND ap.id IS NULL
            AND o.prescription_snapshot->>'clientId'=o.client_id::text
            AND o.prescription_snapshot->>'sessionId'=o.session_id::text
            AND jsonb_typeof(o.prescription_snapshot->'queue')='array'
            AND jsonb_array_length(o.prescription_snapshot->'queue')>0)
          OR (o.appointment_id IS NOT NULL AND ap.id IS NOT NULL AND (
          (o.status='confirmada' AND ap.status='confirmada')
          OR (o.status='en_curso' AND ap.status IN ('confirmada','cancelada'))
          OR (o.status='completada' AND ap.status IN ('completada','cancelada','confirmada'))
          OR (o.status='cancelada' AND ap.status IN ('confirmada','cancelada','completada'))
          )))
        AND EXISTS (
          SELECT 1 FROM public.domain_entities_v26 source
          WHERE source.entity_type='session'
            AND source.entity_id=o.session_id
            AND source.client_id=o.client_id
            AND source.status='disponible'
            AND source.body->>'visibleToClient'='true'
            AND source.body->>'clientVisibilityLevel'='full'
            AND source.body->>'deliveryModality'='guiada_en_app'
            AND source.body->>'deliveryOwnership' IN ('guided_in_app','client_autonomous')
            AND source.revision>=o.prescription_revision
        )
      ))
    ORDER BY o.local_date,o.id
    LIMIT p_limit + 1
  ) s;
  v_n:=jsonb_array_length(v_rows);
  v_more:=v_n>p_limit;
  IF v_more THEN
    v_last:=v_rows->(p_limit-1);
    SELECT coalesce(jsonb_agg(item.value ORDER BY item.ordinality),'[]'::jsonb)
      INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS item(value,ordinality)
    WHERE item.ordinality<=p_limit;
  END IF;
  RETURN jsonb_build_object(
    'kind','calendar','clientId',p_client_id,'timeZone','America/Santiago',
    'startDate',p_start_date,'endDate',p_end_date,
    'count',jsonb_array_length(v_rows),'occurrences',v_rows,
    'hasMore',v_more,
    'nextCursor',CASE WHEN v_more
       THEN jsonb_build_object('localDate',v_last->>'localDate','id',v_last->>'id')
       ELSE NULL END
  );
END
$function$;

CREATE OR REPLACE FUNCTION private.iberfit_u60_occurrence_detail_v1(p_client_id uuid, p_occurrence_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_occ public.training_session_occurrences_v1%rowtype;
  v_source public.domain_entities_v26%rowtype;
  v_execution public.domain_entities_v26%rowtype;
  v_typed public.session_executions%rowtype;
  v_ap_status text;
  v_ap public.appointments%rowtype;
  v_snapshot jsonb;
  v_execution_snapshot jsonb;
  v_execution_body jsonb;
BEGIN
  -- IBERFIT_M1_AUTONOMOUS_DATES_V1: no-cita only for a signed, published guided prescription.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';
  END IF;
  IF p_client_id IS NULL OR p_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'U60_READ_IDENTIFIERS_REQUIRED' USING errcode='22023';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role NOT IN ('coach','cliente')
    OR NOT public.iberfit_can_access_client_v26(p_client_id)
    OR NOT public.iberfit_canary_enabled_v26(p_client_id) THEN
    RAISE EXCEPTION 'CLIENT_ACCESS_DENIED' USING errcode='42501';
  END IF;
  SELECT * INTO v_occ FROM public.training_session_occurrences_v1
    WHERE id=p_occurrence_id AND client_id=p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'U60_OCCURRENCE_NOT_FOUND' USING errcode='42501';
  END IF;
  SELECT * INTO v_source FROM public.domain_entities_v26
    WHERE entity_type='session' AND entity_id=v_occ.session_id
      AND client_id=v_occ.client_id AND status='disponible';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'U60_SOURCE_NOT_AVAILABLE' USING errcode='42501';
  END IF;
  IF v_occ.appointment_id IS NOT NULL THEN
    SELECT * INTO v_ap FROM public.appointments
      WHERE id=v_occ.appointment_id AND client_id=v_occ.client_id
        AND session_id=v_occ.session_id;
    IF NOT FOUND OR v_ap.start_at IS DISTINCT FROM v_occ.starts_at
      OR v_ap.end_at IS DISTINCT FROM v_occ.ends_at
      OR v_ap.time_zone IS DISTINCT FROM v_occ.time_zone
      OR (v_occ.starts_at AT TIME ZONE v_occ.time_zone)::date
        IS DISTINCT FROM v_occ.local_date
      OR (v_occ.starts_at AT TIME ZONE v_occ.time_zone)::time
        IS DISTINCT FROM v_occ.local_time THEN
      RAISE EXCEPTION 'U60_LINKED_APPOINTMENT_DRIFT' USING errcode='42501';
    END IF;
    v_ap_status:=v_ap.status;
  END IF;
  -- Match the Client visibility conditions of U33, including cancellation
  -- after an in-flight execution. No unpublished draft or unlinked read.
  IF v_role='cliente' AND (
    v_occ.status='planificada'
    OR v_source.body->>'visibleToClient' IS DISTINCT FROM 'true'
    OR v_source.body->>'deliveryOwnership' NOT IN ('guided_in_app','client_autonomous')
    OR v_source.body->>'clientVisibilityLevel' IS DISTINCT FROM 'full'
    OR v_source.body->>'deliveryModality' IS DISTINCT FROM 'guiada_en_app'
    OR NOT (
      (v_occ.appointment_id IS NULL AND v_ap_status IS NULL
        AND v_occ.prescription_revision<=v_source.revision
        AND v_occ.prescription_snapshot->>'clientId'=v_occ.client_id::text
        AND v_occ.prescription_snapshot->>'sessionId'=v_occ.session_id::text)
      OR (v_occ.appointment_id IS NOT NULL AND (
      (v_occ.status='confirmada' AND v_ap_status='confirmada')
      OR (v_occ.status='en_curso' AND v_ap_status IN ('confirmada','cancelada'))
      OR (v_occ.status='completada' AND v_ap_status IN ('completada','cancelada','confirmada'))
      OR (v_occ.status='cancelada' AND v_ap_status IN ('confirmada','cancelada','completada'))
      ))
  ) THEN
    RAISE EXCEPTION 'U60_CLIENT_DATE_NOT_PUBLISHED' USING errcode='42501';
  END IF;
  IF v_occ.prescription_snapshot->>'clientId' IS DISTINCT FROM v_occ.client_id::text
    OR v_occ.prescription_snapshot->>'sessionId' IS DISTINCT FROM v_occ.session_id::text
    OR jsonb_typeof(v_occ.prescription_snapshot->'queue') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_occ.prescription_snapshot->'blocks') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_occ.prescription_snapshot->'queue')=0
    OR jsonb_array_length(v_occ.prescription_snapshot->'blocks')=0 THEN
    RAISE EXCEPTION 'U60_SOURCE_SNAPSHOT_INVALID' USING errcode='42501';
  END IF;
  v_snapshot:=jsonb_build_object(
    'clientId',v_occ.client_id,'sessionId',v_occ.session_id,
    'cycleId',v_occ.prescription_snapshot->'cycleId',
    'title',v_occ.prescription_snapshot->'title',
    'queue',v_occ.prescription_snapshot->'queue',
    'blocks',v_occ.prescription_snapshot->'blocks'
  );
  v_execution_body:=NULL;
  IF v_occ.execution_id IS NULL THEN
    IF v_occ.status IN ('en_curso','completada') THEN
      RAISE EXCEPTION 'U60_EXECUTION_LINK_MISSING' USING errcode='42501';
    END IF;
  ELSE
    IF v_occ.status NOT IN ('en_curso','completada') THEN
      RAISE EXCEPTION 'U60_EXECUTION_STATUS_DRIFT' USING errcode='42501';
    END IF;
    SELECT * INTO v_execution FROM public.domain_entities_v26
      WHERE entity_type='session_execution'
        AND entity_id=v_occ.execution_id AND client_id=v_occ.client_id;
    SELECT * INTO v_typed FROM public.session_executions
      WHERE id=v_occ.execution_id AND client_id=v_occ.client_id
        AND session_id=v_occ.session_id AND occurrence_id=v_occ.id;
    IF v_execution.entity_id IS NULL OR v_typed.id IS NULL
      OR NOT (v_execution.status=v_occ.status OR
        (v_occ.status='en_curso' AND v_execution.status='pausada'))
      OR v_typed.revision IS DISTINCT FROM v_execution.revision
      OR v_typed.summary IS DISTINCT FROM v_execution.body
      OR (v_occ.status='en_curso' AND NOT (
        (v_execution.status='en_curso' AND v_typed.execution_status='activa')
        OR (v_execution.status='pausada' AND v_typed.execution_status='pausada')))
      OR (v_occ.status='completada' AND (
        v_typed.execution_status IS DISTINCT FROM 'cerrada_confirmada'
        OR v_typed.remote_confirmed_at IS NULL))
      OR v_execution.body->>'occurrenceId' IS DISTINCT FROM v_occ.id::text
      OR v_execution.body->>'sessionId' IS DISTINCT FROM v_occ.session_id::text
      OR v_execution.body->>'clientId' IS DISTINCT FROM v_occ.client_id::text
      OR v_execution.body->'queue' IS DISTINCT FROM v_occ.prescription_snapshot->'queue'
      OR jsonb_typeof(v_execution.body->'sourceSnapshot') IS DISTINCT FROM 'object'
      OR v_execution.body#>'{sourceSnapshot,queue}' IS DISTINCT FROM v_occ.prescription_snapshot->'queue'
      OR v_execution.body#>'{sourceSnapshot,blocks}' IS DISTINCT FROM v_occ.prescription_snapshot->'blocks'
    THEN
      RAISE EXCEPTION 'U60_EXECUTION_INTEGRITY_DRIFT' USING errcode='42501';
    END IF;
    v_execution_snapshot:=jsonb_build_object(
      'clientId',v_occ.client_id,'sessionId',v_occ.session_id,
      'cycleId',v_execution.body#>'{sourceSnapshot,cycleId}',
      'title',v_execution.body#>'{sourceSnapshot,title}',
      'queue',v_execution.body#>'{sourceSnapshot,queue}',
      'blocks',v_execution.body#>'{sourceSnapshot,blocks}'
    );
    v_execution_body:=jsonb_build_object(
      'id',v_execution.entity_id,'clientId',v_occ.client_id,
      'sessionId',v_occ.session_id,'occurrenceId',v_occ.id,
      'status',v_execution.status,'revision',v_execution.revision,
      'startedAt',v_execution.body->'startedAt',
      'activeSince',v_execution.body->'activeSince',
      'pausedAt',v_execution.body->'pausedAt',
      'accumulatedActiveMs',v_execution.body->'accumulatedActiveMs',
      'completedAt',v_execution.body->'completedAt',
      'sourceSnapshot',v_execution_snapshot,
      'queue',v_execution.body->'queue',
      'results',v_execution.body->'results',
      'skippedSets',v_execution.body->'skippedSets',
      'events',v_execution.body->'events',
      'feedback',v_execution.body->'feedback'
    );
  END IF;
  IF octet_length(v_snapshot::text)>524288
    OR octet_length(coalesce(v_execution_body,'{}'::jsonb)::text)>1048576 THEN
    RAISE EXCEPTION 'U60_PRIVATE_READ_SIZE_LIMIT' USING errcode='54000';
  END IF;
  RETURN jsonb_build_object(
    'kind','private-occurrence',
    'occurrence',jsonb_build_object(
      'id',v_occ.id,'clientId',v_occ.client_id,'sessionId',v_occ.session_id,
      'appointmentId',v_occ.appointment_id,'localDate',v_occ.local_date,
      'localTime',v_occ.local_time,'timeZone',v_occ.time_zone,
      'startsAt',v_occ.starts_at,'endsAt',v_occ.ends_at,
      'durationMinutes',v_occ.duration_minutes,'status',v_occ.status,
      'revision',v_occ.revision,'executionId',v_occ.execution_id),
    'prescriptionSnapshot',v_snapshot,'executionBody',v_execution_body);
END;
$function$;

REVOKE ALL ON FUNCTION private.iberfit_u31_occurrence_transition_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.iberfit_u60_occurrence_detail_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $m1_autonomous_postcheck$
DECLARE v_env text := public.iberfit_environment()->>'environment';
BEGIN
  IF position('IBERFIT_M1_AUTONOMOUS_DATES_V1' in pg_get_functiondef(to_regprocedure('private.iberfit_u31_occurrence_transition_v1(jsonb)'))) = 0
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_U31_INSTALL_FAILED'; END IF;
  IF position('IBERFIT_M1_AUTONOMOUS_DATES_V1' in pg_get_functiondef(to_regprocedure('private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)'))) = 0
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_U33_INSTALL_FAILED'; END IF;
  IF position('IBERFIT_M1_AUTONOMOUS_DATES_V1' in pg_get_functiondef(to_regprocedure('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'))) = 0
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_U60_INSTALL_FAILED'; END IF;
  IF v_env='PRODUCTION' AND has_function_privilege('authenticated',
       'public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROD_ENABLED_PREMATURELY'; END IF;
  IF has_function_privilege('authenticated','private.iberfit_u31_occurrence_transition_v1(jsonb)','EXECUTE')
      OR has_function_privilege('authenticated','private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)','EXECUTE')
      OR has_function_privilege('authenticated','private.iberfit_u60_occurrence_detail_v1(uuid,uuid)','EXECUTE')
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PRIVATE_ACL_DRIFT'; END IF;
END $m1_autonomous_postcheck$;
