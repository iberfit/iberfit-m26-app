-- IBERFIT · Security Advisor least-privilege hardening v1
-- active_execution_locks_v26 is an internal coordination table.
-- Client-visible access is mediated by guarded RPCs; there is no direct-table
-- contract for anon/authenticated and RLS intentionally has no policies.

do $guard$
begin
  if to_regclass('public.active_execution_locks_v26') is null then
    raise exception 'IBERFIT_ACTIVE_EXECUTION_LOCKS_TABLE_REQUIRED';
  end if;
  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='active_execution_locks_v26'
  ) then
    raise exception 'IBERFIT_ACTIVE_EXECUTION_LOCKS_RLS_REQUIRED';
  end if;
end
$guard$;

revoke select, references, trigger
on table public.active_execution_locks_v26
from anon, authenticated;

do $postcheck$
begin
  if has_table_privilege('anon','public.active_execution_locks_v26','SELECT')
     or has_table_privilege('authenticated','public.active_execution_locks_v26','SELECT')
     or has_table_privilege('anon','public.active_execution_locks_v26','REFERENCES')
     or has_table_privilege('authenticated','public.active_execution_locks_v26','REFERENCES')
     or has_table_privilege('anon','public.active_execution_locks_v26','TRIGGER')
     or has_table_privilege('authenticated','public.active_execution_locks_v26','TRIGGER') then
    raise exception 'IBERFIT_ACTIVE_EXECUTION_LOCKS_DIRECT_GRANT_FORBIDDEN';
  end if;

  if to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') is null then
    raise exception 'IBERFIT_ACTIVE_EXECUTION_GUARDED_RPC_REQUIRED';
  end if;

  if has_function_privilege('anon','public.iberfit_execute_command_v26(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.iberfit_command_preflight_v26(jsonb)','EXECUTE') then
    raise exception 'IBERFIT_ACTIVE_EXECUTION_ANON_RPC_FORBIDDEN';
  end if;

  if not has_function_privilege('authenticated','public.iberfit_execute_command_v26(jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.iberfit_command_preflight_v26(jsonb)','EXECUTE') then
    raise exception 'IBERFIT_ACTIVE_EXECUTION_AUTHENTICATED_RPC_REQUIRED';
  end if;
end
$postcheck$;
