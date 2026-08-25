-- IBERFIT M26 RC74.4M · TERMINAL EXECUTION LOCK RELEASE · QA ONLY
-- Fixes stale active_execution_locks_v26 after EJECUCION_CANCELAR.
do $guard$
declare v_env jsonb:=public.iberfit_environment();
begin
  if coalesce(v_env->>'environment','')<>'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true)<>false
     or coalesce((v_env->>'productionBlocked')::boolean,false)<>true then
    raise exception 'RC74_4M_QA_ENVIRONMENT_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_execute_command_v26_pre_rc74_4h(jsonb)') is null
     or to_regprocedure('public.iberfit_operation_identity_guard_v26(jsonb,boolean)') is null
     or to_regprocedure('private.iberfit_apply_registry_conflict_policy_v26(jsonb)') is null then
    raise exception 'RC74_4M_REQUIRED_WRAPPERS_MISSING';
  end if;
end
$guard$;

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
    return jsonb_build_object(
      'kind','rejected',
      'operationId',v_guard->>'operationId',
      'remoteRevision',null,
      'reason',v_guard->>'reason',
      'serverAt',now()
    );
  end if;

  v_result:=public.iberfit_execute_command_v26_pre_rc74_4h(v_command);

  if v_result->>'kind'='ack'
     and v_command->>'entityType'='session_execution'
     and v_command->>'type' in ('EJECUCION_CANCELAR','EJECUCION_COMPLETAR') then
    delete from public.active_execution_locks_v26
    where client_id=(v_command->>'clientId')::uuid
      and execution_id=(v_command->>'entityId')::uuid;
  end if;

  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end
$function$;

-- CREATE OR REPLACE preserves existing routine privileges; verify the expected
-- least-privilege public surface remains intact.
do $postcheck$
declare v_def text;
begin
  v_def:=pg_get_functiondef('public.iberfit_execute_command_v26(jsonb)'::regprocedure);
  if position('EJECUCION_CANCELAR' in v_def)=0
     or position('delete from public.active_execution_locks_v26' in v_def)=0 then
    raise exception 'RC74_4M_LOCK_RELEASE_PATCH_MISSING';
  end if;
  if has_function_privilege('anon','public.iberfit_execute_command_v26(jsonb)','EXECUTE') then
    raise exception 'RC74_4M_ANON_EXECUTE_FORBIDDEN';
  end if;
  if not has_function_privilege('authenticated','public.iberfit_execute_command_v26(jsonb)','EXECUTE') then
    raise exception 'RC74_4M_AUTHENTICATED_EXECUTE_REQUIRED';
  end if;
end
$postcheck$;
