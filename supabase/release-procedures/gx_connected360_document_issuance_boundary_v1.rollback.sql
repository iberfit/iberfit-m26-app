-- Empty closed-stage rollback only. Never remove data or consent history.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE d text; restored text; a text; b text;
BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR EXISTS(SELECT 1 FROM public.reports WHERE private.gx_document_has_external_v1(content))
 OR EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE entity_type='report' AND private.gx_document_has_external_v1(body))
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE private.gx_document_has_external_v1(source_snapshot)) THEN RAISE EXCEPTION 'GX_DOCUMENT_ISSUANCE_ROLLBACK_REQUIRES_CLOSED_EMPTY_FENCE'; END IF;
 d:=pg_get_functiondef('private.iberfit_gx_report_write_guard_v1()'::regprocedure);
 a:=$p$ IF private.gx_document_has_external_v1(NEW.content) THEN
  IF NEW.status::text<>'retirado' AND (private.gx_document_other_evidence_current_v1(NEW.client_id,NEW.content) IS DISTINCT FROM true OR NEW.report_type IS DISTINCT FROM NEW.content->>'reportType')
  THEN RAISE EXCEPTION 'GX_REPORT_EVIDENCE_STALE_OR_FORGED' USING ERRCODE='40001'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.status::text='retirado' THEN RETURN NEW; END IF;$p$;
 b:=' IF NEW.status::text=''retirado'' THEN RETURN NEW; END IF;';
 restored:=replace(d,a,b);
 IF md5(restored) IS DISTINCT FROM 'be9f09c1851b5cc3e618fef03aaaa757' THEN RAISE EXCEPTION 'GX_DOCUMENT_ISSUANCE_ROLLBACK_REPORT_DRIFT'; END IF;
 EXECUTE restored;
 d:=pg_get_functiondef('private.iberfit_gx_issuance_write_guard_v1()'::regprocedure);
 a:=$p$ IF private.gx_document_has_external_v1(NEW.source_snapshot) THEN RETURN NEW; END IF;
 IF NOT private.iberfit_gx_report_body_has_refs_v1(NEW.source_snapshot) THEN RETURN NEW; END IF;$p$;
 b:=' IF NOT private.iberfit_gx_report_body_has_refs_v1(NEW.source_snapshot) THEN RETURN NEW; END IF;';
 restored:=replace(d,a,b);
 IF md5(restored) IS DISTINCT FROM '4644f631db0575fffcb5c66198e217cf' THEN RAISE EXCEPTION 'GX_DOCUMENT_ISSUANCE_ROLLBACK_LEDGER_DRIFT'; END IF;
 EXECUTE restored;
END $rollback$;
DROP TRIGGER zz_gx_document_issuance_write_v1 ON public.iberfit_evolution_report_issuances_v1;
DROP FUNCTION private.gx_document_issuance_write_v1() RESTRICT;
COMMIT;
