-- M44 privacy-preserving document history. No public Storage paths exposed.
-- Companion migration for issue/withdraw/recovery, not a deployment instruction.
CREATE OR REPLACE FUNCTION public.iberfit_m44_report_issued_pdf_history_v1(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid:=auth.uid();
 v_role text:=public.iberfit_current_role_v26();
 v_report public.reports%rowtype;
 v_manager boolean:=false;
 v_client boolean:=false;
 v_items jsonb;
BEGIN
 IF v_actor IS NULL OR p_report_id IS NULL
 THEN RAISE EXCEPTION 'M44_PDF_HISTORY_NOT_AUTHORIZED' USING errcode='42501';END IF;
 SELECT * INTO v_report FROM public.reports WHERE id=p_report_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'M44_PDF_HISTORY_NOT_FOUND' USING errcode='42501';END IF;
 v_manager:=coalesce(v_role,'') IN ('coach','admin')
   AND coalesce(public.iberfit_can_access_client_v26(v_report.client_id),false)
   AND (v_role<>'coach' OR coalesce(public.is_assigned_coach(v_report.client_id),false));
 v_client:=v_role='cliente'
   AND public.iberfit_client_id() IS NOT DISTINCT FROM v_report.client_id
   AND v_report.status='publicado' AND v_report.audience='cliente';
 IF NOT (v_manager OR v_client)
 THEN RAISE EXCEPTION 'M44_PDF_HISTORY_SCOPE_FORBIDDEN' USING errcode='42501';END IF;
 SELECT coalesce(jsonb_agg(issued.payload ORDER BY issued.version DESC),'[]'::jsonb)
 INTO v_items FROM (
   SELECT i.version, jsonb_build_object(
     'issuanceId',i.id,'version',i.version,
     'issuedAt',i.issued_at,
     'withdrawn',i.status='withdrawn',
     'withdrawnAt',case when v_manager then i.withdrawn_at else null end,
     'withdrawnReason',case when v_manager then i.withdrawn_reason else null end,
     'artifactSha256',i.artifact_sha256
   ) AS payload
   FROM public.iberfit_evolution_report_issuances_v1 i
   WHERE i.report_id=p_report_id
     AND (v_manager OR i.status='issued')
   ORDER BY i.version DESC LIMIT 20
 ) AS issued;
 RETURN jsonb_build_object('ok',true,'reportId',p_report_id,
   'manager',v_manager,'items',v_items);
END $fn$;
REVOKE ALL ON FUNCTION public.iberfit_m44_report_issued_pdf_history_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_report_issued_pdf_history_v1(uuid) TO authenticated;
