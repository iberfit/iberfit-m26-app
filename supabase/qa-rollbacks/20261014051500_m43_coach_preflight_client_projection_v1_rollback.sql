-- Revert only the M43 function definitions to the verified QA baseline.
-- Backup definitions match PROD after CRLF normalization at authoring time.
BEGIN;
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
$function$
;

CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_payload jsonb;
  v_org uuid;
  v_clients jsonb;
begin
  v_payload:=public.iberfit_bootstrap_v26_pre_person_service_v1();
  v_org:=nullif(public.iberfit_application_context_v14()->>'organizationId','')::uuid;

  select coalesce(jsonb_agg(
    c.value||jsonb_build_object(
      'trainingServiceStatus',coalesce(s.status,'none')
    )
    order by c.ordinality
  ),'[]'::jsonb)
  into v_clients
  from jsonb_array_elements(coalesce(v_payload#>'{data,clients}','[]'::jsonb))
       with ordinality c(value,ordinality)
  left join lateral (
    select e.status
    from public.iberfit_training_service_events_v1 e
    where e.organization_id=v_org
      and e.person_id=nullif(c.value->>'id','')::uuid
    order by e.effective_at desc,e.created_at desc,e.id desc
    limit 1
  ) s on true;

  return jsonb_set(v_payload,'{data,clients}',coalesce(v_clients,'[]'::jsonb),true);
end
$function$
;
COMMIT;
