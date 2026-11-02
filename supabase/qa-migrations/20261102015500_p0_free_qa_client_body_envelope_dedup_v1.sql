-- P0 #1209 QA ONLY: reversible synthetic Client A body-envelope de-dup.
-- DEFAULT OFF. Requires separately reviewed flag activation after front-end deploy.
-- Never apply to PROD. Does not touch stored rows, RLS, grants or tokens.
DO $p0_migrate$
DECLARE v_source text; v_next text;
  v_anchor text := E'  return jsonb_build_object(\\n';
  v_patch text := $p0_patch$
  -- P0 FREE QA: exact-envelope equality is required for EACH compacted body.
  -- The client rebuilds all five fields before canonical reconciliation.
  -- Security stays server-side; a missing flag leaves the response untouched.
  IF v_role='cliente'
     AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
        WHERE s.key='environment' AND s.value#>>'{}'='QA')
     AND EXISTS (SELECT 1 FROM auth.users u
        WHERE u.id=auth.uid() AND lower(u.email)='qa.rc74.client-a@iberfit.cl')
     AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
        WHERE s.key='free_client_body_envelope_compact_v1' AND s.value#>>'{}'='true')
  THEN
    v_data := jsonb_set(v_data,'{m26Entities}',
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
        FROM jsonb_array_elements(COALESCE(v_data->'m26Entities','[]'::jsonb))
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
    RAISE EXCEPTION 'P0_BODY_META_FLAG_MUST_BE_OFF' USING ERRCODE='42501';
  END IF;
  SELECT pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)
    INTO v_source;
  IF md5(v_source) <> 'a8bf53fd05478bb2face12edc642dccc' THEN
    RAISE EXCEPTION 'P0_BODY_META_SOURCE_HASH_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF (length(v_source)-length(replace(v_source,v_anchor,'')))<>length(v_anchor)
  THEN RAISE EXCEPTION 'P0_BODY_META_ANCHOR_AMBIGUOUS'; END IF;
  v_next:=replace(v_source,v_anchor,v_patch||v_anchor);
  IF v_next=v_source THEN RAISE EXCEPTION 'P0_BODY_META_NO_PATCH'; END IF;
  EXECUTE v_next;
END
$p0_migrate$;
