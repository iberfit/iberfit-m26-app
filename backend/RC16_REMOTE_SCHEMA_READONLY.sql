-- IBERFIT M26 RC16 · AUDITORÍA REMOTA EXCLUSIVAMENTE DE LECTURA
-- Ejecutar con un rol autorizado de auditoría. No crea, altera ni elimina objetos.
begin transaction read only;

select current_database() as database_name,
       current_user as database_user,
       current_setting('server_version') as postgres_version,
       now() as observed_at;

select command_type, entity_type, event_name, allowed_roles,
       requires_reason, requires_preview, enabled
from public.domain_command_registry_v26
order by command_type;

select count(*) filter (where enabled) as enabled_commands,
       count(*) as total_commands
from public.domain_command_registry_v26;

select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       pg_get_function_result(p.oid) as result_type,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       md5(pg_get_functiondef(p.oid)) as definition_md5
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('iberfit_bootstrap_v26','iberfit_command_preflight_v26','iberfit_execute_command_v26')
order by p.proname, identity_arguments;

select table_name, column_name, ordinal_position, data_type, udt_name,
       is_nullable, column_default
from information_schema.columns
where table_schema='public'
  and table_name in (
    'domain_command_registry_v26','domain_entities_v26','domain_transition_registry_v26',
    'm26_canary_clients_v26','user_profiles','client_assignments','clients',
    'client_checkins_v26','client_habits_v26','client_habit_logs_v26','coach_private_notes_v26'
  )
order by table_name, ordinal_position;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in (
    'domain_command_registry_v26','domain_entities_v26','domain_transition_registry_v26',
    'm26_canary_clients_v26','client_checkins_v26','client_habits_v26',
    'client_habit_logs_v26','coach_private_notes_v26'
  )
order by tablename, policyname;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind='r'
  and c.relname in (
    'domain_command_registry_v26','domain_entities_v26','domain_transition_registry_v26',
    'm26_canary_clients_v26','client_checkins_v26','client_habits_v26',
    'client_habit_logs_v26','coach_private_notes_v26'
  )
order by c.relname;

select count(*) as active_canary_count
from public.m26_canary_clients_v26
where active=true;

commit;
