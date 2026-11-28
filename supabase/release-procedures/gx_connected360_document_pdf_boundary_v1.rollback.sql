-- Restore the exact closed-stage definitions, never delete material or history.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR EXISTS(SELECT 1 FROM public.reports WHERE private.gx_document_has_external_v1(content))
 OR EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 WHERE private.gx_document_has_external_v1(source_snapshot))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ROLLBACK_REQUIRES_CLOSED_EMPTY_FENCE'; END IF;
END $guard$;
DO $patch$
DECLARE d text; prior text; replacement text; baseline text; restored text;
BEGIN
 d:=pg_get_functiondef('public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'::regprocedure);
 prior:=$anchor$(CASE WHEN private.gx_document_has_external_v1(prepared->'sourceSnapshot') THEN private.gx_document_pdf_user_current_v1(p_report_id,(prepared->>'clientId')::uuid,(prepared->>'sourceRevision')::bigint,prepared->'sourceSnapshot') ELSE private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot') END)$anchor$;
 replacement:=$replacement$(CASE WHEN private.gx_document_has_external_v1(prepared->'sourceSnapshot') THEN private.gx_document_read_visible_v1(p_report_id,(prepared->>'clientId')::uuid,prepared->'sourceSnapshot') ELSE private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot') END)$replacement$;
 baseline:=$baseline$private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot')$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(restored,$verify$(CASE WHEN private.gx_document_has_external_v1(prepared->'sourceSnapshot') THEN private.gx_document_read_visible_v1(p_report_id,(prepared->>'clientId')::uuid,prepared->'sourceSnapshot') ELSE private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot') END)$verify$,baseline)) IS DISTINCT FROM '61b5ec624800951afd06bfbe2e635490' THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_DEFINITION_DRIFT: public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'; END IF;
 EXECUTE restored;
 d:=pg_get_functiondef('public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'::regprocedure);
 prior:=$anchor$(CASE WHEN private.gx_document_has_external_v1(snapshot) THEN EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 i WHERE i.id=p_issuance_id AND i.status='issued' AND private.gx_document_pdf_user_current_v1(i.report_id,i.client_id,i.report_revision,i.source_snapshot) IS TRUE) ELSE private.iberfit_gx_report_body_current_v1(v_client,snapshot) END)$anchor$;
 replacement:=$replacement$(CASE WHEN private.gx_document_has_external_v1(snapshot) THEN private.gx_document_read_visible_v1((result->>'reportId')::uuid,v_client,snapshot) ELSE private.iberfit_gx_report_body_current_v1(v_client,snapshot) END)$replacement$;
 baseline:=$baseline$private.iberfit_gx_report_body_current_v1(v_client,snapshot)$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(restored,$verify$(CASE WHEN private.gx_document_has_external_v1(snapshot) THEN private.gx_document_read_visible_v1((result->>'reportId')::uuid,v_client,snapshot) ELSE private.iberfit_gx_report_body_current_v1(v_client,snapshot) END)$verify$,baseline)) IS DISTINCT FROM 'fc964fabfd797e0a5cd1a8ed3aeb9aee' THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_DEFINITION_DRIFT: public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'; END IF;
 EXECUTE restored;
 d:=pg_get_functiondef('private.iberfit_gx_report_client_visible_v1(uuid,uuid)'::regprocedure);
 prior:=$anchor$RETURN CASE WHEN private.gx_document_has_external_v1(body) THEN private.gx_document_read_visible_v1(p_report,p_client,body) ELSE private.iberfit_gx_report_body_current_v1(p_client,body) END;$anchor$;
 replacement:=$replacement$RETURN private.iberfit_gx_report_body_current_v1(p_client,body);$replacement$;
 baseline:=$baseline$RETURN private.iberfit_gx_report_body_current_v1(p_client,body);$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: private.iberfit_gx_report_client_visible_v1(uuid,uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(restored,$verify$RETURN private.iberfit_gx_report_body_current_v1(p_client,body);$verify$,baseline)) IS DISTINCT FROM 'eb121f1c28f23159cff090bdf0a07590' THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_DEFINITION_DRIFT: private.iberfit_gx_report_client_visible_v1(uuid,uuid)'; END IF;
 EXECUTE restored;
 d:=pg_get_functiondef('public.iberfit_m44_report_issued_pdf_history_impl_v1(uuid)'::regprocedure);
 prior:=$anchor$AND (v_manager OR i.status='issued')
     AND (NOT private.gx_document_has_external_v1(i.source_snapshot) OR (i.status='issued' AND private.gx_document_pdf_user_current_v1(i.report_id,i.client_id,i.report_revision,i.source_snapshot) IS TRUE))$anchor$;
 replacement:=$replacement$AND (v_manager OR i.status='issued')$replacement$;
 baseline:=$baseline$AND (v_manager OR i.status='issued')$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: public.iberfit_m44_report_issued_pdf_history_impl_v1(uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(restored,$verify$AND (v_manager OR i.status='issued')$verify$,baseline)) IS DISTINCT FROM 'be55660cd727affe245c5d7b9f8719f4' THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_DEFINITION_DRIFT: public.iberfit_m44_report_issued_pdf_history_impl_v1(uuid)'; END IF;
 EXECUTE restored;
 d:=pg_get_functiondef('public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)'::regprocedure);
 prior:=$anchor$ -- Revalidate BEFORE either the existing issuance return or a new insertion.
 IF private.gx_document_has_external_v1(v_report.content) OR private.gx_document_has_external_v1(v_source) THEN
  IF private.gx_document_pdf_service_lock_v1(v_report.id,v_report.client_id,p_source_revision,v_source,v_actor) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'GX_DOCUMENT_FINALIZE_EXTERNAL_STALE' USING ERRCODE='40001'; END IF;
 ELSIF private.iberfit_gx_report_body_has_refs_v1(v_source) THEN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  THEN RAISE EXCEPTION 'GX_REPORT_ISOLATION_REQUIRED' USING ERRCODE='40001'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(1781042601,pg_catalog.hashtext(v_report.client_id::text));
  IF private.iberfit_gx_report_body_current_v1(v_report.client_id,v_source) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'M44_PDF_SOURCE_EVIDENCE_STALE' USING ERRCODE='40001'; END IF;
 END IF;
