-- SIGNATURE U32 · staging-only Coach batch scheduling. NOT a public RPC.
-- Dependencies #1072, U30 #1144, U31 #1145.
-- No direct grants/dispatcher updates; typed calendar projection remains closed.
SELECT 1 / CASE WHEN
  to_regclass('public.training_session_occurrences_v1') IS NOT NULL
  AND to_regprocedure('private.iberfit_u31_occurrence_transition_v1(jsonb)') IS NOT NULL
THEN 1 ELSE 0 END AS u32_requires_u30_u31;

CREATE FUNCTION private.iberfit_u32_create_occurrences_batch_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $u32$
DECLARE
  v_actor uuid := auth.uid();
  v_operation uuid;
  v_client uuid;
  v_session uuid;
  v_target uuid;
  v_revision bigint;
  v_role text;
  v_source public.domain_entities_v26%rowtype;
  v_plan public.domain_entities_v26%rowtype;
  v_plan_id uuid;
  v_receipt public.command_receipts_v26%rowtype;
  v_request_hash text;
  v_payload jsonb;
  v_dates jsonb;
  v_item jsonb;
  v_date date;
  v_time text;
  v_disambiguation text;
  v_appointment_id uuid;
  v_appointment public.appointments%rowtype;
  v_duration integer;
  v_clock timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_alternative timestamptz;
  v_snapshot jsonb;
  v_id uuid;
  v_new_ids jsonb := '[]'::jsonb;
  v_ack jsonb;
  v_now timestamptz:=clock_timestamp();
  v_service jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';
  END IF;
  IF jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR octet_length(p_command::text)>131072 THEN
    RAISE EXCEPTION 'U32_INVALID_COMMAND' USING errcode='22023';
  END IF;
  BEGIN
    v_operation:=nullif(p_command->>'operationId','')::uuid;
    v_client:=nullif(p_command->>'clientId','')::uuid;
    v_session:=nullif(p_command->>'entityId','')::uuid;
    v_revision:=nullif(p_command->>'baseRevision','')::bigint;
    v_payload:=p_command->'payload';
    v_target:=nullif(v_payload->>'targetClientId','')::uuid;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'U32_INVALID_IDENTIFIERS' USING errcode='22023';
  END;
  IF v_operation IS NULL OR v_client IS NULL OR v_session IS NULL
    OR v_revision IS NULL OR v_revision<0
    OR p_command->>'type' IS DISTINCT FROM 'OCURRENCIAS_CREAR_LOTE'
    OR jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
    OR v_target IS DISTINCT FROM v_client
    OR v_payload->>'previewConfirmed' IS DISTINCT FROM 'true'
    OR (v_payload - 'dates' - 'targetClientId' - 'previewConfirmed') <> '{}'::jsonb
  THEN
    RAISE EXCEPTION 'U32_INVALID_COMMAND' USING errcode='22023';
  END IF;
  v_dates:=v_payload->'dates';
  IF jsonb_typeof(v_dates) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_dates) NOT BETWEEN 1 AND 52 THEN
    RAISE EXCEPTION 'U32_INVALID_BATCH_SIZE' USING errcode='22023';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role<>'coach' OR NOT public.iberfit_can_access_client_v26(v_client)
    OR NOT public.iberfit_canary_enabled_v26(v_client) THEN
    RAISE EXCEPTION 'CLIENT_ACCESS_DENIED' USING errcode='42501';
  END IF;
  -- The old v26 execution lock key is shared with U31. Scheduling also has
  -- a separate per-Client serialization key for all U32 Coach batches.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('schedule_client:'||v_client::text,0));
  v_request_hash:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  SELECT * INTO v_receipt FROM public.command_receipts_v26
  WHERE operation_id=v_operation FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.command_type<>'OCURRENCIAS_CREAR_LOTE'
      OR v_receipt.entity_type<>'training_occurrence_batch'
      OR v_receipt.entity_id<>v_session
      OR v_receipt.client_id<>v_client
      OR v_receipt.actor_user_id<>v_actor
      OR v_receipt.base_revision<>v_revision
      OR v_receipt.response->>'requestHash' IS DISTINCT FROM v_request_hash THEN
      RETURN jsonb_build_object('kind','rejected',
        'reason','OPERATION_ID_REUSED','operationId',v_operation,'serverAt',v_now);
    END IF;
    RETURN (v_receipt.response-'requestHash') ||
      jsonb_build_object('duplicate',true);
  END IF;
  SELECT * INTO v_source FROM public.domain_entities_v26
  WHERE entity_type='session' AND entity_id=v_session
    AND client_id=v_client FOR UPDATE;
  IF NOT FOUND OR v_source.status<>'disponible'
    OR v_source.body->>'deliveryModality'<>'guiada_en_app'
    OR v_source.body->>'visibleToClient'<>'true'
    OR v_source.body->>'clientVisibilityLevel'<>'full'
    OR jsonb_typeof(v_source.body->'blocks') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_source.body->'blocks')=0 THEN
    RETURN jsonb_build_object('kind','rejected','reason','SOURCE_NOT_PUBLISHED_GUIDED',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  IF v_revision<>v_source.revision THEN
    RETURN jsonb_build_object('kind','conflict','reason','SOURCE_REVISION_MISMATCH',
      'operationId',v_operation,'remoteRevision',v_source.revision,'serverAt',v_now);
  END IF;
  v_plan_id:=nullif(v_source.body->>'cycleId','')::uuid;
  SELECT * INTO v_plan FROM public.domain_entities_v26
  WHERE entity_type='planning' AND entity_id=v_plan_id
    AND client_id=v_client AND status='publicado';
  IF NOT FOUND OR v_plan.body->>'startDate' IS NULL
    OR v_plan.body->>'endDate' IS NULL THEN
    RETURN jsonb_build_object('kind','rejected','reason','PUBLISHED_CYCLE_REQUIRED',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  v_duration:=nullif(v_source.body->>'durationMinutes','')::integer;
  IF v_duration NOT BETWEEN 10 AND 240 THEN
    RETURN jsonb_build_object('kind','rejected','reason','DURATION_INVALID',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  v_service:=private.iberfit_training_command_guard_v1(
    jsonb_build_object('type','SESION_INICIAR','entityId',v_session,
      'clientId',v_client,'payload','{}'::jsonb));
  IF coalesce((v_service->>'allowed')::boolean,false) IS NOT TRUE THEN
    RETURN jsonb_build_object('kind','rejected','reason','TRAINING_SERVICE_NOT_ACTIVE',
      'operationId',v_operation,'serverAt',v_now);
  END IF;
  -- Build source snapshot ONLY from server-owned published prescription.
  -- Caller may specify dates/hours, but no exercises, source, role or status.
  v_snapshot:=jsonb_build_object(
    'clientId',v_client,'sessionId',v_session,'cycleId',v_plan_id,
    'title',v_source.body->>'title','queue',v_source.body->'blocks',
    'blocks',v_source.body->'blocks',
    'publishedSnapshot',v_source.body->'publishedSnapshot');
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_dates) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR (v_item - 'localDate' - 'localTime' - 'dstDisambiguation' - 'appointmentId')
        <> '{}'::jsonb
      OR v_item->>'localDate' IS NULL
      OR v_item->>'localDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} THEN
      RAISE EXCEPTION 'U32_INVALID_DATE_ITEM' USING errcode='22023';
    END IF;
    BEGIN
      v_date:=(v_item->>'localDate')::date;
      v_appointment_id:=nullif(v_item->>'appointmentId','')::uuid;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow
      OR invalid_text_representation THEN
      RAISE EXCEPTION 'U32_INVALID_DATE_ITEM' USING errcode='22023';
    END;
    IF v_date < (v_plan.body->>'startDate')::date
      OR v_date > (v_plan.body->>'endDate')::date THEN
      RAISE EXCEPTION 'U32_OUTSIDE_CYCLE' USING errcode='22023';
    END IF;
    v_time:=nullif(v_item->>'localTime','');
    v_disambiguation:=nullif(v_item->>'dstDisambiguation','');
    v_start:=NULL;v_end:=NULL;
    IF v_time IS NULL THEN
      IF v_disambiguation IS NOT NULL OR v_appointment_id IS NOT NULL THEN
        RAISE EXCEPTION 'U32_TIME_REQUIRED_FOR_APPOINTMENT'
          USING errcode='22023';
      END IF;
    ELSE
      IF v_time !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' THEN
        RAISE EXCEPTION 'U32_INVALID_LOCAL_TIME' USING errcode='22023';
      END IF;
      v_clock:=(v_date::text||' '||v_time)::timestamp;
      v_start:=v_clock AT TIME ZONE 'America/Santiago';
      IF (v_start AT TIME ZONE 'America/Santiago') IS DISTINCT FROM v_clock THEN
        RAISE EXCEPTION 'U32_DST_NONEXISTENT_LOCAL_TIME' USING errcode='22023';
      END IF;
      v_alternative:=NULL;
      IF ((v_start+interval '1 hour') AT TIME ZONE 'America/Santiago')
        =v_clock THEN
        v_alternative:=v_start+interval '1 hour';
      ELSIF ((v_start-interval '1 hour') AT TIME ZONE 'America/Santiago')
        =v_clock THEN
        v_alternative:=v_start-interval '1 hour';
      END IF;
      IF v_alternative IS NOT NULL THEN
        IF v_disambiguation NOT IN ('earlier','later')
          OR v_disambiguation IS NULL THEN
          RAISE EXCEPTION 'U32_DST_AMBIGUOUS_LOCAL_TIME'
            USING errcode='22023';
        END IF;
        v_start:=CASE WHEN v_disambiguation='earlier'
          THEN LEAST(v_start,v_alternative)
          ELSE GREATEST(v_start,v_alternative) END;
      ELSIF v_disambiguation IS NOT NULL THEN
        RAISE EXCEPTION 'U32_DST_DISAMBIGUATION_NOT_NEEDED'
          USING errcode='22023';
      END IF;
      v_end:=v_start+v_duration*interval '1 minute';
    END IF;

    IF EXISTS(SELECT 1 FROM public.training_session_occurrences_v1 existing
      WHERE existing.session_id=v_session AND existing.local_date=v_date
        AND existing.status<>'cancelada') THEN
      RAISE EXCEPTION 'U32_DUPLICATE_ACTIVE_LOCAL_DATE'
        USING errcode='23505';
    END IF;
    -- Serialize with other U32 batch writers. Legacy CITA_CREAR currently
    -- does NOT take this advisory key: cross-writer race must be addressed
    -- separately before granting live EXECUTE to any caller.
    IF v_start IS NOT NULL AND (
      EXISTS(SELECT 1 FROM public.appointments ap
        WHERE ap.client_id=v_client AND ap.status<>'cancelada'
          AND ap.start_at<v_end AND ap.end_at>v_start
          AND (v_appointment_id IS NULL OR ap.id<>v_appointment_id))
      OR EXISTS(SELECT 1 FROM public.training_session_occurrences_v1 oc
        WHERE oc.client_id=v_client AND oc.status<>'cancelada'
          AND oc.starts_at IS NOT NULL
          AND oc.starts_at<v_end AND oc.ends_at>v_start)
    ) THEN
      RAISE EXCEPTION 'U32_CLIENT_SCHEDULE_CONFLICT' USING errcode='23P01';
    END IF;
    IF v_appointment_id IS NOT NULL THEN
      SELECT * INTO v_appointment FROM public.appointments
      WHERE id=v_appointment_id AND client_id=v_client
        AND session_id=v_session AND status='confirmada';
      IF NOT FOUND OR v_appointment.start_at IS DISTINCT FROM v_start
        OR v_appointment.end_at IS DISTINCT FROM v_end THEN
        RAISE EXCEPTION 'U32_APPOINTMENT_MISMATCH' USING errcode='23503';
      END IF;
    END IF;
    v_id:=gen_random_uuid();
    INSERT INTO public.training_session_occurrences_v1(
      id,client_id,session_id,appointment_id,local_date,local_time,time_zone,
      starts_at,ends_at,duration_minutes,prescription_revision,
      prescription_snapshot,created_operation_id
    ) VALUES (v_id,v_client,v_session,v_appointment_id,
      v_date,CASE WHEN v_time IS NULL THEN NULL ELSE v_time::time END,
      'America/Santiago',v_start,v_end,v_duration,v_revision,v_snapshot,gen_random_uuid());
    v_new_ids:=v_new_ids||jsonb_build_array(jsonb_build_object(
      'id',v_id,'localDate',v_date,'startsAt',v_start,'appointmentId',v_appointment_id));
  END LOOP;
  v_ack:=jsonb_build_object('kind','ack','operationId',v_operation,
    'entityId',v_session,'entityType','training_occurrence_batch',
    'remoteRevision',v_source.revision,
    'occurrences',v_new_ids,'count',jsonb_array_length(v_new_ids),
    'duplicate',false,'serverAt',v_now);
  INSERT INTO public.command_receipts_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,base_revision,remote_revision,response,processed_at
  ) VALUES(v_operation,'OCURRENCIAS_CREAR_LOTE','training_occurrence_batch',
    v_session,v_client,v_actor,v_revision,v_source.revision,
    v_ack||jsonb_build_object('requestHash',v_request_hash),v_now);
  INSERT INTO public.command_events_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,phase,base_revision,remote_revision,payload_hash
  ) VALUES(v_operation,'OCURRENCIAS_CREAR_LOTE','training_occurrence_batch',
    v_session,v_client,v_actor,'applied',v_revision,v_source.revision,v_request_hash);
  INSERT INTO public.domain_events_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,actor_role,phase,from_status,to_status,
    base_revision,remote_revision,details
  ) VALUES(v_operation,'OCURRENCIAS_CREAR_LOTE','training_occurrence_batch',
    v_session,v_client,v_actor,v_role,'applied','available','scheduled',
    v_revision,v_source.revision,jsonb_build_object('count',jsonb_array_length(v_new_ids)));
  RETURN v_ack;
