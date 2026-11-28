-- Independent closed-stage hardening: no authorization of Connected360.
-- The source-evidence trigger covers inserts, not the idempotent retry path.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $install$
DECLARE d text; old text:=$anchor$ SELECT * INTO v_prev FROM public.iberfit_evolution_report_issuances_v1$anchor$; extra text:=$guard$ -- Revalidate BEFORE either the existing issuance return or a new insertion.
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
 IF to_regprocedure('private.gx_document_has_external_v1(jsonb)') IS NULL
 OR to_regprocedure('private.iberfit_gx_report_body_has_refs_v1(jsonb)') IS NULL
 OR to_regprocedure('private.iberfit_gx_report_body_current_v1(uuid,jsonb)') IS NULL
 OR (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR NOT has_function_privilege('service_role','public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'GX_DOCUMENT_FINALIZE_PREREQUISITES'; END IF;
 d:=pg_get_functiondef('public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)'::regprocedure);
 IF md5(d) IS DISTINCT FROM 'e7956fc7a0bb237082f10743e6492f36' OR length(d)-length(replace(d,old,''))<>length(old)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_FINALIZE_DRIFT'; END IF;
 EXECUTE replace(d,old,extra||old);
END $install$;
COMMIT;
