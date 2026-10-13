-- M28 V2: reconcile the previously deployed QA preview function with the
-- reviewed PR #907 executor; fresh writes MUST evaluate the modality guard.
-- Safe to apply after V1 on QA and PROD. No data/schema changes or re-grants.
-- Preserve idempotent receipts and the canonical command authorization.
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
