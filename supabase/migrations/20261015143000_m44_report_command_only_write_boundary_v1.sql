-- IBERFIT M44: report persistence is a command domain, never open table DML.
-- Apply only after M44 private-draft bootstrap and publication projection.
-- Authoritative security-definer RPCs and the canary command bus own writes.
-- Client RLS may SELECT only status=publicado, audience=cliente.
do $m44_boundary$
begin
  if to_regprocedure('public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb)') is null
    or to_regprocedure('public.iberfit_m44_report_public_projection_v1()') is null
    or to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null
  then
    raise exception 'M44_REPORT_WRITE_BOUNDARY_PREREQUISITES_MISSING';
  end if;
end $m44_boundary$;

revoke insert, update, delete on table public.reports from public, anon, authenticated;

do $verify$
begin
  if has_table_privilege('anon','public.reports','INSERT')
    or has_table_privilege('anon','public.reports','UPDATE')
    or has_table_privilege('anon','public.reports','DELETE')
    or has_table_privilege('authenticated','public.reports','INSERT')
    or has_table_privilege('authenticated','public.reports','UPDATE')
    or has_table_privilege('authenticated','public.reports','DELETE')
  then
    raise exception 'M44_REPORT_DIRECT_WRITE_PRIVILEGE_STILL_PRESENT';
  end if;
  if not has_table_privilege('authenticated','public.reports','SELECT') then
    raise exception 'M44_REPORT_LEGITIMATE_READ_PRIVILEGE_LOST';
  end if;
end $verify$;
