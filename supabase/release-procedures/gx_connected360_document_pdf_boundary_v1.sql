-- Staged PDF and client-read boundary. Keep all three closed CHECKs; no API activation.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$ BEGIN
 IF to_regprocedure('private.gx_document_read_visible_v1(uuid,uuid,jsonb)') IS NULL
 OR to_regprocedure('private.gx_document_published_pair_current_v1(uuid,uuid,jsonb)') IS NULL
 OR to_regprocedure('private.gx_document_publication_lock_v1(uuid,uuid,jsonb)') IS NULL
 OR to_regclass('private.gx_document_write_permit_v1') IS NULL
 OR (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR md5(pg_get_functiondef('public.iberfit_m44_private_issued_source_v1(uuid)'::regprocedure)) IS DISTINCT FROM 'b66cd77c9ce6ca14ac7e0c657c868400'
 OR md5(pg_get_functiondef('public.iberfit_m44_authorize_evolution_report_pdf_impl_v1(uuid)'::regprocedure)) IS DISTINCT FROM '20905b9ce3b66878ca1832842b073e68'
 OR md5(pg_get_functiondef('public.iberfit_m44_prepare_evolution_report_issue_impl_v1(uuid)'::regprocedure)) IS DISTINCT FROM '1e6722a48ed7b38f333d181dafa7f0a3'
 OR NOT has_function_privilege('service_role','public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)','EXECUTE')
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolbypassrls OR rolsuper))
 THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_PREREQUISITES'; END IF;
