-- U33 PostgreSQL 17.6 QA only: execute inside BEGIN/ROLLBACK after
-- #1072+U30+U31+U32+writer fence+U33. No persistent data or PII logs.
DO $qa$
DECLARE
 r record; coach uuid;customer uuid;cid uuid;sid uuid;rev bigint;
 appt uuid:=gen_random_uuid();appt_start timestamptz;day1 date;
 result_coach jsonb;result_client jsonb;answer jsonb;
 occurrence uuid;next_occurrence uuid;
 cmd jsonb;other_client uuid;
BEGIN
 FOR r IN
  SELECT e.client_id cid,e.entity_id sid,e.revision rev,
   (p.body->>'startDate')::date first_day,
   (p.body->>'endDate')::date final_day,
   (e.body->>'durationMinutes')::int duration,
   ca.coach_user_id coach,cp.user_id customer
  FROM public.domain_entities_v26 e
  JOIN public.domain_entities_v26 p
    ON p.entity_type='planning' AND p.entity_id=(e.body->>'cycleId')::uuid
      AND p.client_id=e.client_id AND p.status='publicado'
  JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
  JOIN public.user_profiles cp ON cp.client_id=e.client_id
    AND cp.role::text IN ('client','cliente')
  JOIN public.client_access_v26 acc ON acc.client_id=e.client_id
    AND acc.auth_user_id=cp.user_id AND acc.status='activo'
  JOIN public.m26_canary_clients_v26 cc ON cc.client_id=e.client_id AND cc.active
  WHERE e.entity_type='session' AND e.status='disponible'
    AND e.body->>'deliveryModality'='guiada_en_app'
    AND e.body->>'deliveryOwnership' IN ('guided_in_app','client_autonomous')
    AND e.body->>'clientVisibilityLevel'='full'
    AND e.body->>'visibleToClient'='true'
    AND (p.body->>'endDate')::date >=
      (now() AT TIME ZONE 'America/Santiago')::date+10
  ORDER BY e.updated_at DESC
 LOOP
   PERFORM set_config('request.jwt.claim.sub',r.coach::text,true);
   IF coalesce((private.iberfit_training_command_guard_v1(
     jsonb_build_object('type','SESION_INICIAR','clientId',r.cid,
       'entityId',r.sid,'payload','{}'::jsonb))->>'allowed')::boolean,false) THEN EXIT;END IF;
 END LOOP;
 IF r.cid IS NULL THEN RAISE EXCEPTION 'U33_QA_REAL_COACH_CLIENT_MISSING';END IF;
 coach:=r.coach;customer:=r.customer;cid:=r.cid;sid:=r.sid;rev:=r.rev;
 day1:=GREATEST(r.first_day,(now() AT TIME ZONE 'America/Santiago')::date+2);
 appt_start:=((day1::text||' 11:00')::timestamp
  AT TIME ZONE 'America/Santiago');
 PERFORM public.iberfit_persist_entity_v26(
   'appointment',appt,cid,'confirmada',0,
   jsonb_build_object('id',appt,'clientId',cid,'sessionId',sid,
     'status','confirmada','revision',0,
     'startAt',appt_start,
     'endAt',appt_start+r.duration*interval '1 minute',
     'mode','guiada_en_app','timeZone','America/Santiago'));
 cmd:=jsonb_build_object('type','OCURRENCIAS_CREAR_LOTE',
   'operationId',gen_random_uuid(),'clientId',cid,'entityId',sid,
   'baseRevision',rev,'payload',jsonb_build_object(
     'targetClientId',cid,'previewConfirmed',true,
     'dates',jsonb_build_array(
       jsonb_build_object('localDate',day1::text,'localTime','11:00',
         'appointmentId',appt),
       jsonb_build_object('localDate',(day1+7)::text))));
 answer:=private.iberfit_u32_create_occurrences_batch_v1(cmd);
 IF answer->>'kind'<>'ack' OR answer->>'count'<>'2' THEN
   RAISE EXCEPTION 'U33_QA_CREATE_FAILED:%',answer;END IF;
 occurrence:=(answer#>>'{occurrences,0,id}')::uuid;
 next_occurrence:=(answer#>>'{occurrences,1,id}')::uuid;
 answer:=private.iberfit_u31_occurrence_transition_v1(
   jsonb_build_object('type','OCURRENCIA_CONFIRMAR',
     'operationId',gen_random_uuid(),'clientId',cid,
     'entityId',occurrence,'baseRevision',0));
 IF answer->>'kind'<>'ack' THEN RAISE EXCEPTION 'U33_QA_CONFIRM_FAILED:%',answer; END IF;
 result_coach:=private.iberfit_u33_occurrence_calendar_v1(
   cid,day1,day1+8,52);
 IF result_coach->>'scope'<>'assigned_coach'
   OR jsonb_array_length(result_coach->'items')<>2 THEN
   RAISE EXCEPTION 'U33_QA_COACH_MISSING_DRAFT_OR_CONFIRMED:%',result_coach;END IF;
 PERFORM set_config('request.jwt.claim.sub',customer::text,true);
 result_client:=private.iberfit_u33_occurrence_calendar_v1(
   cid,day1,day1+8,52);
 IF result_client->>'scope'<>'guided_client'
   OR jsonb_array_length(result_client->'items')<>1
   OR result_client#>>'{items,0,occurrenceId}'<>occurrence::text
   OR result_client#>>'{items,0,appointmentId}'<>appt::text
   OR result_client::text ~* 'prescription|blocks|exerciseId|sourceSnapshot'
   OR result_client::text LIKE '%'||next_occurrence::text||'%' THEN
   RAISE EXCEPTION 'U33_QA_CLIENT_PROJECTION_UNSAFE_OR_MISSING';
 END IF;
 -- A source downgraded to summary-only must immediately disappear
 -- from Client calendar while still remaining visible to assigned Coach.
 UPDATE public.domain_entities_v26 SET
   body=jsonb_set(body,'{clientVisibilityLevel}','"summary_only"'::jsonb,true)
 WHERE entity_type='session' AND entity_id=sid AND client_id=cid;
 answer:=private.iberfit_u33_occurrence_calendar_v1(cid,day1,day1+8,52);
 IF jsonb_array_length(answer->'items')<>0 THEN
   RAISE EXCEPTION 'U33_QA_DOWNGRADED_VISIBILITY_LEAKED';
 END IF;
 UPDATE public.domain_entities_v26 SET
   body=jsonb_set(body,'{clientVisibilityLevel}','"full"'::jsonb,true)
 WHERE entity_type='session' AND entity_id=sid AND client_id=cid;
 -- A cancelled appointment cannot leave a phantom future Client workout.
 UPDATE public.appointments SET status='cancelada' WHERE id=appt;
 answer:=private.iberfit_u33_occurrence_calendar_v1(cid,day1,day1+8,52);
 IF jsonb_array_length(answer->'items')<>0 THEN
   RAISE EXCEPTION 'U33_QA_CANCELLED_APPOINTMENT_VISIBLE';
 END IF;
 answer:=private.iberfit_u33_occurrence_calendar_v1(cid,day1,day1+8,1);
 IF answer->>'hasMore'<>'false' THEN
   RAISE EXCEPTION 'U33_QA_CLIENT_CALENDAR_TRUNCATION_WRONG';
 END IF;

 BEGIN
  PERFORM private.iberfit_u33_occurrence_calendar_v1(
   gen_random_uuid(),day1,day1+8,52);
  RAISE EXCEPTION 'U33_QA_CROSS_CLIENT_CALENDAR_ACCEPTED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
  PERFORM private.iberfit_u33_occurrence_calendar_v1(cid,day1,day1+500,52);
  RAISE EXCEPTION 'U33_QA_UNBOUNDED_CALENDAR_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 IF has_function_privilege('authenticated',
      'private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,integer)','EXECUTE')
    OR has_function_privilege('service_role',
      'private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,integer)','EXECUTE') THEN
   RAISE EXCEPTION 'U33_QA_PRIVATE_PROJECTION_EXPOSED';
 END IF;
 RAISE NOTICE 'U33_ROLE_RESTRICTED_CALENDAR_PROJECTION_OK';
END $qa$;
