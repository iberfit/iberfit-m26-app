-- U32 DST QA only: applied in BEGIN/ROLLBACK after FK+U30+U31+U32.
-- Temporarily widens a QA planning window ONLY within transaction, then
-- certifies exact Chile spring gap and autumn fold without any persistent DML.
DO $qa$
DECLARE
 r record;pid uuid;coach uuid;client uuid;v_session_id uuid;source_revision bigint;
 cmd jsonb;ack jsonb;early timestamptz;later timestamptz;
 occ_id uuid;instant timestamptz;day date;
BEGIN
 FOR r IN
 SELECT e.entity_id sid,e.client_id cid,e.revision rev,
   nullif(e.body->>'cycleId','')::uuid planid,ca.coach_user_id actor
 FROM public.domain_entities_v26 e
 JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
 JOIN public.user_profiles p ON p.user_id=ca.coach_user_id AND p.role::text='coach'
 JOIN public.m26_canary_clients_v26 cc ON cc.client_id=e.client_id AND cc.active
 WHERE e.entity_type='session' AND e.status='disponible'
   AND e.body->>'deliveryModality'='guiada_en_app'
   AND e.body->>'visibleToClient'='true'
   AND e.body->>'clientVisibilityLevel'='full'
 ORDER BY e.updated_at DESC LOOP
   PERFORM set_config('request.jwt.claim.sub',r.actor::text,true);
   IF coalesce((private.iberfit_training_command_guard_v1(
      jsonb_build_object('type','SESION_INICIAR','clientId',r.cid,
        'entityId',r.sid,'payload','{}'::jsonb))->>'allowed')::boolean,false)
      AND EXISTS(SELECT 1 FROM public.domain_entities_v26 p
        WHERE p.entity_type='planning' AND p.entity_id=r.planid
          AND p.client_id=r.cid AND p.status='publicado') THEN
     EXIT;
   END IF;
 END LOOP;
 IF r.cid IS NULL THEN RAISE EXCEPTION 'U32_DST_QA_NO_GUIDED_SOURCE';END IF;
 coach:=r.actor;client:=r.cid;v_session_id:=r.sid;source_revision:=r.rev;pid:=r.planid;
 UPDATE public.domain_entities_v26 SET
 body=jsonb_set(jsonb_set(body,'{startDate}',to_jsonb('2026-04-01'::text),true),
   '{endDate}',to_jsonb('2026-11-30'::text),true)
 WHERE entity_type='planning' AND entity_id=pid AND client_id=client;

 -- Spring-forward: 00:30 does not exist in Santiago on 2026-09-06.
 cmd:=jsonb_build_object('type','OCURRENCIAS_CREAR_LOTE',
 'operationId',gen_random_uuid(),'clientId',client,'entityId',v_session_id,
 'baseRevision',source_revision,'payload',
 jsonb_build_object('targetClientId',client,'previewConfirmed',true,
   'dates',jsonb_build_array(jsonb_build_object(
       'localDate','2026-09-06','localTime','00:30'))));
 BEGIN
   PERFORM private.iberfit_u32_create_occurrences_batch_v1(cmd);
   RAISE EXCEPTION 'U32_DST_GAP_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM<>'U32_DST_NONEXISTENT_LOCAL_TIME' THEN RAISE; END IF;
 END;

 -- Autumn-back: 23:30 occurs twice on 2026-04-04; explicit selection.
 cmd:=jsonb_set(jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)),
    '{payload,dates}',jsonb_build_array(jsonb_build_object(
       'localDate','2026-04-04','localTime','23:30')));
 BEGIN
   PERFORM private.iberfit_u32_create_occurrences_batch_v1(cmd);
   RAISE EXCEPTION 'U32_DST_FOLD_SILENTLY_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN
   IF SQLERRM<>'U32_DST_AMBIGUOUS_LOCAL_TIME' THEN RAISE;END IF;
 END;

 cmd:=jsonb_set(jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)),
   '{payload,dates}',jsonb_build_array(jsonb_build_object(
     'localDate','2026-04-04','localTime','23:30',
     'dstDisambiguation','earlier')));
 ack:=private.iberfit_u32_create_occurrences_batch_v1(cmd);
 IF ack->>'kind'<>'ack' OR ack->>'count'<>'1' THEN
   RAISE EXCEPTION 'U32_DST_EARLIER_FAILED:%',ack;
 END IF;
 early:=(ack#>>'{occurrences,0,startsAt}')::timestamptz;
 occ_id:=(ack#>>'{occurrences,0,id}')::uuid;
 UPDATE public.training_session_occurrences_v1 SET status='cancelada',revision=1
 WHERE id=occ_id AND client_id=client;
 cmd:=jsonb_set(jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)),
   '{payload,dates}',jsonb_build_array(jsonb_build_object(
     'localDate','2026-04-04','localTime','23:30',
     'dstDisambiguation','later')));
 ack:=private.iberfit_u32_create_occurrences_batch_v1(cmd);
 IF ack->>'kind'<>'ack' OR ack->>'count'<>'1' THEN
   RAISE EXCEPTION 'U32_DST_LATER_FAILED:%',ack;
 END IF;
 later:=(ack#>>'{occurrences,0,startsAt}')::timestamptz;
 IF early IS DISTINCT FROM '2026-04-05 02:30:00+00'::timestamptz
   OR later IS DISTINCT FROM '2026-04-05 03:30:00+00'::timestamptz
   OR later-early <> interval '1 hour' THEN
   RAISE EXCEPTION 'U32_DST_FOLD_INSTANTS_WRONG';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
    WHERE session_id=v_session_id AND local_date='2026-04-04' AND status='cancelada')
   OR NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
    WHERE session_id=v_session_id AND local_date='2026-04-04' AND status='planificada') THEN
   RAISE EXCEPTION 'U32_DST_REBOOK_PRESERVATION_FAILED';
 END IF;

 -- Ordinary Chile local hour must round-trip to the same wall clock.
 cmd:=jsonb_set(jsonb_set(cmd,'{operationId}',to_jsonb(gen_random_uuid()::text)),
   '{payload,dates}',jsonb_build_array(jsonb_build_object(
      'localDate','2026-10-27','localTime','18:00')));
 ack:=private.iberfit_u32_create_occurrences_batch_v1(cmd);
 IF ack->>'kind'<>'ack' OR
   (ack#>>'{occurrences,0,startsAt}')::timestamptz
      IS DISTINCT FROM '2026-10-27 21:00:00+00'::timestamptz THEN
   RAISE EXCEPTION 'U32_DST_NORMAL_TIME_FAILED:%',ack;
 END IF;
 RAISE NOTICE 'U32_SANTIAGO_DST_GAP_FOLD_AND_NORMAL_PASS';
END $qa$;
