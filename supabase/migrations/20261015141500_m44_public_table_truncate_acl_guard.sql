-- P0 IBERFIT permissions hardening: preserve on every future migration.
-- In Supabase PROD this existing-table change was independently applied and
-- read-verified on 2026-10-15; this migration makes the repair reproducible.
-- RLS DOES NOT protect TRUNCATE, even where SELECT/UPDATE/DELETE policies exist.
revoke truncate on all tables in schema public from anon, authenticated;
-- Suppress future grants from the migration owner where possible.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

do $security_guard$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
    and (has_table_privilege('anon',c.oid,'TRUNCATE')
      or has_table_privilege('authenticated',c.oid,'TRUNCATE'));
  if v_count<>0 then
    raise exception 'M44_PUBLIC_TRUNCATE_GRANTS_NOT_REVOKED: %',v_count;
  end if;
end $security_guard$;
