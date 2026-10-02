-- IBERFIT · Solo IRI explicit access mode and canonical lifecycle
-- Keeps email as contact/intake identity while decoupling it from app invitation.
-- Safe additive behavior: accessMode defaults to internal for iri_only and app for training.

create or replace function public.iberfit_admin_create_client_v26_pre_privileged_assurance(
  p_command jsonb,
  p_context jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb:=coalesce(p_context,public.iberfit_application_context_v14());
  v_org uuid;
  v_actor uuid:=auth.uid();
  v_op text:=btrim(coalesce(p_command->>'operationId',''));
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_email text:=lower(btrim(coalesce(v_payload->>'email','')));
  v_name text:=btrim(coalesce(v_payload->>'name',''));
  v_initial_lifecycle text:=lower(btrim(coalesce(v_payload->>'initialLifecycleStatus','onboarding')));
  v_access_mode text;
  v_existing jsonb;
  v_created jsonb;
  v_client uuid;
  v_audit uuid;
  v_result jsonb;
  v_access public.client_access_v26%rowtype;
begin
  if v_actor is null then raise exception 'V26_ADMIN_CLIENT_CREATE_AUTH_REQUIRED' using errcode='28000'; end if;
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V26_ADMIN_CLIENT_CREATE_ADMIN_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then raise exception 'V26_ADMIN_CLIENT_CREATE_ORGANIZATION_REQUIRED' using errcode='42501'; end if;
  if v_type<>'ADMIN_CLIENTE_CREAR' then raise exception 'V26_ADMIN_CLIENT_CREATE_COMMAND_INVALID' using errcode='22023'; end if;
  if v_op='' then raise exception 'V14_OPERATION_ID_INVALID' using errcode='22023'; end if;
  if v_email='' or position('@' in v_email)<=1 then raise exception 'V12_EMAIL_INVALID' using errcode='22023'; end if;
  if char_length(v_name)<2 then raise exception 'V26_ADMIN_CLIENT_CREATE_NAME_INVALID' using errcode='22023'; end if;
  if v_initial_lifecycle not in ('onboarding','iri_only') then
    raise exception 'V26_ADMIN_CLIENT_CREATE_LIFECYCLE_INVALID' using errcode='22023';
  end if;

  v_access_mode:=lower(btrim(coalesce(
    nullif(v_payload->>'accessMode',''),
    case when v_initial_lifecycle='iri_only' then 'internal' else 'app' end
  )));
  if v_access_mode not in ('internal','app') then
    raise exception 'V26_ADMIN_CLIENT_CREATE_ACCESS_MODE_INVALID' using errcode='22023';
  end if;

  select r.result into v_existing
  from public.iberfit_admin_mutation_receipts r
  where r.operation_id=v_op and r.actor_user_id=v_actor and r.command_type=v_type;
  if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate'); end if;
  if exists(select 1 from public.iberfit_admin_mutation_receipts r where r.operation_id=v_op) then
    raise exception 'V14_OPERATION_COLLISION' using errcode='23505';
  end if;

  v_created:=public.iberfit_create_client_draft_v12_pre_v65e(
    v_payload||jsonb_build_object('idempotencyKey',v_op)
  );
  begin v_client:=coalesce(v_created->>'clientId',v_created->>'client_id')::uuid;
  exception when others then raise exception 'V26_ADMIN_CLIENT_CREATE_RESULT_INVALID' using errcode='P0001'; end;
  if v_client is null then raise exception 'V26_ADMIN_CLIENT_CREATE_RESULT_INVALID' using errcode='P0001'; end if;

  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client::text);

  if not exists(
    select 1 from public.iberfit_client_lifecycle_events e
    where e.organization_id=v_org and e.client_id=v_client::text
  ) then
    insert into public.iberfit_client_lifecycle_events(
      organization_id,client_id,status,reason,changed_by
    ) values(
      v_org,
      v_client::text,
      v_initial_lifecycle,
      case
        when v_initial_lifecycle='iri_only' then 'Alta como persona con servicio IRI, sin entrenamiento activo.'
        else 'Alta de cliente desde Admin IBERFIT.'
      end,
      v_actor
    );
  end if;

  insert into public.client_access_v26(client_id,email,status)
  values(
    v_client,
    v_email,
    case when v_access_mode='internal' then 'sin_acceso' else 'invitacion_pendiente' end
  )
  on conflict(client_id) do update set
    email=excluded.email,
    status=case
      when public.client_access_v26.status='activo' then 'activo'
      when v_access_mode='internal' then 'sin_acceso'
      else 'invitacion_pendiente'
    end,
    invitation_delivery_status=case
      when public.client_access_v26.status='activo' then public.client_access_v26.invitation_delivery_status
      when v_access_mode='internal' then null
      else public.client_access_v26.invitation_delivery_status
    end,
    invitation_error_code=case
      when public.client_access_v26.status='activo' then public.client_access_v26.invitation_error_code
      when v_access_mode='internal' then null
      else public.client_access_v26.invitation_error_code
    end,
    last_invitation_operation_id=case
      when public.client_access_v26.status='activo' then public.client_access_v26.last_invitation_operation_id
      when v_access_mode='internal' then null
      else public.client_access_v26.last_invitation_operation_id
    end,
    updated_at=now(),
    revision=public.client_access_v26.revision+1
  returning * into v_access;

  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,
    entity_type,entity_id,summary,trace_id,revision
  ) values(
    v_org,'ADMIN_CLIENTE_CREAR',v_actor,'admin','client',v_client::text,
    case
      when v_initial_lifecycle='iri_only' and v_access_mode='internal'
        then 'Persona Solo IRI creada con expediente interno y sin invitación.'
      when v_initial_lifecycle='iri_only'
        then 'Persona Solo IRI creada con acceso IBERFIT preparado.'
      when v_access_mode='internal'
        then 'Cliente creado con expediente interno y sin invitación.'
      else 'Cliente creado y acceso preparado para invitación alojada.'
    end,
    v_op,coalesce(v_access.revision,0)::integer
  ) returning id into v_audit;

  v_result:=jsonb_build_object(
    'ok',true,'kind','ack','operationId',v_op,'commandType',v_type,
    'entityId',v_client::text,'clientId',v_client::text,'email',v_email,
    'initialLifecycleStatus',v_initial_lifecycle,
    'accessMode',v_access_mode,
    'revision',coalesce(v_access.revision,0),'auditId',v_audit,'serverTime',now(),
    'invitation',jsonb_build_object(
      'accessStatus',v_access.status,
      'deliveryStatus',v_access.invitation_delivery_status,
      'attemptCount',v_access.invitation_attempt_count,
      'sentAt',v_access.invitation_sent_at,
      'activatedAt',v_access.activated_at,
      'reason',case when v_access_mode='internal' then 'internal_record' else 'invitation_requested' end
    )
  );
  insert into public.iberfit_admin_mutation_receipts(
    operation_id,organization_id,actor_user_id,command_type,result
  ) values(v_op,v_org,v_actor,v_type,v_result);
  return v_result;
