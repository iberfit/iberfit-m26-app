-- U32 cross-writer QA only. Run after #1072,U30,U31,U32,writer fence
-- in the same BEGIN/ROLLBACK. Synthetic appointment writes never persist.
DO $qa$
DECLARE r record;v_client uuid;v_session uuid;v_actor uuid;
 slot timestamptz;duration_minutes int;d date;ack jsonb;
 o_id uuid;a_id uuid;v_base bigint;
BEGIN
 FOR r IN
  SELECT e.entity_id sid,e.client_id cid,e.revision rev,
    ca.coach_user_id actor,(e.body->>'durationMinutes')::int duration,
    (p.body->>'startDate')::date first_day,(p.body->>'endDate')::date last_day
  FROM public.domain_entities_v26 e JOIN public.domain_entities_v26 p
    ON p.entity_type='planning' AND p.entity_id=(e.body->>'cycleId')::uuid
     AND p.client_id=e.client_id AND p.status='publicado'
  JOIN public.client_assignments ca ON ca.client_id=e.client_id AND ca.active
  JOIN public.user_profiles u ON u.user_id=ca.coach_user_id AND u.role::text='coach'
  JOIN public.m26_canary_clients_v26 c ON c.client_id=e.client_id AND c.active
  WHERE e.entity_type='session' AND e.status='disponible'
    AND e.body->>'deliveryModality'='guiada_en_app'
    AND e.body->>'visibleToClient'='true'
    AND e.body->>'clientVisibilityLevel'='full'
    AND (p.body->>'endDate')::date >
      (now() AT TIME ZONE 'America/Santiago')::date+8
  ORDER BY e.updated_at DESC LOOP
  PERFORM set_config('request.jwt.claim.sub',r.actor::text,true);
  IF coalesce((private.iberfit_training_command_guard_v1(
     jsonb_build_object('type','SESION_INICIAR','clientId',r.cid,
        'entityId',r.sid,'payload','{}'::jsonb))->>'allowed')::boolean,false)
    THEN EXIT;END IF;
 END LOOP;
 IF r.cid IS NULL THEN RAISE EXCEPTION 'U32_CROSS_WRITER_QA_SOURCE_MISSING';END IF;
 v_client:=r.cid;v_session:=r.sid;v_actor:=r.actor;v_base:=r.rev;
 duration_minutes:=r.duration;
 d:=GREATEST(r.first_day,(now() AT TIME ZONE 'America/Santiago')::date+2);
 slot:=((d::text||' 18:00')::timestamp AT TIME ZONE 'America/Santiago');
 ack:=private.iberfit_u32_create_occurrences_batch_v1(
  jsonb_build_object('type','OCURRENCIAS_CREAR_LOTE','operationId',gen_random_uuid(),
    'clientId',v_client,'entityId',v_session,'baseRevision',v_base,
    'payload',jsonb_build_object('targetClientId',v_client,
      'previewConfirmed',true,'dates',jsonb_build_array(
         jsonb_build_object('localDate',d::text,'localTime','18:00')))));
 IF ack->>'kind'<>'ack' THEN RAISE EXCEPTION 'U32_PREPARE_TIMED_OCCURRENCE_FAILED:%',ack;END IF;
 o_id:=(ack#>>'{occurrences,0,id}')::uuid;

 -- A concurrent legacy CITA_CREAR for an unrelated session is now blocked
 -- even though the old RPC does NOT participate in the U32 batch preflight.
 BEGIN
  INSERT INTO public.appointments(client_id,title,mode,start_at,end_at,status)
  VALUES(v_client,'QA other session','guiada_en_app',
    slot+interval '10 min',slot+interval '40 min','propuesta');
  RAISE EXCEPTION 'U32_CROSS_WRITER_UNRELATED_APPOINTMENT_ACCEPTED';
 EXCEPTION WHEN exclusion_violation THEN NULL;END;

 -- A legitimate EXACT appointment for this source/time may be created and
 -- attached. Another identical appointment may NOT silently claim that slot.
 INSERT INTO public.appointments(client_id,session_id,title,mode,
   start_at,end_at,status)
 VALUES(v_client,v_session,'QA own source slot','guiada_en_app',
   slot,slot+duration_minutes*interval '1 minute','propuesta')
 RETURNING id INTO a_id;
 BEGIN
  INSERT INTO public.appointments(client_id,session_id,title,mode,
    start_at,end_at,status)
  VALUES(v_client,v_session,'QA duplicate own slot','guiada_en_app',
    slot,slot+duration_minutes*interval '1 minute','propuesta');
  RAISE EXCEPTION 'U32_CROSS_WRITER_DUPLICATE_APPOINTMENT_ACCEPTED';
 EXCEPTION WHEN exclusion_violation THEN NULL;END;
 UPDATE public.training_session_occurrences_v1 SET
  appointment_id=a_id,revision=1
 WHERE id=o_id AND client_id=v_client AND revision=0;
 IF NOT FOUND THEN RAISE EXCEPTION 'U32_CROSS_WRITER_OWN_LINK_FAILED';END IF;
 UPDATE public.appointments SET status='confirmada'
 WHERE id=a_id AND client_id=v_client;
 IF NOT FOUND THEN RAISE EXCEPTION 'U32_CROSS_WRITER_OWN_CONFIRM_FAILED';END IF;

 -- A reschedule cannot leave a different appointment time over an old
 -- still-active occurrence without changing its own occurrence too.
 BEGIN
  UPDATE public.appointments SET
    start_at=slot+interval '15 min',
    end_at=slot+(duration_minutes+15)*interval '1 minute'
  WHERE id=a_id;
  RAISE EXCEPTION 'U32_CROSS_WRITER_DRIFTED_LINK_ACCEPTED';
 EXCEPTION WHEN exclusion_violation THEN NULL;END;

 -- Cancelling a legitimate appointment is never trapped; the occurrence
 -- remains in history with the old link and cannot be started by Client.
 UPDATE public.appointments SET status='cancelada'
 WHERE id=a_id AND client_id=v_client;
 IF NOT EXISTS(SELECT 1 FROM public.training_session_occurrences_v1
   WHERE id=o_id AND client_id=v_client AND appointment_id=a_id) THEN
  RAISE EXCEPTION 'U32_CROSS_WRITER_CANCEL_REMOVED_HISTORY';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='u32_appointment_writer_fence'
   AND tgrelid='public.appointments'::regclass AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'U32_CROSS_WRITER_TRIGGER_NOT_INSTALLED';
 END IF;
 RAISE NOTICE 'U32_LEGACY_APPOINTMENT_SERIALIZATION_AND_OVERLAP_PASS';
END $qa$;
