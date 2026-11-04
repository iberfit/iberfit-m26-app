-- SIGNATURE U31 · staging-only occurrence-scoped command executor.
-- DEPENDS ON U30 + #1072. Not callable by Client, Coach, anon or service_role.
-- Public v26 command dispatcher remains untouched: NO production activation.
-- Explicit security-definer is safe only behind the private + REVOKE boundary.
SELECT 1 / CASE WHEN to_regclass('public.training_session_occurrences_v1') IS NOT NULL
  AND EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='session_executions'
      AND column_name='occurrence_id') THEN 1 ELSE 0 END AS u31_foundation_required;

CREATE FUNCTION private.iberfit_u31_occurrence_transition_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $u31$
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
    ELSIF v_role='cliente' THEN
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
$u31$;

-- An internal staging function is NOT a User/Service API. Postgres owner may
-- call it in QA inside BEGIN/ROLLBACK with a real actor JWT context only.
REVOKE ALL ON FUNCTION private.iberfit_u31_occurrence_transition_v1(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.iberfit_u31_occurrence_transition_v1(jsonb)
IS 'U31 staging. No exposed EXECUTE grants or public dispatcher registration; QA-only rehearsal until release certification.';
