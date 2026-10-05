-- IBERFIT · Security & Data Access 360 · Canary RPC scoped disclosure v1
--
-- RLS policies invoke this helper under the authenticated role, so direct
-- authenticated EXECUTE is required. Harden the helper itself instead:
-- callers only learn Canary enrolment for clients they can already access.
--
-- Keep the existing signature and execution model to avoid RLS regressions.

create or replace function public.iberfit_canary_enabled_v26(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(
    p_client_id is not null
    and public.iberfit_can_access_client_v26(p_client_id)
    and exists(
      select 1
      from public.m26_canary_clients_v26 c
      where c.client_id=p_client_id
        and c.active=true
    ),
    false
  )
$function$;

revoke all on function public.iberfit_canary_enabled_v26(uuid)
from public, anon;

grant execute on function public.iberfit_canary_enabled_v26(uuid)
to authenticated, service_role;

notify pgrst, 'reload schema';
