-- Restore only the exact original definition; keep independent storage fence.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $rollback$
DECLARE d text; original text; old text:=$anchor$ SELECT * INTO v_prev FROM public.iberfit_evolution_report_issuances_v1$anchor$; extra text:=$guard$ -- Revalidate BEFORE either the existing issuance return or a new insertion.
 IF private.gx_document_has_external_v1(v_report.content) OR private.gx_document_has_external_v1(v_source)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_FINALIZE_EXTERNAL_CLOSED' USING ERRCODE='40001'; END IF;
 IF private.iberfit_gx_report_body_has_refs_v1(v_source) THEN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  THEN RAISE EXCEPTION 'GX_REPORT_ISOLATION_REQUIRED' USING ERRCODE='40001'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(1781042601,pg_catalog.hashtext(v_report.client_id::text));
  IF private.iberfit_gx_report_body_current_v1(v_report.client_id,v_source) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'M44_PDF_SOURCE_EVIDENCE_STALE' USING ERRCODE='40001'; END IF;
 END IF;
$guard$;
BEGIN
 d:=pg_get_functiondef('public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)'::regprocedure);
 original:=replace(d,extra||old,old);
 IF length(d)-length(original)<>length(extra) OR md5(original) IS DISTINCT FROM 'e7956fc7a0bb237082f10743e6492f36'
 THEN RAISE EXCEPTION 'GX_DOCUMENT_FINALIZE_ROLLBACK_DRIFT'; END IF;
 EXECUTE original;
END $rollback$;
COMMIT;
