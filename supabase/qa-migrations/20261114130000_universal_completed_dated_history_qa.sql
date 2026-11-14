-- IBERFIT UNIVERSAL 360 #1340 · QA-only, exact-revision expansion of dated history.
-- A completed result remains visible if its prescription is reusable or withdrawn.
-- All owner, role, parent visibility, page cursor, snapshot and ACL fences stay byte-for-byte.
-- Safe to replay exactly once or accept the known final definition; no personal data changes.
DO $universal_history_expand$
DECLARE
  v_existing text;
  v_previous text := $parent_before$AND lower(COALESCE(s.status,s.body->>'status','')) IN ('completado','completada','completed')$parent_before$;
  v_extended text := $parent_after$AND lower(COALESCE(s.status,s.body->>'status','')) IN ('disponible','completado','completada','completed','cancelada','cancelado','cancelled')$parent_after$;
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    THEN RAISE EXCEPTION 'UNIVERSAL_HISTORY_QA_ONLY' USING ERRCODE='42501'; END IF;
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='free_client_completed_history_demand_qa') IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'UNIVERSAL_HISTORY_QA_ROLLOUT_UNEXPECTED' USING ERRCODE='42501'; END IF;
  v_existing := pg_get_functiondef('public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,text,integer)'::regprocedure);
  IF md5(v_existing) = '3a73617648b73eb472af6ce8e9c2ee8e' THEN
    IF length(v_existing)-length(replace(v_existing,v_previous,'')) <> 2*length(v_previous)
      THEN RAISE EXCEPTION 'UNIVERSAL_HISTORY_PREDICATE_SOURCE_DRIFT'; END IF;
    -- The only two replacements are the identical fingerprint and page WHERE clauses.
    EXECUTE replace(v_existing,v_previous,v_extended);
  ELSIF md5(v_existing) <> 'ae01c1771319b99f0404612a4b84fd2a' THEN
    RAISE EXCEPTION 'UNIVERSAL_HISTORY_SQL_SOURCE_DRIFT' USING ERRCODE='42501';
  END IF;
  IF md5(pg_get_functiondef('public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,text,integer)'::regprocedure)) <> 'ae01c1771319b99f0404612a4b84fd2a'
    THEN RAISE EXCEPTION 'UNIVERSAL_HISTORY_REVISION_MISMATCH'; END IF;
END $universal_history_expand$;
REVOKE ALL ON FUNCTION public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,text,integer) TO authenticated;
