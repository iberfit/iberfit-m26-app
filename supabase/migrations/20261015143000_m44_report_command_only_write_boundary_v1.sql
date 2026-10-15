-- IBERFIT M44: report persistence is a command domain, never open table DML.
-- Apply only after M44 private-draft bootstrap and publication projection.
-- Authoritative security-definer RPCs and the canary command bus own writes.
-- Client RLS may SELECT only status=publicado, audience=cliente.
-- M44_REPORT_WRITE_BOUNDARY_PREREQUISITES_MISSING: declarative fail-closed verification; no arbitrary DO/EXECUTE.
SELECT 1 / (CASE WHEN to_regprocedure('public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb)') IS NOT NULL
 AND to_regprocedure('public.iberfit_m44_report_public_projection_v1()') IS NOT NULL
 AND to_regprocedure('public.iberfit_execute_command_v26(jsonb)') IS NOT NULL THEN 1 ELSE 0 END) AS m44_report_write_boundary_prerequisites_missing;

revoke insert, update, delete on table public.reports from public, anon, authenticated;

-- M44_REPORT_DIRECT_WRITE_PRIVILEGE_STILL_PRESENT: declarative fail-closed verification; no arbitrary DO/EXECUTE.
SELECT 1 / (CASE WHEN NOT (
has_table_privilege('anon','public.reports','INSERT')
 OR has_table_privilege('anon','public.reports','UPDATE')
 OR has_table_privilege('anon','public.reports','DELETE')
 OR has_table_privilege('authenticated','public.reports','INSERT')
 OR has_table_privilege('authenticated','public.reports','UPDATE')
 OR has_table_privilege('authenticated','public.reports','DELETE')
) AND has_table_privilege('authenticated','public.reports','SELECT') THEN 1 ELSE 0 END) AS m44_report_direct_write_privilege_still_present;
