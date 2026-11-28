SET ROLE service_role;
DO $test$ BEGIN
 BEGIN PERFORM gx_test.issue_candidate('10000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'withdrawn issue unexpectedly accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
RESET ROLE;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');
UPDATE public.iberfit_evolution_report_issuances_v1 SET status='withdrawn',withdrawn_by=auth.uid(),withdrawn_at=now(),withdrawn_reason='Synthetic withdrawal' WHERE status='issued';
SELECT gx_test.assert((SELECT count(*) FROM public.iberfit_evolution_report_issuances_v1 WHERE status='withdrawn' AND private.gx_document_has_external_v1(source_snapshot))=1,'withdrawal preserves ledger after consent revoked');
\echo GX_DOCUMENT_ISSUANCE_BOUNDARY_PG17_OK
