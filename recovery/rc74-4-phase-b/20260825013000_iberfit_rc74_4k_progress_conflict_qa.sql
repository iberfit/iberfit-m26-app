-- IBERFIT M26 RC74.4K · PROGRESS CONFLICT POLICY · QA ONLY
-- APPLY ONLY AFTER THE CLIENT OFFLINE REBASE PATCH IS VERSIONED AND CANARY GATES PASS.
do $guard$
declare
  v_env jsonb:=public.iberfit_environment();
  v_count integer;
  v_policy boolean;
begin
  if lower(coalesce(v_env->>'environment',''))<>'qa'
     or coalesce((v_env->>'realDataAllowed')::boolean,true)<>false
     or coalesce((v_env->>'productionBlocked')::boolean,false)<>true then
    raise exception 'RC74_4K_QA_ENVIRONMENT_REQUIRED';
  end if;
  select count(*) into v_count from public.domain_command_registry_v26 where enabled=true;
  if v_count<>52 then raise exception 'RC74_4K_COMMAND_COUNT_MISMATCH:%',v_count; end if;
  if to_regprocedure('private.iberfit_apply_registry_conflict_policy_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_operation_identity_guard_v26(jsonb,boolean)') is null
     or to_regprocedure('private.iberfit_finalize_execution_cancel_v26(jsonb)') is null
     or to_regprocedure('private.iberfit_active_execution_command_guard_v26(jsonb)') is null then
    raise exception 'RC74_4K_REQUIRED_HARDENING_MISSING';
  end if;
  select conflict_sensitive into v_policy
  from public.domain_command_registry_v26
  where command_type='EJECUCION_GUARDAR_PROGRESO'
    and entity_type='session_execution' and enabled=true;
  if v_policy is distinct from false then raise exception 'RC74_4K_PHASE_A_POLICY_NOT_FALSE'; end if;
  select count(*) into v_count from public.active_execution_locks_v26;
  if v_count<>0 then raise exception 'RC74_4K_ACTIVE_EXECUTION_LOCKS:%',v_count; end if;
  select count(*) into v_count
  from public.domain_entities_v26
  where entity_type='session_execution' and status in ('en_curso','pausada');
  if v_count<>0 then raise exception 'RC74_4K_ACTIVE_EXECUTIONS:%',v_count; end if;
  select count(*) into v_count
  from public.command_operation_identities_v26
  where command_type='EJECUCION_GUARDAR_PROGRESO';
  if v_count<>0 then raise exception 'RC74_4K_LEGACY_PROGRESS_IDENTITIES:%',v_count; end if;
end
$guard$;

update public.domain_command_registry_v26
set conflict_sensitive=true
where command_type='EJECUCION_GUARDAR_PROGRESO'
  and entity_type='session_execution'
  and enabled=true;

do $postcheck$
declare v_count integer; v_policy boolean;
begin
  select count(*) into v_count
  from public.domain_command_registry_v26
  where command_type='EJECUCION_GUARDAR_PROGRESO'
    and entity_type='session_execution'
    and enabled=true
    and conflict_sensitive=true;
  if v_count<>1 then raise exception 'RC74_4K_PROGRESS_POLICY_NOT_ENABLED:%',v_count; end if;

  select (private.iberfit_apply_registry_conflict_policy_v26(
    jsonb_build_object(
      'type','EJECUCION_GUARDAR_PROGRESO',
      'entityType','session_execution',
      'conflictSensitive',false
    )
  )->>'conflictSensitive')::boolean into v_policy;
  if v_policy is distinct from true then raise exception 'RC74_4K_CLIENT_DOWNGRADE_NOT_BLOCKED'; end if;

  select count(*) into v_count from public.domain_command_registry_v26 where enabled=true;
  if v_count<>52 then raise exception 'RC74_4K_POSTCHECK_COMMAND_COUNT:%',v_count; end if;
  select count(*) into v_count from public.active_execution_locks_v26;
  if v_count<>0 then raise exception 'RC74_4K_POSTCHECK_ACTIVE_LOCKS:%',v_count; end if;
  select count(*) into v_count
  from public.domain_entities_v26
  where entity_type='session_execution' and status in ('en_curso','pausada');
  if v_count<>0 then raise exception 'RC74_4K_POSTCHECK_ACTIVE_EXECUTIONS:%',v_count; end if;
end
$postcheck$;
