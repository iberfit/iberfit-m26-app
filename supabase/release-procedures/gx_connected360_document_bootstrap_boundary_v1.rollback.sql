-- Only empty closed-stage rollback. Never hide the absence of the read gate.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.domain_entities_v26,public.reports,public.iberfit_evolution_report_issuances_v1 IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE d text; restored text; a text; b text;
BEGIN
 IF (SELECT count(*) FROM pg_constraint WHERE contype='c' AND convalidated AND ((conrelid='public.domain_entities_v26'::regclass AND conname='gx_document_canonical_closed_v1') OR (conrelid='public.reports'::regclass AND conname='gx_document_projected_closed_v1') OR (conrelid='public.iberfit_evolution_report_issuances_v1'::regclass AND conname='gx_document_issuance_closed_v1')))<>3
 OR EXISTS(SELECT 1 FROM public.reports WHERE private.gx_document_has_external_v1(content)) OR EXISTS(SELECT 1 FROM public.domain_entities_v26 WHERE entity_type='report' AND private.gx_document_has_external_v1(body)) THEN RAISE EXCEPTION 'GX_DOCUMENT_BOOTSTRAP_ROLLBACK_REQUIRES_EMPTY_CLOSED_FENCE'; END IF;
 d:=pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure);
 a:='  return private.gx_document_bootstrap_filter_v1(v_payload);';b:='  return v_payload;';restored:=replace(d,a,b);
 IF md5(restored) NOT IN ('e460264e965db3688709101bc30e10fa','aedea9df3d4986496626e10318628c41') OR d=restored THEN RAISE EXCEPTION 'GX_DOCUMENT_BOOTSTRAP_ROLLBACK_DRIFT'; END IF;
 EXECUTE restored;
 IF to_regprocedure('public.iberfit_bootstrap_v26_core_u37_qa()') IS NOT NULL AND has_function_privilege('authenticated','public.iberfit_bootstrap_v26_core_u37_qa()','EXECUTE') THEN
  d:=pg_get_functiondef('public.iberfit_bootstrap_v26_core_u37_qa()'::regprocedure);
  a:='  RETURN private.gx_document_bootstrap_filter_v1(private.iberfit_bootstrap_v26_full_core_internal_u37_qa());';b:='  RETURN private.iberfit_bootstrap_v26_full_core_internal_u37_qa();';restored:=replace(d,a,b);
  IF md5(restored) IS DISTINCT FROM 'e1ff01e23ee9d40e818a2dba320c3ae1' OR d=restored THEN RAISE EXCEPTION 'GX_DOCUMENT_BOOTSTRAP_CORE_ROLLBACK_DRIFT'; END IF;
  EXECUTE restored;
 END IF;
END $rollback$;
DROP FUNCTION private.gx_document_bootstrap_filter_v1(jsonb) RESTRICT;
DROP FUNCTION private.gx_document_bootstrap_row_current_v1(jsonb,boolean) RESTRICT;
COMMIT;
