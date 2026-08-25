do $$
declare v_env jsonb := public.iberfit_environment();
begin
  if lower(coalesce(v_env->>'environment','')) <> 'qa'
     or coalesce((v_env->>'realDataAllowed')::boolean,true)
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'RC74_4N_QA_GUARD_FAILED' using errcode='42501';
  end if;
end $$;

create or replace function private.iberfit_finalize_execution_cancel_v26(p_command jsonb)
returns void
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_operation_id uuid := nullif(p_command->>'operationId','')::uuid;
  v_client_id uuid := nullif(p_command->>'clientId','')::uuid;
  v_execution_id uuid := nullif(p_command->>'entityId','')::uuid;
  v_session_id uuid;
  v_appointment_id uuid;
  v_reason text := nullif(btrim(coalesce(p_command#>>'{payload,reason}',p_command->>'reason')),'');
  v_now timestamptz := now();
  v_body jsonb;
  v_status text;
  v_revision bigint;
  v_actor_role text := public.iberfit_current_role_v26();
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_command->>'type' <> 'EJECUCION_CANCELAR' or p_command->>'entityType' <> 'session_execution' then
    raise exception 'RC74_4N_INVALID_CANCEL_COMMAND' using errcode='22023';
  end if;
  if v_operation_id is null or v_client_id is null or v_execution_id is null then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.command_receipts_v26 r
    where r.operation_id=v_operation_id and r.command_type='EJECUCION_CANCELAR'
      and r.entity_type='session_execution' and r.entity_id=v_execution_id
      and r.client_id=v_client_id and r.actor_user_id=auth.uid()
  ) then
    raise exception 'RC74_4N_RECEIPT_REQUIRED' using errcode='42501';
  end if;

  select nullif(e.body->>'sessionId','')::uuid,
         nullif(e.body->>'appointmentId','')::uuid,
         e.status
    into v_session_id,v_appointment_id,v_status
  from public.domain_entities_v26 e
  where e.entity_type='session_execution' and e.entity_id=v_execution_id and e.client_id=v_client_id;

  if v_status is distinct from 'cancelada' then
    raise exception 'RC74_4N_EXECUTION_NOT_CANCELLED' using errcode='P0001';
  end if;

  if v_session_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('session:'||v_session_id::text,0));
    select e.body,e.status,e.revision into v_body,v_status,v_revision
    from public.domain_entities_v26 e
    where e.entity_type='session' and e.entity_id=v_session_id and e.client_id=v_client_id
    for update;

    if v_body is not null then
      if v_status='en_curso' then
        if nullif(v_body->>'activeExecutionId','')::uuid is distinct from v_execution_id then
          raise exception 'RC74_4N_SESSION_EXECUTION_MISMATCH' using errcode='P0001';
        end if;
        v_body := (v_body - 'activeExecutionId') || jsonb_build_object(
          'status','cancelada','revision',v_revision+1,'cancelledAt',v_now,'cancelledBy',auth.uid(),
          'closedAt',v_now,'closedBy',auth.uid(),'closeReason',v_reason,'updatedAt',v_now
        );
        perform public.iberfit_persist_entity_v26('session',v_session_id,v_client_id,'cancelada',v_revision+1,v_body);
        insert into public.domain_events_v26(
          operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,
          phase,from_status,to_status,base_revision,remote_revision,reason,details
        ) values(
          v_operation_id,'EJECUCION_CANCELAR','session',v_session_id,v_client_id,auth.uid(),v_actor_role,
          'related_applied',v_status,'cancelada',v_revision,v_revision+1,v_reason,
          jsonb_build_object('executionId',v_execution_id)
        );
      elsif v_status='cancelada' and nullif(v_body->>'activeExecutionId','')::uuid is not null then
        if nullif(v_body->>'activeExecutionId','')::uuid is distinct from v_execution_id then
          raise exception 'RC74_4N_SESSION_EXECUTION_MISMATCH' using errcode='P0001';
        end if;
        v_body := (v_body - 'activeExecutionId') || jsonb_build_object('revision',v_revision+1,'updatedAt',v_now);
        perform public.iberfit_persist_entity_v26('session',v_session_id,v_client_id,'cancelada',v_revision+1,v_body);
        insert into public.domain_events_v26(
          operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,
          phase,from_status,to_status,base_revision,remote_revision,reason,details
        ) values(
          v_operation_id,'EJECUCION_CANCELAR','session',v_session_id,v_client_id,auth.uid(),v_actor_role,
          'related_applied','cancelada','cancelada',v_revision,v_revision+1,v_reason,
          jsonb_build_object('executionId',v_execution_id,'cleanupActiveExecution',true)
        );
      elsif v_status <> 'cancelada' then
        raise exception 'RC74_4N_SESSION_STATE_MISMATCH:%',v_status using errcode='P0001';
      end if;
    end if;
  end if;

  if v_appointment_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('appointment:'||v_appointment_id::text,0));
    select e.body,e.status,e.revision into v_body,v_status,v_revision
    from public.domain_entities_v26 e
    where e.entity_type='appointment' and e.entity_id=v_appointment_id and e.client_id=v_client_id
    for update;

    if v_body is not null then
      if v_status='confirmada' then
        if nullif(v_body->>'sessionId','')::uuid is distinct from v_session_id then
          raise exception 'RC74_4N_APPOINTMENT_SESSION_MISMATCH' using errcode='P0001';
        end if;
        v_body := v_body || jsonb_build_object(
          'status','cancelada','revision',v_revision+1,'cancelledAt',v_now,'cancelledBy',auth.uid(),
          'closedAt',v_now,'closedBy',auth.uid(),'closeReason',v_reason,'updatedAt',v_now
        );
        perform public.iberfit_persist_entity_v26('appointment',v_appointment_id,v_client_id,'cancelada',v_revision+1,v_body);
        insert into public.domain_events_v26(
          operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,
          phase,from_status,to_status,base_revision,remote_revision,reason,details
        ) values(
          v_operation_id,'EJECUCION_CANCELAR','appointment',v_appointment_id,v_client_id,auth.uid(),v_actor_role,
          'related_applied',v_status,'cancelada',v_revision,v_revision+1,v_reason,
          jsonb_build_object('executionId',v_execution_id,'sessionId',v_session_id)
        );
      elsif v_status <> 'cancelada' then
        raise exception 'RC74_4N_APPOINTMENT_STATE_MISMATCH:%',v_status using errcode='P0001';
      end if;
    end if;
  end if;
