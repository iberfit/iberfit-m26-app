-- P0 IBERFIT permissions hardening: preserve on every future migration.
-- In Supabase PROD this existing-table change was independently applied and
-- read-verified on 2026-10-15; this migration makes the repair reproducible.
-- RLS DOES NOT protect TRUNCATE, even where SELECT/UPDATE/DELETE policies exist.
revoke truncate on all tables in schema public from anon, authenticated;
-- Suppress future grants from the migration owner where possible.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;

-- M44_PUBLIC_TRUNCATE_GRANTS_NOT_REVOKED: declarative fail-closed verification; no arbitrary DO/EXECUTE.
SELECT 1 / (CASE WHEN NOT EXISTS (
 SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
   AND (has_table_privilege('anon',c.oid,'TRUNCATE')
    OR has_table_privilege('authenticated',c.oid,'TRUNCATE'))
) THEN 1 ELSE 0 END) AS m44_public_truncate_grants_not_revoked;
