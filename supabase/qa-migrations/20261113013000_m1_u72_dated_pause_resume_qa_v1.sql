-- IBERFIT M1 U72 · synthetic QA ONLY, closed new private transition.
-- Shared authenticated U60 bridge retains legacy behavior except fail-closed
-- pause/resume CAS + persisted clock. No PROD grants, client deletion or data
-- migration. Atomic Supabase migration; source fingerprints required.
DO $m1_guard$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.iberfit_system_settings
   WHERE key='environment' AND value#>>'{}'='QA')
  OR md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))<>'5914acf371015a6bbeeaf95f99e056e3'
  OR md5(pg_get_functiondef('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure))<>'35862b8e4977fcf0c3d611937fe83126'
  OR md5(pg_get_functiondef('private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure))<>'f97d7df4fdd510b63ac1249352273927'
  OR to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.domain_entities_v26
    WHERE entity_type='session_execution' AND status='pausada'
    AND body ? 'occurrenceId')
  THEN
   RAISE EXCEPTION 'M1_U72_QA_SOURCE_OR_STATE_DRIFT';
 END IF;
END $m1_guard$;

CREATE OR REPLACE FUNCTION private.iberfit_u72_occurrence_pause_resume_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $u72_pause$
DECLARE
  v_actor uuid := auth.uid();
  v_type text;
  v_operation uuid;
  v_client uuid;
  v_occurrence uuid;
  v_exec_id uuid;
  v_occ_base bigint;
  v_exec_base bigint;
  v_receipt public.command_receipts_v26%rowtype;
  v_occ public.training_session_occurrences_v1%rowtype;
  v_exec public.domain_entities_v26%rowtype;
  v_typed public.session_executions%rowtype;
  v_role text;
  v_now timestamptz:=clock_timestamp();
  v_since timestamptz;
  v_ms bigint;
  v_state text;
  v_body jsonb;
  v_hash text;
  v_ack jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501'; END IF;
  IF jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR octet_length(p_command::text)>524288
    OR (p_command-'type'-'operationId'-'clientId'-'entityId'-'baseRevision'-'payload')<>'{}'::jsonb
    OR jsonb_typeof(p_command->'payload') IS DISTINCT FROM 'object'
    OR (p_command->'payload'-'executionId'-'executionBaseRevision')<>'{}'::jsonb
  THEN RAISE EXCEPTION 'U72_UNTRUSTED_COMMAND' USING errcode='22023'; END IF;
  BEGIN
    v_type:=p_command->>'type';
    v_operation:=nullif(p_command->>'operationId','')::uuid;
    v_client:=nullif(p_command->>'clientId','')::uuid;
    v_occurrence:=nullif(p_command->>'entityId','')::uuid;
    v_occ_base:=nullif(p_command->>'baseRevision','')::bigint;
    v_exec_id:=nullif(p_command#>>'{payload,executionId}','')::uuid;
    v_exec_base:=nullif(p_command#>>'{payload,executionBaseRevision}','')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'U72_COMMAND_IDENTIFIERS_INVALID' USING errcode='22023';
  END;
  IF v_type NOT IN ('OCURRENCIA_PAUSAR','OCURRENCIA_REANUDAR')
    OR v_operation IS NULL OR v_client IS NULL OR v_occurrence IS NULL
    OR v_exec_id IS NULL OR v_occ_base IS NULL OR v_occ_base<0
    OR v_exec_base IS NULL OR v_exec_base<1 THEN
    RAISE EXCEPTION 'U72_COMMAND_FIELDS_INVALID' USING errcode='22023';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role NOT IN ('coach','cliente')
    OR NOT public.iberfit_can_access_client_v26(v_client)
    OR NOT public.iberfit_canary_enabled_v26(v_client) THEN
    RAISE EXCEPTION 'CLIENT_ACCESS_DENIED' USING errcode='42501';
  END IF;
  v_hash:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(
    hashtextextended('active_execution_client:'||v_client::text,0));
  SELECT * INTO v_receipt FROM public.command_receipts_v26
    WHERE operation_id=v_operation FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.command_type<>v_type
      OR v_receipt.entity_type<>'training_occurrence'
      OR v_receipt.entity_id<>v_occurrence
      OR v_receipt.client_id<>v_client
      OR v_receipt.actor_user_id<>v_actor
      OR v_receipt.base_revision<>v_occ_base
      OR v_receipt.response->>'requestHash' IS DISTINCT FROM v_hash THEN
      RETURN jsonb_build_object('kind','rejected','reason','OPERATION_ID_REUSED',
        'operationId',v_operation,'serverAt',v_now);
    END IF;
    RETURN (v_receipt.response-'requestHash')||jsonb_build_object('duplicate',true);
  END IF;
  SELECT * INTO v_occ FROM public.training_session_occurrences_v1
    WHERE id=v_occurrence AND client_id=v_client FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind','rejected','reason','OCCURRENCE_NOT_FOUND',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  IF v_occ.revision<>v_occ_base THEN
    RETURN jsonb_build_object('kind','conflict','reason','REVISION_MISMATCH',
      'operationId',v_operation,'remoteRevision',v_occ.revision,'serverAt',v_now);
  END IF;
  IF v_occ.status<>'en_curso' OR v_occ.execution_id IS DISTINCT FROM v_exec_id THEN
    RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_NOT_ACTIVE',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  SELECT * INTO v_exec FROM public.domain_entities_v26
    WHERE entity_type='session_execution' AND entity_id=v_exec_id
      AND client_id=v_client FOR UPDATE;
  SELECT * INTO v_typed FROM public.session_executions
    WHERE id=v_exec_id AND client_id=v_client
      AND session_id=v_occ.session_id AND occurrence_id=v_occ.id FOR UPDATE;
  IF v_exec.entity_id IS NULL OR v_typed.id IS NULL
    OR v_exec.body->>'clientId' IS DISTINCT FROM v_client::text
    OR v_exec.body->>'sessionId' IS DISTINCT FROM v_occ.session_id::text
    OR v_exec.body->>'occurrenceId' IS DISTINCT FROM v_occ.id::text
    OR v_typed.revision IS DISTINCT FROM v_exec.revision
    OR v_typed.summary IS DISTINCT FROM v_exec.body
    OR NOT EXISTS(SELECT 1 FROM public.active_execution_locks_v26
      WHERE client_id=v_client AND session_id=v_occ.session_id
        AND execution_id=v_exec_id) THEN
    RAISE EXCEPTION 'U72_EXECUTION_INTEGRITY_DRIFT' USING errcode='23514';
  END IF;
  IF v_exec.revision<>v_exec_base THEN
    RETURN jsonb_build_object('kind','conflict','reason','EXECUTION_REVISION_MISMATCH',
      'operationId',v_operation,'remoteRevision',v_occ.revision,
      'executionRevision',v_exec.revision,'serverAt',v_now);
  END IF;
  IF (v_type='OCURRENCIA_PAUSAR'
      AND (v_exec.status<>'en_curso' OR v_typed.execution_status<>'activa'))
    OR (v_type='OCURRENCIA_REANUDAR'
      AND (v_exec.status<>'pausada' OR v_typed.execution_status<>'pausada')) THEN
    RETURN jsonb_build_object('kind','rejected','reason','TRANSITION_FORBIDDEN',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  IF jsonb_typeof(v_exec.body->'events') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_exec.body->'events')>4999 THEN
    RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_EVENTS_LIMIT',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  BEGIN
    v_ms:=coalesce((v_exec.body->>'accumulatedActiveMs')::bigint,0);
    IF v_ms<0 OR v_ms>604800000 THEN
      RAISE EXCEPTION 'U72_ACTIVE_DURATION_INVALID' USING errcode='23514';
    END IF;
    IF v_type='OCURRENCIA_PAUSAR' THEN
      v_since:=coalesce(nullif(v_exec.body->>'activeSince','')::timestamptz,
        nullif(v_exec.body->>'startedAt','')::timestamptz);
      IF v_since IS NULL OR v_since>v_now+interval '5 minutes' THEN
        RAISE EXCEPTION 'U72_ACTIVE_CLOCK_INVALID' USING errcode='23514';
      END IF;
      v_ms:=v_ms+greatest(0,floor(extract(epoch FROM (v_now-v_since))*1000)::bigint);
    END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow
      OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'U72_EXECUTION_CLOCK_DRIFT' USING errcode='23514';
  END;
  v_state:=CASE WHEN v_type='OCURRENCIA_PAUSAR' THEN 'pausada'
    ELSE 'en_curso' END;
  v_body:=v_exec.body||jsonb_build_object(
    'status',v_state,'revision',v_exec_base+1,'updatedAt',v_now,
    'accumulatedActiveMs',v_ms,
    'activeSince',CASE WHEN v_state='pausada' THEN NULL ELSE to_jsonb(v_now) END,
    'pausedAt',CASE WHEN v_state='pausada' THEN to_jsonb(v_now) ELSE NULL END,
    'events',(v_exec.body->'events')||jsonb_build_array(jsonb_build_object(
      'type',CASE WHEN v_state='pausada' THEN 'SESSION_PAUSED' ELSE 'SESSION_RESUMED' END,
      'payload','{}'::jsonb,'occurredAt',v_now)));
  IF octet_length(v_body::text)>1048576 THEN
    RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_BODY_SIZE_LIMIT',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  UPDATE public.domain_entities_v26 SET
    status=v_state,revision=v_exec_base+1,body=v_body,updated_at=v_now
    WHERE entity_type='session_execution' AND entity_id=v_exec_id
      AND client_id=v_client AND revision=v_exec_base;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'U72_EXECUTION_CAS_LOST' USING errcode='40001';
  END IF;
  UPDATE public.session_executions SET
    execution_status=CASE WHEN v_state='pausada' THEN 'pausada' ELSE 'activa' END,
    revision=v_exec_base+1,summary=v_body,updated_at=v_now
    WHERE id=v_exec_id AND session_id=v_occ.session_id
      AND client_id=v_client AND occurrence_id=v_occ.id
      AND revision=v_exec_base;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'U72_TYPED_CAS_LOST' USING errcode='40001';
  END IF;
  v_ack:=jsonb_build_object(
    'kind','ack','operationId',v_operation,'entityId',v_occ.id,
    'entityType','training_occurrence','remoteRevision',v_occ.revision,
    'status','en_curso','executionStatus',v_state,
    'executionId',v_exec_id,'executionRevision',v_exec_base+1,
    'accumulatedActiveMs',v_ms,
    'activeSince',CASE WHEN v_state='pausada' THEN NULL ELSE to_jsonb(v_now) END,
    'appointmentCompletionState',NULL,'serverAt',v_now,'duplicate',false);
  INSERT INTO public.command_receipts_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,base_revision,remote_revision,response,processed_at
  ) VALUES (
    v_operation,v_type,'training_occurrence',v_occ.id,v_client,
    v_actor,v_occ_base,v_occ.revision,
    v_ack||jsonb_build_object('requestHash',v_hash),v_now
  );
  INSERT INTO public.command_events_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,phase,base_revision,remote_revision,payload_hash
  ) VALUES (
    v_operation,v_type,'training_occurrence',v_occ.id,v_client,
    v_actor,'applied',v_occ_base,v_occ.revision,v_hash
  );
  INSERT INTO public.domain_events_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,actor_role,phase,from_status,to_status,
    base_revision,remote_revision,details
  ) VALUES (
    v_operation,v_type,'training_occurrence',v_occ.id,v_client,
    v_actor,v_role,'applied',v_exec.status,v_state,
    v_occ_base,v_occ.revision,jsonb_build_object(
      'sessionId',v_occ.session_id,'occurrenceId',v_occ.id,
      'executionId',v_exec_id,'executionRevision',v_exec_base+1)
  );
  RETURN v_ack;
END;
$u72_pause$;
REVOKE ALL ON FUNCTION private.iberfit_u72_occurrence_pause_resume_v1(jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.iberfit_u72_occurrence_pause_resume_v1(jsonb)
 IS 'QA-only U72: idempotent, owner-scoped occurrence pause/resume with CAS, private receipt and server clock. Direct EXECUTE forbidden.';

CREATE OR REPLACE FUNCTION public.iberfit_occurrence_api_u60_v1(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reply jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';
  END IF;
  -- U36 validates action, filters, payload and role using the ORIGINAL
  -- caller JWT; its EXECUTE privileges remain revoked to public roles.
  IF p_action='TRANSICION' AND (p_payload->>'type') IN
    ('OCURRENCIA_PAUSAR','OCURRENCIA_REANUDAR') THEN
    v_reply:=private.iberfit_u72_occurrence_pause_resume_v1(p_payload);
  ELSE
    -- Never let the old U31 progress/completion handler silently mutate a
    -- paused occurrence while U72 owns its timed state.
    IF p_action='TRANSICION' AND (p_payload->>'type') IN
      ('OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR')
      AND (p_payload->>'clientId') ~* '^[0-9a-f-]{36}
  IF p_action='CAMBIO' AND (
    v_reply='{"kind":"conflict","reason":"APPOINTMENT_ALREADY_TERMINAL"}'::jsonb
    OR v_reply='{"kind":"conflict","reason":"APPOINTMENT_REVISION_DRIFT"}'::jsonb
  ) THEN
    -- U34 already checked this request's operationId and Coach permission
    -- before returning either side-effect-free conflict. The exact ID can
    -- therefore be returned for safe encrypted-journal cleanup.
    RETURN v_reply||jsonb_build_object('operationId',p_payload->'operationId');
  END IF;
  RETURN v_reply;
END;
$function$

      AND (p_payload->>'entityId') ~* '^[0-9a-f-]{36}
  IF p_action='CAMBIO' AND (
    v_reply='{"kind":"conflict","reason":"APPOINTMENT_ALREADY_TERMINAL"}'::jsonb
    OR v_reply='{"kind":"conflict","reason":"APPOINTMENT_REVISION_DRIFT"}'::jsonb
  ) THEN
    -- U34 already checked this request's operationId and Coach permission
    -- before returning either side-effect-free conflict. The exact ID can
    -- therefore be returned for safe encrypted-journal cleanup.
    RETURN v_reply||jsonb_build_object('operationId',p_payload->'operationId');
  END IF;
  RETURN v_reply;
END;
$function$
 THEN
      IF public.iberfit_can_access_client_v26((p_payload->>'clientId')::uuid)
        AND public.iberfit_canary_enabled_v26((p_payload->>'clientId')::uuid)
        AND public.iberfit_current_role_v26() IN ('coach','cliente') THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(
          'active_execution_client:'||(p_payload->>'clientId'),0));
        IF NOT EXISTS (SELECT 1 FROM public.command_receipts_v26
          WHERE operation_id=nullif(p_payload->>'operationId','')::uuid)
          AND EXISTS (
            SELECT 1 FROM public.training_session_occurrences_v1 o
            JOIN public.domain_entities_v26 d
              ON d.entity_type='session_execution'
              AND d.entity_id=o.execution_id AND d.client_id=o.client_id
            WHERE o.id=(p_payload->>'entityId')::uuid
              AND o.client_id=(p_payload->>'clientId')::uuid
              AND o.status='en_curso' AND d.status='pausada') THEN
          RETURN jsonb_build_object('kind','rejected','reason','EXECUTION_PAUSED',
            'operationId',p_payload->'operationId','serverAt',clock_timestamp());
        END IF;
      END IF;
    END IF;
    v_reply:=public.iberfit_occurrence_api_v1(p_action,p_payload);
  END IF;
  IF p_action='CAMBIO' AND (
    v_reply='{"kind":"conflict","reason":"APPOINTMENT_ALREADY_TERMINAL"}'::jsonb
    OR v_reply='{"kind":"conflict","reason":"APPOINTMENT_REVISION_DRIFT"}'::jsonb
  ) THEN
    -- U34 already checked this request's operationId and Coach permission
    -- before returning either side-effect-free conflict. The exact ID can
    -- therefore be returned for safe encrypted-journal cleanup.
    RETURN v_reply||jsonb_build_object('operationId',p_payload->'operationId');
  END IF;
  RETURN v_reply;
END;
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
    OR v_occ.appointment_id IS NULL
    OR v_source.body->>'visibleToClient' IS DISTINCT FROM 'true'
    OR v_source.body->>'clientVisibilityLevel' IS DISTINCT FROM 'full'
    OR v_source.body->>'deliveryModality' IS DISTINCT FROM 'guiada_en_app'
    OR NOT (
      (v_occ.status='confirmada' AND v_ap_status='confirmada')
      OR (v_occ.status='en_curso' AND v_ap_status IN ('confirmada','cancelada'))
      OR (v_occ.status='completada' AND v_ap_status IN ('completada','cancelada','confirmada'))
      OR (v_occ.status='cancelada' AND v_ap_status IN ('confirmada','cancelada','completada'))
    )
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
CREATE OR REPLACE FUNCTION private.iberfit_u60_dated_mirror_receipt_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.occurrence_id IS NULL THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.command_receipts_v26 r
    WHERE r.entity_type='training_occurrence'
      AND r.entity_id=NEW.occurrence_id AND r.client_id=NEW.client_id
      AND r.actor_user_id=auth.uid()
      AND r.response->>'executionId'=NEW.id::text
      AND r.response->>'executionRevision'=NEW.revision::text
      AND r.response->>'kind'='ack'
      AND r.processed_at >= transaction_timestamp()
      AND (
        (r.command_type='OCURRENCIA_GUARDAR_PROGRESO'
          AND r.response->>'status'='en_curso'
          AND NEW.execution_status='activa'
          AND NEW.summary->>'status'='en_curso')
        OR
        (r.command_type IN ('OCURRENCIA_PAUSAR','OCURRENCIA_REANUDAR')
          AND r.response->>'status'='en_curso'
          AND r.response->>'executionStatus'=NEW.summary->>'status'
          AND (
            (r.command_type='OCURRENCIA_PAUSAR'
              AND NEW.execution_status='pausada'
              AND NEW.summary->>'status'='pausada')
            OR (r.command_type='OCURRENCIA_REANUDAR'
              AND NEW.execution_status='activa'
              AND NEW.summary->>'status'='en_curso')))
        OR
        (r.command_type='OCURRENCIA_COMPLETAR'
          AND r.response->>'status'='completada'
          AND NEW.execution_status='cerrada_confirmada'
          AND NEW.summary->>'status'='completada')
      )
  ) THEN
    RAISE EXCEPTION 'U60_DATED_EXECUTION_UPDATE_REQUIRES_U31_RECEIPT'
      USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$function$;
-- Replacements retain the old function OIDs, owners and ACLs.
DO $m1_readback$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.iberfit_system_settings
   WHERE key='environment' AND value#>>'{}'='QA')
  OR has_function_privilege('anon','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)','EXECUTE')
  OR has_function_privilege('authenticated','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)','EXECUTE')
  OR has_function_privilege('service_role','private.iberfit_u72_occurrence_pause_resume_v1(jsonb)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
  OR has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE')
  OR (SELECT count(*) FROM pg_proc WHERE oid IN (
   'private.iberfit_u72_occurrence_pause_resume_v1(jsonb)'::regprocedure,
   'public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure,
   'private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure,
   'private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure
  ) AND prosecdef AND pg_get_userbyid(proowner)='postgres'
    AND proconfig @> ARRAY['search_path=""']::text[])<>4
 THEN RAISE EXCEPTION 'M1_U72_QA_POSTINSTALL_SECURITY_DRIFT'; END IF;
END $m1_readback$;
