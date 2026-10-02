-- IBERFIT service dimension v1.
-- Additive by design: service purchased (training vs IRI-only) is independent from
-- lifecycle and Coach assignment. This preserves private IRI authorization without
-- counting IRI-only people as active training clients.

-- IBERFIT-TABLE-ACCESS: public.iberfit_client_service_events :: service-role-only append-only service history; no direct anon/authenticated access; Admin reads and writes only through privileged SECURITY DEFINER workflows.
-- IBERFIT-POLICY: public.iberfit_client_service_events = service-role-only
create table if not exists public.iberfit_client_service_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_kind text not null check (service_kind in ('training','iri_only')),
  reason text not null check (char_length(reason) between 3 and 500),
  changed_by uuid not null references auth.users(id),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists iberfit_client_service_events_org_client_effective_idx
  on public.iberfit_client_service_events(organization_id,client_id,effective_at desc,created_at desc);

alter table public.iberfit_client_service_events enable row level security;
alter table public.iberfit_client_service_events force row level security;
revoke all on table public.iberfit_client_service_events from public,anon,authenticated;
grant select,insert on table public.iberfit_client_service_events to service_role;

comment on table public.iberfit_client_service_events is
  'Append-only commercial service history. iri_only means paid IRI/report without active training service. Coach assignment remains independent for private-record authorization.';

create or replace function public.iberfit_admin_create_client_v26_pre_privileged_assurance(
  p_command jsonb,
  p_context jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
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
  v_initial_service text:=lower(btrim(coalesce(v_payload->>'initialServiceKind','training')));
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
  if v_initial_service not in ('training','iri_only') then
    raise exception 'V26_ADMIN_CLIENT_CREATE_SERVICE_INVALID' using errcode='22023';
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
    ) values(v_org,v_client::text,'onboarding','Alta de expediente desde Admin IBERFIT.',v_actor);
  end if;

  if not exists(
    select 1 from public.iberfit_client_service_events s
    where s.organization_id=v_org and s.client_id=v_client
  ) then
    insert into public.iberfit_client_service_events(
      organization_id,client_id,service_kind,reason,changed_by
    ) values(
      v_org,v_client,v_initial_service,
      case when v_initial_service='iri_only'
        then 'Alta como persona con servicio IRI, sin entrenamiento activo.'
        else 'Alta con servicio de entrenamiento personal.'
      end,
      v_actor
    );
  end if;

  insert into public.client_access_v26(client_id,email,status)
  values(v_client,v_email,'invitacion_pendiente')
  on conflict(client_id) do update set
    email=excluded.email,
    status=case when public.client_access_v26.status='activo' then 'activo' else 'invitacion_pendiente' end,
    updated_at=now(),
    revision=public.client_access_v26.revision+1
  returning * into v_access;

  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,
    entity_type,entity_id,summary,trace_id,revision
  ) values(
    v_org,'ADMIN_CLIENTE_CREAR',v_actor,'admin','client',v_client::text,
    case when v_initial_service='iri_only'
      then 'Persona creada para servicio IRI y acceso preparado.'
      else 'Cliente creado y acceso preparado para invitación alojada.'
    end,
    v_op,coalesce(v_access.revision,0)::integer
  ) returning id into v_audit;

  v_result:=jsonb_build_object(
    'ok',true,'kind','ack','operationId',v_op,'commandType',v_type,
    'entityId',v_client::text,'clientId',v_client::text,'email',v_email,
    'initialServiceKind',v_initial_service,
    'revision',coalesce(v_access.revision,0),'auditId',v_audit,'serverTime',now(),
    'invitation',jsonb_build_object(
      'accessStatus',v_access.status,
      'deliveryStatus',v_access.invitation_delivery_status,
      'attemptCount',v_access.invitation_attempt_count,
      'sentAt',v_access.invitation_sent_at,
      'activatedAt',v_access.activated_at
    )
  );
  insert into public.iberfit_admin_mutation_receipts(
    operation_id,organization_id,actor_user_id,command_type,result
  ) values(v_op,v_org,v_actor,v_type,v_result);
  return v_result;
end
$function$;

