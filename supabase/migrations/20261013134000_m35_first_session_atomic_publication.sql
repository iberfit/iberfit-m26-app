-- M35. Exact versioned implementation derived from production V26 RC29,
-- source-compared to QA implementation tested on 2026-10-13.
-- Scope of change: ONLY first-session reviewed publication initialization.
-- All existing authorization, preview, rate, revision, idempotency, service,
-- delivery, client scope and audit guards remain unchanged.
-- Do not mutate any existing data, role registry or RLS policy.
CREATE OR REPLACE FUNCTION public.iberfit_execute_command_v26_rc29(p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_operation_id uuid; v_command_type text; v_entity_type text; v_entity_id uuid; v_client_id uuid;
  v_base_revision bigint; v_conflict_sensitive boolean; v_payload jsonb; v_role text; v_now timestamptz:=now();
  v_def public.domain_command_registry_v26%rowtype; v_receipt public.command_receipts_v26%rowtype;
  v_body jsonb; v_next_body jsonb; v_status text; v_to_status text; v_revision bigint; v_next_revision bigint;
  v_reason text; v_response jsonb:='{}'::jsonb; v_related jsonb; v_related_revision bigint;
  v_appointment jsonb; v_execution_id uuid; v_appointment_id uuid; v_plan_id uuid; v_plan jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_command)<>'object' then raise exception 'INVALID_COMMAND' using errcode='22023'; end if;

  v_operation_id:=(p_command->>'operationId')::uuid;
  v_command_type:=nullif(p_command->>'type','');
  v_entity_type:=nullif(p_command->>'entityType','');
  v_entity_id:=(p_command->>'entityId')::uuid;
  v_client_id:=(p_command->>'clientId')::uuid;
  v_base_revision:=(p_command->>'baseRevision')::bigint;
  v_conflict_sensitive:=coalesce((p_command->>'conflictSensitive')::boolean,true);
  v_payload:=coalesce(p_command->'payload','{}'::jsonb);
  v_role:=public.iberfit_current_role_v26();
  v_reason:=nullif(btrim(v_payload->>'reason'),'');

  if v_command_type is null or v_entity_type is null or v_base_revision<0 then
    raise exception 'INVALID_COMMAND' using errcode='22023';
  end if;
  if not public.iberfit_can_access_client_v26(v_client_id) then raise exception 'CLIENT_ACCESS_DENIED' using errcode='42501'; end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','M26_CANARY_NOT_ENABLED','serverAt',v_now);
  end if;

  select * into v_def from public.domain_command_registry_v26 where command_type=v_command_type and enabled=true;
  if not found or v_def.entity_type<>v_entity_type then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','COMMAND_NOT_ALLOWED','serverAt',v_now);
  end if;
  if not (v_role=any(v_def.allowed_roles)) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','ROLE_NOT_ALLOWED','serverAt',v_now);
  end if;
  if v_def.requires_reason and v_reason is null then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','REASON_REQUIRED','serverAt',v_now);
  end if;
  if v_def.requires_preview and (
    coalesce((v_payload->>'previewConfirmed')::boolean,false)=false
    or nullif(v_payload->>'targetClientId','')::uuid is distinct from v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','PREVIEW_CONFIRMATION_REQUIRED','serverAt',v_now);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_entity_type||':'||v_entity_id::text,0));
  select * into v_receipt from public.command_receipts_v26 where operation_id=v_operation_id;
  if found then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'duplicate',v_base_revision,v_receipt.remote_revision,'Recibo existente');
    return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_receipt.remote_revision,
      'serverAt',v_receipt.processed_at,'duplicate',true,'receipt',to_jsonb(v_receipt));
  end if;

  select body,status,revision into v_body,v_status,v_revision
  from public.domain_entities_v26
  where entity_type=v_entity_type and entity_id=v_entity_id and client_id=v_client_id;
  if v_body is null then
    v_body:=public.iberfit_base_entity_v26(v_entity_type,v_entity_id,v_client_id);
    v_status:=v_body->>'status'; v_revision:=coalesce((v_body->>'revision')::bigint,0);
  end if;
  if v_body is null and (v_def.bootstrap_allowed or (v_entity_type='session' and v_command_type='SESION_PUBLICAR' and v_def.requires_preview)) then
    v_status:=case v_entity_type
      when 'client_access' then 'sin_acceso' when 'planning' then 'borrador'
      when 'appointment' then 'propuesta' when 'intelligence' then 'borrador' when 'session' then 'aprobada' else null end;
    v_revision:=0;
    v_body:=jsonb_build_object('id',v_entity_id,'clientId',v_client_id,'status',v_status,'revision',0,
      'createdAt',v_now,'updatedAt',v_now);
  end if;
  if v_body is null then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'rejected',v_base_revision,'ENTITY_NOT_FOUND');
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason','ENTITY_NOT_FOUND','serverAt',v_now);
  end if;

  v_status:=coalesce(v_status,v_body->>'status');
  v_revision:=coalesce(v_revision,(v_body->>'revision')::bigint,0);
  if v_conflict_sensitive and v_base_revision<>v_revision then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'conflict',v_base_revision,v_revision,'REVISION_MISMATCH');
    insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_role,'conflict',v_status,v_status,v_base_revision,v_revision,'REVISION_MISMATCH');
    return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,'reason','REVISION_MISMATCH','serverAt',v_now);
  end if;

  select to_status into v_to_status from public.domain_transitions_v26
  where entity_type=v_entity_type and from_status=v_status and event_name=v_def.event_name;
  if v_to_status is null then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'rejected',v_base_revision,v_revision,'INVALID_TRANSITION');
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','INVALID_TRANSITION','serverAt',v_now);
  end if;

  v_next_revision:=v_revision+1;
  v_next_body:=v_body || case when jsonb_typeof(v_payload->'patch')='object' then v_payload->'patch' else '{}'::jsonb end;

  if v_command_type='PLAN_VALIDAR' and jsonb_typeof(v_payload->'draft')='object' then
    v_next_body:=v_next_body || (v_payload->'draft');
  elsif v_command_type in ('CITA_CREAR','CITA_REPROGRAMAR') and jsonb_typeof(v_payload->'appointment')='object' then
    v_next_body:=v_next_body || (v_payload->'appointment');
    if nullif(v_next_body->>'startAt','') is null or nullif(v_next_body->>'endAt','') is null
       or (v_next_body->>'endAt')::timestamptz <= (v_next_body->>'startAt')::timestamptz then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','INVALID_APPOINTMENT_RANGE','serverAt',v_now);
    end if;
    if exists(
      select 1 from public.appointments a
      where a.client_id=v_client_id and a.id<>v_entity_id and a.status in ('propuesta','confirmada')
        and tstzrange(a.start_at,a.end_at,'[)') && tstzrange((v_next_body->>'startAt')::timestamptz,(v_next_body->>'endAt')::timestamptz,'[)')
    ) then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','APPOINTMENT_OVERLAP','serverAt',v_now);
    end if;
  elsif v_command_type='INTELIGENCIA_GENERAR' then
    if jsonb_typeof(v_payload->'proposal')<>'object' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','STRUCTURED_PROPOSAL_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object(
      'proposal',v_payload->'proposal','provider',v_payload->>'provider','providerMode',v_payload->>'providerMode',
      'providerModel',v_payload->>'model','providerRequestId',v_payload->>'requestId',
      'fallbackReason',v_payload->>'fallbackReason','generatedAt',v_now,'generatedBy',auth.uid()
    );
  elsif v_command_type='INTELIGENCIA_REVISAR' then
    if nullif(btrim(v_payload->>'reviewSummary'),'') is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','REVIEW_SUMMARY_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object('reviewSummary',v_payload->>'reviewSummary','reviewedAt',v_now,'reviewedBy',auth.uid());
  elsif v_command_type in ('CLIENTE_INVITAR','CLIENTE_REINVITAR','CLIENTE_REENVIAR_INVITACION') then
    if nullif(v_payload->>'email','') is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EMAIL_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object('email',v_payload->>'email','invitationSentAt',v_now,
      'invitationSentBy',auth.uid(),'invitationAttemptCount',coalesce((v_body->>'invitationAttemptCount')::integer,0)+1);
  elsif v_command_type='CLIENTE_ACTIVAR' then
    v_next_body:=v_next_body || jsonb_build_object('authUserId',v_payload->>'authUserId','activatedAt',v_now);
  elsif v_command_type='EJECUCION_GUARDAR_PROGRESO' then
    if jsonb_typeof(v_payload->'progressSnapshot')<>'object' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PROGRESS_SNAPSHOT_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object(
      'progressSnapshot',v_payload->'progressSnapshot','items',coalesce(v_payload->'progressSnapshot'->'items','[]'::jsonb),
      'cursor',coalesce(v_payload->'progressSnapshot'->'cursor','{}'::jsonb),
      'incidents',coalesce(v_payload->'progressSnapshot'->'incidents','[]'::jsonb),
      'progressSavedAt',v_now,'progressSavedBy',auth.uid()
    );
  end if;

  if v_command_type='SESION_INICIAR' then
    v_execution_id:=nullif(v_payload->>'executionId','')::uuid;
    v_appointment_id:=nullif(v_payload->>'appointmentId','')::uuid;
    if v_execution_id is null or v_appointment_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EXECUTION_AND_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    if exists(select 1 from public.active_execution_locks_v26 where client_id=v_client_id) then
      return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,'reason','ACTIVE_EXECUTION_EXISTS','serverAt',v_now);
    end if;
    v_appointment:=public.iberfit_base_entity_v26('appointment',v_appointment_id,v_client_id);
    if v_appointment is null or v_appointment->>'status'<>'confirmada'
       or nullif(v_appointment->>'sessionId','')::uuid is distinct from v_entity_id then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','CONFIRMED_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    v_related:=jsonb_build_object(
      'id',v_execution_id,'clientId',v_client_id,'sessionId',v_entity_id,'appointmentId',v_appointment_id,
      'status','en_curso','revision',1,'startedAt',v_now,'startedBy',auth.uid(),
      'mode',coalesce(v_next_body->>'type',v_next_body->>'execution_type'),
      'sourceRevision',v_revision,'sourceSnapshot',coalesce(v_next_body->'publishedSnapshot',v_next_body->'prescription',v_next_body),
      'items',coalesce(v_next_body->'publishedSnapshot'->'items',v_next_body->'prescription'->'items',v_next_body->'blocks','[]'::jsonb),
      'cursor',jsonb_build_object('itemIndex',0,'setIndex',0),'incidents','[]'::jsonb
    );
    perform public.iberfit_persist_entity_v26('session_execution',v_execution_id,v_client_id,'en_curso',1,v_related);
    insert into public.active_execution_locks_v26(client_id,session_id,execution_id,acquired_by)
    values(v_client_id,v_entity_id,v_execution_id,auth.uid());
    v_next_body:=v_next_body || jsonb_build_object('activeExecutionId',v_execution_id,'appointmentId',v_appointment_id,'startedAt',v_now,'startedBy',auth.uid());
    v_response:=jsonb_build_object('executionId',v_execution_id,'executionRevision',1,'appointmentId',v_appointment_id);
    insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,details)
    values(v_operation_id,v_command_type,'session_execution',v_execution_id,v_client_id,auth.uid(),v_role,'related_applied','creada','en_curso',0,1,jsonb_build_object('sessionId',v_entity_id));
  elsif v_command_type='EJECUCION_COMPLETAR' then
    delete from public.active_execution_locks_v26 where client_id=v_client_id and execution_id=v_entity_id;
    if nullif(v_body->>'sessionId','') is not null then
      v_related:=public.iberfit_base_entity_v26('session',(v_body->>'sessionId')::uuid,v_client_id);
      select body,revision into v_plan,v_related_revision from public.domain_entities_v26
        where entity_type='session' and entity_id=(v_body->>'sessionId')::uuid and client_id=v_client_id;
      v_related:=coalesce(v_plan,v_related);
      if v_related is not null then
        v_related_revision:=coalesce(v_related_revision,(v_related->>'revision')::bigint,0)+1;
        v_related:=v_related || jsonb_build_object('status','completada','revision',v_related_revision,'completedAt',v_now,'updatedAt',v_now);
        perform public.iberfit_persist_entity_v26('session',(v_body->>'sessionId')::uuid,v_client_id,'completada',v_related_revision,v_related);
      end if;
    end if;
    if nullif(v_body->>'appointmentId','') is not null then
      v_related:=public.iberfit_base_entity_v26('appointment',(v_body->>'appointmentId')::uuid,v_client_id);
      if v_related is not null then
        v_related_revision:=coalesce((v_related->>'revision')::bigint,0)+1;
        v_related:=v_related || jsonb_build_object('status','completada','revision',v_related_revision,'completedAt',v_now,'completedBy',auth.uid(),'updatedAt',v_now);
        perform public.iberfit_persist_entity_v26('appointment',(v_body->>'appointmentId')::uuid,v_client_id,'completada',v_related_revision,v_related);
      end if;
    end if;
    v_next_body:=v_next_body || jsonb_build_object('completedAt',v_now,'completedBy',auth.uid(),'feedback',coalesce(v_payload->'feedback','{}'::jsonb));
  elsif v_command_type='INTELIGENCIA_APLICAR_A_BORRADOR' then
    v_plan_id:=nullif(v_payload->>'planDraftId','')::uuid;
    if v_plan_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PLAN_DRAFT_REQUIRED','serverAt',v_now);
    end if;
    select body,revision into v_plan,v_related_revision from public.domain_entities_v26
      where entity_type='planning' and entity_id=v_plan_id and client_id=v_client_id;
    if v_plan is null then v_plan:=public.iberfit_base_entity_v26('planning',v_plan_id,v_client_id); end if;
    v_related_revision:=coalesce(v_related_revision,(v_plan->>'revision')::bigint,0);
    if v_plan is null or v_plan->>'status'<>'borrador' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PLAN_NOT_DRAFT','serverAt',v_now);
    end if;
    if v_related_revision<>coalesce((v_payload->>'planBaseRevision')::bigint,-1) then
      return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_related_revision,'reason','PLAN_REVISION_MISMATCH','serverAt',v_now);
    end if;
    v_related_revision:=v_related_revision+1;
    v_plan:=v_plan || jsonb_build_object('revision',v_related_revision,'updatedAt',v_now,
      'aiSuggestions',coalesce(v_plan->'aiSuggestions','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id',v_operation_id,'intelligenceRunId',v_entity_id,'proposal',v_body->'proposal','addedAt',v_now,
        'addedBy',auth.uid(),'status','pendiente_revision_editor')));
    perform public.iberfit_persist_entity_v26('planning',v_plan_id,v_client_id,'borrador',v_related_revision,v_plan);
    v_next_body:=v_next_body || jsonb_build_object('appliedAt',v_now,'appliedBy',auth.uid(),'appliedPlanId',v_plan_id);
    v_response:=jsonb_build_object('planId',v_plan_id,'planRevision',v_related_revision,'suggestionId',v_operation_id);
  end if;

  if v_to_status in ('aprobado','aprobada') then
    v_next_body:=v_next_body || jsonb_build_object('approvedAt',v_now,'approvedBy',auth.uid());
  elsif v_to_status in ('publicado','publicada') then
    v_next_body:=v_next_body || jsonb_build_object('publishedAt',v_now,'publishedBy',auth.uid());
  elsif v_to_status='retirado' then
    v_next_body:=v_next_body || jsonb_build_object('retiredAt',v_now,'retiredBy',auth.uid(),'retireReason',v_reason);
  elsif v_to_status in ('cancelada','anulado','archivado','descartada','revocado','suspendido') then
    v_next_body:=v_next_body || jsonb_build_object('closedAt',v_now,'closedBy',auth.uid(),'closeReason',v_reason);
  end if;
  if v_def.snapshot_on_apply then
    v_next_body:=v_next_body || jsonb_build_object('publishedSnapshot',coalesce(v_next_body->'content',v_next_body->'sessions',v_next_body->'blocks',v_next_body),
      'publishedRevision',v_next_revision);
  end if;

  v_next_body:=v_next_body || jsonb_build_object('id',v_entity_id,'clientId',v_client_id,'status',v_to_status,
    'revision',v_next_revision,'updatedAt',v_now);
  perform public.iberfit_persist_entity_v26(v_entity_type,v_entity_id,v_client_id,v_to_status,v_next_revision,v_next_body);

  insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,payload_hash)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'applied',v_base_revision,v_next_revision,md5(v_payload::text));
  insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,reason,details)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_role,'applied',v_status,v_to_status,v_base_revision,v_next_revision,v_reason,v_response);

  insert into public.command_receipts_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,base_revision,remote_revision,response,processed_at)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_base_revision,v_next_revision,v_response,v_now)
  returning * into v_receipt;

  return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_next_revision,
    'serverAt',v_now,'duplicate',false,'receipt',to_jsonb(v_receipt));
exception
  when invalid_text_representation or numeric_value_out_of_range or null_value_not_allowed then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end $function$
