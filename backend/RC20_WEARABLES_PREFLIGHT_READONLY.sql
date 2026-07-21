-- IBERFIT M26 RC20 · solo lectura. No crea, altera ni elimina objetos.
select current_database() as database_name, current_user as database_user, now() as checked_at;
select count(*) filter(where enabled=true) as enabled_commands from public.domain_command_registry_v26;
select count(*) filter(where active=true) as active_canary_clients from public.m26_canary_clients_v26;
select to_regprocedure('public.iberfit_bootstrap_v26()') as bootstrap_rpc,
       to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') as preflight_rpc,
       to_regprocedure('public.iberfit_execute_command_v26(jsonb)') as execute_rpc;
select tablename,policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('clients','client_assignments','sessions','session_executions')
order by tablename,policyname;
