-- U32 QA-only: apply #1072/U30/U31/U32 within one BEGIN/ROLLBACK.
DO $qa$
DECLARE
  r record;v_client uuid;v_session uuid;v_actor uuid;v_revision bigint;
  d date;lim date;op uuid:=gen_random_uuid();cmd jsonb;ack jsonb;retry jsonb;
  count_rows integer;slot timestamptz;admin_id uuid;
BEGIN
  FOR r IN SELECT e.entity_id sid,e.client_id cid,e.revision rev,
    ca.coach_user_id coach,(p.body->>'startDate')::date first_day,
    (p.body->>'endDate')::date final_day
    FROM public.domain_entities_v26 e JOIN public.domain_entities_v26 p
      ON p.entity_type='planning' AND p.entity_id=(e.body->>'cycleId')::uuid
      AND p.client_id=e.client_id AND p.status='publicado'
    JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
    JOIN public.user_profiles up ON up.user_id=ca.coach_user_id AND up.role::text='coach'
    JOIN public.m26_canary_clients_v26 cc ON cc.client_id=e.client_id AND cc.active
    WHERE e.entity_type='session' AND e.status='disponible'
      AND e.body->>'deliveryModality'='guiada_en_app'
      AND e.body->>'visibleToClient'='true'
      AND e.body->>'clientVisibilityLevel'='full'
      AND (p.body->>'endDate')::date >= (now() AT TIME ZONE 'America/Santiago')::date+21
    ORDER BY e.updated_at DESC LOOP
    PERFORM set_config('request.jwt.claim.sub',r.coach::text,true);
    IF (private.iberfit_training_command_guard_v1(
      jsonb_build_object('type','SESION_INICIAR','clientId',r.cid,
       'entityId',r.sid,'payload','{}'::jsonb))->>'allowed')::boolean THEN EXIT; END IF;
  END LOOP;
  IF r.cid IS NULL THEN RAISE EXCEPTION 'U32_NO_ELIGIBLE_COACH';END IF;
  v_client:=r.cid;v_session:=r.sid;v_revision:=r.rev;v_actor:=r.coach;
  d:=GREATEST(r.first_day,(now() AT TIME ZONE 'America/Santiago')::date+2);
  lim:=r.final_day;
  IF d+16>lim THEN RAISE EXCEPTION 'U32_SHORT_CYCLE';END IF;
  cmd:=jsonb_build_object('type','OCURRENCIAS_CREAR_LOTE','operationId',op,
    'clientId',v_client,'entityId',v_session,'baseRevision',v_revision,
    'payload',jsonb_build_object('targetClientId',v_client,'previewConfirmed',true,
      'dates',jsonb_build_array(jsonb_build_object('localDate',d::text),
        jsonb_build_object('localDate',(d+7)::text),
        jsonb_build_object('localDate',(d+14)::text))));
  BEGIN
    PERFORM private.iberfit_u32_create_occurrences_batch_v1(
      jsonb_set(jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)),
        '{payload,dates}',jsonb_build_array(jsonb_build_object('localDate',d::text),
          jsonb_build_object('localDate',d::text))));
    RAISE EXCEPTION 'U32_DUPLICATE_BATCH_ACCEPTED';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
    WHERE session_id=v_session AND local_date=d) THEN
    RAISE EXCEPTION 'U32_PARTIAL_BATCH_PERSISTED';
  END IF;
  ack:=private.iberfit_u32_create_occurrences_batch_v1(cmd);
  IF ack->>'kind'<>'ack' OR ack->>'count'<>'3' THEN
    RAISE EXCEPTION 'U32_BATCH_FAILED:%',ack; END IF;
  retry:=private.iberfit_u32_create_occurrences_batch_v1(cmd);
  IF retry->>'duplicate'<>'true'
    OR retry->'occurrences' IS DISTINCT FROM ack->'occurrences' THEN
    RAISE EXCEPTION 'U32_REPLAY_NOT_IDEMPOTENT:%',retry;END IF;
  retry:=private.iberfit_u32_create_occurrences_batch_v1(
    jsonb_set(cmd,'{payload,dates}',jsonb_build_array(
      jsonb_build_object('localDate',d::text))));
  IF retry->>'reason'<>'OPERATION_ID_REUSED' THEN
    RAISE EXCEPTION 'U32_MODIFIED_REPLAY_ALLOWED:%',retry;END IF;
  SELECT count(*) INTO count_rows FROM public.training_session_occurrences_v1
  WHERE client_id=v_client AND session_id=v_session
    AND local_date IN (d,d+7,d+14);
  IF count_rows<>3 THEN RAISE EXCEPTION 'U32_EXPECTED_THREE_ROWS';END IF;
  IF EXISTS(SELECT 1 FROM public.training_session_occurrences_v1 oc
    WHERE client_id=v_client AND session_id=v_session
      AND (oc.prescription_revision<>v_revision
        OR oc.prescription_snapshot->>'sessionId'<>v_session::text
        OR oc.prescription_snapshot->>'clientId'<>v_client::text
        OR jsonb_typeof(oc.prescription_snapshot->'queue')<>'array'
        OR oc.created_operation_id=op)) THEN
    RAISE EXCEPTION 'U32_SNAPSHOT_NOT_SERVER_OWNED';END IF;
  slot:=((d+1)::text||' 18:00')::timestamp AT TIME ZONE 'America/Santiago';
  INSERT INTO public.appointments(client_id,title,mode,start_at,end_at,status)
  VALUES(v_client,'U32 QA conflict','guiada_en_app',slot,slot+interval '45 minute','confirmada');
  BEGIN
    PERFORM private.iberfit_u32_create_occurrences_batch_v1(
      jsonb_set(jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)),
        '{payload,dates}',jsonb_build_array(
          jsonb_build_object('localDate',(d+1)::text,'localTime','18:00'))));
    RAISE EXCEPTION 'U32_CLIENT_APPOINTMENT_CONFLICT_ALLOWED';
  EXCEPTION WHEN exclusion_violation THEN NULL;END;
  BEGIN
    PERFORM private.iberfit_u32_create_occurrences_batch_v1(
      jsonb_set(jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)),
        '{payload,dates}',jsonb_build_array(
          jsonb_build_object('localDate',(lim+1)::text))));
    RAISE EXCEPTION 'U32_OUT_OF_CYCLE_ALLOWED';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
  BEGIN
    PERFORM private.iberfit_u32_create_occurrences_batch_v1(
      jsonb_set(jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)),
        '{payload,blocks}','[{"exerciseId":"fake"}]'::jsonb));
    RAISE EXCEPTION 'U32_UNTRUSTED_BLOCKS_ALLOWED';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
  BEGIN
    PERFORM private.iberfit_u32_create_occurrences_batch_v1(
      jsonb_set(jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)),
        '{clientId}',to_jsonb(gen_random_uuid()::text)));
    RAISE EXCEPTION 'U32_OTHER_CLIENT_ALLOWED';
  EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN NULL;END;
  SELECT user_id INTO admin_id FROM public.user_profiles WHERE role::text='admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'U32_ADMIN_TEST_REQUIRED';END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  BEGIN
    PERFORM private.iberfit_u32_create_occurrences_batch_v1(
      jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)));
    RAISE EXCEPTION 'U32_ADMIN_AS_COACH_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  IF has_function_privilege('authenticated',
    'private.iberfit_u32_create_occurrences_batch_v1(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'U32_PRIVATE_EXECUTE_EXPOSED';END IF;
  RAISE NOTICE 'U32_THREE_DATE_ATOMIC_BATCH_PASS';
END $qa$;
