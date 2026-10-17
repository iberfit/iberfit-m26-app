-- IBERFIT M45: keep command preflight bootstrap parity with the real executor.
-- Bug found by the real Coach↔Client release E2E: CITA_CREAR is bootstrap_allowed
-- and the executor initializes a new appointment at status 'propuesta', while the
-- preflight wrapper rejected the same valid new entity as ENTITY_NOT_FOUND.
--
-- Fail closed on unknown baselines. Safe to replay on QA where the exact patch
-- was independently certified before this migration was added to source control.

DO $m45_guard$
DECLARE
  v_md5 text;
BEGIN
  v_md5 := md5(pg_get_functiondef(
    'public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb)'::regprocedure
  ));
  IF v_md5 NOT IN (
    '6b8f44e7122d01e81a5b819677b4b5af',
    'dd8a9d3cfb35812e2a51c24bd06b4580'
  ) THEN
    RAISE EXCEPTION 'M45_APPOINTMENT_PREFLIGHT_BASELINE_CHANGED:%', v_md5;
  END IF;
END
$m45_guard$;

CREATE OR REPLACE FUNCTION public.iberfit_command_preflight_v26_pre_rc74_4h(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_command jsonb;
  v_result jsonb;
  v_def public.domain_command_registry_v26%rowtype;
  v_type text;
  v_entity_type text;
  v_entity_id uuid;
  v_client_id uuid;
  v_role text;
  v_reason text;
  v_body jsonb;
  v_status text;
  v_to_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_command) <> 'object' then
    raise exception 'INVALID_COMMAND' using errcode = '22023';
  end if;

  v_type := nullif(p_command->>'type','');
  v_entity_type := nullif(p_command->>'entityType','');
  v_entity_id := nullif(p_command->>'entityId','')::uuid;
  v_client_id := nullif(p_command->>'clientId','')::uuid;

  if not public.iberfit_can_access_client_v26(v_client_id) then
    raise exception 'CLIENT_ACCESS_DENIED' using errcode = '42501';
  end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','M26_CANARY_NOT_ENABLED','serverAt',now());
  end if;
  if exists (
    select 1 from public.domain_entities_v26
    where entity_type = v_entity_type and entity_id = v_entity_id and client_id <> v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ENTITY_CLIENT_MISMATCH','serverAt',now());
  end if;

  select * into v_def
  from public.domain_command_registry_v26
  where command_type = v_type and enabled;
  if not found or v_def.entity_type <> v_entity_type then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','COMMAND_NOT_ALLOWED','serverAt',now());
  end if;

  v_role := public.iberfit_current_role_v26();
  if not (v_role = any(v_def.allowed_roles)) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ROLE_NOT_ALLOWED','serverAt',now());
  end if;

  v_command := public.iberfit_prepare_command_rc30_v26(p_command);
  v_reason := nullif(btrim(v_command->'payload'->>'reason'), '');
  if v_def.requires_reason and v_reason is null then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','REASON_REQUIRED','serverAt',now());
  end if;
  if v_def.requires_preview and (
    coalesce((v_command->'payload'->>'previewConfirmed')::boolean,false) = false
    or nullif(v_command->'payload'->>'targetClientId','')::uuid is distinct from v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','PREVIEW_CONFIRMATION_REQUIRED','serverAt',now());
  end if;

  v_result := public.iberfit_command_preflight_v26_rc29(v_command);
  if v_result->>'kind' <> 'ack'
     or coalesce((v_result->>'duplicate')::boolean,false) then
    return v_result;
  end if;

  select body, status into v_body, v_status
  from public.domain_entities_v26
  where entity_type = v_entity_type and entity_id = v_entity_id and client_id = v_client_id;
  if v_body is null then
    v_body := public.iberfit_base_entity_v26(v_entity_type, v_entity_id, v_client_id);
    v_status := v_body->>'status';
  end if;

  -- Simulation-only bootstrap parity with the executor. No entity/receipt is
  -- persisted by preflight.
  if v_body is null and (
    (v_entity_type='planning' and v_type='PLAN_VALIDAR' and v_def.bootstrap_allowed)
    or (v_entity_type='session' and v_type='SESION_PUBLICAR' and v_def.requires_preview)
    or (v_entity_type='appointment' and v_type='CITA_CREAR' and v_def.bootstrap_allowed)
  ) then
    v_status := case
      when v_entity_type='planning' then 'borrador'
      when v_entity_type='appointment' then 'propuesta'
      else 'aprobada'
    end;
    v_body := jsonb_build_object(
      'id',v_entity_id,
      'clientId',v_client_id,
      'status',v_status,
      'revision',0
    );
  end if;

  if v_body is null then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ENTITY_NOT_FOUND','serverAt',now());
  end if;

  select to_status into v_to_status
  from public.domain_transitions_v26
  where entity_type = v_entity_type
    and from_status = coalesce(v_status, v_body->>'status')
    and event_name = v_def.event_name;
  if v_to_status is null then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',v_result->'remoteRevision','reason','INVALID_TRANSITION','serverAt',now());
  end if;

  return v_result || jsonb_build_object(
    'commandPolicy','server_registry',
    'eventName',v_def.event_name,
    'toStatus',v_to_status
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode = '22023';
end
$function$;

DO $m45_post$
DECLARE
  v_md5 text;
BEGIN
  v_md5 := md5(pg_get_functiondef(
    'public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb)'::regprocedure
  ));
  IF v_md5 <> 'dd8a9d3cfb35812e2a51c24bd06b4580' THEN
    RAISE EXCEPTION 'M45_APPOINTMENT_PREFLIGHT_PATCH_HASH_INVALID:%', v_md5;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.domain_command_registry_v26
    WHERE command_type='CITA_CREAR'
      AND entity_type='appointment'
      AND bootstrap_allowed
      AND enabled
  ) THEN
    RAISE EXCEPTION 'M45_APPOINTMENT_CREATE_REGISTRY_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.domain_transitions_v26
    WHERE entity_type='appointment'
      AND from_status='propuesta'
      AND event_name='CREAR'
      AND to_status='propuesta'
  ) THEN
    RAISE EXCEPTION 'M45_APPOINTMENT_CREATE_TRANSITION_INVALID';
  END IF;
END
$m45_post$;