end
$function$;

revoke execute on function private.iberfit_finalize_execution_cancel_v26(jsonb) from public,anon,authenticated,service_role;

create or replace function public.iberfit_execute_command_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_command jsonb;
  v_guard jsonb;
  v_result jsonb;
begin
  v_command:=private.iberfit_apply_registry_conflict_policy_v26(p_command);
  v_guard:=public.iberfit_operation_identity_guard_v26(v_command,true);
  if coalesce((v_guard->>'ok')::boolean,false) is not true then
    return jsonb_build_object('kind','rejected','operationId',v_guard->>'operationId','remoteRevision',null,'reason',v_guard->>'reason','serverAt',now());
  end if;
  v_result:=public.iberfit_execute_command_v26_pre_rc74_4h(v_command);
  if v_result->>'kind'='ack' and v_command->>'entityType'='session_execution'
     and v_command->>'type' in ('EJECUCION_CANCELAR','EJECUCION_COMPLETAR') then
    delete from public.active_execution_locks_v26
    where client_id=(v_command->>'clientId')::uuid and execution_id=(v_command->>'entityId')::uuid;
  end if;
  if v_result->>'kind'='ack' and coalesce((v_result->>'duplicate')::boolean,false) is false
     and v_command->>'entityType'='session_execution' and v_command->>'type'='EJECUCION_CANCELAR' then
    perform private.iberfit_finalize_execution_cancel_v26(v_command);
  end if;
  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end
$function$;