END $preflight$;
-- Exact current published snapshot, independently of the caller's role.
-- The immutable ledger is retained, but a stale revision or changed source is
-- not a current authorization to retrieve external material.
CREATE FUNCTION private.gx_document_pdf_snapshot_current_v1(p_report uuid,p_client uuid,p_revision bigint,p_source jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
BEGIN
 IF NOT private.gx_document_has_external_v1(p_source)
 OR p_revision IS NULL OR p_source->>'revision' IS DISTINCT FROM p_revision::text
 OR NOT EXISTS(SELECT 1 FROM public.reports r WHERE r.id=p_report AND r.client_id=p_client AND r.revision=p_revision AND r.status::text='publicado' AND r.audience='cliente')
 OR private.gx_document_publication_current_v1(p_report,p_client,p_source) IS DISTINCT FROM true
 OR private.gx_document_published_pair_current_v1(p_report,p_client,p_source) IS DISTINCT FROM true
 OR private.gx_document_other_evidence_current_v1(p_client,p_source) IS DISTINCT FROM true
 THEN RETURN false; END IF;
 RETURN public.iberfit_m44_private_issued_source_v1(p_report) IS NOT DISTINCT FROM p_source;
EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN RETURN false;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_pdf_snapshot_current_v1(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.gx_document_pdf_user_current_v1(p_report uuid,p_client uuid,p_revision bigint,p_source jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.gx_document_read_visible_v1(p_report,p_client,p_source) IS TRUE
 AND private.gx_document_pdf_snapshot_current_v1(p_report,p_client,p_revision,p_source) IS TRUE
$f$;
REVOKE ALL ON FUNCTION private.gx_document_pdf_user_current_v1(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
-- The finalizer is service-only. It has the verified actor from the Edge
-- broker, not a user JWT. Recheck original Coach identity and current proof
-- under the same consent lock as canonical publication; never impersonate a JWT.
-- The existing broker also repeats user-scoped prepare immediately before finalizing.
CREATE FUNCTION private.gx_document_pdf_service_lock_v1(p_report uuid,p_client uuid,p_revision bigint,p_source jsonb,p_actor uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role'
 OR current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
 OR p_actor IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.reports r JOIN public.user_profiles p ON p.user_id=p_actor AND p.role::text='coach'
 WHERE r.id=p_report AND r.client_id=p_client AND r.created_by=p_actor AND r.revision=p_revision AND r.status::text='publicado' AND r.audience='cliente')
 OR NOT EXISTS(SELECT 1 FROM public.user_application_roles a WHERE a.user_id=p_actor AND a.active AND a.role::text='coach')
 OR EXISTS(SELECT 1 FROM public.user_application_roles a WHERE a.user_id=p_actor AND a.active AND a.role::text='admin')
 THEN RETURN false; END IF;
 IF private.gx_document_publication_lock_v1(p_report,p_client,p_source) IS DISTINCT FROM true THEN RETURN false; END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(1781042601,pg_catalog.hashtext(p_client::text)) THEN RETURN false; END IF;
 RETURN private.gx_document_pdf_snapshot_current_v1(p_report,p_client,p_revision,p_source) IS TRUE;
END $f$;
REVOKE ALL ON FUNCTION private.gx_document_pdf_service_lock_v1(uuid,uuid,bigint,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $patch$
DECLARE d text; prior text; replacement text; baseline text; restored text;
BEGIN
 d:=pg_get_functiondef('public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'::regprocedure);
 prior:=$anchor$(CASE WHEN private.gx_document_has_external_v1(prepared->'sourceSnapshot') THEN private.gx_document_read_visible_v1(p_report_id,(prepared->>'clientId')::uuid,prepared->'sourceSnapshot') ELSE private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot') END)$anchor$;
 replacement:=$replacement$(CASE WHEN private.gx_document_has_external_v1(prepared->'sourceSnapshot') THEN private.gx_document_pdf_user_current_v1(p_report_id,(prepared->>'clientId')::uuid,(prepared->>'sourceRevision')::bigint,prepared->'sourceSnapshot') ELSE private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot') END)$replacement$;
 baseline:=$baseline$private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot')$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(d,$verify$(CASE WHEN private.gx_document_has_external_v1(prepared->'sourceSnapshot') THEN private.gx_document_read_visible_v1(p_report_id,(prepared->>'clientId')::uuid,prepared->'sourceSnapshot') ELSE private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot') END)$verify$,baseline)) IS DISTINCT FROM '61b5ec624800951afd06bfbe2e635490' THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_DEFINITION_DRIFT: public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'; END IF;
 EXECUTE restored;
 d:=pg_get_functiondef('public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'::regprocedure);
 prior:=$anchor$(CASE WHEN private.gx_document_has_external_v1(snapshot) THEN private.gx_document_read_visible_v1((result->>'reportId')::uuid,v_client,snapshot) ELSE private.iberfit_gx_report_body_current_v1(v_client,snapshot) END)$anchor$;
 replacement:=$replacement$(CASE WHEN private.gx_document_has_external_v1(snapshot) THEN EXISTS(SELECT 1 FROM public.iberfit_evolution_report_issuances_v1 i WHERE i.id=p_issuance_id AND i.status='issued' AND private.gx_document_pdf_user_current_v1(i.report_id,i.client_id,i.report_revision,i.source_snapshot) IS TRUE) ELSE private.iberfit_gx_report_body_current_v1(v_client,snapshot) END)$replacement$;
 baseline:=$baseline$private.iberfit_gx_report_body_current_v1(v_client,snapshot)$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(d,$verify$(CASE WHEN private.gx_document_has_external_v1(snapshot) THEN private.gx_document_read_visible_v1((result->>'reportId')::uuid,v_client,snapshot) ELSE private.iberfit_gx_report_body_current_v1(v_client,snapshot) END)$verify$,baseline)) IS DISTINCT FROM 'fc964fabfd797e0a5cd1a8ed3aeb9aee' THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_DEFINITION_DRIFT: public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'; END IF;
 EXECUTE restored;
 d:=pg_get_functiondef('private.iberfit_gx_report_client_visible_v1(uuid,uuid)'::regprocedure);
 prior:=$anchor$RETURN private.iberfit_gx_report_body_current_v1(p_client,body);$anchor$;
 replacement:=$replacement$RETURN CASE WHEN private.gx_document_has_external_v1(body) THEN private.gx_document_read_visible_v1(p_report,p_client,body) ELSE private.iberfit_gx_report_body_current_v1(p_client,body) END;$replacement$;
 baseline:=$baseline$RETURN private.iberfit_gx_report_body_current_v1(p_client,body);$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: private.iberfit_gx_report_client_visible_v1(uuid,uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(d,$verify$RETURN private.iberfit_gx_report_body_current_v1(p_client,body);$verify$,baseline)) IS DISTINCT FROM 'eb121f1c28f23159cff090bdf0a07590' THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_DEFINITION_DRIFT: private.iberfit_gx_report_client_visible_v1(uuid,uuid)'; END IF;
 EXECUTE restored;
 d:=pg_get_functiondef('public.iberfit_m44_report_issued_pdf_history_impl_v1(uuid)'::regprocedure);
 prior:=$anchor$AND (v_manager OR i.status='issued')$anchor$;
 replacement:=$replacement$AND (v_manager OR i.status='issued')
     AND (NOT private.gx_document_has_external_v1(i.source_snapshot) OR (i.status='issued' AND private.gx_document_pdf_user_current_v1(i.report_id,i.client_id,i.report_revision,i.source_snapshot) IS TRUE))$replacement$;
 baseline:=$baseline$AND (v_manager OR i.status='issued')$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: public.iberfit_m44_report_issued_pdf_history_impl_v1(uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(d,$verify$AND (v_manager OR i.status='issued')$verify$,baseline)) IS DISTINCT FROM 'be55660cd727affe245c5d7b9f8719f4' THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_DEFINITION_DRIFT: public.iberfit_m44_report_issued_pdf_history_impl_v1(uuid)'; END IF;
 EXECUTE restored;
 d:=pg_get_functiondef('public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)'::regprocedure);
 prior:=$anchor$ -- Revalidate BEFORE either the existing issuance return or a new insertion.
 IF private.gx_document_has_external_v1(v_report.content) OR private.gx_document_has_external_v1(v_source)
 THEN RAISE EXCEPTION 'GX_DOCUMENT_FINALIZE_EXTERNAL_CLOSED' USING ERRCODE='40001'; END IF;
 IF private.iberfit_gx_report_body_has_refs_v1(v_source) THEN
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed'
  THEN RAISE EXCEPTION 'GX_REPORT_ISOLATION_REQUIRED' USING ERRCODE='40001'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(1781042601,pg_catalog.hashtext(v_report.client_id::text));
  IF private.iberfit_gx_report_body_current_v1(v_report.client_id,v_source) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'M44_PDF_SOURCE_EVIDENCE_STALE' USING ERRCODE='40001'; END IF;
 END IF;
$anchor$;
 replacement:=$replacement$ -- Revalidate BEFORE either the existing issuance return or a new insertion.
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
$replacement$;
 baseline:=$baseline$$baseline$;
 IF length(d)-length(replace(d,prior,''))<>length(prior) THEN RAISE EXCEPTION 'GX_DOCUMENT_PDF_ANCHOR_DRIFT: public.iberfit_m44_finalize_evolution_report_issue_v1(uuid,uuid,bigint,text,text,text,bigint,text,text,uuid)'; END IF;
 restored:=replace(d,prior,replacement);
 IF md5(replace(d,$verify$ -- Revalidate BEFORE either the existing issuance return or a new insertion.
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
-- Existing GX326 issuance guard and all CHECKs remain closed.
COMMIT;
