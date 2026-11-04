-- IBERFIT U60: STAGED ONLY. Depends on reconciled U30-U36 source and QA ledger.
-- Deliberately no EXECUTE grants to anon/authenticated/service_role.
-- Do not apply to QA before comparing installed U30-U36 definitions and migrations.
SELECT 1 / CASE WHEN
  to_regclass('public.training_session_occurrences_v1') IS NOT NULL
  AND to_regclass('public.active_execution_locks_v26') IS NOT NULL
  AND to_regprocedure('private.iberfit_u31_occurrence_transition_v1(jsonb)') IS NOT NULL
  AND to_regprocedure('private.iberfit_u32_create_occurrences_batch_v1(jsonb)') IS NOT NULL
  AND to_regprocedure('public.iberfit_occurrence_api_v1(text,jsonb)') IS NOT NULL
THEN 1 ELSE 0 END AS u60_staging_dependency_guard;

-- The dated read returns an explicit allowlist. Never return publishedSnapshot,
-- a raw domain_entities row, receipts, or unscoped Coach/private fields.
CREATE FUNCTION private.iberfit_u60_occurrence_detail_v1(
  p_client_id uuid,p_occurrence_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $u60_read$
DECLARE
  v_role text;
  v_occ public.training_session_occurrences_v1%rowtype;
  v_source public.domain_entities_v26%rowtype;
  v_execution public.domain_entities_v26%rowtype;
  v_typed public.session_executions%rowtype;
  v_ap_status text;
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
    SELECT status INTO v_ap_status FROM public.appointments
      WHERE id=v_occ.appointment_id AND client_id=v_occ.client_id
        AND session_id=v_occ.session_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'U60_LINKED_APPOINTMENT_DRIFT' USING errcode='42501';
    END IF;
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
$u60_read$;
REVOKE ALL ON FUNCTION private.iberfit_u60_occurrence_detail_v1(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Separate read-only public entrypoint. Still CLOSED in this migration.
CREATE FUNCTION public.iberfit_occurrence_detail_v1(
  p_client_id uuid,p_occurrence_id uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $u60_rpc$
  SELECT private.iberfit_u60_occurrence_detail_v1(p_client_id,p_occurrence_id);
$u60_rpc$;
REVOKE ALL ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- The legacy executor and U31 share active_execution_client locking. New
-- typed execution inserts also serialize on schedule_client. Never accept a
-- legacy execution for a prescription that has EVER had a dated occurrence.
CREATE FUNCTION private.iberfit_u60_typed_execution_fence_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u60_typed$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('schedule_client:'||NEW.client_id::text,0));
  IF NEW.occurrence_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.training_session_occurrences_v1 o
      WHERE o.id=NEW.occurrence_id AND o.client_id=NEW.client_id
        AND o.session_id=NEW.session_id AND o.status='confirmada'
        AND o.execution_id IS NULL
    ) THEN
      RAISE EXCEPTION 'U60_DATED_EXECUTION_SOURCE_INVALID' USING errcode='23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.training_session_occurrences_v1 o
    WHERE o.client_id=NEW.client_id AND o.session_id=NEW.session_id
  ) THEN
    RAISE EXCEPTION 'U60_LEGACY_EXECUTION_BLOCKED' USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$u60_typed$;
REVOKE ALL ON FUNCTION private.iberfit_u60_typed_execution_fence_v1()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER u60_typed_execution_fence
  BEFORE INSERT ON public.session_executions FOR EACH ROW
  EXECUTE FUNCTION private.iberfit_u60_typed_execution_fence_v1();

-- Defense in depth when a caller attempts to acquire an active lock without
-- writing a typed execution. U31 legitimately binds an occurrence first.
CREATE FUNCTION private.iberfit_u60_active_lock_fence_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u60_lock$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('schedule_client:'||NEW.client_id::text,0));
  IF EXISTS (
    SELECT 1 FROM public.training_session_occurrences_v1 o
    WHERE o.client_id=NEW.client_id AND o.session_id=NEW.session_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.session_executions e
    JOIN public.training_session_occurrences_v1 o
      ON o.id=e.occurrence_id AND o.client_id=e.client_id
        AND o.session_id=e.session_id
    WHERE e.id=NEW.execution_id AND e.client_id=NEW.client_id
      AND e.session_id=NEW.session_id AND o.status='confirmada'
  ) THEN
    RAISE EXCEPTION 'U60_LEGACY_ACTIVE_LOCK_BLOCKED' USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$u60_lock$;
REVOKE ALL ON FUNCTION private.iberfit_u60_active_lock_fence_v1()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER u60_active_lock_fence
  BEFORE INSERT ON public.active_execution_locks_v26 FOR EACH ROW
  EXECUTE FUNCTION private.iberfit_u60_active_lock_fence_v1();

-- A Coach cannot introduce dates for a session still executing through the
-- legacy runtime. U32 already holds schedule_client before INSERT.
CREATE FUNCTION private.iberfit_u60_occurrence_insert_fence_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u60_occ$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('schedule_client:'||NEW.client_id::text,0));
  IF EXISTS (
    SELECT 1 FROM public.active_execution_locks_v26 l
    LEFT JOIN public.session_executions e ON e.id=l.execution_id
      AND e.client_id=l.client_id AND e.session_id=l.session_id
    WHERE l.client_id=NEW.client_id AND l.session_id=NEW.session_id
      AND e.occurrence_id IS NULL
  ) THEN
    RAISE EXCEPTION 'U60_LEGACY_EXECUTION_ALREADY_ACTIVE' USING errcode='23514';
  END IF;
  RETURN NEW;
END;
$u60_occ$;
REVOKE ALL ON FUNCTION private.iberfit_u60_occurrence_insert_fence_v1()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER u60_occurrence_insert_fence
  BEFORE INSERT ON public.training_session_occurrences_v1 FOR EACH ROW
  EXECUTE FUNCTION private.iberfit_u60_occurrence_insert_fence_v1();

COMMENT ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)
IS 'U60 STAGED CLOSED: owner-scoped private read; no authenticated EXECUTE until QA drift reconciliation, cross-role tests and rollback certified.';
COMMENT ON FUNCTION private.iberfit_u60_typed_execution_fence_v1()
IS 'U60 legacy writer fence: DATE occurrence uses typed occurrence_id; old session start must not consume a prescription with dated history.';
