-- GX319: recovery by exact operation reference. Install after GX299 + GX315.
-- Read-only, caller's RLS, no extra tables or indexes, no bootstrap request.
CREATE FUNCTION public.iberfit_gx_followup_detail_v1(p_client_id uuid,p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE e public.m26_client_measurements_v43%ROWTYPE;
 o public.m26_client_measurements_v43%ROWTYPE; v public.m26_client_measurements_v43%ROWTYPE;
 target_id uuid; has_void boolean:=false; event_kind text;
BEGIN
 IF current_user<>'authenticated' OR p_client_id IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client_id) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'GX_FOLLOWUP_COACH_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_operation_id IS NULL THEN RAISE EXCEPTION 'GX_FOLLOWUP_DETAIL_INVALID' USING ERRCODE='22023'; END IF;
 SELECT m.* INTO e FROM public.m26_client_measurements_v43 m
 WHERE m.id=p_operation_id AND m.client_id=p_client_id AND m.created_by=(SELECT auth.uid()) AND m.metric IN ('gx_followup_v1','gx_followup_void_v1');
 -- Indistinguishable missing/foreign operation for an otherwise authorized client.
 IF NOT FOUND THEN RAISE EXCEPTION 'GX_FOLLOWUP_DETAIL_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 IF e.metric='gx_followup_v1' THEN
  event_kind:='record';target_id:=e.id;
 ELSE
  event_kind:='void';
  IF private.iberfit_gx_followup_void_valid_v1(e.metadata) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_FOLLOWUP_DETAIL_INTEGRITY_INVALID'; END IF;
  target_id:=(e.metadata->>'targetId')::uuid;
  IF target_id=e.id THEN RAISE EXCEPTION 'GX_FOLLOWUP_DETAIL_INTEGRITY_INVALID'; END IF;
 END IF;
 SELECT m.* INTO o FROM public.m26_client_measurements_v43 m WHERE m.id=target_id AND m.client_id=p_client_id AND m.metric='gx_followup_v1';
 IF NOT FOUND OR o.revision IS DISTINCT FROM 1 OR o.source IS DISTINCT FROM 'manual' OR o.notes IS NOT NULL OR o.created_at IS NULL OR o.measured_at IS NULL OR o.created_at<o.measured_at OR o.created_at>now() OR private.iberfit_gx_followup_valid_v1(o.metadata,o.value,o.unit) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'GX_FOLLOWUP_DETAIL_INTEGRITY_INVALID';
 END IF;
 SELECT m.* INTO v FROM public.m26_client_measurements_v43 m
 WHERE m.client_id=p_client_id AND m.metric='gx_followup_void_v1' AND m.metadata->>'targetId'=target_id::text;
 has_void:=FOUND;
 IF has_void AND (v.id=o.id OR v.revision IS DISTINCT FROM 1 OR v.source IS DISTINCT FROM 'manual' OR v.notes IS NOT NULL OR v.value IS DISTINCT FROM 0 OR v.unit IS DISTINCT FROM 'event' OR v.created_at IS NULL OR v.created_at<o.created_at OR v.created_at>now() OR v.measured_at IS DISTINCT FROM o.measured_at OR private.iberfit_gx_followup_void_valid_v1(v.metadata) IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'GX_FOLLOWUP_DETAIL_INTEGRITY_INVALID';
 END IF;
 IF event_kind='void' AND (NOT has_void OR v.id IS DISTINCT FROM e.id OR v.created_at IS DISTINCT FROM e.created_at) THEN RAISE EXCEPTION 'GX_FOLLOWUP_DETAIL_INTEGRITY_INVALID'; END IF;
 RETURN jsonb_build_object('ok',true,'clientId',p_client_id,'operationId',e.id,'kind',event_kind,'createdAt',e.created_at,'observation',jsonb_build_object('id',o.id,'clientId',o.client_id,'measuredAt',o.measured_at,'value',o.value,'unit',o.unit,'revision',o.revision,'protocol',o.metadata,'rectification',CASE WHEN has_void THEN jsonb_build_object('id',v.id,'targetId',o.id,'reason',v.metadata->>'reason','voidedAt',v.created_at) ELSE NULL END));
END $f$;
REVOKE ALL ON FUNCTION public.iberfit_gx_followup_detail_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_gx_followup_detail_v1(uuid,uuid) TO authenticated;
