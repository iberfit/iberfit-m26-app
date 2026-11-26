-- Install only AFTER certified GX299 follow-up, in same controlled backend release.
-- No new tables, indexes, privileges on tables, writes, polling or bypass of RLS.
CREATE FUNCTION public.iberfit_gx_followup_recent_v1(p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE r public.m26_client_measurements_v43%ROWTYPE; items jsonb:='[]'::jsonb; target_id uuid;
BEGIN
 IF p_client_id IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_FOLLOWUP_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 FOR r IN SELECT m.* FROM public.m26_client_measurements_v43 m
  WHERE m.client_id=p_client_id AND m.created_by=(SELECT auth.uid()) AND m.metric IN ('gx_followup_v1','gx_followup_void_v1')
  ORDER BY m.created_at DESC,m.id DESC LIMIT 10 LOOP
  IF r.revision IS DISTINCT FROM 1 OR r.source IS DISTINCT FROM 'manual' OR r.notes IS NOT NULL OR r.created_at IS NULL OR r.measured_at IS NULL OR r.created_at<r.measured_at OR r.created_at>now() THEN RAISE EXCEPTION 'GX_FOLLOWUP_RECENT_INTEGRITY_INVALID'; END IF;
  target_id:=NULL;
  IF r.metric='gx_followup_v1' THEN
   IF private.iberfit_gx_followup_valid_v1(r.metadata,r.value,r.unit) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_FOLLOWUP_RECENT_INTEGRITY_INVALID'; END IF;
  ELSE
   IF private.iberfit_gx_followup_void_valid_v1(r.metadata) IS DISTINCT FROM true OR r.value IS DISTINCT FROM 0 OR r.unit IS DISTINCT FROM 'event' THEN RAISE EXCEPTION 'GX_FOLLOWUP_RECENT_INTEGRITY_INVALID'; END IF;
   target_id:=(r.metadata->>'targetId')::uuid;
   IF target_id=r.id THEN RAISE EXCEPTION 'GX_FOLLOWUP_RECENT_INTEGRITY_INVALID'; END IF;
  END IF;
  items:=items||jsonb_build_array(jsonb_build_object('id',r.id,'kind',CASE WHEN r.metric='gx_followup_v1' THEN 'record' ELSE 'void' END,'createdAt',r.created_at,'measuredAt',r.measured_at,'targetId',target_id));
 END LOOP;
 RETURN jsonb_build_object('ok',true,'clientId',p_client_id,'items',items);
END $f$;
REVOKE ALL ON FUNCTION public.iberfit_gx_followup_recent_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_gx_followup_recent_v1(uuid) TO authenticated;
