BEGIN;
DROP FUNCTION public.iberfit_gx_report_evidence_v1(uuid,date,date,jsonb);
DROP FUNCTION private.iberfit_gx_report_evidence_v1(uuid,date,date,jsonb);
DROP FUNCTION private.iberfit_gx_report_client_visible_v1(uuid,uuid);
DROP FUNCTION private.iberfit_gx_report_body_current_v1(uuid,jsonb);
DROP FUNCTION private.iberfit_gx_report_body_has_refs_v1(jsonb);
DROP FUNCTION private.iberfit_gx_report_evidence_current_v1(uuid,date,date,jsonb);
DROP FUNCTION private.iberfit_gx_report_evidence_row_v1(jsonb);
CREATE OR REPLACE FUNCTION private.iberfit_gx_publication_pair_v1(p_client uuid,p_previous uuid,p_current uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE a public.m26_client_measurements_v43%ROWTYPE; b public.m26_client_measurements_v43%ROWTYPE;
BEGIN
 IF private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.m26_client_measurements_v43 WHERE client_id=p_client AND id=p_previous AND metric='gx_followup_v1';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO b FROM public.m26_client_measurements_v43 WHERE client_id=p_client AND id=p_current AND metric='gx_followup_v1';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM private.iberfit_gx_publication_event_v1 e WHERE e.client_id=p_client AND ((e.previous_id IN (p_previous,p_current) AND e.invalidated_previous_at IS NOT NULL) OR (e.current_id IN (p_previous,p_current) AND e.invalidated_current_at IS NOT NULL))) THEN RETURN NULL; END IF;
 IF a.revision IS DISTINCT FROM 1 OR b.revision IS DISTINCT FROM 1 OR a.source IS DISTINCT FROM 'manual' OR b.source IS DISTINCT FROM 'manual' OR a.notes IS NOT NULL OR b.notes IS NOT NULL OR a.measured_at IS NULL OR b.measured_at IS NULL OR a.created_at<a.measured_at OR b.created_at<b.measured_at OR a.created_at IS NULL OR b.created_at IS NULL OR a.created_at>now() OR b.created_at>now() OR a.measured_at<'1900-01-01'::timestamptz OR b.measured_at>now() OR a.measured_at>=b.measured_at OR (a.measured_at AT TIME ZONE 'America/Santiago')::date >= (b.measured_at AT TIME ZONE 'America/Santiago')::date OR a.unit IS DISTINCT FROM b.unit OR a.metadata IS DISTINCT FROM b.metadata OR private.iberfit_gx_followup_valid_v1(a.metadata,a.value,a.unit) IS DISTINCT FROM true OR private.iberfit_gx_followup_valid_v1(b.metadata,b.value,b.unit) IS DISTINCT FROM true OR EXISTS (SELECT 1 FROM public.m26_client_measurements_v43 m WHERE m.client_id=p_client AND m.metric='gx_followup_void_v1' AND m.metadata->>'targetId' IN (a.id::text,b.id::text)) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('previous',jsonb_build_object('id',a.id,'revision',a.revision,'measuredMicros',trunc(extract(epoch FROM a.measured_at)*1000000)::bigint::text,'value',a.value,'unit',a.unit,'protocol',a.metadata),'current',jsonb_build_object('id',b.id,'revision',b.revision,'measuredMicros',trunc(extract(epoch FROM b.measured_at)*1000000)::bigint::text,'value',b.value,'unit',b.unit,'protocol',b.metadata));
END $f$;
DROP FUNCTION private.iberfit_gx_report_pair_core_v1(uuid,uuid,uuid);
COMMIT;
