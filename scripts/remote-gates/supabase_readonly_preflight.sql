-- IBERFIT M26 RC18 · READ-ONLY preflight
-- Run only with a role permitted to inspect metadata. This script performs no DDL or DML.

select 'project_ref' as section, current_database()::text as value;

select 'rpc' as section,
       p.proname as name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as return_type,
       p.prosecdef as security_definer,
       l.lanname as language
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
join pg_language l on l.oid=p.prolang
where n.nspname='public'
  and p.proname in ('iberfit_bootstrap_v26','iberfit_command_preflight_v26','iberfit_execute_command_v26')
order by p.proname;

select 'command' as section,
       command_type,
       entity_type,
       event_type,
       allowed_roles,
       enabled,
       conflict_sensitive,
       preview_required,
       reason_required
from public.domain_command_registry_v26
order by command_type;

select 'canary' as section,
       client_id,
       active,
       enabled_at,
       reason
from public.m26_canary_clients_v26
order by enabled_at desc nulls last;

select 'rls' as section,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('appointments','client_access_v26','coach_availability_v26','command_events_v26','command_receipts_v26','domain_command_registry_v26','domain_entities_v26','domain_events_v26','domain_transitions_v26','m26_canary_clients_v26')
order by c.relname;
