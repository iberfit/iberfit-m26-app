-- SIGNATURE U33. Role-scoped, bounded read projection. STAGING only.
-- Requires #1072, U30, U31 and U32. No public dispatcher or grants.
-- Do not expose raw prescription_snapshot, internal command receipts or events.
SELECT 1 / CASE WHEN to_regclass('public.training_session_occurrences_v1') IS NOT NULL
  AND to_regprocedure('private.iberfit_u32_create_occurrences_batch_v1(jsonb)') IS NOT NULL
  THEN 1 ELSE 0 END AS u33_occurrence_prerequisite;

CREATE FUNCTION private.iberfit_u33_occurrence_calendar_v1(
  p_client_id uuid,
  p_start_date date,
  p_end_date date,
  p_after_date date DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $u33$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_rows jsonb;
  v_last jsonb;
  v_n integer;
  v_more boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';
  END IF;
  IF p_client_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL
    OR p_end_date < p_start_date OR p_end_date > p_start_date + 92
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR ((p_after_date IS NULL) <> (p_after_id IS NULL))
  THEN
    RAISE EXCEPTION 'U33_INVALID_CALENDAR_QUERY' USING errcode='22023';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role NOT IN ('coach','cliente')
    OR NOT public.iberfit_can_access_client_v26(p_client_id)
    OR NOT public.iberfit_canary_enabled_v26(p_client_id)
  THEN
    RAISE EXCEPTION 'CLIENT_ACCESS_DENIED' USING errcode='42501';
  END IF;

  -- Cursor uses the immutable (local_date,id) pair, never OFFSET. A Client
  -- only sees a linked appointment for a currently visible, published source;
  -- unconfirmed Coach drafts and unlinked occurrences are never projected.
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',s.id,'clientId',s.client_id,'sessionId',s.session_id,
      'appointmentId',s.appointment_id,'appointmentStatus',s.appointment_status,
      'localDate',s.local_date,'localTime',s.local_time,
      'timeZone',s.time_zone,'startsAt',s.starts_at,'endsAt',s.ends_at,
      'durationMinutes',s.duration_minutes,'status',s.status,
      'revision',s.revision,'executionId',
        CASE WHEN s.status='en_curso' THEN s.execution_id ELSE NULL END,
      'title',s.session_title
    ) ORDER BY s.local_date,s.id
  ),'[]'::jsonb) INTO v_rows
  FROM (
    SELECT o.id,o.client_id,o.session_id,o.appointment_id,
      ap.status AS appointment_status,o.local_date,o.local_time,o.time_zone,
      o.starts_at,o.ends_at,o.duration_minutes,o.status,o.revision,
      o.execution_id,o.prescription_snapshot->>'title' AS session_title
    FROM public.training_session_occurrences_v1 o
    LEFT JOIN public.appointments ap
      ON ap.id=o.appointment_id AND ap.client_id=o.client_id
        AND ap.session_id=o.session_id
    WHERE o.client_id=p_client_id
      AND o.local_date BETWEEN p_start_date AND p_end_date
      AND (p_after_date IS NULL OR (o.local_date,o.id)>(p_after_date,p_after_id))
      AND (v_role='coach' OR (
        o.status IN ('confirmada','en_curso','completada','cancelada')
        AND ap.id IS NOT NULL
        AND (
          (o.status='confirmada' AND ap.status='confirmada')
          OR (o.status='en_curso' AND ap.status IN ('confirmada','cancelada'))
          OR (o.status='completada' AND ap.status IN ('completada','cancelada','confirmada'))
          OR (o.status='cancelada' AND ap.status IN ('confirmada','cancelada','completada'))
        )
        AND EXISTS (
          SELECT 1 FROM public.domain_entities_v26 source
          WHERE source.entity_type='session'
            AND source.entity_id=o.session_id
            AND source.client_id=o.client_id
            AND source.status='disponible'
            AND source.body->>'visibleToClient'='true'
            AND source.body->>'clientVisibilityLevel'='full'
            AND source.body->>'deliveryModality'='guiada_en_app'
        )
      ))
    ORDER BY o.local_date,o.id
    LIMIT p_limit + 1
  ) s;
  v_n:=jsonb_array_length(v_rows);
  v_more:=v_n>p_limit;
  IF v_more THEN
    v_last:=v_rows->(p_limit-1);
    SELECT coalesce(jsonb_agg(item.value ORDER BY item.ordinality),'[]'::jsonb)
      INTO v_rows
    FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS item(value,ordinality)
    WHERE item.ordinality<=p_limit;
  END IF;
  RETURN jsonb_build_object(
    'kind','calendar','clientId',p_client_id,'timeZone','America/Santiago',
    'startDate',p_start_date,'endDate',p_end_date,
    'count',jsonb_array_length(v_rows),'occurrences',v_rows,
    'hasMore',v_more,
    'nextCursor',CASE WHEN v_more
       THEN jsonb_build_object('localDate',v_last->>'localDate','id',v_last->>'id')
       ELSE NULL END
  );
END
$u33$;

REVOKE ALL ON FUNCTION private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)
 FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)
 IS 'SIGNATURE U33 STAGING private read projection, bounded cursor and role scope. Not exposed to REST or clients.';
