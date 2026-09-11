-- IBERFIT P0 · Authenticated health RPC least privilege
-- Keeps health checks available to signed-in application sessions while removing anonymous execution.

begin;

do $precheck$
begin
  if to_regprocedure('public.m26_backend_health_v43()') is null
     or to_regprocedure('public.m26_backend_health_v431()') is null
     or to_regprocedure('public.m26_wearable_health_v44()') is null then
    raise exception 'IBERFIT_P0_HEALTH_RPC_REQUIRED';
  end if;
end
$precheck$;

alter function public.m26_backend_health_v43() security invoker;
alter function public.m26_backend_health_v431() security invoker;
alter function public.m26_wearable_health_v44() security invoker;

revoke all on function public.m26_backend_health_v43() from public, anon, authenticated;
revoke all on function public.m26_backend_health_v431() from public, anon, authenticated;
revoke all on function public.m26_wearable_health_v44() from public, anon, authenticated;

grant execute on function public.m26_backend_health_v43() to authenticated, service_role;
grant execute on function public.m26_backend_health_v431() to authenticated, service_role;
grant execute on function public.m26_wearable_health_v44() to authenticated, service_role;

comment on function public.m26_backend_health_v43()
  is 'IBERFIT authenticated health probe. SECURITY INVOKER; anonymous execution forbidden.';
comment on function public.m26_backend_health_v431()
  is 'IBERFIT authenticated draft-backend health probe. SECURITY INVOKER; anonymous execution forbidden.';
comment on function public.m26_wearable_health_v44()
  is 'IBERFIT authenticated wearable health probe. SECURITY INVOKER; anonymous execution forbidden.';

do $postcheck$
declare
  v_definer_count integer;
begin
  if has_function_privilege('anon','public.m26_backend_health_v43()','EXECUTE')
     or has_function_privilege('anon','public.m26_backend_health_v431()','EXECUTE')
     or has_function_privilege('anon','public.m26_wearable_health_v44()','EXECUTE') then
    raise exception 'IBERFIT_P0_HEALTH_RPC_ANON_EXECUTE_FORBIDDEN';
  end if;

  if not has_function_privilege('authenticated','public.m26_backend_health_v43()','EXECUTE')
     or not has_function_privilege('authenticated','public.m26_backend_health_v431()','EXECUTE')
     or not has_function_privilege('authenticated','public.m26_wearable_health_v44()','EXECUTE') then
    raise exception 'IBERFIT_P0_HEALTH_RPC_AUTH_EXECUTE_REQUIRED';
  end if;

  select count(*) into v_definer_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in ('m26_backend_health_v43','m26_backend_health_v431','m26_wearable_health_v44')
    and p.prosecdef=true;

  if v_definer_count<>0 then
    raise exception 'IBERFIT_P0_HEALTH_RPC_SECURITY_INVOKER_REQUIRED:%',v_definer_count;
  end if;
end
$postcheck$;

commit;
