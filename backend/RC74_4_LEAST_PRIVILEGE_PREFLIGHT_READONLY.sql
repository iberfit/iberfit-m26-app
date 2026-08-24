-- IBERFIT M26 RC74.4B-P0 · PREFLIGHT READ ONLY
-- No DDL / no DML.
begin transaction read only;

select
  current_database() as database_name,
  current_user as database_user,
  auth.uid() as authenticated_user,
  now() as observed_at,
  public.iberfit_environment() as environment;

select count(*) as active_canaries
from public.m26_canary_clients_v26
where active=true;

select command_type, entity_type, event_name, allowed_roles,
       requires_reason, requires_preview, enabled
from public.domain_command_registry_v26
where command_type in (
  'SESION_INICIAR','SESION_COMPLETAR','SESION_CANCELAR',
  'EJECUCION_INICIAR','EJECUCION_GUARDAR_PROGRESO','EJECUCION_PAUSAR',
  'EJECUCION_REANUDAR','EJECUCION_COMPLETAR','EJECUCION_CANCELAR'
)
order by command_type;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  md5(pg_get_functiondef(p.oid)) as definition_md5,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'iberfit_command_preflight_v26',
    'iberfit_execute_command_v26',
    'iberfit_execute_command_v26_rc29',
    'iberfit_operation_allowed'
  )
order by p.proname, args;

select pg_get_functiondef('public.iberfit_operation_allowed(text,uuid)'::regprocedure)
  as legacy_operation_allowed_definition;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in (
    'domain_command_registry_v26','domain_entities_v26','domain_events_v26',
    'command_events_v26','command_receipts_v26','coach_private_notes_v26'
  )
order by tablename, policyname;

commit;