end
$function$;

revoke all on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb) to service_role;

create or replace function public.iberfit_admin_create_client_v26(
  p_command jsonb,
  p_context jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb:=coalesce(p_context,public.iberfit_application_context_v14());
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_actor uuid:=auth.uid();
  v_org uuid;
  v_relationship_raw text:=lower(btrim(coalesce(v_payload->>'relationshipType','')));
  v_initial_lifecycle text:=lower(btrim(coalesce(
    nullif(v_payload->>'initialLifecycleStatus',''),
    case when v_relationship_raw='iri_only' then 'iri_only' else 'onboarding' end
  )));
  v_relationship text;
  v_access_mode text;
  v_coach_raw text:=btrim(coalesce(v_payload->>'coachUserId',''));
  v_coach uuid;
  v_client text;
  v_assignment uuid;
  v_result jsonb;
  v_command jsonb;
begin
  perform public.iberfit_require_privileged_assurance_v65d();

  if v_actor is null then
    raise exception 'V26_ADMIN_CLIENT_CREATE_AUTH_REQUIRED' using errcode='28000';
  end if;
  if v_initial_lifecycle not in ('onboarding','iri_only') then
    raise exception 'V26_ADMIN_CLIENT_CREATE_LIFECYCLE_INVALID' using errcode='22023';
  end if;
  if v_relationship_raw<>'' and v_relationship_raw not in ('training','iri_only') then
    raise exception 'V26_ADMIN_CLIENT_CREATE_RELATIONSHIP_INVALID' using errcode='22023';
  end if;

  v_relationship:=case when v_initial_lifecycle='iri_only' then 'iri_only' else 'training' end;
  if v_relationship_raw<>'' and v_relationship_raw<>v_relationship then
    raise exception 'V26_ADMIN_CLIENT_CREATE_RELATIONSHIP_LIFECYCLE_MISMATCH' using errcode='22023';
  end if;

  v_access_mode:=lower(btrim(coalesce(
    nullif(v_payload->>'accessMode',''),
    case when v_initial_lifecycle='iri_only' then 'internal' else 'app' end
  )));
  if v_access_mode not in ('internal','app') then
    raise exception 'V26_ADMIN_CLIENT_CREATE_ACCESS_MODE_INVALID' using errcode='22023';
  end if;

  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then
    raise exception 'V26_ADMIN_CLIENT_CREATE_ORGANIZATION_REQUIRED' using errcode='42501';
  end if;

  if v_coach_raw<>'' then
    begin v_coach:=v_coach_raw::uuid;
    exception when others then
      raise exception 'V26_ADMIN_CLIENT_CREATE_COACH_INVALID' using errcode='22023';
    end;
    perform public.iberfit_assert_org_user_scope_v65e(v_org,v_coach,true,'coach');
  end if;

  v_payload:=v_payload||jsonb_build_object(
    'initialLifecycleStatus',v_initial_lifecycle,
    'accessMode',v_access_mode
  );
  v_command:=jsonb_set(p_command,'{payload}',v_payload,true);

  v_result:=public.iberfit_admin_create_client_v26_pre_privileged_assurance(
    v_command,
    v_context
  );

  v_client:=btrim(coalesce(v_result->>'clientId',v_result->>'entityId',''));
  if v_client='' then
    raise exception 'V26_ADMIN_CLIENT_CREATE_RESULT_INVALID' using errcode='P0001';
  end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);

  if v_coach is null then
    return v_result||jsonb_build_object('relationshipType',v_relationship,'accessMode',v_access_mode);
  end if;

  select a.id into v_assignment
  from public.iberfit_coach_client_assignments a
  where a.organization_id=v_org
    and a.coach_user_id=v_coach
    and a.client_id=v_client
    and a.status='active'
  order by a.created_at asc
  limit 1;

  if v_assignment is null then
    insert into public.iberfit_coach_client_assignments(
      organization_id,coach_user_id,client_id,status,starts_at,reason,created_by
    ) values(
      v_org,v_coach,v_client,'active',current_date,
      case when v_relationship='iri_only'
        then 'Asignación responsable para custodia y gestión del Diagnóstico IRI.'
        else 'Asignación inicial desde alta de cliente.'
      end,
      v_actor
    )
    returning id into v_assignment;
  end if;

  insert into public.iberfit_conversation_threads(
    organization_id,client_id,coach_user_id,created_by
  ) values(
    v_org,v_client,v_coach,v_actor
  )
  on conflict(organization_id,coach_user_id,client_id)
  do update set
    status='active',
    updated_at=now(),
    revision=public.iberfit_conversation_threads.revision+1;

  return v_result||jsonb_build_object(
    'relationshipType',v_relationship,
    'accessMode',v_access_mode,
    'coachAssignment',
    jsonb_build_object(
      'id',v_assignment,
      'coachUserId',v_coach,
      'clientId',v_client,
      'status','active'
    )
  );
end
$function$;

-- Keep the public admin command wrapper authenticated; privileged assurance and
-- role checks remain server-side. The pre-assurance helper stays service-only.
revoke all on function public.iberfit_admin_create_client_v26(jsonb,jsonb) from public,anon;
grant execute on function public.iberfit_admin_create_client_v26(jsonb,jsonb) to authenticated,service_role;
