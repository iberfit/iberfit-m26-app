-- QA-only ENABLE GATE; DO NOT EXECUTE UNTIL PUBLIC BOOTSTRAP PATCH
-- IS APPLIED, CANARY FRONT-END EXACT-SHA IS DEPLOYED, AND GATES ARE GREEN.
-- Verifies restored source equals unmodified QA production-safe function.
DO $p0_enable$
DECLARE v_source text;v_original text;
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
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings
   WHERE key='free_client_completed_history_demand_qa') IS DISTINCT FROM 'true'
 OR (SELECT value#>>'{}' FROM public.iberfit_system_settings
   WHERE key='free_client_compact_legacy_refs_qa') IS DISTINCT FROM 'true'
 OR (SELECT value#>>'{}' FROM public.iberfit_system_settings
   WHERE key='free_client_hide_qa_fixture_checkin_revisions_v1') IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'P0_QA_DEPENDENCY_MISSING' USING ERRCODE='42501'; END IF;
 SELECT pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)
  INTO v_source;
 v_original:=replace(v_source,v_patch,'');
 IF v_original=v_source OR md5(v_original)<>'aedea9df3d4986496626e10318628c41' THEN
   RAISE EXCEPTION 'P0_QA_SOURCE_DRIFT_OR_PATCH_NOT_APPLIED' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.iberfit_system_settings(key,value,updated_at)
 VALUES('free_client_body_envelope_compact_v1','true'::jsonb,now())
 ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
END
$p0_enable$;
