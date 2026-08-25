-- IBERFIT M26 RC74.4J · INTERNAL COMMAND RPC PERMISSIONS · QA ONLY
do $guard$
declare v_env jsonb:=public.iberfit_environment();
begin
  if coalesce(v_env->>'environment','')<>'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true)<>false
     or coalesce((v_env->>'productionBlocked')::boolean,false)<>true then
    raise exception 'RC74_4J_QA_ENVIRONMENT_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26_pre_rc74_4h(jsonb)') is null
     or to_regprocedure('public.iberfit_operation_identity_guard_v26(jsonb,boolean)') is null then
    raise exception 'RC74_4J_REQUIRED_FUNCTION_MISSING';
  end if;
end
$guard$;

revoke all on function public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_execute_command_v26_pre_rc74_4h(jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_operation_identity_guard_v26(jsonb,boolean) from public,anon,authenticated;

grant execute on function public.iberfit_command_preflight_v26(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_execute_command_v26(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb) to service_role;
grant execute on function public.iberfit_execute_command_v26_pre_rc74_4h(jsonb) to service_role;
grant execute on function public.iberfit_operation_identity_guard_v26(jsonb,boolean) to service_role;

do $postcheck$
begin
  if has_function_privilege('anon','public.iberfit_command_preflight_v26(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.iberfit_execute_command_v26(jsonb)','EXECUTE') then
    raise exception 'RC74_4J_ANON_PUBLIC_COMMAND_RPC_EXPOSURE';
  end if;
  if not has_function_privilege('authenticated','public.iberfit_command_preflight_v26(jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.iberfit_execute_command_v26(jsonb)','EXECUTE') then
    raise exception 'RC74_4J_PUBLIC_COMMAND_RPC_UNAVAILABLE';
  end if;
  if has_function_privilege('authenticated','public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.iberfit_execute_command_v26_pre_rc74_4h(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.iberfit_operation_identity_guard_v26(jsonb,boolean)','EXECUTE') then
    raise exception 'RC74_4J_INTERNAL_COMMAND_RPC_EXPOSURE';
  end if;
end
$postcheck$;
