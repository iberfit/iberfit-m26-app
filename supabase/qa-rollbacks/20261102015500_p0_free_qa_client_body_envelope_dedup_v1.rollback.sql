-- P0 #1209 QA only. First disable the feature flag. Restore exact source.
DO $p0_rollback$
DECLARE v_source text; v_previous text;
  v_patch text := $p0_patch$
  -- P0 FREE QA: exact-envelope equality is required for EACH compacted body.
  -- The client rebuilds all five fields before canonical reconciliation.
  -- Security stays server-side; a missing flag leaves the response untouched.
  IF public.iberfit_current_role_v26() IN ('client','cliente')
     AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
        WHERE s.key='environment' AND s.value#>>'{}'='QA')
     AND EXISTS (SELECT 1 FROM auth.users u
        WHERE u.id=auth.uid() AND lower(u.email)='qa.rc74.client-a@iberfit.cl')
     AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
        WHERE s.key='free_client_body_envelope_compact_v1' AND s.value#>>'{}'='true')
  THEN
    v_payload := jsonb_set(v_payload,'{data,m26Entities}',
      COALESCE((
        SELECT jsonb_agg(
          CASE WHEN item->>'entityType' IN ('planning','session','session_execution')
            AND jsonb_typeof(item->'body')='object'
            AND NOT (item ? '__iberfitQaClientBodyMetaV1')
            AND item->'body'->>'id'=item->>'entityId'
            AND item->'body'->>'clientId'=item->>'clientId'
            AND item->'body'->>'status'=item->>'status'
            AND item->'body'->>'revision'=item->>'revision'
            AND item->'body'->>'updatedAt'=item->>'updatedAt'
            THEN (item-'body')||jsonb_build_object(
              'body',item->'body'-'id'-'clientId'-'status'-'revision'-'updatedAt',
              '__iberfitQaClientBodyMetaV1',1)
            ELSE item END ORDER BY ordinal
        )
        FROM jsonb_array_elements(COALESCE(v_payload#>'{data,m26Entities}','[]'::jsonb))
          WITH ORDINALITY AS objects(item,ordinal)
      ),'[]'::jsonb),true);
  END IF;
$p0_patch$;
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings
      WHERE key='environment') IS DISTINCT FROM 'QA' THEN
    RAISE EXCEPTION 'P0_QA_PROJECT_ONLY' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.iberfit_system_settings WHERE
    key='free_client_body_envelope_compact_v1' AND value#>>'{}'='true') THEN
    RAISE EXCEPTION 'P0_BODY_META_DISABLE_FLAG_FIRST' USING ERRCODE='42501';
  END IF;
  SELECT pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)
    INTO v_source;
  IF (length(v_source)-length(replace(v_source,v_patch,'')))<>length(v_patch)
  THEN RAISE EXCEPTION 'P0_BODY_META_PATCH_ABSENT_OR_AMBIGUOUS' USING ERRCODE='42501'; END IF;
  v_previous:=replace(v_source,v_patch,'');
  IF md5(v_previous)<>'aedea9df3d4986496626e10318628c41' THEN
    RAISE EXCEPTION 'P0_BODY_META_ROLLBACK_HASH_MISMATCH' USING ERRCODE='42501';
  END IF;
  EXECUTE v_previous;
END
$p0_rollback$;
