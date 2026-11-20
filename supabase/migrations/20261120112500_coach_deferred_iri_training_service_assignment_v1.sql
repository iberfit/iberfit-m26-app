-- IBERFIT P0 2026-11-20: Coach dual-role client onboarding with IRI deferred.
-- No existing client is modified. Existing assignments/events are never reset.
-- Only an explicitly requested training-service activation on a *new* client
-- can create training + Coach scope. Admin-only/IRI-only workflows stay separate.
-- Read-only source preflight. No anonymous DO blocks or backfill writes:
-- the migration runner aborts if the dynamic CASE cannot be cast to integer.
SELECT (CASE WHEN
  md5(pg_get_functiondef(to_regprocedure('public.iberfit_create_client_draft_v12(jsonb)')))
    = '906a923478573671ddc5532af9172356'
  AND md5(pg_get_functiondef(to_regprocedure('public.iberfit_create_client_draft_v12_pre_v65e(jsonb)')))
    = '833239e847db56f90de23c6b407e1384'
  AND (SELECT pg_get_userbyid(proowner) FROM pg_proc
    WHERE oid=to_regprocedure('public.iberfit_create_client_draft_v12(jsonb)'))='postgres'
  AND (SELECT prosecdef FROM pg_proc
    WHERE oid=to_regprocedure('public.iberfit_create_client_draft_v12(jsonb)'))=true
  AND EXISTS (SELECT 1 FROM pg_class
    WHERE oid=to_regclass('public.iberfit_training_service_events_v1')
      AND relrowsecurity AND relforcerowsecurity)
THEN '1' ELSE 'M26_COACH_DEFERRED_IRI_CREATE_SOURCE_DRIFT' END)::integer AS source_guard;


CREATE OR REPLACE FUNCTION public.iberfit_create_client_draft_v12(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_context jsonb;
  v_org uuid;
  v_client uuid;
  v_result jsonb;
  v_primary text;
  v_coach_role boolean;
  v_new boolean;
  v_intent text:=lower(btrim(coalesce(p_payload->>'trainingServiceIntent','none')));
  v_mode text:=lower(btrim(coalesce(p_payload->>'initialAssessmentMode','iri')));
BEGIN
  -- This same protection was present in the previous gateway.
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  IF v_intent NOT IN ('none','active') THEN
    RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_INTENT_INVALID' USING errcode='22023';
  END IF;
  IF v_intent='active' AND v_mode NOT IN ('iri','deferred') THEN
    RAISE EXCEPTION 'M26_ONBOARDING_IRI_MODE_INVALID' USING errcode='22023';
  END IF;

  -- Keep the certified original V12.3 implementation (validations, email lock,
  -- source tables, idempotent reuse, IRI draft, visibility/readback) unchanged.
  v_result:=public.iberfit_create_client_draft_v12_pre_v65e(p_payload);

  IF v_intent<>'active' THEN RETURN v_result; END IF;

  IF v_actor IS NULL OR coalesce(v_result->>'ok','false')<>'true'
    OR coalesce(v_result->>'visible','false')<>'true' THEN
    RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_CREATE_UNCONFIRMED';
  END IF;

  -- Do not reactivate existing, ended, or IRI-only people via email reuse.
  v_new:=coalesce((v_result->>'reused')::boolean,true)=false;
  IF NOT v_new THEN RETURN v_result; END IF;

  BEGIN v_client:=(v_result->>'client_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_CLIENT_INVALID' USING errcode='22023';
  END;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_CLIENT_INVALID' USING errcode='22023';
  END IF;

  SELECT lower(up.role::text) INTO v_primary
    FROM public.user_profiles up WHERE up.user_id=v_actor;
  v_coach_role:=v_primary='coach' OR EXISTS(
    SELECT 1 FROM public.user_application_roles r
    WHERE r.user_id=v_actor AND r.role='coach' AND r.active=true
  );
  IF NOT v_coach_role THEN
    RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_COACH_ROLE_REQUIRED' USING errcode='42501';
  END IF;

  v_context:=public.iberfit_application_context_v14();
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_ORGANIZATION_MISSING' USING errcode='42501';
  END IF;
  PERFORM public.iberfit_assert_client_org_scope_v65e(v_org,v_client::text);

  -- No ownership takeover: the brand-new record must be attributable to this
  -- very actor and must have no other Coach or historical service.
  IF NOT EXISTS(
    SELECT 1 FROM public.client_intake_profiles i
    WHERE i.client_id=v_client AND i.created_by=v_actor
  ) OR EXISTS(
    SELECT 1 FROM public.client_assignments a
    WHERE a.client_id=v_client AND a.coach_user_id<>v_actor
  ) OR EXISTS(
    SELECT 1 FROM public.iberfit_coach_client_assignments a
    WHERE a.organization_id=v_org AND a.client_id=v_client::text
  ) OR EXISTS(
    SELECT 1 FROM public.iberfit_training_service_events_v1 s
    WHERE s.organization_id=v_org AND s.person_id=v_client
  ) THEN
    RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_SCOPE_OR_STATE_DRIFT' USING errcode='42501';
  END IF;

  INSERT INTO public.client_assignments(client_id,coach_user_id,active)
  VALUES(v_client,v_actor,true)
  ON CONFLICT(client_id,coach_user_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.client_assignments
    WHERE client_id=v_client AND coach_user_id=v_actor AND active=true)
  THEN RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_COACH_LINK_REQUIRED'; END IF;

  INSERT INTO public.iberfit_coach_client_assignments(
    organization_id,coach_user_id,client_id,status,
    starts_at,ends_at,reason,created_by
  ) VALUES (
    v_org,v_actor,v_client::text,'active',current_date,NULL,
    'Alta de entrenamiento Coach; IRI inicial independiente.',v_actor
  );

  INSERT INTO public.iberfit_training_service_events_v1(
    organization_id,person_id,status,reason,changed_by
  ) VALUES(
    v_org,v_client,'active',
    'Servicio de entrenamiento solicitado al crear el expediente Coach; IRI independiente.',
    v_actor
  );
  RETURN v_result;
END
$function$;

-- No grants broadened. Preserve existing authenticated access and deny anon.
-- Read-only postflight. CREATE OR REPLACE retains the existing function ACL;
-- any accidental grant to anonymous aborts the complete migration transaction.
SELECT (CASE WHEN
  has_function_privilege('authenticated',
       'public.iberfit_create_client_draft_v12(jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon',
       'public.iberfit_create_client_draft_v12(jsonb)','EXECUTE')
  AND (SELECT pg_get_userbyid(proowner) FROM pg_proc
       WHERE oid=to_regprocedure('public.iberfit_create_client_draft_v12(jsonb)'))='postgres'
THEN '1' ELSE 'M26_ONBOARDING_TRAINING_GATEWAY_ACL_DRIFT' END)::integer AS acl_guard;

