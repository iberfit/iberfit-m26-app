-- SIGNATURE U31/U32 link reconciliation. Execute after #1072,U30,U31,U32
-- and the appointment writer fence inside a single BEGIN/ROLLBACK.
-- Simulates a real canonical confirmed appointment, not a typed-only orphan.
DO $qa$
DECLARE r record;client uuid;session_id uuid;actor uuid;rev bigint;
  plan_date date;d2 date;d3 date;slot timestamptz;
  duration_min int;appt_id uuid:=gen_random_uuid();
  appointment_body jsonb;operation uuid;execution uuid:=gen_random_uuid();
  occurrence uuid;second uuid;third uuid;ack jsonb;cmd jsonb;
  exercise_id text;results jsonb;set_no int;sets int;
BEGIN
 FOR r IN
 SELECT e.client_id cid,e.entity_id sid,e.revision rev,
   e.body->'blocks' blocks, (e.body->>'durationMinutes')::int duration,
   ca.coach_user_id actor,
   (p.body->>'startDate')::date starts,(p.body->>'endDate')::date ends
 FROM public.domain_entities_v26 e
 JOIN public.domain_entities_v26 p
   ON p.entity_type='planning' AND p.entity_id=(e.body->>'cycleId')::uuid
     AND p.client_id=e.client_id AND p.status='publicado'
 JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
 JOIN public.user_profiles up ON up.user_id=ca.coach_user_id AND up.role::text='coach'
 JOIN public.m26_canary_clients_v26 cc ON cc.client_id=e.client_id AND cc.active
 WHERE e.entity_type='session' AND e.status='disponible'
   AND e.body->>'deliveryModality'='guiada_en_app'
   AND e.body->>'visibleToClient'='true'
   AND e.body->>'clientVisibilityLevel'='full'
   AND jsonb_typeof(e.body->'blocks')='array'
   AND jsonb_array_length(e.body->'blocks')=1
   AND coalesce(e.body->'blocks'->0->>'sets','')~'^[0-9]{1,2}$'
   AND (p.body->>'endDate')::date>=(now() AT TIME ZONE 'America/Santiago')::date+14
 ORDER BY e.updated_at DESC LOOP
   PERFORM set_config('request.jwt.claim.sub',r.actor::text,true);
   IF coalesce((private.iberfit_training_command_guard_v1(
       jsonb_build_object('type','SESION_INICIAR','entityId',r.sid,
         'clientId',r.cid,'payload','{}'::jsonb))->>'allowed')::boolean,false)
     THEN EXIT; END IF;
 END LOOP;
 IF r.cid IS NULL THEN RAISE EXCEPTION 'U31_LINKED_QA_SOURCE_MISSING';END IF;
 client:=r.cid;session_id:=r.sid;actor:=r.actor;rev:=r.rev;
 duration_min:=r.duration;
 plan_date:=GREATEST(r.starts,(now() AT TIME ZONE 'America/Santiago')::date-1);
 d2:=plan_date+7;d3:=plan_date+14;
 IF plan_date>(now() AT TIME ZONE 'America/Santiago')::date
    OR d3>r.ends THEN RAISE EXCEPTION 'U31_LINKED_QA_CYCLE_TOO_SHORT';END IF;
 slot:=((plan_date::text||' 12:00')::timestamp AT TIME ZONE 'America/Santiago');
 appointment_body:=jsonb_build_object(
   'id',appt_id,'clientId',client,'sessionId',session_id,
   'status','confirmada','revision',0,
   'title','QA linked guided appointment','type','session',
   'mode','guiada_en_app','timeZone','America/Santiago',
   'startAt',slot,'endAt',slot+duration_min*interval '1 minute',
   'confirmedAt',now(),'confirmedBy',actor,'createdBy',actor);
 PERFORM public.iberfit_persist_entity_v26(
   'appointment',appt_id,client,'confirmada',0,appointment_body);
 IF NOT EXISTS(SELECT 1 FROM public.appointments
   WHERE id=appt_id AND client_id=client
     AND session_id=session_id AND status='confirmada') THEN
   RAISE EXCEPTION 'U31_LINKED_QA_CANONICAL_APPOINTMENT_MISSING';
 END IF;
 operation:=gen_random_uuid();
 ack:=private.iberfit_u32_create_occurrences_batch_v1(
  jsonb_build_object('type','OCURRENCIAS_CREAR_LOTE',
   'operationId',operation,'clientId',client,'entityId',session_id,
   'baseRevision',rev,'payload',jsonb_build_object(
     'targetClientId',client,'previewConfirmed',true,
     'dates',jsonb_build_array(
       jsonb_build_object('localDate',plan_date::text,
         'localTime','12:00','appointmentId',appt_id),
       jsonb_build_object('localDate',d2::text),
       jsonb_build_object('localDate',d3::text)))));
 IF ack->>'kind'<>'ack' OR ack->>'count'<>'3' THEN
   RAISE EXCEPTION 'U31_LINKED_CREATE_BATCH_FAILED:%',ack;END IF;
 occurrence:=(ack#>>'{occurrences,0,id}')::uuid;
 second:=(ack#>>'{occurrences,1,id}')::uuid;
 third:=(ack#>>'{occurrences,2,id}')::uuid;
 cmd:=jsonb_build_object('type','OCURRENCIA_CONFIRMAR',
  'operationId',gen_random_uuid(),'clientId',client,
  'entityId',occurrence,'baseRevision',0);
 ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
 IF ack->>'status'<>'confirmada' THEN
   RAISE EXCEPTION 'U31_LINKED_CONFIRM_FAILED:%',ack; END IF;
 cmd:=jsonb_build_object('type','OCURRENCIA_INICIAR',
  'operationId',gen_random_uuid(),'clientId',client,
  'entityId',occurrence,'baseRevision',1,
  'payload',jsonb_build_object('executionId',execution));
 ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
 IF ack->>'kind'<>'ack' OR ack->>'status'<>'en_curso' THEN
   RAISE EXCEPTION 'U31_LINKED_START_FAILED:%',ack;END IF;
 exercise_id:=r.blocks->0->>'exerciseId';
 sets:=(r.blocks->0->>'sets')::int;results:='{}'::jsonb;
 FOR set_no IN 1..sets LOOP
   results:=results||jsonb_build_object(exercise_id||':'||set_no,
     jsonb_build_object('reps',10,'loadKg',20));
 END LOOP;
 cmd:=jsonb_build_object('type','OCURRENCIA_COMPLETAR',
  'operationId',gen_random_uuid(),'clientId',client,
  'entityId',occurrence,'baseRevision',2,
  'payload',jsonb_build_object('executionId',execution,
   'executionBaseRevision',1,'results',results,'skippedSets','{}'::jsonb,
   'feedback',jsonb_build_object('sessionRpe',7,
     'comment','Linked appointment test','pain',false)));
 ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
 IF ack->>'kind'<>'ack' OR ack->>'status'<>'completada'
    OR ack->>'appointmentCompletionState'<>'completed' THEN
   RAISE EXCEPTION 'U31_LINKED_CLOSE_FAILED:%',ack;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.appointments WHERE id=appt_id
   AND status='completada' AND revision=1
   AND completed_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM public.domain_entities_v26
   WHERE entity_type='appointment' AND entity_id=appt_id
     AND client_id=client AND status='completada' AND revision=1)
 OR NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
   WHERE id=occurrence AND status='completada' AND appointment_id=appt_id)
 OR (SELECT revision FROM public.domain_entities_v26
     WHERE entity_type='session' AND entity_id=session_id)<>rev
 OR (SELECT status FROM public.domain_entities_v26
     WHERE entity_type='session' AND entity_id=session_id)<>'disponible'
 OR (SELECT count(*) FROM public.training_session_occurrences_v1
     WHERE id IN (second,third) AND status='planificada')<>2 THEN
   RAISE EXCEPTION 'U31_LINKED_CALENDAR_OR_SOURCE_STATE_WRONG';END IF;
 ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
 IF ack->>'kind'<>'ack' OR ack->>'duplicate'<>'true' THEN
   RAISE EXCEPTION 'U31_LINKED_CLOSE_REPLAY_FAILED:%',ack;END IF;
 IF (SELECT revision FROM public.appointments WHERE id=appt_id)<>1 THEN
   RAISE EXCEPTION 'U31_LINKED_CLOSE_DUPLICATED_APPOINTMENT_UPDATE';
 END IF;
 RAISE NOTICE 'U31_LINKED_APPOINTMENT_COMPLETED_ATOMICALLY';
END $qa$;
