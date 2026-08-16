create or replace function public.iberfit_bootstrap()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'environment',coalesce((select value #>> '{}' from public.iberfit_system_settings where key='environment'),'UNSET'),
    'serverTime',now(),
    'user',jsonb_build_object(
      'id',auth.uid(),
      'role',public.iberfit_role(),
      'clientId',public.iberfit_client_id(),
      'name',(select display_name from public.user_profiles where user_id=auth.uid())
    ),
    'remoteRevisions',coalesce((select jsonb_object_agg(entity_type||':'||entity_id,revision) from public.sync_entities),'{}'::jsonb),
    'data',public.iberfit_bootstrap_core() || public.iberfit_bootstrap_support()
  )
$$;
revoke all on function public.iberfit_bootstrap() from public,anon;
grant execute on function public.iberfit_bootstrap() to authenticated;;
