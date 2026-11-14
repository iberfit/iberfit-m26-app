-- IBERFIT UNIVERSAL 360 · QA-only exact-revision restoration.
-- Restores the original conservative parent predicate; does not change records or grants.
-- Required for reversible deployment; rejects every unrelated revision.
DO $universal_history_restore$
DECLARE
  v_function text;
  v_extended text := $expanded_parent$AND lower(COALESCE(s.status,s.body->>'status','')) IN ('disponible','completado','completada','completed','cancelada','cancelado','cancelled')$expanded_parent$;
  v_original text := $original_parent$AND lower(COALESCE(s.status,s.body->>'status','')) IN ('completado','completada','completed')$original_parent$;
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
    THEN RAISE EXCEPTION 'UNIVERSAL_HISTORY_ROLLBACK_QA_ONLY' USING ERRCODE='42501'; END IF;
  v_function := pg_get_functiondef('public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,text,integer)'::regprocedure);
  IF md5(v_function) = 'ae01c1771319b99f0404612a4b84fd2a' THEN
    IF length(v_function)-length(replace(v_function,v_extended,'')) <> length(v_extended)*2
      THEN RAISE EXCEPTION 'UNIVERSAL_HISTORY_ROLLBACK_PREDICATE_DRIFT'; END IF;
    EXECUTE replace(v_function,v_extended,v_original);
  ELSIF md5(v_function) <> '3a73617648b73eb472af6ce8e9c2ee8e' THEN
    RAISE EXCEPTION 'UNIVERSAL_HISTORY_ROLLBACK_SOURCE_DRIFT' USING ERRCODE='42501';
  END IF;
  IF md5(pg_get_functiondef('public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,text,integer)'::regprocedure)) <> '3a73617648b73eb472af6ce8e9c2ee8e'
    THEN RAISE EXCEPTION 'UNIVERSAL_HISTORY_ROLLBACK_POSTCONDITION_FAILED'; END IF;
END $universal_history_restore$;
REVOKE ALL ON FUNCTION public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iberfit_client_completed_history_page_free_v1(text,timestamp with time zone,jsonb,bigint,text,integer) TO authenticated;
