-- SIGNATURE U32/U31 full-backend integration rehearsal.
-- QA only. Apply FK #1072, U30, U31, U32, writer fence, then this DO
-- inside ONE BEGIN/ROLLBACK. Select existing authorized Coach + published
-- real single-exercise guided session. Never output Client IDs or PII.
DO $u32_e2e$
DECLARE
  r record;
  c uuid;s uuid;actor uuid;ex1 uuid:=gen_random_uuid();ex2 uuid:=gen_random_uuid();
  a uuid;b uuid;third uuid;v_confirm_id uuid;
  day1 date;d2 date;d3 date;
  snapshot jsonb;queue jsonb;
  block jsonb;exercise_key text;exercise_id text;
  base_rev bigint;source_status text;
  cmd jsonb;ack jsonb;replay jsonb;
  results jsonb;idx int;sets int;
  operation uuid;
BEGIN
  FOR r IN
    SELECT e.client_id cid,e.entity_id sid,e.revision rev,
      e.status status,e.body->'blocks' blocks,
      ca.coach_user_id actor,
      (p.body->>'startDate')::date first_day,
      (p.body->>'endDate')::date final_day
    FROM public.domain_entities_v26 e
    JOIN public.domain_entities_v26 p
      ON p.entity_type='planning'
        AND p.entity_id=(e.body->>'cycleId')::uuid
        AND p.client_id=e.client_id AND p.status='publicado'
    JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
    JOIN public.user_profiles u ON u.user_id=ca.coach_user_id AND u.role::text='coach'
    JOIN public.m26_canary_clients_v26 cc ON cc.client_id=e.client_id AND cc.active
    WHERE e.entity_type='session' AND e.status='disponible'
      AND e.body->>'deliveryModality'='guiada_en_app'
      AND e.body->>'visibleToClient'='true'
      AND e.body->>'clientVisibilityLevel'='full'
      AND jsonb_typeof(e.body->'blocks')='array'
      AND jsonb_array_length(e.body->'blocks')=1
      AND (e.body->'blocks'->0->>'sets')~'^[0-9]{1,2}$'
      AND (e.body->'blocks'->0->>'sets')::int BETWEEN 1 AND 15
      AND (p.body->>'endDate')::date >=
          (now() AT TIME ZONE 'America/Santiago')::date+14
    ORDER BY e.updated_at DESC
  LOOP
    PERFORM set_config('request.jwt.claim.sub',r.actor::text,true);
    IF coalesce((private.iberfit_training_command_guard_v1(
      jsonb_build_object('type','SESION_INICIAR',
        'entityId',r.sid,'clientId',r.cid,
        'payload','{}'::jsonb))->>'allowed')::boolean,false) THEN EXIT;END IF;
  END LOOP;
  IF r.cid IS NULL THEN RAISE EXCEPTION 'U32_U31_NO_REAL_GUIDED_SOURCE';END IF;
  c:=r.cid;s:=r.sid;actor:=r.actor;base_rev:=r.rev;source_status:=r.status;
  block:=r.blocks->0;exercise_id:=block->>'exerciseId';sets:=(block->>'sets')::int;
  IF exercise_id IS NULL OR exercise_id='' THEN
    RAISE EXCEPTION 'U32_U31_SOURCE_EXERCISE_ID_MISSING';
  END IF;
  day1:=GREATEST(r.first_day,
    (now() AT TIME ZONE 'America/Santiago')::date-2);
  d2:=day1+7;d3:=day1+14;
  IF day1>(now() AT TIME ZONE 'America/Santiago')::date
    OR d3>r.final_day THEN
    RAISE EXCEPTION 'U32_U31_SOURCE_CYCLE_WINDOW_UNSUITABLE';
  END IF;
  operation:=gen_random_uuid();
  cmd:=jsonb_build_object('type','OCURRENCIAS_CREAR_LOTE',
    'operationId',operation,'clientId',c,'entityId',s,
    'baseRevision',base_rev,
    'payload',jsonb_build_object(
      'targetClientId',c,'previewConfirmed',true,
      'dates',jsonb_build_array(
        jsonb_build_object('localDate',day1::text),
        jsonb_build_object('localDate',d2::text),
        jsonb_build_object('localDate',d3::text))));
  ack:=private.iberfit_u32_create_occurrences_batch_v1(cmd);
  IF ack->>'kind'<>'ack' OR ack->>'count'<>'3' THEN
    RAISE EXCEPTION 'U32_U31_CREATE_THREE_FAILED:%',ack;END IF;
  a:=(ack#>>'{occurrences,0,id}')::uuid;
  b:=(ack#>>'{occurrences,1,id}')::uuid;
  third:=(ack#>>'{occurrences,2,id}')::uuid;
  replay:=private.iberfit_u32_create_occurrences_batch_v1(cmd);
  IF replay->>'duplicate'<>'true' THEN
    RAISE EXCEPTION 'U32_U31_CREATE_RETRY_MISSED';END IF;
  SELECT prescription_snapshot->'queue' INTO queue
  FROM public.training_session_occurrences_v1
  WHERE id=a AND client_id=c AND session_id=s;
  IF queue IS DISTINCT FROM r.blocks THEN
    RAISE EXCEPTION 'U32_U31_SERVER_SNAPSHOT_DIFFERS_FROM_PUBLISHED';
  END IF;
  FOREACH v_confirm_id IN ARRAY ARRAY[a,b,third] LOOP
    cmd:=jsonb_build_object('type','OCURRENCIA_CONFIRMAR',
      'operationId',gen_random_uuid(),'clientId',c,
      'entityId',v_confirm_id,'baseRevision',0);
    ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
    IF ack->>'kind'<>'ack' OR ack->>'status'<>'confirmada' THEN
      RAISE EXCEPTION 'U32_U31_CONFIRM_REJECTED:%',ack;
    END IF;
  END LOOP;
  cmd:=jsonb_build_object('type','OCURRENCIA_INICIAR',
    'operationId',gen_random_uuid(),'clientId',c,
    'entityId',a,'baseRevision',1,
    'payload',jsonb_build_object('executionId',ex1));
  ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF ack->>'kind'<>'ack' OR ack->>'status'<>'en_curso' THEN
    RAISE EXCEPTION 'U32_U31_START_REAL_SNAPSHOT_FAILED:%',ack;
  END IF;
  -- First of the actual published sets is checkpointed (offline recovery).
  results:=jsonb_build_object(exercise_id||':1',
    jsonb_build_object('reps',10,'loadKg',20));
  cmd:=jsonb_build_object('type','OCURRENCIA_GUARDAR_PROGRESO',
    'operationId',gen_random_uuid(),'clientId',c,'entityId',a,
    'baseRevision',2,
    'payload',jsonb_build_object('executionId',ex1,
      'executionBaseRevision',1,'results',results,'skippedSets','{}'::jsonb));
  ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF ack->>'kind'<>'ack' OR ack->>'executionRevision'<>'2' THEN
    RAISE EXCEPTION 'U32_U31_FIRST_PUBLISHED_SET_SAVE_FAILED:%',ack;
  END IF;
  -- Complete ALL remaining published sets without altering the source.
  FOR idx IN 2..sets LOOP
    results:=results||jsonb_build_object(exercise_id||':'||idx::text,
      jsonb_build_object('reps',8,'loadKg',22));
  END LOOP;
  cmd:=jsonb_build_object('type','OCURRENCIA_COMPLETAR',
    'operationId',gen_random_uuid(),'clientId',c,'entityId',a,
    'baseRevision',2,
    'payload',jsonb_build_object('executionId',ex1,
      'executionBaseRevision',2,'results',results,
      'skippedSets','{}'::jsonb,
      'feedback',jsonb_build_object('sessionRpe',7,
        'comment','U32/U31 isolated QA','pain',false)));
  ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF ack->>'kind'<>'ack' OR ack->>'status'<>'completada' THEN
    RAISE EXCEPTION 'U32_U31_REAL_PUBLISHED_CLOSURE_FAILED:%',ack;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.session_executions
      WHERE id=ex1 AND client_id=c AND session_id=s
        AND occurrence_id=a AND execution_status='cerrada_confirmada')
    OR NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
      WHERE id=third AND status='confirmada')
    OR (SELECT status FROM public.domain_entities_v26
      WHERE entity_type='session' AND entity_id=s) IS DISTINCT FROM source_status
    OR (SELECT revision FROM public.domain_entities_v26
      WHERE entity_type='session' AND entity_id=s) IS DISTINCT FROM base_rev THEN
    RAISE EXCEPTION 'U32_U31_SOURCE_CONSUMED_OR_MIRROR_MISMATCH';
  END IF;
  cmd:=jsonb_build_object('type','OCURRENCIA_INICIAR',
    'operationId',gen_random_uuid(),'clientId',c,
    'entityId',b,'baseRevision',1,
    'payload',jsonb_build_object('executionId',ex2));
  ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
  IF ack->>'kind'<>'ack' OR ack->>'status'<>'en_curso' THEN
    RAISE EXCEPTION 'U32_U31_SECOND_DATE_NOT_STARTABLE:%',ack;
  END IF;
  IF EXISTS(SELECT 1 FROM public.active_execution_locks_v26
    WHERE client_id=c AND execution_id=ex1) THEN
    RAISE EXCEPTION 'U32_U31_FIRST_EXECUTION_LOCK_REMAINS';
  END IF;
  RAISE NOTICE 'U32_U31_REAL_PUBLISHED_3_DATE_LIFECYCLE_PASS';
END $u32_e2e$;
