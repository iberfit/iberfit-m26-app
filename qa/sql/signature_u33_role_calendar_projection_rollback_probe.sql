-- QA ONLY. Apply #1072, U30, U31, U32, appointment fence, U33 in
-- a single BEGIN/ROLLBACK. No output of names, IDs or clinical information.
DO $qa$
DECLARE
 r record; v_client uuid; v_session uuid; v_coach uuid; v_client_actor uuid;
 v_admin uuid; v_revision bigint; v_day date; v_second date;
 v_slot timestamptz; v_appointment uuid:=gen_random_uuid();
 v_ack jsonb; v_coach_view jsonb; v_first jsonb; v_next jsonb;
 v_client_view jsonb; v_occurrence uuid; v_cursor jsonb;
BEGIN
 FOR r IN
 SELECT e.client_id cid,e.entity_id sid,e.revision rev,
   (e.body->>'durationMinutes')::int duration,
   ca.coach_user_id coach_actor,cp.user_id client_actor,
   (p.body->>'startDate')::date starts,(p.body->>'endDate')::date ends
 FROM public.domain_entities_v26 e
 JOIN public.domain_entities_v26 p
   ON p.entity_type='planning' AND p.entity_id=(e.body->>'cycleId')::uuid
     AND p.client_id=e.client_id AND p.status='publicado'
 JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
 JOIN public.user_profiles up ON up.user_id=ca.coach_user_id AND up.role::text='coach'
 JOIN public.user_profiles cp ON cp.client_id=e.client_id AND cp.role::text IN ('client','cliente')
 JOIN public.client_access_v26 access ON access.client_id=e.client_id
   AND access.auth_user_id=cp.user_id AND access.status='activo'
 JOIN public.m26_canary_clients_v26 cc ON cc.client_id=e.client_id AND cc.active
 WHERE e.entity_type='session' AND e.status='disponible'
   AND e.body->>'deliveryModality'='guiada_en_app'
   AND e.body->>'visibleToClient'='true'
   AND e.body->>'clientVisibilityLevel'='full'
   AND jsonb_typeof(e.body->'blocks')='array'
   AND jsonb_array_length(e.body->'blocks')>0
   AND coalesce(e.body->>'durationMinutes','')~'^[0-9]{2,3}$'
   AND (e.body->>'durationMinutes')::int BETWEEN 10 AND 240
   AND (p.body->>'endDate')::date >= (now() AT TIME ZONE 'America/Santiago')::date + 7
 ORDER BY e.updated_at DESC LOOP
   PERFORM set_config('request.jwt.claim.sub',r.coach_actor::text,true);
   IF coalesce((private.iberfit_training_command_guard_v1(
     jsonb_build_object('type','SESION_INICIAR','entityId',r.sid,
       'clientId',r.cid,'payload','{}'::jsonb))->>'allowed')::boolean,false)
   THEN EXIT;END IF;
 END LOOP;
 IF r.cid IS NULL THEN RAISE EXCEPTION 'U33_QA_SOURCE_NOT_FOUND';END IF;
 v_client:=r.cid;v_session:=r.sid;v_coach:=r.coach_actor;
 v_client_actor:=r.client_actor;v_revision:=r.rev;
 v_day:=GREATEST(r.starts,(now() AT TIME ZONE 'America/Santiago')::date);
 v_second:=v_day+7;
 IF v_second>r.ends THEN RAISE EXCEPTION 'U33_QA_CYCLE_WINDOW_INVALID';END IF;
 v_slot:=((v_day::text||' 12:00')::timestamp AT TIME ZONE 'America/Santiago');
 PERFORM public.iberfit_persist_entity_v26(
 'appointment',v_appointment,v_client,'confirmada',0,
 jsonb_build_object('id',v_appointment,'clientId',v_client,
   'sessionId',v_session,'status','confirmada','revision',0,
   'title','U33 isolated appointment','type','session',
   'mode','guiada_en_app','timeZone','America/Santiago',
   'startAt',v_slot,'endAt',v_slot+r.duration*interval '1 minute',
   'confirmedAt',now(),'confirmedBy',v_coach,'createdBy',v_coach));
 v_ack:=private.iberfit_u32_create_occurrences_batch_v1(jsonb_build_object(
  'type','OCURRENCIAS_CREAR_LOTE','operationId',gen_random_uuid(),
  'clientId',v_client,'entityId',v_session,'baseRevision',v_revision,
  'payload',jsonb_build_object('targetClientId',v_client,'previewConfirmed',true,
    'dates',jsonb_build_array(
      jsonb_build_object('localDate',v_day::text,'localTime','12:00','appointmentId',v_appointment),
      jsonb_build_object('localDate',v_second::text)))));
 IF v_ack->>'kind'<>'ack' OR v_ack->>'count'<>'2' THEN
   RAISE EXCEPTION 'U33_QA_BATCH_FAILED';
 END IF;
 v_occurrence:=(v_ack#>>'{occurrences,0,id}')::uuid;
 v_coach_view:=private.iberfit_u33_occurrence_calendar_v1(v_client,v_day,v_second);
 IF v_coach_view->>'count'<>'2' OR v_coach_view->>'hasMore'<>'false' THEN
   RAISE EXCEPTION 'U33_QA_COACH_COUNT_INVALID';END IF;
 IF (v_coach_view->'occurrences')::text ~
   'prescriptionSnapshot|publishedSnapshot|requestHash|batchOperationId|queue' THEN
   RAISE EXCEPTION 'U33_QA_PRIVATE_SNAPSHOT_EXPOSED';END IF;
 v_first:=private.iberfit_u33_occurrence_calendar_v1(
    v_client,v_day,v_second,NULL,NULL,1);
 IF v_first->>'count'<>'1' OR v_first->>'hasMore'<>'true'
    OR v_first->'nextCursor' IS NULL THEN
    RAISE EXCEPTION 'U33_QA_CURSOR_FIRST_FAILED';END IF;
 v_cursor:=v_first->'nextCursor';
 v_next:=private.iberfit_u33_occurrence_calendar_v1(
   v_client,v_day,v_second,(v_cursor->>'localDate')::date,
   (v_cursor->>'id')::uuid,1);
 IF v_next->>'count'<>'1' OR v_next->>'hasMore'<>'false'
   OR v_first#>>'{occurrences,0,id}' = v_next#>>'{occurrences,0,id}' THEN
   RAISE EXCEPTION 'U33_QA_CURSOR_NEXT_FAILED';END IF;
 PERFORM set_config('request.jwt.claim.sub',v_client_actor::text,true);
 v_client_view:=private.iberfit_u33_occurrence_calendar_v1(v_client,v_day,v_second);
 IF v_client_view->>'count'<>'0' THEN
   RAISE EXCEPTION 'U33_QA_CLIENT_SAW_UNCONFIRMED_DRAFT';END IF;
 PERFORM set_config('request.jwt.claim.sub',v_coach::text,true);
 v_ack:=private.iberfit_u31_occurrence_transition_v1(jsonb_build_object(
   'type','OCURRENCIA_CONFIRMAR','operationId',gen_random_uuid(),
   'clientId',v_client,'entityId',v_occurrence,'baseRevision',0));
 IF v_ack->>'status'<>'confirmada' THEN
   RAISE EXCEPTION 'U33_QA_CONFIRM_FAILED';END IF;
 PERFORM set_config('request.jwt.claim.sub',v_client_actor::text,true);
 v_client_view:=private.iberfit_u33_occurrence_calendar_v1(v_client,v_day,v_second);
 IF v_client_view->>'count'<>'1'
   OR v_client_view#>>'{occurrences,0,id}' IS DISTINCT FROM v_occurrence::text THEN
   RAISE EXCEPTION 'U33_QA_CLIENT_VISIBLE_CONFIRMED_INVALID';END IF;
 BEGIN
   PERFORM private.iberfit_u33_occurrence_calendar_v1(gen_random_uuid(),v_day,v_second);
   RAISE EXCEPTION 'U33_QA_CLIENT_CROSS_SCOPE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',v_coach::text,true);
 BEGIN
   PERFORM private.iberfit_u33_occurrence_calendar_v1(v_client,v_day,v_second,NULL,NULL,101);
   RAISE EXCEPTION 'U33_QA_UNBOUNDED_QUERY_ALLOWED';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 SELECT user_id INTO v_admin FROM public.user_profiles WHERE role::text='admin' LIMIT 1;
 IF v_admin IS NULL THEN RAISE EXCEPTION 'U33_QA_ADMIN_NOT_FOUND';END IF;
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
 BEGIN
   PERFORM private.iberfit_u33_occurrence_calendar_v1(v_client,v_day,v_second);
   RAISE EXCEPTION 'U33_QA_ADMIN_ALLOWED_WITHOUT_POLICY';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('authenticated',
    'private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'U33_QA_PUBLIC_FUNCTION_EXPOSED';END IF;
 RAISE NOTICE 'U33_AUTH_PAGINATION_PRIVACY_AND_ROLLBACK_PASS';
END $qa$;
