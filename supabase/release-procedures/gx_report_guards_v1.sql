-- GX326: activate evidence integrity at the existing report/PDF boundaries.
-- Release procedure only; execute after GX326_REPORT_EVIDENCE_INSTALL.
BEGIN;
DO $preflight$ BEGIN
 IF to_regprocedure('private.iberfit_gx_report_body_current_v1(uuid,jsonb)') IS NULL
 OR md5(pg_get_functiondef('public.iberfit_m44_authorize_evolution_report_pdf_v1(uuid)'::regprocedure)) IS DISTINCT FROM '6557e81328b35bb71c7446a3b65d36eb'
 OR md5(pg_get_functiondef('public.iberfit_m44_prepare_evolution_report_issue_v1(uuid)'::regprocedure)) IS DISTINCT FROM 'c91bbed407f6c2e3230b1c64ae9ffa39'
 OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.reports'::regclass AND polname='gx326_client_evidence_current')
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN ('gx326_report_evidence_guard','gx326_issuance_evidence_guard')) THEN
  RAISE EXCEPTION 'GX_REPORT_GUARD_INSTALL_DRIFT';
 END IF;
END $preflight$;
-- Row-independent marker detection contains no private reads.
GRANT EXECUTE ON FUNCTION private.iberfit_gx_report_body_has_refs_v1(jsonb) TO authenticated;
-- Only marked reports take the additional validation path. Preserve historical
-- reports and let explicitly retired reports remain in the administrative ledger.
CREATE FUNCTION private.iberfit_gx_report_write_guard_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE marked boolean:=private.iberfit_gx_report_body_has_refs_v1(NEW.content);
BEGIN
 IF NEW.status::text='retirado' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF private.iberfit_gx_report_body_has_refs_v1(OLD.content) AND NOT marked THEN
   RAISE EXCEPTION 'GX_REPORT_LINEAGE_REMOVAL' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NOT marked THEN RETURN NEW; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'GX_REPORT_ISOLATION_REQUIRED' USING ERRCODE='40001'; END IF;
 -- Same client lock as GX324 publication/withdrawal/void. No new locks on legacy reports.
 PERFORM pg_catalog.pg_advisory_xact_lock(1781042601,pg_catalog.hashtext(NEW.client_id::text));
 IF NEW.report_type IS DISTINCT FROM NEW.content->>'reportType' OR private.iberfit_gx_report_body_current_v1(NEW.client_id,NEW.content) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'GX_REPORT_EVIDENCE_STALE_OR_FORGED' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_report_write_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gx326_report_evidence_guard BEFORE INSERT OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION private.iberfit_gx_report_write_guard_v1();
-- Client SELECT remains subject to the existing permissive ownership rules.
-- Extra restrictive policy applies solely to reports carrying the GX marker.
CREATE POLICY gx326_client_evidence_current ON public.reports AS RESTRICTIVE FOR SELECT TO authenticated USING (
 CASE WHEN public.iberfit_current_role_v26()='cliente' AND private.iberfit_gx_report_body_has_refs_v1(content)
 THEN private.iberfit_gx_report_client_visible_v1(client_id,id) ELSE true END
);
CREATE FUNCTION private.iberfit_gx_issuance_write_guard_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF NOT private.iberfit_gx_report_body_has_refs_v1(NEW.source_snapshot) THEN RETURN NEW; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'GX_REPORT_ISOLATION_REQUIRED' USING ERRCODE='40001'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(1781042601,pg_catalog.hashtext(NEW.client_id::text));
 IF private.iberfit_gx_report_body_current_v1(NEW.client_id,NEW.source_snapshot) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'GX_REPORT_EVIDENCE_STALE_OR_FORGED' USING ERRCODE='40001';
 END IF;
 RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_issuance_write_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gx326_issuance_evidence_guard BEFORE INSERT ON public.iberfit_evolution_report_issuances_v1 FOR EACH ROW EXECUTE FUNCTION private.iberfit_gx_issuance_write_guard_v1();
-- Keep original wrapper authorization and implementation, then check exact source.
-- No privileged actor receives invalidated PDF bytes via the existing authorization RPC.
CREATE OR REPLACE FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE prepared jsonb;
BEGIN
 PERFORM public.iberfit_m44_require_privileged_assurance_v1();
 prepared:=public.iberfit_m44_prepare_evolution_report_issue_impl_v1(p_report_id);
 IF private.iberfit_gx_report_body_current_v1((prepared->>'clientId')::uuid,prepared->'sourceSnapshot') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'M44_PDF_SOURCE_EVIDENCE_STALE' USING ERRCODE='40001';
 END IF;
 RETURN prepared;
END $function$;
CREATE OR REPLACE FUNCTION public.iberfit_m44_authorize_evolution_report_pdf_v1(p_issuance_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE result jsonb; v_client uuid; snapshot jsonb;
BEGIN
 IF public.iberfit_current_role_v26() IN ('coach','admin')
 THEN PERFORM public.iberfit_m44_require_privileged_assurance_v1(); END IF;
 result:=public.iberfit_m44_authorize_evolution_report_pdf_impl_v1(p_issuance_id);
 SELECT client_id,source_snapshot INTO v_client,snapshot FROM public.iberfit_evolution_report_issuances_v1 WHERE id=p_issuance_id;
 IF NOT FOUND OR private.iberfit_gx_report_body_current_v1(v_client,snapshot) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'M44_PDF_SOURCE_EVIDENCE_STALE' USING ERRCODE='40001';
 END IF;
 RETURN result;
END $function$;
COMMIT;
