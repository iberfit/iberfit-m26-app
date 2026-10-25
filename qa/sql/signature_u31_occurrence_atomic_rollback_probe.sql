-- U31 QA ONLY · invoke inside BEGIN/ROLLBACK after #1072/U30/U31.
-- Finds existing eligible QA Coach and published guided source; never writes
-- persistent data and never leaks client names, ids or health information.
DO $qa$
DECLARE
  r record; g jsonb; source public.domain_entities_v26%rowtype;
  source_status text; source_revision bigint;
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();
  x uuid:=gen_random_uuid(); y uuid:=gen_random_uuid();
  cmd jsonb; ack jsonb; replay jsonb; snapshot jsonb;
  ids uuid[]:=ARRAY[a,b,c];
  n int; created_operation uuid; replay_operation uuid;
  base_day date:=(now() AT TIME ZONE 'America/Santiago')::date;
  completions int; events_count int;
BEGIN
  FOR r IN
    SELECT e.entity_id AS session_id,e.client_id,ca.coach_user_id AS actor
    FROM public.domain_entities_v26 e
    JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
    JOIN public.user_profiles p ON p.user_id=ca.coach_user_id AND p.role::text='coach'
    JOIN public.m26_canary_clients_v26 cc ON cc.client_id=e.client_id AND cc.active
    WHERE e.entity_type='session' AND e.status='disponible'
      AND e.body->>'deliveryModality'='guiada_en_app'
      AND jsonb_typeof(e.body->'blocks')='array'
      AND jsonb_array_length(e.body->'blocks')>0
    ORDER BY e.updated_at DESC
  LOOP
    PERFORM set_config('request.jwt.claim.sub',r.actor::text,true);
    g:=private.iberfit_training_command_guard_v1(
      jsonb_build_object('type','SESION_INICIAR','entityId',r.session_id,
        'clientId',r.client_id,'payload','{}'::jsonb));
    EXIT WHEN (g->>'allowed')::boolean IS TRUE;
  END LOOP;
  IF r.client_id IS NULL OR (g->>'allowed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'U31_QA_ACTIVE_GUIDED_COACH_SOURCE_NOT_FOUND';
  END IF;
  SELECT * INTO source FROM public.domain_entities_v26
  WHERE entity_type='session' AND entity_id=r.session_id AND client_id=r.client_id;
  source_status:=source.status;source_revision:=source.revision;
  snapshot:=jsonb_build_object('clientId',r.client_id,'sessionId',r.session_id,
    'queue',jsonb_build_array(jsonb_build_object(
      'exerciseId','u31-qa-squat','sets',1)),'title','QA U31 isolated');

  FOR n IN 1..3 LOOP
    INSERT INTO public.training_session_occurrences_v1(
      id,client_id,session_id,local_date,duration_minutes,prescription_revision,
      prescription_snapshot,created_operation_id
    ) VALUES(ids[n],r.client_id,r.session_id,base_day-(n-1)*7,
      50,source_revision,snapshot,gen_random_uuid());
    created_operation:=gen_random_uuid();
    cmd:=jsonb_build_object('type','OCURRENCIA_CONFIRMAR','operationId',created_operation,
      'clientId',r.client_id,'entityId',ids[n],'baseRevision',0);
    ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
    IF ack->>'status'<>'confirmada' OR ack->>'kind'<>'ack' THEN
      RAISE EXCEPTION 'U31_QA_CONFIRM_FAILED: %',ack;
    END IF;
    replay:=private.iberfit_u31_occurrence_transition_v1(cmd);
    IF replay->>'duplicate'<>'true' OR replay ? 'requestHash' THEN
      RAISE EXCEPTION 'U31_QA_DUPLICATE_OR_HASH_LEAK';
    END IF;
  END LOOP;

  -- Negative security probes: unknown Client and missing command type
  -- must be rejected before touching any occurrence.
  BEGIN
    PERFORM private.iberfit_u31_occurrence_transition_v1(
      jsonb_build_object('type','OCURRENCIA_CONFIRMAR',
        'operationId',gen_random_uuid(),'clientId',gen_random_uuid(),
        'entityId',c,'baseRevision',1));
    RAISE EXCEPTION 'U31_QA_CROSS_CLIENT_SCOPE_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM private.iberfit_u31_occurrence_transition_v1(
      jsonb_build_object('operationId',gen_random_uuid(),'clientId',r.client_id,
        'entityId',c,'baseRevision',1));
    RAISE EXCEPTION 'U31_QA_MISSING_TYPE_ACCEPTED';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  replay_operation:=gen_random_uuid();
  cmd:=jsonb_build_object('type','OCURRENCIA_INICIAR','operationId',replay_operation,
      'clientId',r.client_id,'entityId',a,'baseRevision',1,
      'payload',jsonb_build_object('executionId',x));
  ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF ack->>'kind'<>'ack' OR ack->>'status'<>'en_curso' THEN
    RAISE EXCEPTION 'U31_QA_START_FAILED: %',ack;
  END IF;
  replay:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF replay->>'duplicate'<>'true' THEN
    RAISE EXCEPTION 'U31_QA_START_NOT_IDEMPOTENT';
  END IF;
  replay:=private.iberfit_u31_occurrence_transition_v1(
    jsonb_set(cmd,'{payload,executionId}',to_jsonb(gen_random_uuid()::text)));
  IF replay->>'reason'<>'OPERATION_ID_REUSED' THEN
    RAISE EXCEPTION 'U31_QA_TAMPERED_RETRY_ACCEPTED: %',replay;
  END IF;

  cmd:=jsonb_build_object('type','OCURRENCIA_INICIAR','operationId',gen_random_uuid(),
      'clientId',r.client_id,'entityId',b,'baseRevision',1,
      'payload',jsonb_build_object('executionId',y));
  ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF ack->>'reason'<>'ACTIVE_EXECUTION_EXISTS' OR ack->>'kind'<>'conflict' THEN
    RAISE EXCEPTION 'U31_QA_CONCURRENT_START_ALLOWED: %',ack;
  END IF;

  cmd:=jsonb_build_object('type','OCURRENCIA_COMPLETAR','operationId',gen_random_uuid(),
      'clientId',r.client_id,'entityId',a,'baseRevision',2,
      'payload',jsonb_build_object('executionId',x,'executionBaseRevision',1,
        'results','{}'::jsonb,'feedback',jsonb_build_object(
          'sessionRpe',7,'comment','QA valid effort','pain',false)));
  ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF ack->>'kind'<>'rejected' OR ack->>'reason'<>'M26_EXECUTION_NOT_READY_TO_COMPLETE' THEN
    RAISE EXCEPTION 'U31_QA_INCOMPLETE_SERIES_ACCEPTED: %',ack;
  END IF;
  cmd:=jsonb_set(cmd,'{payload,results}',jsonb_build_object(
    'u31-qa-squat:1',jsonb_build_object('reps',10,'loadKg',22)));
  ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF ack->>'kind'<>'ack' OR ack->>'status'<>'completada' THEN
    RAISE EXCEPTION 'U31_QA_VALID_CLOSE_FAILED: %',ack;
  END IF;
  replay:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF replay->>'duplicate'<>'true' THEN
    RAISE EXCEPTION 'U31_QA_CLOSE_NOT_IDEMPOTENT';
  END IF;
  SELECT count(*) INTO completions FROM public.session_executions
  WHERE id=x AND session_id=r.session_id AND client_id=r.client_id
    AND occurrence_id=a AND execution_status='cerrada_confirmada';
  IF completions<>1 THEN RAISE EXCEPTION 'U31_QA_TYPED_EXECUTION_MIRROR_MISSING'; END IF;
  IF EXISTS (SELECT 1 FROM public.active_execution_locks_v26
    WHERE client_id=r.client_id) THEN
    RAISE EXCEPTION 'U31_QA_EXECUTION_LOCK_NOT_RELEASED';
  END IF;
  IF (SELECT status FROM public.domain_entities_v26
      WHERE entity_type='session' AND entity_id=r.session_id)
       IS DISTINCT FROM source_status
    OR (SELECT revision FROM public.domain_entities_v26
      WHERE entity_type='session' AND entity_id=r.session_id)
       IS DISTINCT FROM source_revision THEN
    RAISE EXCEPTION 'U31_QA_SOURCE_PRESCRIPTION_CONSUMED';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
      WHERE id=c AND status='confirmada') THEN
    RAISE EXCEPTION 'U31_QA_THIRD_OCCURRENCE_CHANGED';
  END IF;

  cmd:=jsonb_build_object('type','OCURRENCIA_INICIAR','operationId',gen_random_uuid(),
      'clientId',r.client_id,'entityId',b,'baseRevision',1,
      'payload',jsonb_build_object('executionId',y));
  ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF ack->>'kind'<>'ack' OR ack->>'status'<>'en_curso' THEN
    RAISE EXCEPTION 'U31_QA_NEXT_DATE_COULD_NOT_START: %',ack;
  END IF;
  SELECT count(*) INTO events_count
    FROM public.command_events_v26 WHERE operation_id=replay_operation
      AND entity_type='training_occurrence' AND phase='applied';
  IF events_count<>1 THEN
    RAISE EXCEPTION 'U31_QA_COMMAND_AUDIT_NOT_UNIQUE';
  END IF;
  SELECT count(*) INTO events_count
    FROM public.domain_events_v26 WHERE operation_id=replay_operation
      AND entity_type='training_occurrence' AND phase='applied';
  IF events_count<>1 THEN
    RAISE EXCEPTION 'U31_QA_DOMAIN_AUDIT_NOT_UNIQUE';
  END IF;
  IF has_function_privilege('authenticated',
      'private.iberfit_u31_occurrence_transition_v1(jsonb)','EXECUTE')
    OR has_function_privilege('anon',
      'private.iberfit_u31_occurrence_transition_v1(jsonb)','EXECUTE')
    OR has_function_privilege('service_role',
      'private.iberfit_u31_occurrence_transition_v1(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'U31_QA_PRIVATE_FUNCTION_EXPOSED';
  END IF;
  RAISE NOTICE 'U31_QA_ATOMIC_THREE_DATE_REHEARSAL_PASSED';
END $qa$;
