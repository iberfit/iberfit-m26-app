do $$
declare v_env jsonb:=public.iberfit_environment();
begin
  if lower(coalesce(v_env->>'environment',''))<>'qa'
     or coalesce((v_env->>'realDataAllowed')::boolean,true)
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'RC74_4O_QA_GUARD_FAILED' using errcode='42501';
  end if;
end $$;

create or replace function private.iberfit_active_execution_command_guard_v26(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_type text;
  v_entity_type text;
  v_entity_id uuid;
  v_client_id uuid;
  v_session_id uuid;
  v_execution_id uuid;
  v_registry_entity text;
  v_allowed_roles text[];
  v_role text;
begin
  if auth.uid() is null or jsonb_typeof(p_command)<>'object' then return jsonb_build_object('ok',true); end if;
  v_type:=nullif(p_command->>'type','');
  v_entity_type:=nullif(p_command->>'entityType','');
  if not (
    (v_entity_type='session' and v_type in ('SESION_CANCELAR','SESION_COMPLETAR'))
    or
    (v_entity_type='appointment' and v_type in ('CITA_CANCELAR','CITA_COMPLETAR','CITA_REPROGRAMAR'))
  ) then return jsonb_build_object('ok',true); end if;

  begin
    v_entity_id:=nullif(p_command->>'entityId','')::uuid;
    v_client_id:=nullif(p_command->>'clientId','')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',true);
  end;
  if v_entity_id is null or v_client_id is null then return jsonb_build_object('ok',true); end if;
  if not public.iberfit_can_access_client_v26(v_client_id) then return jsonb_build_object('ok',true); end if;

  select r.entity_type,r.allowed_roles into v_registry_entity,v_allowed_roles
  from public.domain_command_registry_v26 r where r.command_type=v_type and r.enabled=true;
  if v_registry_entity is distinct from v_entity_type then return jsonb_build_object('ok',true); end if;
  v_role:=public.iberfit_current_role_v26();
  if not (v_role=any(v_allowed_roles)) then return jsonb_build_object('ok',true); end if;

  if v_entity_type='session' then
    v_session_id:=v_entity_id;
    select l.execution_id into v_execution_id
    from public.active_execution_locks_v26 l
    where l.client_id=v_client_id and l.session_id=v_session_id
    limit 1;
    if v_execution_id is null then
      select e.entity_id into v_execution_id
      from public.domain_entities_v26 e
      where e.entity_type='session_execution' and e.client_id=v_client_id
        and e.status in ('en_curso','pausada')
        and nullif(e.body->>'sessionId','')::uuid=v_session_id
      order by e.updated_at desc limit 1;
    end if;
  else
    select e.entity_id,nullif(e.body->>'sessionId','')::uuid into v_execution_id,v_session_id
    from public.domain_entities_v26 e
    where e.entity_type='session_execution' and e.client_id=v_client_id
      and e.status in ('en_curso','pausada')
      and nullif(e.body->>'appointmentId','')::uuid=v_entity_id
    order by e.updated_at desc limit 1;
    if v_session_id is null then
      select coalesce(
        (select nullif(d.body->>'sessionId','')::uuid from public.domain_entities_v26 d where d.entity_type='appointment' and d.entity_id=v_entity_id and d.client_id=v_client_id),
        (select a.session_id from public.appointments a where a.id=v_entity_id and a.client_id=v_client_id)
      ) into v_session_id;
    end if;
    if v_execution_id is null and v_session_id is not null then
      select l.execution_id into v_execution_id
      from public.active_execution_locks_v26 l
      where l.client_id=v_client_id and l.session_id=v_session_id
      limit 1;
    end if;
  end if;

  if v_execution_id is not null then
    return jsonb_build_object('ok',false,'reason','ACTIVE_EXECUTION_MUST_CLOSE_FIRST','executionId',v_execution_id,'sessionId',v_session_id);
  end if;
  return jsonb_build_object('ok',true);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok',true);
end
$function$;

revoke execute on function private.iberfit_active_execution_command_guard_v26(jsonb) from public,anon,authenticated,service_role;

create or replace function public.iberfit_command_preflight_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_command jsonb;
  v_live_guard jsonb;
  v_guard jsonb;
begin
  v_command:=private.iberfit_apply_registry_conflict_policy_v26(p_command);
  v_live_guard:=private.iberfit_active_execution_command_guard_v26(v_command);
  if coalesce((v_live_guard->>'ok')::boolean,true) is not true then
    return jsonb_build_object('kind','rejected','operationId',v_command->>'operationId','remoteRevision',null,'reason',v_live_guard->>'reason','serverAt',now())
      || jsonb_build_object('executionId',v_live_guard->>'executionId','sessionId',v_live_guard->>'sessionId');
  end if;
  v_guard:=public.iberfit_operation_identity_guard_v26(v_command,false);
  if coalesce((v_guard->>'ok')::boolean,false) is not true then
    return jsonb_build_object('kind','rejected','operationId',v_guard->>'operationId','remoteRevision',null,'reason',v_guard->>'reason','serverAt',now());
  end if;
  return public.iberfit_command_preflight_v26_pre_rc74_4h(v_command);
end
$function$;

create or replace function public.iberfit_execute_command_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_command jsonb;
  v_live_guard jsonb;
  v_guard jsonb;
  v_result jsonb;
begin
  v_command:=private.iberfit_apply_registry_conflict_policy_v26(p_command);
  v_live_guard:=private.iberfit_active_execution_command_guard_v26(v_command);
  if coalesce((v_live_guard->>'ok')::boolean,true) is not true then
    return jsonb_build_object('kind','rejected','operationId',v_command->>'operationId','remoteRevision',null,'reason',v_live_guard->>'reason','serverAt',now())
      || jsonb_build_object('executionId',v_live_guard->>'executionId','sessionId',v_live_guard->>'sessionId');
  end if;
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

do $postcheck$
begin
  if has_function_privilege('anon','public.iberfit_command_preflight_v26(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.iberfit_execute_command_v26(jsonb)','EXECUTE') then
    raise exception 'RC74_4O_ANON_EXECUTE_FORBIDDEN';
  end if;
  if not has_function_privilege('authenticated','public.iberfit_command_preflight_v26(jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.iberfit_execute_command_v26(jsonb)','EXECUTE') then
    raise exception 'RC74_4O_AUTHENTICATED_EXECUTE_REQUIRED';
  end if;
  if has_function_privilege('authenticated','private.iberfit_active_execution_command_guard_v26(jsonb)','EXECUTE') then
    raise exception 'RC74_4O_PRIVATE_GUARD_EXPOSED';
  end if;
end
$postcheck$;
