-- IBERFIT M26 RC74.4P · AUTHENTICATED ENVIRONMENT RPC THROUGH RLS · QA ONLY
-- Keeps iberfit_system_settings private while allowing the narrow environment RPC
-- to report QA truth to authenticated non-admin actors.
do $$
declare v_env jsonb := public.iberfit_environment();
begin
  if coalesce(v_env->>'environment','') <> 'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'RC74_4P_QA_ENVIRONMENT_REQUIRED' using errcode='42501';
  end if;
end $$;

create or replace function public.iberfit_environment()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'environment', coalesce((select value #>> '{}' from public.iberfit_system_settings where key='environment'),'UNSET'),
    'realDataAllowed', coalesce((select (value #>> '{}')::boolean from public.iberfit_system_settings where key='real_data_allowed'),false),
    'productionBlocked', coalesce((select (value #>> '{}')::boolean from public.iberfit_system_settings where key='production_blocked'),true),
    'serverTime', now()
  )
$function$;

revoke execute on function public.iberfit_environment() from public, anon;
grant execute on function public.iberfit_environment() to authenticated, service_role;

do $$
declare
  v_env jsonb := public.iberfit_environment();
  v_secdef boolean;
begin
  select p.prosecdef into v_secdef
  from pg_proc p where p.oid='public.iberfit_environment()'::regprocedure;
  if v_secdef is not true then raise exception 'RC74_4P_SECURITY_DEFINER_REQUIRED'; end if;
  if has_function_privilege('anon','public.iberfit_environment()','EXECUTE') then raise exception 'RC74_4P_ANON_EXECUTE_FORBIDDEN'; end if;
  if not has_function_privilege('authenticated','public.iberfit_environment()','EXECUTE') then raise exception 'RC74_4P_AUTHENTICATED_EXECUTE_REQUIRED'; end if;
  if coalesce(v_env->>'environment','') <> 'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'RC74_4P_POSTCHECK_FAILED';
  end if;
end $$;
