-- M28 Session Delivery. Scope-only security hardening, no schema/data mutation.
-- A confirmed appointment is still required by the canonical command executor.
CREATE OR REPLACE FUNCTION private.iberfit_session_delivery_guard_m28(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_type text;
  v_role text;
  v_client_id uuid;
  v_session_id uuid;
  v_appointment_id uuid;
  v_session jsonb;
  v_appointment jsonb;
  v_modality text;
  v_ownership text;
  v_visibility text;
  v_patch jsonb;
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(p_command) <> 'object' THEN
    RETURN jsonb_build_object('allowed', true, 'basis', 'delegate_unauthed');
  END IF;
  v_type := nullif(p_command->>'type','');
  IF v_type = 'SESION_PUBLICAR' THEN
    v_patch := p_command #> '{payload,patch}';
    IF jsonb_typeof(v_patch)='object' AND v_patch ? 'deliveryModality' THEN
      v_modality := lower(trim(v_patch->>'deliveryModality'));
      v_ownership := lower(trim(coalesce(v_patch->>'deliveryOwnership','')));
      v_visibility := lower(trim(coalesce(v_patch->>'clientVisibilityLevel','')));
      IF v_modality IS NULL OR v_modality NOT IN ('presencial','guiada_en_app')
        OR v_ownership IS DISTINCT FROM (CASE WHEN v_modality='presencial' THEN 'coach_led' ELSE 'guided_in_app' END)
        OR v_visibility IS DISTINCT FROM (CASE WHEN v_modality='presencial' THEN 'summary_only' ELSE 'full' END) THEN
        RETURN jsonb_build_object('allowed',false,'reason','M28_SESSION_DELIVERY_INCONSISTENT');
      END IF;
    END IF;
    RETURN jsonb_build_object('allowed',true,'basis','consistent_publication');
  END IF;
  IF v_type <> 'SESION_INICIAR' THEN
    RETURN jsonb_build_object('allowed',true,'basis','not_applicable');
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role NOT IN ('cliente','client') THEN
    RETURN jsonb_build_object('allowed',true,'basis','delegate_supervisor');
  END IF;
  BEGIN
    v_client_id:=nullif(p_command->>'clientId','')::uuid;
    v_session_id:=nullif(p_command->>'entityId','')::uuid;
    v_appointment_id:=nullif(p_command #>> '{payload,appointmentId}','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('allowed',true,'basis','delegate_invalid_identifiers');
  END;
  IF v_client_id IS NULL OR v_session_id IS NULL OR v_appointment_id IS NULL THEN
    RETURN jsonb_build_object('allowed',true,'basis','delegate_missing_identifiers');
  END IF;
  IF NOT public.iberfit_can_access_client_v26(v_client_id) THEN
    RETURN jsonb_build_object('allowed',true,'basis','delegate_scope');
  END IF;
  v_session:=public.iberfit_base_entity_v26('session',v_session_id,v_client_id);
  v_appointment:=public.iberfit_base_entity_v26('appointment',v_appointment_id,v_client_id);
  IF v_session IS NULL OR v_appointment IS NULL THEN
    RETURN jsonb_build_object('allowed',true,'basis','delegate_missing_record');
  END IF;
  v_modality:=lower(trim(coalesce(
    v_session->>'deliveryModality',v_session->>'delivery_modality',
    v_session->>'modality',v_session->>'modalidad',
    v_appointment->>'modality',v_appointment->>'modalidad','guiada_en_app'
  )));
  v_ownership:=lower(trim(coalesce(
    v_session->>'deliveryOwnership',v_session->>'delivery_ownership',
    v_session->>'executionMode',v_session->>'execution_mode',
    CASE WHEN v_modality='presencial' THEN 'coach_led'
         WHEN v_modality='online' THEN 'live_online'
         ELSE 'client_autonomous' END
  )));
  v_visibility:=lower(trim(coalesce(
    v_session->>'clientVisibilityLevel',v_session->>'client_visibility_level',
    v_session->>'visibilityLevel',v_session->>'visibility_level','full'
  )));
  IF v_modality <> 'guiada_en_app'
    OR v_ownership NOT IN ('guided_in_app','client_autonomous')
    OR v_visibility <> 'full'
    OR lower(coalesce(v_session->>'visibleToClient','true'))='false' THEN
    RETURN jsonb_build_object('allowed',false,'reason','M28_COACH_LED_CLIENT_START_FORBIDDEN');
  END IF;
  RETURN jsonb_build_object('allowed',true,'basis','guided_client_session');
END;
$function$;
REVOKE ALL ON FUNCTION private.iberfit_session_delivery_guard_m28(jsonb) FROM PUBLIC, anon, authenticated;

-- Preserve canonical role, scope, training-service, idempotency and receipt behavior.
-- On a prior successful operation, the execute wrapper delegates its receipt BEFORE
-- the new guard. No existing active execution or domain row is modified here.

CREATE OR REPLACE FUNCTION public.iberfit_command_preflight_v26(p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_guard jsonb;
  v_delivery_guard jsonb;
begin
  v_guard := private.iberfit_training_command_guard_v1(p_command);
  if coalesce((v_guard->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'kind', 'rejected',
      'operationId', p_command->>'operationId',
      'remoteRevision', null,
      'reason', 'TRAINING_SERVICE_NOT_ACTIVE',
      'guard', v_guard,
      'serverAt', now()
    );
  end if;
  v_delivery_guard := private.iberfit_session_delivery_guard_m28(p_command);
  if coalesce((v_delivery_guard->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'kind', 'rejected',
      'operationId', p_command->>'operationId',
      'remoteRevision', null,
      'reason', coalesce(v_delivery_guard->>'reason','M28_SESSION_DELIVERY_REJECTED'),
      'guard', v_delivery_guard,
      'serverAt', now()
    );
  end if;
  return public.iberfit_command_preflight_v26_pre_training_service_guard_v1(p_command);
end
$function$;

CREATE OR REPLACE FUNCTION public.iberfit_execute_command_v26(p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_guard jsonb;
  v_delivery_guard jsonb;
  v_operation_id uuid;
begin
  begin
    v_operation_id := nullif(p_command->>'operationId','')::uuid;
  exception when invalid_text_representation then
    v_operation_id := null;
  end;

  -- Preserve canonical idempotency: an already-applied operation must continue
  -- returning its original acknowledgement even if service status changed later.
  if v_operation_id is not null
     and exists (
       select 1 from public.command_receipts_v26 r
       where r.operation_id = v_operation_id
     ) then
    -- Preserve canonical idempotent acknowledgement on existing receipts.
    return public.iberfit_execute_command_v26_pre_training_service_guard_v1(p_command);
  end if;

  v_guard := private.iberfit_training_command_guard_v1(p_command);
  if coalesce((v_guard->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'kind', 'rejected',
      'operationId', p_command->>'operationId',
      'remoteRevision', null,
      'reason', 'TRAINING_SERVICE_NOT_ACTIVE',
      'guard', v_guard,
      'serverAt', now()
    );
  end if;

  -- Fresh writes must pass this guard, not just the optional preflight RPC.
  v_delivery_guard := private.iberfit_session_delivery_guard_m28(p_command);
  if coalesce((v_delivery_guard->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'kind', 'rejected',
      'operationId', p_command->>'operationId',
      'remoteRevision', null,
      'reason', coalesce(v_delivery_guard->>'reason','M28_SESSION_DELIVERY_REJECTED'),
      'guard', v_delivery_guard,
      'serverAt', now()
    );
  end if;
  return public.iberfit_execute_command_v26_pre_training_service_guard_v1(p_command);
end
$function$;
