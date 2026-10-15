-- One canonical withdrawal audit event, atomically with the immutable PDF ledger.
-- Depends on the M44 base issuance migration. Existing grants are retained.
CREATE OR REPLACE FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(
 p_issuance_id uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor uuid:=auth.uid();v_role text:=public.iberfit_current_role_v26();
 v_issue public.iberfit_evolution_report_issuances_v1%rowtype;
BEGIN
 IF v_actor IS NULL OR coalesce(v_role,'') NOT IN ('coach','admin')
   OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 500
 THEN RAISE EXCEPTION 'M44_PDF_WITHDRAW_INVALID_ROLE_OR_REASON' USING errcode='42501';END IF;
 SELECT * INTO v_issue FROM public.iberfit_evolution_report_issuances_v1
   WHERE id=p_issuance_id FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(public.iberfit_can_access_client_v26(v_issue.client_id),false)
   OR (v_role='coach' AND NOT coalesce(public.is_assigned_coach(v_issue.client_id),false))
 THEN RAISE EXCEPTION 'M44_PDF_WITHDRAW_SCOPE_FORBIDDEN' USING errcode='42501';END IF;
 IF v_issue.status='withdrawn' THEN
  RETURN jsonb_build_object('ok',true,'kind','already-withdrawn','issuanceId',v_issue.id);
 END IF;
 UPDATE public.iberfit_evolution_report_issuances_v1
 SET status='withdrawn',withdrawn_at=now(),withdrawn_by=v_actor,withdrawn_reason=btrim(p_reason)
 WHERE id=p_issuance_id;
 -- Append the same withdrawal to the canonical command/audit timeline.
 -- This is in the same SQL transaction as the immutable ledger update.
 -- Concurrent retries wait on FOR UPDATE; already-withdrawn exits above.
 INSERT INTO public.domain_events_v26(
   operation_id,command_type,entity_type,entity_id,client_id,
   actor_user_id,actor_role,phase,from_status,to_status,
   base_revision,remote_revision,reason,details
 ) VALUES (
   gen_random_uuid(),'INFORME_PDF_RETIRAR_M44','report',
   v_issue.report_id,v_issue.client_id,v_actor,v_role,'applied',
   'issued','withdrawn',v_issue.report_revision,v_issue.report_revision,
   btrim(p_reason),jsonb_build_object(
     'issuanceId',v_issue.id,'reportRevision',v_issue.report_revision,
     'version',v_issue.version,'artifactSha256',v_issue.artifact_sha256
   )
 );
 RETURN jsonb_build_object('ok',true,'kind','withdrawn','issuanceId',v_issue.id);
END $fn$;
REVOKE ALL ON FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iberfit_m44_withdraw_evolution_report_pdf_v1(uuid,text) TO authenticated;
