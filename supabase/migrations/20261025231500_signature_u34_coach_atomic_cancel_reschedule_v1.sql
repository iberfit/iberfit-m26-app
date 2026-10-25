-- U34 staging only. Atomic Coach cancel/rebook; history preserved.
-- Advisory lock order: active execution BEFORE schedule (as U31 can take both).
SELECT 1 / CASE WHEN to_regprocedure('private.iberfit_u32_create_occurrences_batch_v1(jsonb)') IS NOT NULL
 AND to_regprocedure('private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)') IS NOT NULL
 THEN 1 ELSE 0 END AS u34_dependencies;

CREATE FUNCTION private.iberfit_u34_coach_occurrence_change_v1(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u34$
DECLARE
 actor uuid:=auth.uid();op uuid;batch_op uuid;owner uuid;oid uuid;
 baserev bigint;cmd_type text;payload jsonb;replacement jsonb;role_name text;
 request_hash text;rece public.command_receipts_v26%rowtype;
 occ public.training_session_occurrences_v1%rowtype;
 ap public.appointments%rowtype;ap_entity public.domain_entities_v26%rowtype;
 src_revision bigint;batch jsonb;ack jsonb;now_at timestamptz:=clock_timestamp();
 affected int;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';END IF;
 IF jsonb_typeof(p_command) IS DISTINCT FROM 'object'
 OR octet_length(p_command::text)>16384 THEN
  RAISE EXCEPTION 'U34_INVALID_COMMAND' USING errcode='22023';END IF;
 BEGIN
  op:=nullif(p_command->>'operationId','')::uuid;
  owner:=nullif(p_command->>'clientId','')::uuid;
  oid:=nullif(p_command->>'entityId','')::uuid;
  baserev:=nullif(p_command->>'baseRevision','')::bigint;
  cmd_type:=p_command->>'type';
  payload:=coalesce(p_command->'payload','{}'::jsonb);
  batch_op:=nullif(payload->>'newOperationId','')::uuid;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'U34_INVALID_IDENTIFIERS' USING errcode='22023';END;
 IF op IS NULL OR owner IS NULL OR oid IS NULL
 OR baserev IS NULL OR baserev<0 OR cmd_type IS NULL
 OR cmd_type NOT IN ('OCURRENCIA_CANCELAR','OCURRENCIA_REPROGRAMAR')
 OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
 OR (p_command-'type'-'operationId'-'clientId'-'entityId'-'baseRevision'-'payload')<>'{}'::jsonb
 THEN RAISE EXCEPTION 'U34_INVALID_COMMAND' USING errcode='22023';END IF;
 IF cmd_type='OCURRENCIA_CANCELAR' THEN
  IF payload<>'{}'::jsonb THEN
   RAISE EXCEPTION 'U34_UNTRUSTED_CANCEL_PAYLOAD' USING errcode='22023';END IF;
 ELSE
  replacement:=payload->'replacement';
  IF (payload-'replacement'-'newOperationId')<>'{}'::jsonb
  OR batch_op IS NULL OR batch_op=op
  OR jsonb_typeof(replacement) IS DISTINCT FROM 'object'
  OR nullif(replacement->>'localDate','') IS NULL THEN
   RAISE EXCEPTION 'U34_REPLACEMENT_INVALID' USING errcode='22023';END IF;
 END IF;
 role_name:=public.iberfit_current_role_v26();
 IF role_name<>'coach' OR NOT public.iberfit_can_access_client_v26(owner)
 OR NOT public.iberfit_canary_enabled_v26(owner) THEN
  RAISE EXCEPTION 'CLIENT_ACCESS_DENIED' USING errcode='42501';END IF;
 request_hash:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('active_execution_client:'||owner::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule_client:'||owner::text,0));
 SELECT * INTO rece FROM public.command_receipts_v26 WHERE operation_id=op FOR UPDATE;
 IF FOUND THEN
  IF rece.command_type<>cmd_type OR rece.entity_type<>'training_occurrence'
  OR rece.entity_id<>oid OR rece.client_id<>owner OR rece.actor_user_id<>actor
  OR rece.base_revision<>baserev
  OR rece.response->>'requestHash' IS DISTINCT FROM request_hash THEN
   RETURN jsonb_build_object('kind','rejected','reason','OPERATION_ID_REUSED','operationId',op);
  END IF;
  RETURN (rece.response-'requestHash')||jsonb_build_object('duplicate',true);
 END IF;
 SELECT * INTO occ FROM public.training_session_occurrences_v1
 WHERE id=oid AND client_id=owner FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('kind','rejected','reason','OCCURRENCE_NOT_FOUND','operationId',op);END IF;
 IF occ.revision<>baserev THEN
  RETURN jsonb_build_object('kind','conflict','reason','REVISION_MISMATCH',
   'operationId',op,'remoteRevision',occ.revision);END IF;
 IF occ.status NOT IN ('planificada','confirmada') OR occ.execution_id IS NOT NULL THEN
  RETURN jsonb_build_object('kind','rejected','reason','TRANSITION_FORBIDDEN','operationId',op);END IF;
 IF occ.appointment_id IS NOT NULL THEN
  SELECT * INTO ap FROM public.appointments WHERE id=occ.appointment_id
  AND client_id=owner AND session_id=occ.session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'U34_LINKED_APPOINTMENT_MISSING' USING errcode='23503';END IF;
  IF ap.status NOT IN ('confirmada','cancelada') THEN
   RETURN jsonb_build_object('kind','conflict','reason','APPOINTMENT_ALREADY_TERMINAL');END IF;
  IF ap.status='confirmada' THEN
   SELECT * INTO ap_entity FROM public.domain_entities_v26
   WHERE entity_type='appointment' AND entity_id=ap.id AND client_id=owner FOR UPDATE;
   IF NOT FOUND OR ap_entity.revision IS DISTINCT FROM ap.revision THEN
    RETURN jsonb_build_object('kind','conflict','reason','APPOINTMENT_REVISION_DRIFT');END IF;
   PERFORM public.iberfit_persist_entity_v26(
    'appointment',ap.id,owner,'cancelada',ap_entity.revision+1,
    ap_entity.body||jsonb_build_object('status','cancelada',
    'revision',ap_entity.revision+1,'cancelledAt',now_at,
    'cancelledBy',actor,'updatedAt',now_at));
  END IF;
 END IF;
 UPDATE public.training_session_occurrences_v1 SET
  status='cancelada',revision=occ.revision+1,updated_at=now_at
 WHERE id=occ.id AND client_id=owner AND revision=baserev
  AND status IN ('planificada','confirmada');
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'U34_CONCURRENT_CHANGE' USING errcode='40001';END IF;
 batch:=NULL;
 IF cmd_type='OCURRENCIA_REPROGRAMAR' THEN
  SELECT revision INTO src_revision FROM public.domain_entities_v26
   WHERE entity_type='session' AND entity_id=occ.session_id AND client_id=owner;
  IF src_revision IS NULL THEN RAISE EXCEPTION 'U34_SOURCE_MISSING' USING errcode='23503';END IF;
  batch:=private.iberfit_u32_create_occurrences_batch_v1(
   jsonb_build_object('type','OCURRENCIAS_CREAR_LOTE',
    'operationId',batch_op,'clientId',owner,'entityId',occ.session_id,
    'baseRevision',src_revision,'payload',jsonb_build_object(
    'targetClientId',owner,'previewConfirmed',true,
    'dates',jsonb_build_array(replacement))));
  IF batch->>'kind'<>'ack' OR batch->>'count'<>'1' THEN
   RAISE EXCEPTION 'U34_REPLACEMENT_NOT_APPLIED' USING errcode='23514';END IF;
 END IF;
 ack:=jsonb_build_object('kind','ack','operationId',op,'entityId',occ.id,
  'entityType','training_occurrence','status','cancelada',
  'remoteRevision',occ.revision+1,'replacement',
   CASE WHEN batch IS NULL THEN NULL ELSE batch#>'{occurrences,0}' END,
  'duplicate',false,'serverAt',now_at);
 INSERT INTO public.command_receipts_v26(
 operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,
 base_revision,remote_revision,response,processed_at)
 VALUES(op,cmd_type,'training_occurrence',occ.id,owner,actor,baserev,
  occ.revision+1,ack||jsonb_build_object('requestHash',request_hash),now_at);
 INSERT INTO public.command_events_v26(
 operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,
 phase,base_revision,remote_revision,payload_hash)
 VALUES(op,cmd_type,'training_occurrence',occ.id,owner,actor,'applied',
  baserev,occ.revision+1,request_hash);
 INSERT INTO public.domain_events_v26(
 operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,
 actor_role,phase,from_status,to_status,base_revision,remote_revision,details)
 VALUES(op,cmd_type,'training_occurrence',occ.id,owner,actor,role_name,
  'applied',occ.status,'cancelada',baserev,occ.revision+1,
  jsonb_build_object('sessionId',occ.session_id,'occurrenceId',occ.id,
   'replacementId',batch#>>'{occurrences,0,id}'));
 RETURN ack;
END $u34$;
REVOKE ALL ON FUNCTION private.iberfit_u34_coach_occurrence_change_v1(jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.iberfit_u34_coach_occurrence_change_v1(jsonb)
 IS 'U34 private Coach-only cancel/rebook. Not activated or exposed.';
