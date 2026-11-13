-- IBERFIT M1 U72 QA rollback; fail if active paused dated executions.
-- Restores exact prior function definitions, then removes private U72 engine.
DO $m1_rollback_guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.iberfit_system_settings
   WHERE key='environment' AND value#>>'{}'='QA')
 OR EXISTS (SELECT 1 FROM public.domain_entities_v26
     WHERE entity_type='session_execution' AND status='pausada'
       AND body ? 'occurrenceId')
 OR to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NULL
 THEN RAISE EXCEPTION 'M1_U72_QA_ROLLBACK_UNSAFE'; END IF;
END $m1_rollback_guard$;
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
  v_reply:=public.iberfit_occurrence_api_v1(p_action,p_payload);
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
      OR v_execution.status IS DISTINCT FROM v_occ.status
      OR v_typed.revision IS DISTINCT FROM v_execution.revision
      OR v_typed.summary IS DISTINCT FROM v_execution.body
      OR (v_occ.status='en_curso'
        AND v_typed.execution_status IS DISTINCT FROM 'activa')
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
DROP FUNCTION private.iberfit_u72_occurrence_pause_resume_v1(jsonb);
DO $m1_rollback_readback$
BEGIN
 IF md5(pg_get_functiondef('public.iberfit_occurrence_api_u60_v1(text,jsonb)'::regprocedure))<>'5914acf371015a6bbeeaf95f99e056e3'
 OR md5(pg_get_functiondef('private.iberfit_u60_occurrence_detail_v1(uuid,uuid)'::regprocedure))<>'35862b8e4977fcf0c3d611937fe83126'
 OR md5(pg_get_functiondef('private.iberfit_u60_dated_mirror_receipt_guard_v1()'::regprocedure))<>'f97d7df4fdd510b63ac1249352273927'
 THEN RAISE EXCEPTION 'M1_U72_QA_ROLLBACK_DRIFT'; END IF;
END $m1_rollback_readback$;
