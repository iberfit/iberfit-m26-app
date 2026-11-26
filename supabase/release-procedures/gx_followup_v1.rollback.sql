-- Never remove protective fences after evidence exists. Forward-fix instead.
DO $rollback$
BEGIN
 IF EXISTS(SELECT 1 FROM public.m26_client_measurements_v43 WHERE left(metric,12)='gx_followup_') THEN RAISE EXCEPTION 'GX_FOLLOWUP_ROLLBACK_REFUSED_EVIDENCE_EXISTS'; END IF;
END $rollback$;
DROP FUNCTION public.iberfit_gx_followup_void_v1(uuid,uuid,uuid,text);
DROP FUNCTION public.iberfit_gx_followup_list_v1(uuid,integer,timestamptz,uuid);
DROP FUNCTION public.iberfit_gx_followup_record_v1(uuid,uuid,timestamptz,numeric,text,jsonb);
DROP TRIGGER iberfit_gx_followup_guard_v1 ON public.m26_client_measurements_v43;
DROP POLICY iberfit_gx_followup_read_v1 ON public.m26_client_measurements_v43;
DROP POLICY iberfit_gx_followup_update_v1 ON public.m26_client_measurements_v43;
DROP POLICY iberfit_gx_followup_delete_v1 ON public.m26_client_measurements_v43;
DROP FUNCTION private.iberfit_gx_followup_guard_v1();
DROP INDEX public.iberfit_gx_followup_void_target_uq;
DROP FUNCTION private.iberfit_gx_followup_void_valid_v1(jsonb);
DROP FUNCTION private.iberfit_gx_followup_can_coach_v1(uuid);
DROP FUNCTION private.iberfit_gx_followup_valid_v1(jsonb,numeric,text);
DROP FUNCTION private.iberfit_gx_followup_shape_v1(jsonb,text[]);
DROP FUNCTION private.iberfit_gx_followup_number_v1(jsonb,numeric,numeric,boolean);
DROP FUNCTION private.iberfit_gx_followup_text_v1(jsonb,integer,boolean);
