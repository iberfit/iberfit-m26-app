-- Candidate release procedure. No data writes; v1 remains intact.
-- Verified base: d8f5e347641f25f26c5d165d7d8af7890cecd138. Apply in protected migration only after QA.
BEGIN;
SET LOCAL lock_timeout = '3s';
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.iberfit_system_settings WHERE key='environment' AND value#>>'{}' IN ('QA','PRODUCTION')) THEN
    RAISE EXCEPTION 'IRI_HISTORY_ENVIRONMENT_UNRECOGNIZED';
  END IF;
  IF md5(pg_get_functiondef('public.iberfit_iri_report_history_v1(uuid)'::regprocedure)) <> '33cf4ff39769ea268bb4b695b43d5ad4' THEN
    RAISE EXCEPTION 'IRI_HISTORY_V1_DRIFT';
  END IF;
  IF to_regprocedure('public.iberfit_iri_report_history_v2(uuid,uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'IRI_HISTORY_V2_ALREADY_EXISTS';
  END IF;
END $guard$;

CREATE FUNCTION public.iberfit_iri_report_history_v2(
  p_assessment_id uuid,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_manager boolean := false;
  v_after_at timestamptz;
  v_after_version integer;
  v_items jsonb;
  v_has_more boolean;
  v_last_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'IRI_REPORT_HISTORY_AUTH_REQUIRED' USING ERRCODE='28000';
  END IF;
  IF p_assessment_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'IRI_REPORT_HISTORY_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT a.client_id INTO v_owner FROM public.iri_assessments a
    WHERE a.id=p_assessment_id AND a.assessment_type='inicial';
  IF NOT FOUND OR v_owner IS NULL THEN
    RAISE EXCEPTION 'IRI_REPORT_HISTORY_SCOPE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  v_manager := coalesce(public.iberfit_can_manage_iri_private_v1(v_owner),false);
  -- Require the current DB profile as well as the existing owner contract.
  -- PROD's private client_id helper can prefer stale app_metadata.
  IF NOT v_manager AND (
    public.iberfit_client_id() IS DISTINCT FROM v_owner OR NOT EXISTS (
      SELECT 1 FROM public.user_profiles p WHERE p.user_id=v_actor AND p.client_id=v_owner
    )
  ) THEN
    RAISE EXCEPTION 'IRI_REPORT_HISTORY_SCOPE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_after_id IS NOT NULL THEN
    SELECT i.issued_at,i.version INTO v_after_at,v_after_version
    FROM public.iri_report_issuances_v1 i
    LEFT JOIN public.iri_report_withdrawals_v1 w ON w.issuance_id=i.id
    WHERE i.id=p_after_id AND i.assessment_id=p_assessment_id
      AND (v_manager OR (i.audience='cliente' AND w.id IS NULL));
    IF NOT FOUND THEN
      RAISE EXCEPTION 'IRI_REPORT_HISTORY_CURSOR_STALE' USING ERRCODE='22023';
    END IF;
  END IF;
  WITH page AS MATERIALIZED (
    SELECT i.id,i.issued_at,i.version,
      jsonb_build_object(
        'issuanceId',i.id,'documentId',i.document_id,'assessmentId',i.assessment_id,
        'audience',i.audience,'version',i.version,'templateVersion',i.template_version,
        'engineVersion',i.engine_version,'sourceRevision',i.source_revision,
        'artifactSha256',CASE WHEN v_manager THEN i.artifact_sha256 ELSE NULL END,
        'artifactSizeBytes',i.artifact_size_bytes,
        'issuedBy',CASE WHEN v_manager THEN i.issued_by ELSE NULL END,
        'issuedAt',i.issued_at,'withdrawn',w.id IS NOT NULL,
        'withdrawnAt',CASE WHEN v_manager THEN w.withdrawn_at ELSE NULL END,
        'withdrawnReason',CASE WHEN v_manager THEN w.reason ELSE NULL END
      ) AS item
    FROM public.iri_report_issuances_v1 i
    LEFT JOIN public.iri_report_withdrawals_v1 w ON w.issuance_id=i.id
    WHERE i.assessment_id=p_assessment_id
      AND (v_manager OR (i.audience='cliente' AND w.id IS NULL))
      AND (p_after_id IS NULL OR (i.issued_at,i.version,i.id)<(v_after_at,v_after_version,p_after_id))
    ORDER BY i.issued_at DESC,i.version DESC,i.id DESC
    LIMIT p_limit+1
  ), ranked AS (
    SELECT *,row_number() OVER (ORDER BY issued_at DESC,version DESC,id DESC) rn FROM page
  )
  SELECT coalesce(jsonb_agg(item ORDER BY rn) FILTER (WHERE rn<=p_limit),'[]'::jsonb),
    count(*)>p_limit,
    (array_agg(id ORDER BY rn DESC) FILTER (WHERE rn<=p_limit))[1]
    INTO v_items,v_has_more,v_last_id FROM ranked;
  RETURN jsonb_build_object('ok',true,'assessmentId',p_assessment_id,'manager',v_manager,
    'items',v_items,'hasMore',v_has_more,'nextCursor',CASE WHEN v_has_more THEN v_last_id ELSE NULL END);
END
$function$;
ALTER FUNCTION public.iberfit_iri_report_history_v2(uuid,uuid,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.iberfit_iri_report_history_v2(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_iri_report_history_v2(uuid,uuid,integer) TO authenticated;
DO $acl$
BEGIN
  IF has_function_privilege('anon','public.iberfit_iri_report_history_v2(uuid,uuid,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.iberfit_iri_report_history_v2(uuid,uuid,integer)','EXECUTE')
     OR has_function_privilege('service_role','public.iberfit_iri_report_history_v2(uuid,uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'IRI_HISTORY_V2_ACL_UNSAFE';
  END IF;
END $acl$;
COMMIT;
