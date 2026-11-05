-- U36 QA ONLY. Apply #1072,U30,U31,U32,writer fence,U33,U34,U36
-- inside one transaction BEGIN/ROLLBACK. Never emit PII or actor IDs.
DO $qa$
DECLARE
  r record;
  v_client uuid;
  v_coach uuid;
  v_client_actor uuid;
  v_admin uuid;
  v_date date;
  v_id uuid;
  v_ack jsonb;
  v_list jsonb;
  v_command jsonb;
BEGIN
  FOR r IN
    SELECT e.entity_id sid,e.client_id cid,e.revision rev,
      ca.coach_user_id coach_actor, cp.user_id client_actor,
      (p.body->>'startDate')::date cycle_begin,
      (p.body->>'endDate')::date cycle_end
    FROM public.domain_entities_v26 e
    JOIN public.domain_entities_v26 p ON
      p.entity_type='planning' AND p.entity_id=(e.body->>'cycleId')::uuid
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
      AND (p.body->>'endDate')::date >= (now() AT TIME ZONE 'America/Santiago')::date+7
    ORDER BY e.updated_at DESC LOOP
      PERFORM set_config('request.jwt.claim.sub',r.coach_actor::text,true);
      IF coalesce((private.iberfit_training_command_guard_v1(
        jsonb_build_object('type','SESION_INICIAR','clientId',r.cid,
        'entityId',r.sid,'payload','{}'::jsonb))->>'allowed')::boolean,false)
      THEN EXIT;END IF;
  END LOOP;
  IF r.cid IS NULL THEN RAISE EXCEPTION 'U36_QA_FIXTURE_NOT_FOUND';END IF;
  v_client:=r.cid;v_coach:=r.coach_actor;v_client_actor:=r.client_actor;
  v_date:=GREATEST(r.cycle_begin,(now() AT TIME ZONE 'America/Santiago')::date);
  IF v_date>r.cycle_end THEN RAISE EXCEPTION 'U36_QA_DATE_UNAVAILABLE';END IF;
  -- Closed HTTP function can only be invoked by its owner in this rehearsal.
  -- Real authenticated users must still fail has_function_privilege.
  IF has_function_privilege('authenticated',
      'public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('anon',
      'public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE')
    OR has_function_privilege('service_role',
      'public.iberfit_occurrence_api_v1(text,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'U36_QA_PUBLIC_GRANT_DETECTED';END IF;
  v_ack:=public.iberfit_occurrence_api_v1('CREAR_LOTE',
    jsonb_build_object('type','OCURRENCIAS_CREAR_LOTE',
      'operationId',gen_random_uuid(),'clientId',r.cid,
      'entityId',r.sid,'baseRevision',r.rev,
      'payload',jsonb_build_object(
        'targetClientId',r.cid,'previewConfirmed',true,
        'dates',jsonb_build_array(jsonb_build_object('localDate',v_date::text)))));
  IF v_ack->>'kind'<>'ack' OR v_ack->>'count'<>'1' THEN
    RAISE EXCEPTION 'U36_QA_CREATE_FAIL';END IF;
  v_id:=(v_ack#>>'{occurrences,0,id}')::uuid;
  v_list:=public.iberfit_occurrence_api_v1('CALENDARIO',
    jsonb_build_object('clientId',r.cid,'startDate',v_date,'endDate',v_date,'limit',20));
  IF v_list->>'kind'<>'calendar' OR v_list->>'count'<>'1'
    OR (v_list->'occurrences')::text~'prescriptionSnapshot|queue|requestHash' THEN
    RAISE EXCEPTION 'U36_QA_CALENDAR_FAILED_OR_LEAKED';END IF;
  -- Confirm via the same future HTTP boundary (still not granted).
  v_command:=jsonb_build_object(
    'type','OCURRENCIA_CONFIRMAR','operationId',gen_random_uuid(),
    'clientId',v_client,'entityId',v_id,'baseRevision',0);
  v_ack:=public.iberfit_occurrence_api_v1('TRANSICION',v_command);
  IF v_ack->>'status'<>'confirmada' THEN
    RAISE EXCEPTION 'U36_QA_TRANSITION_FAILED';END IF;
  PERFORM set_config('request.jwt.claim.sub',v_client_actor::text,true);
  v_list:=public.iberfit_occurrence_api_v1('CALENDARIO',
    jsonb_build_object('clientId',v_client,'startDate',v_date,'endDate',v_date));
  IF v_list->>'count'<>'0' THEN
    RAISE EXCEPTION 'U36_QA_UNLINKED_CLIENT_DRAFT_VISIBLE';END IF;
  BEGIN
    PERFORM public.iberfit_occurrence_api_v1('CALENDARIO',
      jsonb_build_object('clientId',gen_random_uuid(),
        'startDate',v_date,'endDate',v_date));
    RAISE EXCEPTION 'U36_QA_CROSS_CLIENT_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub',v_coach::text,true);
  BEGIN
    PERFORM public.iberfit_occurrence_api_v1('CALENDARIO',
      jsonb_build_object('clientId',v_client,'startDate',v_date,
        'endDate',v_date,'role','admin'));
    RAISE EXCEPTION 'U36_QA_UNTRUSTED_FILTER_ALLOWED';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
  -- Correct Coach-only cancellation can dispatch without changing source.
  v_ack:=public.iberfit_occurrence_api_v1('CAMBIO',
    jsonb_build_object('type','OCURRENCIA_CANCELAR',
      'operationId',gen_random_uuid(),'clientId',v_client,
      'entityId',v_id,'baseRevision',1));
  IF v_ack->>'kind'<>'ack' OR v_ack->>'status'<>'cancelada' THEN
    RAISE EXCEPTION 'U36_QA_CANCEL_DISPATCH_FAILED';END IF;
  SELECT user_id INTO v_admin FROM public.user_profiles
    WHERE role::text='admin' LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'U36_QA_ADMIN_REQUIRED';END IF;
  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  BEGIN
    PERFORM public.iberfit_occurrence_api_v1('CALENDARIO',
      jsonb_build_object('clientId',v_client,
        'startDate',v_date,'endDate',v_date));
    RAISE EXCEPTION 'U36_QA_ADMIN_BYPASS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  PERFORM set_config('request.jwt.claim.sub','',true);
  BEGIN
    PERFORM public.iberfit_occurrence_api_v1('CALENDARIO',
      jsonb_build_object('clientId',v_client,
        'startDate',v_date,'endDate',v_date));
    RAISE EXCEPTION 'U36_QA_UNAUTHENTICATED_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;END;
  RAISE NOTICE 'U36_ROLE_SCOPE_HTTP_BRIDGE_AND_GRANT_CLOSURE_PASS';
END $qa$;
