create or replace function public.iberfit_environment()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'environment', coalesce((select value #>> '{}' from public.iberfit_system_settings where key = 'environment'), 'UNSET'),
    'serverTime', now()
  )
$$;
revoke all on function public.iberfit_environment() from public;
grant execute on function public.iberfit_environment() to authenticated;;
