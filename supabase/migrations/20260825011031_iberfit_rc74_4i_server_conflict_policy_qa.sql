-- IBERFIT M26 RC74.4I · SERVER-OWNED CONFLICT POLICY · QA ONLY
do $$
declare v_env jsonb:=public.iberfit_environment();
begin
  if coalesce(v_env->>'environment','')<>'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true)<>false
     or coalesce((v_env->>'productionBlocked')::boolean,false)<>true then
    raise exception 'RC74_4I_QA_ENVIRONMENT_REQUIRED';
  end if;
end $$;

create or replace function private.iberfit_apply_registry_conflict_policy_v26(p_command jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_type text;
  v_entity_type text;
  v_conflict_sensitive boolean;
begin
  if jsonb_typeof(p_command)<>'object' then return p_command; end if;
  v_type:=nullif(p_command->>'type','');
  v_entity_type:=nullif(p_command->>'entityType','');
  select r.conflict_sensitive into v_conflict_sensitive
  from public.domain_command_registry_v26 r
  where r.command_type=v_type and r.entity_type=v_entity_type and r.enabled=true;
  if not found then
    v_conflict_sensitive:=true;
  end if;
  return jsonb_set(p_command,'{conflictSensitive}',to_jsonb(coalesce(v_conflict_sensitive,true)),true);
end
$$;

revoke all on function private.iberfit_apply_registry_conflict_policy_v26(jsonb) from public;
revoke all on function private.iberfit_apply_registry_conflict_policy_v26(jsonb) from anon;
revoke all on function private.iberfit_apply_registry_conflict_policy_v26(jsonb) from authenticated;

create or replace function public.iberfit_command_preflight_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_command jsonb;
  v_guard jsonb;
begin
  v_command:=private.iberfit_apply_registry_conflict_policy_v26(p_command);
  v_guard:=public.iberfit_operation_identity_guard_v26(v_command,false);
  if coalesce((v_guard->>'ok')::boolean,false) is not true then
    return jsonb_build_object('kind','rejected','operationId',v_guard->>'operationId','remoteRevision',null,'reason',v_guard->>'reason','serverAt',now());
  end if;
  return public.iberfit_command_preflight_v26_pre_rc74_4h(v_command);
end
$$;

create or replace function public.iberfit_execute_command_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_command jsonb;
  v_guard jsonb;
begin
  v_command:=private.iberfit_apply_registry_conflict_policy_v26(p_command);
  v_guard:=public.iberfit_operation_identity_guard_v26(v_command,true);
  if coalesce((v_guard->>'ok')::boolean,false) is not true then
    return jsonb_build_object('kind','rejected','operationId',v_guard->>'operationId','remoteRevision',null,'reason',v_guard->>'reason','serverAt',now());
  end if;
  return public.iberfit_execute_command_v26_pre_rc74_4h(v_command);
end
$$;

do $$
declare
  v_env jsonb:=public.iberfit_environment();
  v_pause boolean;
  v_progress boolean;
begin
  select (private.iberfit_apply_registry_conflict_policy_v26(
    jsonb_build_object('type','EJECUCION_PAUSAR','entityType','session_execution','conflictSensitive',false)
  )->>'conflictSensitive')::boolean into v_pause;
  select (private.iberfit_apply_registry_conflict_policy_v26(
    jsonb_build_object('type','EJECUCION_GUARDAR_PROGRESO','entityType','session_execution','conflictSensitive',true)
  )->>'conflictSensitive')::boolean into v_progress;
  if v_pause is distinct from true then raise exception 'RC74_4I_PAUSE_POLICY_NOT_CANONICAL'; end if;
  if v_progress is distinct from false then raise exception 'RC74_4I_PROGRESS_POLICY_CHANGED_EARLY'; end if;
  if coalesce(v_env->>'environment','')<>'QA' then raise exception 'RC74_4I_ENVIRONMENT_DRIFT'; end if;
end $$;