END;
$u32$;
REVOKE ALL ON FUNCTION private.iberfit_u32_create_occurrences_batch_v1(jsonb)
FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.iberfit_u32_create_occurrences_batch_v1(jsonb)
IS 'U32 STAGING ONLY. No RPC grant or dispatch wiring; preflight must include canonical legacy appointment writer locking before launch.';
 THEN
      RAISE EXCEPTION 'U32_INVALID_DATE_ITEM' USING errcode='22023';
    END IF;
    BEGIN
      v_date:=(v_item->>'localDate')::date;
      v_appointment_id:=nullif(v_item->>'appointmentId','')::uuid;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow
      OR invalid_text_representation THEN
      RAISE EXCEPTION 'U32_INVALID_DATE_ITEM' USING errcode='22023';
    END;
    IF v_date < (v_plan.body->>'startDate')::date
      OR v_date > (v_plan.body->>'endDate')::date THEN
      RAISE EXCEPTION 'U32_OUTSIDE_CYCLE' USING errcode='22023';
    END IF;
    v_time:=nullif(v_item->>'localTime','');
    v_disambiguation:=nullif(v_item->>'dstDisambiguation','');
    v_start:=NULL;v_end:=NULL;
    IF v_time IS NULL THEN
      IF v_disambiguation IS NOT NULL OR v_appointment_id IS NOT NULL THEN
        RAISE EXCEPTION 'U32_TIME_REQUIRED_FOR_APPOINTMENT'
          USING errcode='22023';
      END IF;
    ELSE
      IF v_time !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' THEN
        RAISE EXCEPTION 'U32_INVALID_LOCAL_TIME' USING errcode='22023';
      END IF;
      v_clock:=(v_date::text||' '||v_time)::timestamp;
      v_start:=v_clock AT TIME ZONE 'America/Santiago';
      IF (v_start AT TIME ZONE 'America/Santiago') IS DISTINCT FROM v_clock THEN
        RAISE EXCEPTION 'U32_DST_NONEXISTENT_LOCAL_TIME' USING errcode='22023';
      END IF;
      v_alternative:=NULL;
      IF ((v_start+interval '1 hour') AT TIME ZONE 'America/Santiago')
        =v_clock THEN
        v_alternative:=v_start+interval '1 hour';
      ELSIF ((v_start-interval '1 hour') AT TIME ZONE 'America/Santiago')
        =v_clock THEN
        v_alternative:=v_start-interval '1 hour';
      END IF;
      IF v_alternative IS NOT NULL THEN
        IF v_disambiguation NOT IN ('earlier','later')
          OR v_disambiguation IS NULL THEN
          RAISE EXCEPTION 'U32_DST_AMBIGUOUS_LOCAL_TIME'
            USING errcode='22023';
        END IF;
        v_start:=CASE WHEN v_disambiguation='earlier'
          THEN LEAST(v_start,v_alternative)
          ELSE GREATEST(v_start,v_alternative) END;
      ELSIF v_disambiguation IS NOT NULL THEN
        RAISE EXCEPTION 'U32_DST_DISAMBIGUATION_NOT_NEEDED'
          USING errcode='22023';
      END IF;
      v_end:=v_start+v_duration*interval '1 minute';
    END IF;

    IF EXISTS(SELECT 1 FROM public.training_session_occurrences_v1 existing
      WHERE existing.session_id=v_session AND existing.local_date=v_date
        AND existing.status<>'cancelada') THEN
      RAISE EXCEPTION 'U32_DUPLICATE_ACTIVE_LOCAL_DATE'
        USING errcode='23505';
    END IF;
    -- Serialize with other U32 batch writers. Legacy CITA_CREAR currently
    -- does NOT take this advisory key: cross-writer race must be addressed
    -- separately before granting live EXECUTE to any caller.
    IF v_start IS NOT NULL AND (
      EXISTS(SELECT 1 FROM public.appointments ap
        WHERE ap.client_id=v_client AND ap.status<>'cancelada'
          AND ap.start_at<v_end AND ap.end_at>v_start
          AND (v_appointment_id IS NULL OR ap.id<>v_appointment_id))
      OR EXISTS(SELECT 1 FROM public.training_session_occurrences_v1 oc
        WHERE oc.client_id=v_client AND oc.status<>'cancelada'
          AND oc.starts_at IS NOT NULL
          AND oc.starts_at<v_end AND oc.ends_at>v_start)
    ) THEN
      RAISE EXCEPTION 'U32_CLIENT_SCHEDULE_CONFLICT' USING errcode='23P01';
    END IF;
    IF v_appointment_id IS NOT NULL THEN
      SELECT * INTO v_appointment FROM public.appointments
      WHERE id=v_appointment_id AND client_id=v_client
        AND session_id=v_session AND status='confirmada';
      IF NOT FOUND OR v_appointment.start_at IS DISTINCT FROM v_start
        OR v_appointment.end_at IS DISTINCT FROM v_end THEN
        RAISE EXCEPTION 'U32_APPOINTMENT_MISMATCH' USING errcode='23503';
      END IF;
    END IF;
    v_id:=gen_random_uuid();
    INSERT INTO public.training_session_occurrences_v1(
      id,client_id,session_id,appointment_id,local_date,local_time,time_zone,
      starts_at,ends_at,duration_minutes,prescription_revision,
      prescription_snapshot,created_operation_id
    ) VALUES (v_id,v_client,v_session,v_appointment_id,
      v_date,CASE WHEN v_time IS NULL THEN NULL ELSE v_time::time END,
      'America/Santiago',v_start,v_end,v_duration,v_revision,v_snapshot,v_operation);
    v_new_ids:=v_new_ids||jsonb_build_array(jsonb_build_object(
      'id',v_id,'localDate',v_date,'startsAt',v_start,'appointmentId',v_appointment_id));
  END LOOP;
  v_ack:=jsonb_build_object('kind','ack','operationId',v_operation,
    'entityId',v_session,'entityType','training_occurrence_batch',
    'remoteRevision',v_source.revision,
    'occurrences',v_new_ids,'count',jsonb_array_length(v_new_ids),
    'duplicate',false,'serverAt',v_now);
  INSERT INTO public.command_receipts_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,base_revision,remote_revision,response,processed_at
  ) VALUES(v_operation,'OCURRENCIAS_CREAR_LOTE','training_occurrence_batch',
    v_session,v_client,v_actor,v_revision,v_source.revision,
    v_ack||jsonb_build_object('requestHash',v_request_hash),v_now);
  INSERT INTO public.command_events_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,phase,base_revision,remote_revision,payload_hash
  ) VALUES(v_operation,'OCURRENCIAS_CREAR_LOTE','training_occurrence_batch',
    v_session,v_client,v_actor,'applied',v_revision,v_source.revision,v_request_hash);
  INSERT INTO public.domain_events_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,actor_role,phase,from_status,to_status,
    base_revision,remote_revision,details
  ) VALUES(v_operation,'OCURRENCIAS_CREAR_LOTE','training_occurrence_batch',
    v_session,v_client,v_actor,v_role,'applied','available','scheduled',
    v_revision,v_source.revision,jsonb_build_object('count',jsonb_array_length(v_new_ids)));
  RETURN v_ack;
END;
$u32$;
REVOKE ALL ON FUNCTION private.iberfit_u32_create_occurrences_batch_v1(jsonb)
FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.iberfit_u32_create_occurrences_batch_v1(jsonb)
IS 'U32 STAGING ONLY. No RPC grant or dispatch wiring; preflight must include canonical legacy appointment writer locking before launch.';
