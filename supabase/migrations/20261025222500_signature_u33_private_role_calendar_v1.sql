-- SIGNATURE U33 · read-only role-aware date projection. STAGING ONLY.
-- Depends on #1072, U30 #1144, U31 #1145 and U32 #1146.
-- No public GRANT, no dispatcher wiring and no Client direct table SELECT.
SELECT 1 / CASE WHEN
 to_regclass('public.training_session_occurrences_v1') IS NOT NULL
 AND to_regprocedure('private.iberfit_u32_create_occurrences_batch_v1(jsonb)') IS NOT NULL
 THEN 1 ELSE 0 END AS u33_requires_foundation;

CREATE FUNCTION private.iberfit_u33_occurrence_calendar_v1(
 p_client_id uuid,p_start_date date,p_end_date date,p_limit integer DEFAULT 52)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $u33$
DECLARE
 v_actor uuid:=auth.uid();
 v_role text;
 v_limit integer;
 v_items jsonb:='[]'::jsonb;
 v_more boolean:=false;
BEGIN
 IF v_actor IS NULL THEN
   RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';
 END IF;
 v_role:=public.iberfit_current_role_v26();
 IF p_client_id IS NULL OR v_role NOT IN ('coach','cliente')
   OR NOT public.iberfit_can_access_client_v26(p_client_id)
   OR (v_role='cliente' AND NOT EXISTS(
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id=v_actor AND up.client_id=p_client_id
        AND up.role::text IN ('client','cliente')
   )) THEN
   RAISE EXCEPTION 'U33_CLIENT_ACCESS_DENIED' USING errcode='42501';
 END IF;
 IF p_start_date IS NULL OR p_end_date IS NULL OR p_limit IS NULL
   OR p_start_date>p_end_date
   OR p_end_date-p_start_date NOT BETWEEN 0 AND 366
   OR p_limit NOT BETWEEN 1 AND 52
   OR p_start_date<'2020-01-01'::date
   OR p_end_date>'2100-12-31'::date THEN
   RAISE EXCEPTION 'U33_INVALID_CALENDAR_WINDOW' USING errcode='22023';
 END IF;
 v_limit:=p_limit;
 WITH eligible AS (
   SELECT
     o.id AS occurrence_id,
     o.local_date,o.starts_at,o.ends_at,o.status,o.revision,
     o.duration_minutes,o.session_id,o.appointment_id,o.execution_id,
     e.body->>'title' AS title,
     a.status AS appointment_status
   FROM public.training_session_occurrences_v1 o
   JOIN public.domain_entities_v26 e
      ON e.entity_type='session'
       AND e.entity_id=o.session_id AND e.client_id=o.client_id
   LEFT JOIN public.appointments a
      ON a.id=o.appointment_id
       AND a.client_id=o.client_id AND a.session_id=o.session_id
   WHERE o.client_id=p_client_id
     AND o.local_date BETWEEN p_start_date AND p_end_date
     AND (
       v_role='coach' OR (
         v_role='cliente'
         AND e.body->>'deliveryModality'='guiada_en_app'
         AND e.body->>'deliveryOwnership' IN ('guided_in_app','client_autonomous')
         AND e.body->>'clientVisibilityLevel'='full'
         AND e.body->>'visibleToClient'='true'
         AND (e.status='disponible' OR o.status='completada')
         AND o.status IN ('confirmada','en_curso','completada')
         AND (o.status<>'confirmada' OR a.status='confirmada')
       )
     )
   ORDER BY o.local_date,o.starts_at NULLS LAST,o.id
   LIMIT v_limit+1
 ), ranked AS (
   SELECT row_number() OVER (ORDER BY local_date,starts_at NULLS LAST,occurrence_id) AS rn,
     eligible.*
   FROM eligible
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'occurrenceId',occurrence_id,
   'sessionId',session_id,
   'appointmentId',appointment_id,
   'executionId',CASE WHEN status='en_curso' THEN execution_id ELSE NULL END,
   'localDate',local_date,'startsAt',starts_at,'endsAt',ends_at,
   'durationMinutes',duration_minutes,'timeZone','America/Santiago',
   'status',status,'revision',revision,'sessionTitle',title,
   'appointmentStatus',appointment_status
 ) ORDER BY rn) FILTER (WHERE rn<=v_limit),'[]'::jsonb),
   count(*)>v_limit
 INTO v_items,v_more FROM ranked;
 RETURN jsonb_build_object(
   'kind','calendar','clientId',p_client_id,
   'fromDate',p_start_date,'toDate',p_end_date,
   'items',v_items,'hasMore',v_more,
   'scope',CASE WHEN v_role='cliente' THEN 'guided_client' ELSE 'assigned_coach' END);
END;
$u33$;

REVOKE ALL ON FUNCTION private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,integer)
 FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,integer)
 IS 'U33 STAGING ONLY. Private role-verified whitelist calendar projection, no exercise blocks or prescriptions. Requires separate reviewed API activation.';
