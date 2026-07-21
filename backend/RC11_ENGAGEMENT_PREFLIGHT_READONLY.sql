-- RC11 · PRECHECK EXCLUSIVAMENTE DE LECTURA. No modifica objetos ni datos.
select count(*) as base_enabled_commands
from public.domain_command_registry_v26
where enabled=true;

select command_type,entity_type,event_name,allowed_roles,requires_reason,requires_preview,enabled
from public.domain_command_registry_v26
order by command_type;

select table_name,column_name,data_type,udt_name,is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('domain_command_registry_v26','domain_entities_v26','domain_transition_registry_v26','user_profiles','client_assignments')
order by table_name,ordinal_position;

select routine_name,data_type
from information_schema.routines
where routine_schema='public'
  and routine_name in ('iberfit_bootstrap_v26','iberfit_command_preflight_v26','iberfit_execute_command_v26')
order by routine_name;

select count(*) as active_canary_count
from public.m26_canary_clients_v26
where active=true;

select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('client_checkins_v26','client_habits_v26','client_habit_logs_v26','coach_private_notes_v26')
order by table_name;
