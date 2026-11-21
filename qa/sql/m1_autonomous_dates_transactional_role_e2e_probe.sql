-- QA synthetic transaction only. Run INSIDE BEGIN; ... ROLLBACK with the M1 overlay.
-- Never persist fixtures, emit IDs/PII, or use this as a production grant.
DO $m1_qa_date_only_probe$
DECLARE
 v_coach uuid;
 v_user_a uuid;
 v_user_b uuid;
 v_client uuid;
 v_session uuid;
 v_revision bigint;
 v_duration integer;
 v_date date:=(clock_timestamp() AT TIME ZONE 'America/Santiago')::date;
 v_ack jsonb;
 v_occ uuid;
 v_second uuid;
 v_calendar jsonb;
 v_detail jsonb;
 v_start jsonb;
 v_execution_id uuid;
 v_exercise_id text;
 v_pause_operation uuid;
 v_count integer;
BEGIN
 IF public.iberfit_environment()->>'environment' IS DISTINCT FROM 'QA'
    OR public.iberfit_environment()->>'realDataAllowed' IS DISTINCT FROM 'false'
    OR public.iberfit_environment()->>'productionBlocked' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_QA_ONLY' USING errcode='42501'; END IF;
 SELECT u.id INTO STRICT v_coach FROM auth.users u
   WHERE lower(u.email)='qa.rc74.coach@iberfit.cl';
 SELECT u.id INTO STRICT v_user_a FROM auth.users u
   WHERE lower(u.email)='qa.rc74.client-a@iberfit.cl';
 SELECT u.id INTO STRICT v_user_b FROM auth.users u
   WHERE lower(u.email)='qa.rc74.client-b@iberfit.cl';
 IF v_user_a=v_user_b OR v_coach IN (v_user_a,v_user_b)
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_ACTOR_DRIFT';END IF;

 SELECT e.client_id,e.entity_id,e.revision,
   (e.body->>'durationMinutes')::integer
 INTO v_client,v_session,v_revision,v_duration
 FROM public.domain_entities_v26 e
 JOIN public.domain_entities_v26 p
   ON p.entity_type='planning' AND p.entity_id=(e.body->>'cycleId')::uuid
   AND p.client_id=e.client_id AND p.status='publicado'
 JOIN public.user_profiles cp
   ON cp.client_id=e.client_id AND cp.user_id=v_user_a
 JOIN public.client_assignments ca
   ON ca.client_id=e.client_id AND ca.coach_user_id=v_coach AND ca.active
 JOIN public.client_access_v26 ac
   ON ac.client_id=e.client_id AND ac.auth_user_id=v_user_a AND ac.status='activo'
 JOIN public.m26_canary_clients_v26 cc
   ON cc.client_id=e.client_id AND cc.active
 WHERE e.entity_type='session' AND e.status='disponible'
   AND e.body->>'deliveryModality'='guiada_en_app'
   AND e.body->>'deliveryOwnership' IN ('guided_in_app','client_autonomous')
   AND e.body->>'visibleToClient'='true'
   AND e.body->>'clientVisibilityLevel'='full'
   AND jsonb_typeof(e.body->'blocks')='array'
   AND jsonb_array_length(e.body->'blocks')=1
   AND coalesce(e.body->'blocks'->0->>'sets','')='1'
   AND length(coalesce(e.body->'blocks'->0->>'exerciseId',''))>0
   AND (e.body->>'durationMinutes') ~ '^[0-9]{2,3}$'
   AND (e.body->>'durationMinutes')::integer BETWEEN 10 AND 240
   AND v_date BETWEEN (p.body->>'startDate')::date AND (p.body->>'endDate')::date-7
   AND NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1 o
     WHERE o.session_id=e.entity_id AND o.local_date BETWEEN v_date AND v_date+7
       AND o.status<>'cancelada')
   AND NOT EXISTS(SELECT 1 FROM public.appointments a
     WHERE a.client_id=e.client_id AND a.session_id=e.entity_id
       AND (a.start_at AT TIME ZONE 'America/Santiago')::date BETWEEN v_date AND v_date+7
       AND a.status<>'cancelada')
 ORDER BY e.updated_at DESC LIMIT 1;
 IF v_session IS NULL THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_SOURCE_UNAVAILABLE';END IF;
 PERFORM set_config('request.jwt.claim.sub',v_coach::text,true);
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',v_coach,'email','qa.rc74.coach@iberfit.cl','role','authenticated')::text,true);
 IF public.iberfit_current_role_v26()<>'coach'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_COACH_AUTH_INVALID';END IF;
 IF coalesce((private.iberfit_training_command_guard_v1(
    jsonb_build_object('type','SESION_INICIAR','clientId',v_client,'entityId',v_session,'payload','{}'::jsonb)
    )->>'allowed')::boolean,false) IS NOT TRUE
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_SERVICE_INACTIVE';END IF;
 v_ack:=private.iberfit_u32_create_occurrences_batch_v1(jsonb_build_object(
    'type','OCURRENCIAS_CREAR_LOTE','operationId',gen_random_uuid(),
    'clientId',v_client,'entityId',v_session,'baseRevision',v_revision,
    'payload',jsonb_build_object(
     'targetClientId',v_client,'previewConfirmed',true,
     'dates',jsonb_build_array(jsonb_build_object('localDate',v_date::text),
                              jsonb_build_object('localDate',(v_date+7)::text,'localTime','12:00')))));
 IF v_ack->>'kind'<>'ack' OR v_ack->>'count'<>'2'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_U32_NOT_ACK';END IF;
 v_occ:=(v_ack#>>'{occurrences,0,id}')::uuid;
 v_second:=(v_ack#>>'{occurrences,1,id}')::uuid;
 IF v_occ IS NULL OR v_second IS NULL OR v_occ=v_second
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_TWO_DATES_INVALID';END IF;
 PERFORM set_config('request.jwt.claim.sub',v_user_a::text,true);
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',v_user_a,'email','qa.rc74.client-a@iberfit.cl','role','authenticated')::text,true);
 v_calendar:=private.iberfit_u33_occurrence_calendar_v1(v_client,v_date,v_date+7);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_calendar->'occurrences') j
      WHERE j->>'id' IN (v_occ::text,v_second::text))
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_UNCONFIRMED_LEAK';END IF;
 BEGIN
   PERFORM private.iberfit_u60_occurrence_detail_v1(v_client,v_occ);
   RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_DRAFT_DETAIL_LEAK';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('request.jwt.claim.sub',v_coach::text,true);
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',v_coach,'email','qa.rc74.coach@iberfit.cl','role','authenticated')::text,true);
 v_ack:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
   'type','OCURRENCIA_CONFIRMAR','operationId',gen_random_uuid(),
   'clientId',v_client,'entityId',v_occ,'baseRevision',0));
 IF v_ack->>'kind'<>'ack' OR v_ack->>'status'<>'confirmada'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_CONFIRM_NOT_ACK';END IF;
 PERFORM set_config('request.jwt.claim.sub',v_user_a::text,true);
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',v_user_a,'email','qa.rc74.client-a@iberfit.cl','role','authenticated')::text,true);
 v_calendar:=private.iberfit_u33_occurrence_calendar_v1(v_client,v_date,v_date+7);
 SELECT count(*) INTO v_count FROM jsonb_array_elements(v_calendar->'occurrences') j
   WHERE j->>'id'=v_occ::text AND j->>'appointmentId' IS NULL AND
    j->>'status'='confirmada' AND j->>'appointmentStatus' IS NULL;
 IF v_count<>1 THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_OWNER_CALENDAR_MISSING';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_calendar->'occurrences') j
   WHERE j->>'id'=v_second::text)
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_SECOND_DRAFT_LEAK'; END IF;
 v_detail:=private.iberfit_u60_occurrence_detail_v1(v_client,v_occ);
 IF v_detail->>'kind'<>'private-occurrence'
   OR v_detail#>>'{occurrence,appointmentId}' IS NOT NULL
   OR v_detail#>>'{prescriptionSnapshot,clientId}' IS DISTINCT FROM v_client::text
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_PRIVATE_OWNER_DRIFT'; END IF;
 PERFORM set_config('request.jwt.claim.sub',v_user_b::text,true);
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',v_user_b,'email','qa.rc74.client-b@iberfit.cl','role','authenticated')::text,true);
 BEGIN
   PERFORM private.iberfit_u33_occurrence_calendar_v1(v_client,v_date,v_date+7);
   RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_CLIENT_B_CALENDAR_LEAK';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
   PERFORM private.iberfit_u60_occurrence_detail_v1(v_client,v_occ);
   RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_CLIENT_B_DETAIL_LEAK';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',v_user_a::text,true);
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',v_user_a,'email','qa.rc74.client-a@iberfit.cl','role','authenticated')::text,true);
 v_execution_id:=gen_random_uuid();
 v_exercise_id:=v_detail#>>'{prescriptionSnapshot,blocks,0,exerciseId}';
 IF length(coalesce(v_exercise_id,''))=0 THEN
   RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_EXERCISE_MISSING';END IF;
 v_start:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
   'type','OCURRENCIA_INICIAR','operationId',gen_random_uuid(),
   'clientId',v_client,'entityId',v_occ,'baseRevision',1,
   'payload',jsonb_build_object('executionId',v_execution_id)));
 IF v_start->>'kind'<>'ack' OR v_start->>'status'<>'en_curso'
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_CLIENT_START_NOT_ACK';END IF;
 v_calendar:=private.iberfit_u33_occurrence_calendar_v1(v_client,v_date,v_date+7);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_calendar->'occurrences') j
      WHERE j->>'id'=v_occ::text AND j->>'status'='en_curso')
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_ACTIVE_DATE_NOT_VISIBLE';END IF;
 -- Durable progress is checked through the same role-scoped private read.
 v_ack:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
   'type','OCURRENCIA_GUARDAR_PROGRESO','operationId',gen_random_uuid(),
   'clientId',v_client,'entityId',v_occ,'baseRevision',2,
   'payload',jsonb_build_object('executionId',v_execution_id,
     'executionBaseRevision',1,'results',jsonb_build_object(
       v_exercise_id||':1',jsonb_build_object('reps',10,'loadKg',20)),
     'skippedSets','{}'::jsonb)));
 IF v_ack->>'kind'<>'ack' OR (v_ack->>'executionRevision')::integer<>2
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_PROGRESS_NOT_ACK';END IF;
 v_pause_operation:=gen_random_uuid();
 v_ack:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
   'type','OCURRENCIA_PAUSAR','operationId',v_pause_operation,
   'clientId',v_client,'entityId',v_occ,'baseRevision',2,
   'payload',jsonb_build_object('executionId',v_execution_id,
     'executionBaseRevision',2)));
 IF v_ack->>'kind'<>'ack' OR v_ack->>'executionStatus'<>'pausada'
   OR (v_ack->>'executionRevision')::int<>3
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_PAUSE_NOT_ACK';END IF;
 v_detail:=private.iberfit_u60_occurrence_detail_v1(v_client,v_occ);
 IF v_detail#>>'{executionBody,status}' IS DISTINCT FROM 'pausada'
    OR v_detail->'executionBody'->'results'->(v_exercise_id||':1')->>'reps' IS DISTINCT FROM '10'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_PAUSE_NOT_DURABLE';END IF;
 v_ack:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
   'type','OCURRENCIA_PAUSAR','operationId',v_pause_operation,
   'clientId',v_client,'entityId',v_occ,'baseRevision',2,
   'payload',jsonb_build_object('executionId',v_execution_id,
     'executionBaseRevision',2)));
 IF v_ack->>'kind'<>'ack' OR v_ack->>'duplicate'<>'true'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_PAUSE_REPLAY_NOT_IDEMPOTENT';END IF;
 v_ack:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
   'type','OCURRENCIA_GUARDAR_PROGRESO','operationId',gen_random_uuid(),
   'clientId',v_client,'entityId',v_occ,'baseRevision',2,
   'payload',jsonb_build_object('executionId',v_execution_id,
     'executionBaseRevision',3,'results','{}'::jsonb,'skippedSets','{}'::jsonb)));
 IF v_ack->>'kind'<>'rejected' OR v_ack->>'reason'<>'EXECUTION_PAUSED'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_PAUSED_WRITE_NOT_FENCED';END IF;
 v_ack:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
   'type','OCURRENCIA_REANUDAR','operationId',gen_random_uuid(),
   'clientId',v_client,'entityId',v_occ,'baseRevision',2,
   'payload',jsonb_build_object('executionId',v_execution_id,
     'executionBaseRevision',3)));
 IF v_ack->>'kind'<>'ack' OR v_ack->>'executionStatus'<>'en_curso'
    OR (v_ack->>'executionRevision')::int<>4
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_RESUME_NOT_ACK';END IF;
 v_detail:=private.iberfit_u60_occurrence_detail_v1(v_client,v_occ);
 IF v_detail#>>'{executionBody,status}' IS DISTINCT FROM 'en_curso'
    OR (v_detail#>>'{executionBody,revision}')::int<>4
    OR v_detail->'executionBody'->'results'->(v_exercise_id||':1')->>'reps' IS DISTINCT FROM '10'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_RESUME_NOT_DURABLE';END IF;
 v_ack:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
   'type','OCURRENCIA_COMPLETAR','operationId',gen_random_uuid(),
   'clientId',v_client,'entityId',v_occ,'baseRevision',2,
   'payload',jsonb_build_object('executionId',v_execution_id,
     'executionBaseRevision',4,
     'results',jsonb_build_object(v_exercise_id||':1',
       jsonb_build_object('reps',10,'loadKg',20)),
     'skippedSets','{}'::jsonb,
     'feedback',jsonb_build_object('sessionRpe',7,
       'comment','M1 synthetic QA autonomous dated','pain',false))));
 IF v_ack->>'kind'<>'ack' OR v_ack->>'status'<>'completada'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_COMPLETION_NOT_ACK';END IF;
 v_detail:=private.iberfit_u60_occurrence_detail_v1(v_client,v_occ);
 IF v_detail#>>'{occurrence,status}' IS DISTINCT FROM 'completada'
    OR v_detail#>>'{executionBody,status}' IS DISTINCT FROM 'completada'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_FINISH_READBACK_DRIFT';END IF;
 -- Confirm the second, timed date without a fabricated appointment.
 PERFORM set_config('request.jwt.claim.sub',v_coach::text,true);
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',v_coach,'email','qa.rc74.coach@iberfit.cl','role','authenticated')::text,true);
 v_ack:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
   'type','OCURRENCIA_CONFIRMAR','operationId',gen_random_uuid(),
   'clientId',v_client,'entityId',v_second,'baseRevision',0));
 IF v_ack->>'kind'<>'ack' OR v_ack->>'status'<>'confirmada'
   THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_SECOND_CONFIRM_NOT_ACK';END IF;
 PERFORM set_config('request.jwt.claim.sub',v_user_a::text,true);
 PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',v_user_a,'email','qa.rc74.client-a@iberfit.cl','role','authenticated')::text,true);
 v_calendar:=private.iberfit_u33_occurrence_calendar_v1(v_client,v_date,v_date+7);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_calendar->'occurrences') j
      WHERE j->>'id'=v_second::text AND j->>'status'='confirmada'
        AND j->>'appointmentId' IS NULL AND left(j->>'localTime',5)='12:00')
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_SECOND_TIMED_DATE_MISSING';END IF;
 v_ack:=public.iberfit_occurrence_api_u60_v1('TRANSICION',jsonb_build_object(
    'type','OCURRENCIA_INICIAR','operationId',gen_random_uuid(),
    'clientId',v_client,'entityId',v_second,'baseRevision',1,
    'payload',jsonb_build_object('executionId',gen_random_uuid())));
 IF v_ack->>'kind'<>'rejected' OR v_ack->>'reason'<>'START_WINDOW_INVALID'
    THEN RAISE EXCEPTION 'M1_AUTONOMOUS_PROBE_FUTURE_START_NOT_DENIED';END IF;
 RAISE NOTICE 'M1_AUTONOMOUS_QA_SQL_TRANSACTIONAL_ROLE_E2E_SUCCESS';
END $m1_qa_date_only_probe$;
