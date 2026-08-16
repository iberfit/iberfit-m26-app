create or replace function public.iberfit_environment()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'environment', coalesce((select value #>> '{}' from public.iberfit_system_settings where key='environment'),'UNSET'),
    'realDataAllowed', coalesce((select (value #>> '{}')::boolean from public.iberfit_system_settings where key='real_data_allowed'),false),
    'productionBlocked', coalesce((select (value #>> '{}')::boolean from public.iberfit_system_settings where key='production_blocked'),true),
    'serverTime', now()
  )
$$;
create or replace function public.iberfit_operation_allowed(p_type text, p_client_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()) is not null
    and (
      public.iberfit_role()='admin'::public.iberfit_role
      or (public.iberfit_role()='coach'::public.iberfit_role and p_client_id is not null and public.is_assigned_coach(p_client_id))
      or (public.iberfit_role()='client'::public.iberfit_role and p_client_id is not null and p_client_id=public.iberfit_client_id() and p_type in ('SESION_INICIADA','SERIE_COMPLETADA','INCIDENCIA_REGISTRADA','CHECKIN_REGISTRADO','FEEDBACK_REGISTRADO','SESION_CERRADA','EJERCICIO_OMITIDO','EJERCICIO_REEMPLAZADO','EJERCICIO_AÑADIDO','DESCANSO_EDITADO'))
    ),false
  )
$$;
revoke all on function public.iberfit_environment() from public,anon;
revoke all on function public.iberfit_operation_allowed(text,uuid) from public,anon;
grant execute on function public.iberfit_environment() to authenticated;
grant execute on function public.iberfit_operation_allowed(text,uuid) to authenticated;;
