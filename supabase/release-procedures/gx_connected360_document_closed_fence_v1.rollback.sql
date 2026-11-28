-- Reverse only an empty, still-closed fence. This restores the legacy gap;
-- not an ordinary production rollback. Never remove it with dependent readers.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF to_regprocedure('private.gx_document_read_visible_v1(uuid,uuid,jsonb)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)') AND position('GX_DOCUMENT_FINALIZE_EXTERNAL_CLOSED' IN prosrc)>0)
 OR EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE entity_type='report' AND private.gx_document_has_external_v1(body))
 OR EXISTS(SELECT 1 FROM public.reports WHERE private.gx_document_has_external_v1(content))
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE private.gx_document_has_external_v1(source_snapshot))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_CLOSED_FENCE_ROLLBACK_REQUIRES_PROTECTION'; END IF;
END $guard$;
ALTER TABLE public.domain_entities_v26 DROP CONSTRAINT gx_document_canonical_closed_v1;
ALTER TABLE public.reports DROP CONSTRAINT gx_document_projected_closed_v1;
ALTER TABLE public.iberfit_evolution_report_issuances_v1 DROP CONSTRAINT gx_document_issuance_closed_v1;
DROP FUNCTION private.gx_document_has_external_v1(jsonb) RESTRICT;
COMMIT;
