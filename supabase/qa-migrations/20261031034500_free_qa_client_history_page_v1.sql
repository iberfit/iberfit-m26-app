-- P0 #1209 · Candidate only: QA Client completed-history paging, no data changes.
-- This function must not be used to truncate any bootstrap until client read
-- paths, history completeness, revisions, offline and ACK contracts are green.
DO $preflight$
BEGIN
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings
      WHERE key='environment') IS DISTINCT FROM 'QA' THEN
    RAISE EXCEPTION 'FREE_HISTORY_QA_ONLY' USING ERRCODE='42501';
  END IF;
  IF to_regprocedure('public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'FREE_HISTORY_ALREADY_EXISTS' USING ERRCODE='42501';
  END IF;
END $preflight$;

CREATE FUNCTION public.iberfit_client_completed_history_page_free_v1(
  p_section text,
  p_snapshot_at timestamp with time zone DEFAULT NULL,
  p_cursor jsonb DEFAULT NULL,
  p_expected_count bigint DEFAULT NULL,
  p_limit integer DEFAULT 24
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_client_id uuid;
  v_snapshot timestamp with time zone;
  v_cursor_at timestamp with time zone;
  v_cursor_id uuid;
  v_total bigint;
  v_rows jsonb;
  v_has_more boolean;
  v_next jsonb;
  v_response jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FREE_HISTORY_AUTH_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF (SELECT value #>> '{}' FROM public.iberfit_system_settings
      WHERE key='environment') IS DISTINCT FROM 'QA' THEN
    RAISE EXCEPTION 'FREE_HISTORY_QA_ONLY' USING ERRCODE='42501';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role IS DISTINCT FROM 'cliente' THEN
    RAISE EXCEPTION 'FREE_HISTORY_CLIENT_ROLE_REQUIRED' USING ERRCODE='42501';
  END IF;
  v_client_id:=public.iberfit_client_id();
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'FREE_HISTORY_OWNER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_section NOT IN ('session','session_execution') OR p_section IS NULL
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'FREE_HISTORY_ARGUMENT_INVALID' USING ERRCODE='22023';
  END IF;
  v_snapshot:=COALESCE(p_snapshot_at,statement_timestamp());
  IF v_snapshot>statement_timestamp()
     OR v_snapshot<statement_timestamp()-INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'FREE_HISTORY_SNAPSHOT_STALE' USING ERRCODE='22023';
  END IF;
  IF p_cursor IS NOT NULL THEN
    IF p_snapshot_at IS NULL OR p_expected_count IS NULL OR p_expected_count<0
       OR jsonb_typeof(p_cursor)<>'object'
       OR NOT (p_cursor ? 'at' AND p_cursor ? 'id')
       OR (SELECT COUNT(*) FROM jsonb_object_keys(p_cursor))<>2
       OR p_cursor->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR length(COALESCE(p_cursor->>'at',''))>45 THEN
      RAISE EXCEPTION 'FREE_HISTORY_CURSOR_INVALID' USING ERRCODE='22023';
    END IF;
    BEGIN
      v_cursor_at:=(p_cursor->>'at')::timestamp with time zone;
      v_cursor_id:=(p_cursor->>'id')::uuid;
    EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'FREE_HISTORY_CURSOR_INVALID' USING ERRCODE='22023';
    END;
    IF v_cursor_at>v_snapshot THEN
      RAISE EXCEPTION 'FREE_HISTORY_CURSOR_INVALID' USING ERRCODE='22023';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.domain_entities_v26 e
  WHERE e.client_id=v_client_id
    AND e.entity_type=p_section
    AND e.updated_at<=v_snapshot
    AND lower(COALESCE(e.status,e.body->>'status','')) IN ('completado','completada','completed')
    AND lower(COALESCE(e.body->>'visibleToClient','true')) NOT IN ('false','0','no');

  IF p_expected_count IS NOT NULL AND p_expected_count<>v_total THEN
    RAISE EXCEPTION 'FREE_HISTORY_REVISION_CHANGED' USING ERRCODE='40001';
  END IF;

  WITH items AS (
    SELECT e.entity_type,e.entity_id,e.client_id,e.status,e.revision,
           e.updated_at,e.body,
           row_number() OVER (ORDER BY e.updated_at DESC,e.entity_id DESC) AS rn
    FROM public.domain_entities_v26 e
    WHERE e.client_id=v_client_id AND e.entity_type=p_section
      AND e.updated_at<=v_snapshot
      AND lower(COALESCE(e.status,e.body->>'status','')) IN ('completado','completada','completed')
      AND lower(COALESCE(e.body->>'visibleToClient','true')) NOT IN ('false','0','no')
      AND (v_cursor_at IS NULL OR (e.updated_at,e.entity_id)<(v_cursor_at,v_cursor_id))
    ORDER BY e.updated_at DESC,e.entity_id DESC LIMIT p_limit+1
  ), encoded AS (
    SELECT rn,updated_at,entity_id,jsonb_build_object(
      'entityType',entity_type,'entityId',entity_id,'clientId',client_id,
      'status',status,'revision',revision,'updatedAt',updated_at,
      'body',CASE WHEN p_section='session'
        THEN public.iberfit_m43_client_safe_session_v2(body)
        ELSE public.iberfit_m43_client_safe_execution_v1(body) END
    ) AS item
    FROM items
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY rn) FILTER(WHERE rn<=p_limit),'[]'::jsonb),
         COUNT(*)>p_limit,
         (SELECT jsonb_build_object('at',updated_at,'id',entity_id)
           FROM encoded WHERE rn=p_limit)
  INTO v_rows,v_has_more,v_next
  FROM encoded;

  IF octet_length(v_rows::text)>300000 THEN
    RAISE EXCEPTION 'FREE_HISTORY_PAGE_TOO_LARGE' USING ERRCODE='54000';
  END IF;
  IF v_has_more IS NOT TRUE THEN v_next:=NULL; END IF;
  v_response:=jsonb_build_object(
    'schema','iberfit.client.completed-history.page.qa.v1',
    'section',p_section,
    'snapshotAt',v_snapshot,
    'total',v_total,
    'rows',v_rows,
    'hasMore',COALESCE(v_has_more,false),
    'nextCursor',v_next
  );
  RETURN v_response;
END
$function$;

-- Never leave a new SECURITY DEFINER RPC executable by PUBLIC/anon.
REVOKE ALL ON FUNCTION public.iberfit_client_completed_history_page_free_v1(
  text,timestamp with time zone,jsonb,bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iberfit_client_completed_history_page_free_v1(
  text,timestamp with time zone,jsonb,bigint,integer) TO authenticated;
