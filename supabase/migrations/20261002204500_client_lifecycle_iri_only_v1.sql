-- IBERFIT: distinguish paid IRI-only people from active training clients.
-- Additive lifecycle state. Coach assignment remains independent so private IRI access can stay authorized.

alter table public.iberfit_client_lifecycle_events
  drop constraint if exists iberfit_client_lifecycle_events_status_check;

alter table public.iberfit_client_lifecycle_events
  add constraint iberfit_client_lifecycle_events_status_check
  check (status = any (array[
    'lead'::text,
    'onboarding'::text,
    'iri_only'::text,
    'active'::text,
    'paused'::text,
    'inactive'::text,
    'reactivation'::text
  ]));

comment on constraint iberfit_client_lifecycle_events_status_check
  on public.iberfit_client_lifecycle_events
  is 'Commercial lifecycle. iri_only means a person with a paid IRI/record but no active training service.';

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
  v_initial_lifecycle text:=lower(btrim(coalesce(v_payload->>'initialLifecycleStatus','onboarding')));
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
    case when v_initial_lifecycle='iri_only'
      then 'Persona creada para servicio IRI y acceso preparado.'
      else 'Cliente creado y acceso preparado para invitación alojada.'
    end,
    v_op,coalesce(v_access.revision,0)::integer
  ) returning id into v_audit;

  v_result:=jsonb_build_object(
    'ok',true,'kind','ack','operationId',v_op,'commandType',v_type,
    'entityId',v_client::text,'clientId',v_client::text,'email',v_email,
    'initialLifecycleStatus',v_initial_lifecycle,
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

revoke all on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb) to service_role;
