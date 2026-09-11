-- IBERFIT P0 · HEALTH RPC least-privilege rollback
-- Manual emergency rollback only. Restores the exact historical exposure if a compatibility incident requires it.
-- Requires:
--   begin;
--   set local iberfit.allow_p0_health_rpc_security_rollback = 'emergency-approved';
--   \i backend/P0_HEALTH_RPC_LEAST_PRIVILEGE_ROLLBACK.sql

begin;

do $guard$
begin
  if current_setting('iberfit.allow_p0_health_rpc_security_rollback',true)
     is distinct from 'emergency-approved' then
    raise exception 'IBERFIT_P0_HEALTH_RPC_ROLLBACK_NOT_AUTHORIZED';
  end if;
end
$guard$;

alter function public.m26_backend_health_v43() security definer;
alter function public.m26_backend_health_v431() security definer;
alter function public.m26_wearable_health_v44() security definer;

grant execute on function public.m26_backend_health_v43() to public, anon, authenticated, service_role;
grant execute on function public.m26_backend_health_v431() to public, anon, authenticated, service_role;
grant execute on function public.m26_wearable_health_v44() to public, anon, authenticated, service_role;

commit;
