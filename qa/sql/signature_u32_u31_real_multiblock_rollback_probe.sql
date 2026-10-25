-- SIGNATURE U32/U31 QA multi-block published prescription integration.
-- Execute after FK+U30+U31+U32+appointment fence inside BEGIN/ROLLBACK.
-- No User PII output. Pure QA synthetic occurrences/executions.
DO $u32_multi$
DECLARE r record; cid uuid; sid uuid;coach uuid;v_source_revision bigint;
  first_date date;last_date date;
  a uuid;b uuid;third uuid;execution uuid:=gen_random_uuid();
  blocks jsonb;block jsonb;items jsonb:='{}'::jsonb;
  first_exercise text;exercise text;sets int;set_no int;
  record_count int:=0;expected_sets int:=0;
  ack jsonb;cmd jsonb;new_status text;
BEGIN
 FOR r IN
  SELECT e.client_id cid,e.entity_id sid,e.revision rev,
    e.body->'blocks' blocks,
    ca.coach_user_id actor,
    (p.body->>'startDate')::date starts,
    (p.body->>'endDate')::date ends
  FROM public.domain_entities_v26 e
    JOIN public.domain_entities_v26 p
      ON p.entity_type='planning' AND p.entity_id=(e.body->>'cycleId')::uuid
        AND p.client_id=e.client_id AND p.status='publicado'
    JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
    JOIN public.user_profiles u ON u.user_id=ca.coach_user_id AND u.role::text='coach'
    JOIN public.m26_canary_clients_v26 cc ON cc.client_id=e.client_id AND cc.active
  WHERE e.entity_type='session' AND e.status='disponible'
    AND e.body->>'deliveryModality'='guiada_en_app'
    AND e.body->>'visibleToClient'='true'
    AND e.body->>'clientVisibilityLevel'='full'
    AND jsonb_typeof(e.body->'blocks')='array'
    AND jsonb_array_length(e.body->'blocks')=3
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e.body->'blocks') AS el(value)
      WHERE el.value->>'exerciseId' IS NULL
        OR coalesce(el.value->>'sets','') !~ '^[0-9]{1,2}$'
        OR (el.value->>'sets')::int NOT BETWEEN 1 AND 20)
    AND (p.body->>'endDate')::date >=
       (now() AT TIME ZONE 'America/Santiago')::date+14
    ORDER BY e.updated_at DESC
 LOOP
   PERFORM set_config('request.jwt.claim.sub',r.actor::text,true);
   IF coalesce((private.iberfit_training_command_guard_v1(
     jsonb_build_object('type','SESION_INICIAR','clientId',r.cid,
       'entityId',r.sid,'payload','{}'::jsonb))->>'allowed')::boolean,false) THEN
     EXIT;
   END IF;
 END LOOP;
 IF r.cid IS NULL THEN RAISE EXCEPTION 'U32_MULTI_QA_REAL_PUBLISHED_SOURCE_MISSING';END IF;
 cid:=r.cid;sid:=r.sid;v_source_revision:=r.rev;blocks:=r.blocks;
 first_date:=GREATEST(r.starts,(now() AT TIME ZONE 'America/Santiago')::date-2);
 last_date:=first_date+14;
 IF first_date>(now() AT TIME ZONE 'America/Santiago')::date OR last_date>r.ends THEN
   RAISE EXCEPTION 'U32_MULTI_QA_SOURCE_CYCLE_UNSUITABLE';END IF;
 ack:=private.iberfit_u32_create_occurrences_batch_v1(
   jsonb_build_object('type','OCURRENCIAS_CREAR_LOTE',
     'operationId',gen_random_uuid(),'clientId',cid,'entityId',sid,
     'baseRevision',v_source_revision,'payload',
     jsonb_build_object('targetClientId',cid,'previewConfirmed',true,
       'dates',jsonb_build_array(
         jsonb_build_object('localDate',first_date::text),
         jsonb_build_object('localDate',(first_date+7)::text),
         jsonb_build_object('localDate',last_date::text)))));
 IF ack->>'kind'<>'ack' OR ack->>'count'<>'3' THEN
   RAISE EXCEPTION 'U32_MULTI_CREATE_BATCH_FAILED:%',ack;END IF;
 a:=(ack#>>'{occurrences,0,id}')::uuid;
 b:=(ack#>>'{occurrences,1,id}')::uuid;
 third:=(ack#>>'{occurrences,2,id}')::uuid;
 -- Precisely the real prescription enters the execution snapshot.
 IF NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
   WHERE id=a AND client_id=cid AND session_id=sid
     AND prescription_snapshot->'queue'=blocks) THEN
   RAISE EXCEPTION 'U32_MULTI_PUBLISHED_SOURCE_DIFFERS';END IF;
 cmd:=jsonb_build_object('type','OCURRENCIA_CONFIRMAR',
   'operationId',gen_random_uuid(),'clientId',cid,'entityId',a,'baseRevision',0);
 ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
 IF ack->>'kind'<>'ack' THEN RAISE EXCEPTION 'U32_MULTI_CONFIRM_FAILED:%',ack;END IF;
 cmd:=jsonb_build_object('type','OCURRENCIA_INICIAR',
   'operationId',gen_random_uuid(),'clientId',cid,'entityId',a,'baseRevision',1,
   'payload',jsonb_build_object('executionId',execution));
 ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
 IF ack->>'kind'<>'ack' THEN RAISE EXCEPTION 'U32_MULTI_START_FAILED:%',ack;END IF;
 FOR block IN SELECT value FROM jsonb_array_elements(blocks) LOOP
   exercise:=block->>'exerciseId'; sets:=(block->>'sets')::int;
   record_count:=record_count+1;
   expected_sets:=expected_sets+sets;
   FOR set_no IN 1..sets LOOP
     items:=items||jsonb_build_object(exercise||':'||set_no::text,
        jsonb_build_object('reps',10,'loadKg',20));
   END LOOP;
 END LOOP;
 IF record_count<>3 OR
   (SELECT count(*) FROM jsonb_object_keys(items))<>expected_sets THEN
   RAISE EXCEPTION 'U32_MULTI_RESULT_SCOPE_COLLISION';END IF;
 -- Withhold one whole block: completion validation must reject.
 cmd:=jsonb_build_object('type','OCURRENCIA_COMPLETAR',
   'operationId',gen_random_uuid(),'clientId',cid,'entityId',a,'baseRevision',2,
   'payload',jsonb_build_object('executionId',execution,'executionBaseRevision',1,
     'results',items-(block->>'exerciseId'||':1'),
     'skippedSets','{}'::jsonb,
     'feedback',jsonb_build_object('sessionRpe',7,'comment','QA three blocks','pain',false)));
 ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
 IF ack->>'kind'<>'rejected' OR ack->>'reason'<>'M26_EXECUTION_NOT_READY_TO_COMPLETE' THEN
   RAISE EXCEPTION 'U32_MULTI_INCOMPLETE_EXERCISE_ACCEPTED:%',ack;END IF;
 cmd:=jsonb_set(cmd,'{payload,results}',items);
 ack:=private.iberfit_u31_occurrence_transition_v1(cmd);
 IF ack->>'kind'<>'ack' OR ack->>'status'<>'completada' THEN
   RAISE EXCEPTION 'U32_MULTI_THREE_BLOCK_CLOSE_FAILED:%',ack;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.session_executions
   WHERE id=execution AND client_id=cid AND session_id=sid
    AND occurrence_id=a AND execution_status='cerrada_confirmada')
   OR (SELECT status FROM public.domain_entities_v26
      WHERE entity_type='session' AND entity_id=sid)<>'disponible'
   OR (SELECT revision FROM public.domain_entities_v26
      WHERE entity_type='session' AND entity_id=sid)<>v_source_revision
   OR (SELECT count(*) FROM public.training_session_occurrences_v1
      WHERE id IN (b,third) AND status='planificada')<>2 THEN
   RAISE EXCEPTION 'U32_MULTI_SOURCE_OR_UPCOMING_CHANGED';END IF;
 RAISE NOTICE 'U32_MULTI_REAL_THREE_BLOCKS_VALIDATED_AND_INDEPENDENT';
END $u32_multi$;