create or replace function public.iberfit_admin_set_client_service_v1(
  p_command jsonb,
  p_context jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_context jsonb:=coalesce(p_context,public.iberfit_application_context_v14());
  v_org uuid;
  v_actor uuid:=auth.uid();
  v_op text:=btrim(coalesce(p_command->>'operationId',''));
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_client uuid;
  v_service text:=lower(btrim(coalesce(v_payload->>'serviceKind','')));
  v_reason text:=btrim(coalesce(p_command->>'reason',''));
  v_existing jsonb;
  v_event uuid;
  v_audit uuid;
  v_result jsonb;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception 'V1_CLIENT_SERVICE_AUTH_REQUIRED' using errcode='28000'; end if;
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V1_CLIENT_SERVICE_ADMIN_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then raise exception 'V1_CLIENT_SERVICE_ORGANIZATION_REQUIRED' using errcode='42501'; end if;
  if v_type<>'ADMIN_CLIENTE_CAMBIAR_SERVICIO' then raise exception 'V1_CLIENT_SERVICE_COMMAND_INVALID' using errcode='22023'; end if;
  if v_op='' then raise exception 'V14_OPERATION_ID_INVALID' using errcode='22023'; end if;
  if char_length(v_reason)<3 or char_length(v_reason)>500 then raise exception 'V14_REASON_REQUIRED' using errcode='22023'; end if;
  if v_service not in ('training','iri_only') then raise exception 'V1_CLIENT_SERVICE_KIND_INVALID' using errcode='22023'; end if;
  begin v_client:=(v_payload->>'clientId')::uuid;
  exception when others then raise exception 'V1_CLIENT_SERVICE_CLIENT_INVALID' using errcode='22023'; end;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client::text);

  select r.result into v_existing
  from public.iberfit_admin_mutation_receipts r
  where r.operation_id=v_op and r.actor_user_id=v_actor and r.command_type=v_type;
  if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate'); end if;
  if exists(select 1 from public.iberfit_admin_mutation_receipts r where r.operation_id=v_op) then
    raise exception 'V14_OPERATION_COLLISION' using errcode='23505';
  end if;

  insert into public.iberfit_client_service_events(
    organization_id,client_id,service_kind,reason,changed_by
  ) values(v_org,v_client,v_service,v_reason,v_actor)
  returning id into v_event;

  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,
    entity_type,entity_id,summary,trace_id,revision
  ) values(
    v_org,'ADMIN_CLIENTE_CAMBIAR_SERVICIO',v_actor,'admin','client',v_client::text,
    concat('Servicio actualizado a ',v_service,'.'),v_op,1
  ) returning id into v_audit;

  v_result:=jsonb_build_object(
    'ok',true,'kind','ack','operationId',v_op,'commandType',v_type,
    'entityId',v_client::text,'clientId',v_client::text,
    'serviceKind',v_service,'serviceEventId',v_event,'auditId',v_audit,'serverTime',now()
  );
  insert into public.iberfit_admin_mutation_receipts(
    operation_id,organization_id,actor_user_id,command_type,result
  ) values(v_op,v_org,v_actor,v_type,v_result);
  return v_result;
end
$function$;

