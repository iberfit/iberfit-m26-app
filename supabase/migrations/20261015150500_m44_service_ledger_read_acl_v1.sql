-- M44 operational fix: the privileged Edge issuer must read issuance idempotency
-- and latest-version metadata via PostgREST. The base ledger is deny-by-default.
-- Give ONLY the trusted service_role SELECT; authenticated still uses redacted RPCs.
REVOKE ALL ON public.iberfit_evolution_report_issuances_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.iberfit_evolution_report_issuances_v1 TO service_role;

DO $m44_acl$
BEGIN
 IF NOT has_table_privilege('service_role',
      'public.iberfit_evolution_report_issuances_v1','SELECT')
 THEN RAISE EXCEPTION 'M44_PDF_SERVICE_LEDGER_SELECT_MISSING';END IF;
 IF has_table_privilege('anon',
      'public.iberfit_evolution_report_issuances_v1','SELECT')
   OR has_table_privilege('authenticated',
      'public.iberfit_evolution_report_issuances_v1','SELECT')
 THEN RAISE EXCEPTION 'M44_PDF_LEDGER_EXPOSED_TO_BROWSER';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles
               WHERE rolname='service_role' AND rolbypassrls)
 THEN RAISE EXCEPTION 'M44_PDF_SERVICE_RLS_BYPASS_UNAVAILABLE';END IF;
END $m44_acl$;
