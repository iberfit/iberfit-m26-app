create or replace function public.iberfit_role()
returns public.iberfit_role
language sql
stable
security invoker
set search_path = ''
as $$ select private.iberfit_role() $$;
create or replace function public.iberfit_client_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$ select private.iberfit_client_id() $$;
create or replace function public.is_assigned_coach(target_client uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_assigned_coach(target_client) $$;
create or replace function public.iberfit_current_role()
returns public.iberfit_role
language sql
stable
security invoker
set search_path = ''
as $$ select private.iberfit_role() $$;
create or replace function public.iberfit_current_client_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$ select private.iberfit_client_id() $$;
create or replace function public.iberfit_is_assigned_coach(target_client uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_assigned_coach(target_client) $$;
revoke all on function public.iberfit_role() from public, anon;
revoke all on function public.iberfit_client_id() from public, anon;
revoke all on function public.is_assigned_coach(uuid) from public, anon;
revoke all on function public.iberfit_current_role() from public, anon;
revoke all on function public.iberfit_current_client_id() from public, anon;
revoke all on function public.iberfit_is_assigned_coach(uuid) from public, anon;
grant execute on function public.iberfit_role() to authenticated;
grant execute on function public.iberfit_client_id() to authenticated;
grant execute on function public.is_assigned_coach(uuid) to authenticated;
grant execute on function public.iberfit_current_role() to authenticated;
grant execute on function public.iberfit_current_client_id() to authenticated;
grant execute on function public.iberfit_is_assigned_coach(uuid) to authenticated;;