create or replace function public.iberfit_admin_execute_v14(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_context jsonb;
  v_org uuid;
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_target_user uuid;
  v_role text;
  v_client text;
  v_coach uuid;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_context:=public.iberfit_application_context_v14();
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V65E_ADMIN_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then raise exception 'V65E_ORGANIZATION_REQUIRED' using errcode='42501'; end if;
  if v_type='ADMIN_CLIENTE_CREAR' then
    return public.iberfit_admin_create_client_v26(p_command,v_context);
  elsif v_type='ADMIN_CLIENTE_ACTUALIZAR_FICHA' then
    return public.iberfit_admin_update_client_profile_v26(p_command,v_context);
  elsif v_type='ADMIN_USUARIO_ELIMINAR' then
    return public.iberfit_admin_decommission_user_v1(p_command,v_context);
  elsif v_type in ('ADMIN_ROL_OTORGAR','ADMIN_ROL_REVOCAR') then
    begin v_target_user:=(v_payload->>'userId')::uuid; exception when others then raise exception 'V65E_TARGET_USER_INVALID' using errcode='22023'; end;
    v_role:=lower(btrim(coalesce(v_payload->>'role','')));
    if v_role not in ('client','coach','admin') then raise exception 'V65E_ROLE_INVALID' using errcode='22023'; end if;
    perform public.iberfit_assert_org_user_scope_v65e(v_org,v_target_user,v_type='ADMIN_ROL_OTORGAR',null);
    perform public.iberfit_assert_global_role_mutation_scope_v65e(v_org,v_target_user);
  elsif v_type='ADMIN_ASIGNACION_CREAR' then
    begin v_coach:=(v_payload->>'coachUserId')::uuid; exception when others then raise exception 'V65E_COACH_USER_INVALID' using errcode='22023'; end;
    perform public.iberfit_assert_org_user_scope_v65e(v_org,v_coach,true,'coach');
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
  elsif v_type='ADMIN_CLIENTE_ELIMINAR' then
    return public.iberfit_admin_delete_client_v26(p_command,v_context);
  elsif v_type='ADMIN_CLIENTE_CAMBIAR_SERVICIO' then
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
    return public.iberfit_admin_set_client_service_v1(p_command,v_context);
  elsif v_type='ADMIN_CLIENTE_CAMBIAR_CICLO' then
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
  end if;
  return public.iberfit_admin_execute_v14_pre_v65e(p_command);
end
$function$;

create or replace function public.iberfit_admin_bootstrap_v14()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_org uuid;
  v_access jsonb;
  v_services jsonb;
  v_active_clients integer;
begin
  v_base:=public.iberfit_admin_bootstrap_v14_pre_v65e();
  v_org:=nullif(v_base#>>'{organization,id}','')::uuid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',a.id,
        'clientId',a.client_id,
        'authUserId',a.auth_user_id,
        'email',a.email,
        'status',a.status,
        'revision',a.revision,
        'invitationAttemptCount',a.invitation_attempt_count,
        'lastInvitationAttemptAt',a.last_invitation_attempt_at,
        'invitationSentAt',a.invitation_sent_at,
        'invitationDeliveryStatus',a.invitation_delivery_status,
        'invitationErrorCode',a.invitation_error_code,
        'activatedAt',a.activated_at,
        'updatedAt',a.updated_at
      )
      order by a.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_access
  from public.client_access_v26 a
  where exists(select 1 from public.iberfit_client_lifecycle_events e where e.organization_id=v_org and e.client_id=a.client_id::text)
     or exists(select 1 from public.iberfit_coach_client_assignments ca where ca.organization_id=v_org and ca.client_id=a.client_id::text)
     or exists(select 1 from public.iberfit_conversation_threads t where t.organization_id=v_org and t.client_id=a.client_id::text)
     or exists(select 1 from public.iberfit_operational_tasks o where o.organization_id=v_org and o.client_id=a.client_id::text);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',s.id,
        'clientId',s.client_id,
        'serviceKind',s.service_kind,
        'reason',s.reason,
        'changedBy',s.changed_by,
        'effectiveAt',s.effective_at,
        'createdAt',s.created_at
      )
      order by s.effective_at desc,s.created_at desc
    ),
    '[]'::jsonb
  )
  into v_services
  from (
    select distinct on(client_id) *
    from public.iberfit_client_service_events
    where organization_id=v_org
    order by client_id,effective_at desc,created_at desc
  ) s;

  select count(*)::integer
  into v_active_clients
  from (
    select distinct on(client_id) client_id,status
    from public.iberfit_client_lifecycle_events
    where organization_id=v_org
    order by client_id,effective_at desc
  ) l
  left join (
    select distinct on(client_id) client_id,service_kind
    from public.iberfit_client_service_events
    where organization_id=v_org
    order by client_id,effective_at desc,created_at desc
  ) s on s.client_id::text=l.client_id
  where l.status='active' and coalesce(s.service_kind,'training')<>'iri_only';

  v_base:=jsonb_set(v_base,'{data,clientAccess}',coalesce(v_access,'[]'::jsonb),true);
  v_base:=jsonb_set(v_base,'{data,clientServices}',coalesce(v_services,'[]'::jsonb),true);
  v_base:=jsonb_set(v_base,'{analytics,activeClients}',to_jsonb(coalesce(v_active_clients,0)),true);
  return v_base;
end
$function$;

revoke all on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_admin_set_client_service_v1(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb) to service_role;
grant execute on function public.iberfit_admin_set_client_service_v1(jsonb,jsonb) to service_role;
