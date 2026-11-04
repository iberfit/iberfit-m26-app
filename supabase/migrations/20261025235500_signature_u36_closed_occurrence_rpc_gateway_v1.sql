-- SIGNATURE U36 · staging-only bridge for occurrence-specific commands.
-- Deliberately CLOSED: no grants to authenticated/anon/service_role until
-- authenticated E2E, production backup restoration and release certification.
-- Review a separate explicit GRANT migration before ever activating this API.
SELECT 1 / CASE WHEN
  to_regprocedure('private.iberfit_u31_occurrence_transition_v1(jsonb)') IS NOT NULL
  AND to_regprocedure('private.iberfit_u32_create_occurrences_batch_v1(jsonb)') IS NOT NULL
  AND to_regprocedure('private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)') IS NOT NULL
  AND to_regprocedure('private.iberfit_u34_coach_occurrence_change_v1(jsonb)') IS NOT NULL
THEN 1 ELSE 0 END AS u36_dependencies;

CREATE FUNCTION public.iberfit_occurrence_api_v1(
  p_action text, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $u36$
DECLARE
  v_actor uuid := auth.uid();
  v_client uuid;
  v_start date;
  v_end date;
  v_cursor_date date;
  v_cursor_id uuid;
  v_limit integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501';
  END IF;
  IF p_action IS NULL
    OR p_action NOT IN ('CALENDARIO','CREAR_LOTE','TRANSICION','CAMBIO')
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR octet_length(p_payload::text)>524288 THEN
    RAISE EXCEPTION 'U36_INVALID_REQUEST' USING errcode='22023';
  END IF;
  IF p_action='CALENDARIO' THEN
    -- These are the ONLY client-supplied read filters. No raw query, role,
    -- source snapshot, permission override or arbitrary SQL expression.
    IF (p_payload - 'clientId' - 'startDate' - 'endDate'
      - 'afterDate' - 'afterId' - 'limit')<>'{}'::jsonb THEN
      RAISE EXCEPTION 'U36_UNTRUSTED_CALENDAR_FILTER'
        USING errcode='22023';
    END IF;
    BEGIN
      v_client:=nullif(p_payload->>'clientId','')::uuid;
      v_start:=nullif(p_payload->>'startDate','')::date;
      v_end:=nullif(p_payload->>'endDate','')::date;
      v_cursor_date:=nullif(p_payload->>'afterDate','')::date;
      v_cursor_id:=nullif(p_payload->>'afterId','')::uuid;
      v_limit:=coalesce(nullif(p_payload->>'limit','')::integer,50);
    EXCEPTION WHEN invalid_text_representation
      OR invalid_datetime_format OR datetime_field_overflow
      OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'U36_INVALID_CALENDAR_FIELDS'
        USING errcode='22023';
    END;
    RETURN private.iberfit_u33_occurrence_calendar_v1(
      v_client,v_start,v_end,v_cursor_date,v_cursor_id,v_limit);
  ELSIF p_action='CREAR_LOTE' THEN
    RETURN private.iberfit_u32_create_occurrences_batch_v1(p_payload);
  ELSIF p_action='TRANSICION' THEN
    RETURN private.iberfit_u31_occurrence_transition_v1(p_payload);
  ELSE
    RETURN private.iberfit_u34_coach_occurrence_change_v1(p_payload);
  END IF;
END
$u36$;

-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default.
-- Revoke in this SAME migration transaction. No feature flag alone is enough.
REVOKE ALL ON FUNCTION public.iberfit_occurrence_api_v1(text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.iberfit_occurrence_api_v1(text,jsonb)
 IS 'SIGNATURE U36 STAGING CLOSED. Explicit role-secured future HTTP bridge; NOT granted, NOT live. Requires E2E and release permission migration.';
