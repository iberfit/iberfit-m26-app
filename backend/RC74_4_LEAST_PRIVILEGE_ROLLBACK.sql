-- IBERFIT M26 RC74.4B-P0 · ROLLBACK QA ONLY
-- Úsese solo si la prueba QA del cambio de least-privilege debe revertirse.
-- Requiere:
--   begin;
--   set local iberfit.allow_rc74_4_least_privilege_rollback = 'qa-only';
--   \i backend/RC74_4_LEAST_PRIVILEGE_ROLLBACK.sql

begin;

do $guard$
begin
  if current_setting('iberfit.allow_rc74_4_least_privilege_rollback', true) is distinct from 'qa-only' then
    raise exception 'M26_RC74_4_ROLLBACK_NOT_AUTHORIZED';
  end if;
  if (select count(*) from public.m26_canary_clients_v26 where active=true) < 2 then
    raise exception 'M26_RC74_4_ROLLBACK_QA_CANARIES_REQUIRED';
  end if;
end
$guard$;

update public.domain_command_registry_v26
set allowed_roles = case command_type
  when 'SESION_INICIAR' then array['admin','coach','cliente']::text[]
  when 'SESION_COMPLETAR' then array['admin','coach','sistema']::text[]
  when 'SESION_CANCELAR' then array['admin','coach']::text[]
  when 'EJECUCION_INICIAR' then array['admin','coach','cliente']::text[]
  when 'EJECUCION_GUARDAR_PROGRESO' then array['admin','coach','cliente']::text[]
  when 'EJECUCION_PAUSAR' then array['admin','coach','cliente']::text[]
  when 'EJECUCION_REANUDAR' then array['admin','coach','cliente']::text[]
  when 'EJECUCION_COMPLETAR' then array['admin','coach','cliente']::text[]
  when 'EJECUCION_CANCELAR' then array['admin','coach']::text[]
  else allowed_roles
end
where command_type in (
  'SESION_INICIAR','SESION_COMPLETAR','SESION_CANCELAR',
  'EJECUCION_INICIAR','EJECUCION_GUARDAR_PROGRESO','EJECUCION_PAUSAR',
  'EJECUCION_REANUDAR','EJECUCION_COMPLETAR','EJECUCION_CANCELAR'
);

create or replace function public.iberfit_operation_allowed(p_type text, p_client_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    (select auth.uid()) is not null
    and (
      public.iberfit_role()='admin'::public.iberfit_role
      or (
        public.iberfit_role()='coach'::public.iberfit_role
        and p_client_id is not null
        and public.is_assigned_coach(p_client_id)
      )
      or (
        public.iberfit_role()='client'::public.iberfit_role
        and p_client_id is not null
        and p_client_id=public.iberfit_client_id()
        and p_type in (
          'SESION_INICIADA','SERIE_COMPLETADA','INCIDENCIA_REGISTRADA',
          'CHECKIN_REGISTRADO','FEEDBACK_REGISTRADO','SESION_CERRADA',
          'EJERCICIO_OMITIDO','EJERCICIO_REEMPLAZADO','EJERCICIO_AÑADIDO',
          'DESCANSO_EDITADO'
        )
      )
    ),
    false
  )
$function$;

revoke all on function public.iberfit_operation_allowed(text,uuid) from public,anon;
grant execute on function public.iberfit_operation_allowed(text,uuid) to authenticated;

commit;