$anchor$;
 replacement:=$replacement$ -- Revalidate BEFORE either the existing issuance return or a new insertion.
 IF private.gx_document_has_external_v1(v_report.content) OR private.gx_document_has_external_v1(v_source)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_FINALIZE_EXTERNAL_CLOSED' USING ERRCODE='40001'; END IF;
 IF private.iberfit_gx_report_body_has_refs_v1(v_source) THEN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  THEN RAISE EXCEPTION 'GX_REPORT_ISOLATION_REQUIRED' USING ERRCODE='40001'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(1781042601,pg_catalog.hashtext(v_report.client_id::text));
  IF private.iberfit_gx_report_body_current_v1(v_report.client_id,v_source) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'M44_PDF_SOURCE_EVIDENCE_STALE' USING ERRCODE='40001'; END IF;
 END IF;
$replacement$;
 baseline:=$baseline$$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(restored,$verify$ -- Revalidate BEFORE either the existing issuance return or a new insertion.
 IF private.gx_document_has_external_v1(v_report.content) OR private.gx_document_has_external_v1(v_source)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_FINALIZE_EXTERNAL_CLOSED' USING ERRCODE='40001'; END IF;
 IF private.iberfit_gx_report_body_has_refs_v1(v_source) THEN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  THEN RAISE EXCEPTION 'GX_REPORT_ISOLATION_REQUIRED' USING ERRCODE='40001'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(1781042601,pg_catalog.hashtext(v_report.client_id::text));
  IF private.iberfit_gx_report_body_current_v1(v_report.client_id,v_source) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'M44_PDF_SOURCE_EVIDENCE_STALE' USING ERRCODE='40001'; END IF;
 END IF;
$verify$,baseline)) IS DISTINCT FROM 'e7956fc7a0bb237082f10743e6492f36' THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_DEFINITION_DRIFT: public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)'; END IF;
 EXECUTE restored;
END $patch$;
DROP FUNCTION private.gx_document_pdf_service_lock_v1(uuid,uuid,bigint,jsonb,uuid) RESTRICT;
DROP FUNCTION private.gx_document_pdf_user_current_v1(uuid,uuid,bigint,jsonb) RESTRICT;
DROP FUNCTION private.gx_document_pdf_snapshot_current_v1(uuid,uuid,bigint,jsonb) RESTRICT;
COMMIT;
