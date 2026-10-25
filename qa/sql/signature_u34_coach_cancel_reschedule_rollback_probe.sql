-- QA only. Run in BEGIN/ROLLBACK after #1072,U30,U31,U32,fence,U33,U34.
DO $qa$
DECLARE r record;d date;d2 date;d3 date;
 a uuid;b uuid;c uuid;replacement_id uuid;
 linked_id uuid:=gen_random_uuid();linked_occ uuid;slot timestamptz;
 admin_actor uuid;typed_status text;domain_status text;
 op uuid;batch_op uuid;cmd jsonb;ack jsonb;replay jsonb;
BEGIN
 FOR r IN SELECT e.client_id cid,e.entity_id sid,e.revision rev,
 ca.coach_user_id actor,(e.body->>'durationMinutes')::int duration,
 (p.body->>'startDate')::date begins,
 (p.body->>'endDate')::date ends
 FROM public.domain_entities_v26 e
 JOIN public.domain_entities_v26 p ON p.entity_type='planning'
  AND p.entity_id=(e.body->>'cycleId')::uuid AND p.client_id=e.client_id
  AND p.status='publicado'
 JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
 JOIN public.user_profiles up ON up.user_id=ca.coach_user_id AND up.role::text='coach'
 JOIN public.m26_canary_clients_v26 cc ON cc.client_id=e.client_id AND cc.active
 WHERE e.entity_type='session' AND e.status='disponible'
 AND e.body->>'deliveryModality'='guiada_en_app'
 AND e.body->>'visibleToClient'='true'
 AND e.body->>'clientVisibilityLevel'='full'
 AND jsonb_typeof(e.body->'blocks')='array'
 AND jsonb_array_length(e.body->'blocks')>0
 AND coalesce(e.body->>'durationMinutes','')~'^[0-9]{2,3}$'
 AND (e.body->>'durationMinutes')::int BETWEEN 10 AND 240
 AND (p.body->>'endDate')::date >= (now() AT TIME ZONE 'America/Santiago')::date+14
 ORDER BY e.updated_at DESC LOOP
 PERFORM set_config('request.jwt.claim.sub',r.actor::text,true);
 IF coalesce((private.iberfit_training_command_guard_v1(
  jsonb_build_object('type','SESION_INICIAR','clientId',r.cid,
   'entityId',r.sid,'payload','{}'::jsonb))->>'allowed')::boolean,false)
 THEN EXIT;END IF;
 END LOOP;
 IF r.cid IS NULL THEN RAISE EXCEPTION 'U34_QA_SOURCE_MISSING';END IF;
 d:=GREATEST(r.begins,(now() AT TIME ZONE 'America/Santiago')::date);
 d2:=d+7;d3:=d+14;
 IF d3>r.ends THEN RAISE EXCEPTION 'U34_QA_CYCLE_SHORT';END IF;
 ack:=private.iberfit_u32_create_occurrences_batch_v1(jsonb_build_object(
  'type','OCURRENCIAS_CREAR_LOTE','operationId',gen_random_uuid(),
  'clientId',r.cid,'entityId',r.sid,'baseRevision',r.rev,
  'payload',jsonb_build_object('targetClientId',r.cid,
   'previewConfirmed',true,'dates',jsonb_build_array(
    jsonb_build_object('localDate',d::text),
    jsonb_build_object('localDate',d2::text),
    jsonb_build_object('localDate',d3::text)))));
 IF ack->>'kind'<>'ack' OR ack->>'count'<>'3'
 THEN RAISE EXCEPTION 'U34_QA_BATCH_FAILED';END IF;
 a:=(ack#>>'{occurrences,0,id}')::uuid;
 b:=(ack#>>'{occurrences,1,id}')::uuid;
 c:=(ack#>>'{occurrences,2,id}')::uuid;
 op:=gen_random_uuid();
 cmd:=jsonb_build_object('type','OCURRENCIA_CANCELAR','operationId',op,
  'clientId',r.cid,'entityId',b,'baseRevision',0);
 ack:=private.iberfit_u34_coach_occurrence_change_v1(cmd);
 IF ack->>'kind'<>'ack' OR ack->>'status'<>'cancelada'
 THEN RAISE EXCEPTION 'U34_QA_CANCEL_FAILED';END IF;
 replay:=private.iberfit_u34_coach_occurrence_change_v1(cmd);
 IF replay->>'duplicate'<>'true' OR replay?'requestHash'
 THEN RAISE EXCEPTION 'U34_QA_CANCEL_REPLAY_FAILED';END IF;
 batch_op:=gen_random_uuid();op:=gen_random_uuid();
 cmd:=jsonb_build_object('type','OCURRENCIA_REPROGRAMAR',
  'operationId',op,'clientId',r.cid,'entityId',c,'baseRevision',0,
  'payload',jsonb_build_object('newOperationId',batch_op,
   'replacement',jsonb_build_object('localDate',d2::text)));
 ack:=private.iberfit_u34_coach_occurrence_change_v1(cmd);
 IF ack->>'kind'<>'ack' OR ack#>>'{replacement,localDate}' IS DISTINCT FROM d2::text
 THEN RAISE EXCEPTION 'U34_QA_REBOOK_FAILED';END IF;
 replacement_id:=(ack#>>'{replacement,id}')::uuid;
 replay:=private.iberfit_u34_coach_occurrence_change_v1(cmd);
 IF replay->>'duplicate'<>'true'
 OR replay#>>'{replacement,id}' IS DISTINCT FROM replacement_id::text
 THEN RAISE EXCEPTION 'U34_QA_REBOOK_REPLAY_FAILED';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
    WHERE id=b AND status='cancelada' AND revision=1)
 OR NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
    WHERE id=c AND status='cancelada' AND revision=1)
 OR NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
    WHERE id=replacement_id AND status='planificada' AND local_date=d2)
 OR (SELECT count(*) FROM public.training_session_occurrences_v1
    WHERE session_id=r.sid AND local_date=d2)<>2
 THEN RAISE EXCEPTION 'U34_QA_HISTORY_NOT_PRESERVED';END IF;
 replay:=private.iberfit_u34_coach_occurrence_change_v1(
  cmd||jsonb_build_object('baseRevision',1));
 IF replay->>'reason'<>'OPERATION_ID_REUSED' THEN
  RAISE EXCEPTION 'U34_QA_REPLAY_MANIPULATED';END IF;
 BEGIN
  PERFORM private.iberfit_u34_coach_occurrence_change_v1(
   jsonb_build_object('type','OCURRENCIA_REPROGRAMAR',
    'operationId',gen_random_uuid(),'clientId',r.cid,
    'entityId',a,'baseRevision',0,
    'payload',jsonb_build_object('newOperationId',gen_random_uuid(),
    'replacement',jsonb_build_object('localDate',(r.ends+1)::text))));
  RAISE EXCEPTION 'U34_QA_OUT_OF_CYCLE_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 IF NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
  WHERE id=a AND status='planificada' AND revision=0)
 THEN RAISE EXCEPTION 'U34_QA_FAILED_REBOOK_CANCELLED_ORIGINAL';END IF;
 -- A stale device must not cancel the same historical occurrence again.
 ack:=private.iberfit_u34_coach_occurrence_change_v1(
   jsonb_build_object('type','OCURRENCIA_CANCELAR',
   'operationId',gen_random_uuid(),'clientId',r.cid,
   'entityId',b,'baseRevision',0));
 IF ack->>'kind'<>'conflict' OR ack->>'reason'<>'REVISION_MISMATCH'
 THEN RAISE EXCEPTION 'U34_QA_STALE_REVISION_ACCEPTED';END IF;
 BEGIN
   PERFORM private.iberfit_u34_coach_occurrence_change_v1(
     jsonb_build_object('type','OCURRENCIA_CANCELAR',
       'operationId',gen_random_uuid(),'clientId',gen_random_uuid(),
       'entityId',a,'baseRevision',0));
   RAISE EXCEPTION 'U34_QA_FOREIGN_CLIENT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 SELECT user_id INTO admin_actor FROM public.user_profiles
   WHERE role::text='admin' LIMIT 1;
 IF admin_actor IS NULL THEN RAISE EXCEPTION 'U34_QA_ADMIN_FIXTURE_REQUIRED';END IF;
 PERFORM set_config('request.jwt.claim.sub',admin_actor::text,true);
 BEGIN
   PERFORM private.iberfit_u34_coach_occurrence_change_v1(
     jsonb_build_object('type','OCURRENCIA_CANCELAR',
       'operationId',gen_random_uuid(),'clientId',r.cid,
       'entityId',a,'baseRevision',0));
   RAISE EXCEPTION 'U34_QA_ADMIN_CANCEL_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',r.actor::text,true);
 -- A linked real appointment must be cancelled in BOTH canonical domain
 -- and typed projection, without deleting either historical identifier.
 slot:=(((d+1)::text||' 12:00')::timestamp AT TIME ZONE 'America/Santiago');
 PERFORM public.iberfit_persist_entity_v26(
   'appointment',linked_id,r.cid,'confirmada',0,
   jsonb_build_object('id',linked_id,'clientId',r.cid,
    'sessionId',r.sid,'status','confirmada','revision',0,
    'title','U34 QA linked','type','session','mode','guiada_en_app',
    'timeZone','America/Santiago','startAt',slot,
    'endAt',slot+r.duration*interval '1 minute',
    'confirmedAt',now(),'confirmedBy',r.actor,'createdBy',r.actor));
 ack:=private.iberfit_u32_create_occurrences_batch_v1(jsonb_build_object(
   'type','OCURRENCIAS_CREAR_LOTE','operationId',gen_random_uuid(),
   'clientId',r.cid,'entityId',r.sid,'baseRevision',r.rev,
   'payload',jsonb_build_object('targetClientId',r.cid,
     'previewConfirmed',true,'dates',jsonb_build_array(
       jsonb_build_object('localDate',(d+1)::text,
       'localTime','12:00','appointmentId',linked_id)))));
 IF ack->>'kind'<>'ack' THEN RAISE EXCEPTION 'U34_QA_LINKED_BATCH_FAILED';END IF;
 linked_occ:=(ack#>>'{occurrences,0,id}')::uuid;
 ack:=private.iberfit_u34_coach_occurrence_change_v1(jsonb_build_object(
   'type','OCURRENCIA_CANCELAR','operationId',gen_random_uuid(),
   'clientId',r.cid,'entityId',linked_occ,'baseRevision',0));
 IF ack->>'kind'<>'ack' THEN RAISE EXCEPTION 'U34_QA_LINKED_CANCEL_FAILED';END IF;
 SELECT status INTO typed_status FROM public.appointments WHERE id=linked_id;
 SELECT status INTO domain_status FROM public.domain_entities_v26
  WHERE entity_type='appointment' AND entity_id=linked_id AND client_id=r.cid;
 IF typed_status<>'cancelada' OR domain_status<>'cancelada'
 OR NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
    WHERE id=linked_occ AND appointment_id=linked_id AND status='cancelada')
 THEN RAISE EXCEPTION 'U34_QA_LINKED_APPOINTMENT_DRIFT';END IF;
 IF has_function_privilege('authenticated',
  'private.iberfit_u34_coach_occurrence_change_v1(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'U34_QA_FUNCTION_EXPOSED';END IF;
 RAISE NOTICE 'U34_QA_CANCEL_REBOOK_ROLLBACK_IDEMPOTENCY_PASS';
END $qa$;
