-- M44 operational fix: the privileged Edge issuer must read issuance idempotency
-- and latest-version metadata via PostgREST. The base ledger is deny-by-default.
-- Give ONLY the trusted service_role SELECT; authenticated still uses redacted RPCs.
REVOKE ALL ON public.iberfit_evolution_report_issuances_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.iberfit_evolution_report_issuances_v1 TO service_role;

-- M44_PDF_SERVICE_LEDGER_SELECT_MISSING: declarative fail-closed verification; no arbitrary DO/EXECUTE.
SELECT 1 / (CASE WHEN has_table_privilege('service_role',
 'public.iberfit_evolution_report_issuances_v1','SELECT')
 AND NOT has_table_privilege('anon',
 'public.iberfit_evolution_report_issuances_v1','SELECT')
 AND NOT has_table_privilege('authenticated',
 'public.iberfit_evolution_report_issuances_v1','SELECT')
 AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN 1 ELSE 0 END) AS m44_pdf_service_ledger_select_missing;
