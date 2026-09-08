alter table public.client_access_v26
  add column if not exists last_invitation_attempt_at timestamptz,
  add column if not exists invitation_delivery_status text,
  add column if not exists invitation_error_code text,
  add column if not exists last_invitation_operation_id text;

alter table public.client_access_v26
  drop constraint if exists client_access_v26_invitation_delivery_status_check;

alter table public.client_access_v26
  add constraint client_access_v26_invitation_delivery_status_check
  check (invitation_delivery_status is null or invitation_delivery_status in ('pending','sent','error'));

create or replace function public.iberfit_admin_create_client_v26(
  p_command jsonb,
  p_context jsonb default null
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
    ) values(v_org,v_client::text,'onboarding','Alta de cliente desde Admin IBERFIT.',v_actor);
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
    'Cliente creado y acceso preparado para invitación alojada.',v_op,coalesce(v_access.revision,0)::integer
  ) returning id into v_audit;

  v_result:=jsonb_build_object(
    'ok',true,'kind','ack','operationId',v_op,'commandType',v_type,
    'entityId',v_client::text,'clientId',v_client::text,'email',v_email,
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

create or replace function public.iberfit_admin_client_invitation_prepare_v26(
  p_client_id uuid,
  p_operation_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb;
  v_org uuid;
  v_actor uuid:=auth.uid();
  v_op text:=btrim(coalesce(p_operation_id,''));
  v_access public.client_access_v26%rowtype;
  v_name text;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_context:=public.iberfit_application_context_v14();
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V26_INVITE_ADMIN_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or v_actor is null then raise exception 'V26_INVITE_CONTEXT_REQUIRED' using errcode='42501'; end if;
  if p_client_id is null or v_op='' then raise exception 'V26_INVITE_PREPARE_INVALID' using errcode='22023'; end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,p_client_id::text);

  select * into v_access from public.client_access_v26 a where a.client_id=p_client_id for update;
  if not found then raise exception 'V26_INVITE_ACCESS_NOT_FOUND' using errcode='P0002'; end if;
  select c.name into v_name from public.clients c where c.id=p_client_id;

  if v_access.status='activo' then
    return jsonb_build_object('ok',true,'shouldSend',false,'reason','already_active','clientId',p_client_id,'email',v_access.email,'name',v_name,'accessStatus',v_access.status,'deliveryStatus',v_access.invitation_delivery_status);
  end if;
  if v_access.last_invitation_operation_id=v_op and v_access.invitation_delivery_status in ('pending','sent') then
    return jsonb_build_object('ok',true,'shouldSend',false,'reason','operation_already_prepared','clientId',p_client_id,'email',v_access.email,'name',v_name,'accessStatus',v_access.status,'deliveryStatus',v_access.invitation_delivery_status);
  end if;
  if v_access.invitation_delivery_status='sent' and v_access.invitation_sent_at is not null then
    return jsonb_build_object('ok',true,'shouldSend',false,'reason','already_sent','clientId',p_client_id,'email',v_access.email,'name',v_name,'accessStatus',v_access.status,'deliveryStatus','sent');
  end if;

  update public.client_access_v26 set
    status='invitacion_pendiente',
    invitation_attempt_count=invitation_attempt_count+1,
    last_invitation_attempt_at=now(),
    invitation_delivery_status='pending',
    invitation_error_code=null,
    last_invitation_operation_id=v_op,
    updated_at=now(),revision=revision+1
  where client_id=p_client_id returning * into v_access;

  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,entity_type,entity_id,summary,trace_id,revision
  ) values(v_org,'ADMIN_CLIENT_INVITATION_ATTEMPT',v_actor,'admin','client_access',p_client_id::text,'Intento de invitación alojada iniciado.',v_op,v_access.revision::integer);

  return jsonb_build_object('ok',true,'shouldSend',true,'clientId',p_client_id,'email',v_access.email,'name',v_name,'accessStatus',v_access.status,'deliveryStatus','pending','attemptCount',v_access.invitation_attempt_count);
end
$function$;

create or replace function public.iberfit_admin_client_invitation_bind_v26(
  p_client_id uuid,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb;
  v_org uuid;
  v_actor uuid:=auth.uid();
  v_access public.client_access_v26%rowtype;
  v_auth_email text;
  v_role text;
  v_profile_client uuid;
  v_name text;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_context:=public.iberfit_application_context_v14();
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V26_INVITE_ADMIN_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or v_actor is null or p_client_id is null or p_auth_user_id is null then raise exception 'V26_INVITE_BIND_CONTEXT_REQUIRED' using errcode='42501'; end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,p_client_id::text);

  select * into v_access from public.client_access_v26 a where a.client_id=p_client_id for update;
  if not found then raise exception 'V26_INVITE_ACCESS_NOT_FOUND' using errcode='P0002'; end if;
  select lower(btrim(u.email)) into v_auth_email from auth.users u where u.id=p_auth_user_id;
  if v_auth_email is null then raise exception 'V26_INVITE_AUTH_USER_NOT_FOUND' using errcode='P0002'; end if;
  if lower(btrim(coalesce(v_access.email,'')))<>v_auth_email then raise exception 'V26_INVITE_IDENTITY_EMAIL_MISMATCH' using errcode='42501'; end if;
  if exists(select 1 from public.client_access_v26 a where a.auth_user_id=p_auth_user_id and a.client_id<>p_client_id) then raise exception 'V26_INVITE_IDENTITY_ALREADY_LINKED' using errcode='42501'; end if;

  select lower(up.role::text),up.client_id into v_role,v_profile_client
  from public.user_profiles up where up.user_id=p_auth_user_id;
  if found then
    if v_role<>'client' or (v_profile_client is not null and v_profile_client<>p_client_id) then
      raise exception 'V26_INVITE_IDENTITY_CONFLICT' using errcode='42501';
    end if;
    update public.user_profiles set client_id=p_client_id where user_id=p_auth_user_id and client_id is distinct from p_client_id;
  else
    select c.name into v_name from public.clients c where c.id=p_client_id;
    insert into public.user_profiles(user_id,role,client_id,display_name)
    values(p_auth_user_id,'client'::public.iberfit_role,p_client_id,coalesce(nullif(btrim(v_name),''),v_auth_email));
  end if;

  insert into public.user_application_roles(user_id,role,active,granted_by)
  values(p_auth_user_id,'client',true,v_actor)
  on conflict(user_id,role) do update set active=true,granted_at=now(),granted_by=v_actor;

  insert into public.iberfit_organization_memberships(organization_id,user_id,status)
  values(v_org,p_auth_user_id,'active')
  on conflict(organization_id,user_id) do update set status='active',revision=public.iberfit_organization_memberships.revision+1,updated_at=now();

  update public.client_access_v26 set
    auth_user_id=p_auth_user_id,
    status=case when status='activo' then 'activo' else 'invitacion_pendiente' end,
    updated_at=now(),revision=revision+1
  where client_id=p_client_id returning * into v_access;

  return jsonb_build_object('ok',true,'clientId',p_client_id,'authUserId',p_auth_user_id,'email',v_auth_email,'accessStatus',v_access.status);
end
$function$;

create or replace function public.iberfit_admin_client_invitation_finalize_v26(
  p_client_id uuid,
  p_operation_id text,
  p_delivery_status text,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb;
  v_org uuid;
  v_actor uuid:=auth.uid();
  v_status text:=lower(btrim(coalesce(p_delivery_status,'')));
  v_code text:=upper(regexp_replace(btrim(coalesce(p_error_code,'')),'[^A-Za-z0-9_:-]+','','g'));
  v_access public.client_access_v26%rowtype;
  v_summary text;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_context:=public.iberfit_application_context_v14();
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V26_INVITE_ADMIN_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or v_actor is null then raise exception 'V26_INVITE_FINALIZE_CONTEXT_REQUIRED' using errcode='42501'; end if;
  if v_status not in ('sent','error') then raise exception 'V26_INVITE_DELIVERY_STATUS_INVALID' using errcode='22023'; end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,p_client_id::text);

  update public.client_access_v26 set
    invitation_delivery_status=v_status,
    invitation_sent_at=case when v_status='sent' then coalesce(invitation_sent_at,now()) else invitation_sent_at end,
    invitation_error_code=case when v_status='error' then left(coalesce(nullif(v_code,''),'INVITATION_SEND_FAILED'),100) else null end,
    updated_at=now(),revision=revision+1
  where client_id=p_client_id
  returning * into v_access;
  if not found then raise exception 'V26_INVITE_ACCESS_NOT_FOUND' using errcode='P0002'; end if;

  v_summary:=case when v_status='sent' then 'Invitación alojada aceptada por el proveedor de autenticación.' else 'La invitación no pudo entregarse; el cliente permanece creado y pendiente.' end;
  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,entity_type,entity_id,summary,trace_id,revision
  ) values(v_org,case when v_status='sent' then 'ADMIN_CLIENT_INVITATION_SENT' else 'ADMIN_CLIENT_INVITATION_ERROR' end,v_actor,'admin','client_access',p_client_id::text,v_summary,btrim(coalesce(p_operation_id,'')),v_access.revision::integer);

  return jsonb_build_object('ok',true,'clientId',p_client_id,'accessStatus',v_access.status,'deliveryStatus',v_status,'attemptCount',v_access.invitation_attempt_count,'lastAttemptAt',v_access.last_invitation_attempt_at,'sentAt',v_access.invitation_sent_at,'errorCode',v_access.invitation_error_code,'activatedAt',v_access.activated_at);
end
$function$;

create or replace function public.iberfit_admin_execute_v14(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
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
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_org uuid;
  v_access jsonb;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_base:=public.iberfit_admin_bootstrap_v14_pre_v65e();
  v_org:=nullif(v_base#>>'{organization,id}','')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'clientId',a.client_id,'authUserId',a.auth_user_id,'email',a.email,
    'status',a.status,'revision',a.revision,'invitationAttemptCount',a.invitation_attempt_count,
    'lastInvitationAttemptAt',a.last_invitation_attempt_at,'invitationSentAt',a.invitation_sent_at,
    'invitationDeliveryStatus',a.invitation_delivery_status,'invitationErrorCode',a.invitation_error_code,
    'activatedAt',a.activated_at,'updatedAt',a.updated_at
  ) order by a.updated_at desc),'[]'::jsonb) into v_access
  from public.client_access_v26 a
  where exists(select 1 from public.iberfit_client_lifecycle_events e where e.organization_id=v_org and e.client_id=a.client_id::text)
     or exists(select 1 from public.iberfit_coach_client_assignments ca where ca.organization_id=v_org and ca.client_id=a.client_id::text)
     or exists(select 1 from public.iberfit_conversation_threads t where t.organization_id=v_org and t.client_id=a.client_id::text)
     or exists(select 1 from public.iberfit_operational_tasks o where o.organization_id=v_org and o.client_id=a.client_id::text);
  return jsonb_set(v_base,'{data,clientAccess}',coalesce(v_access,'[]'::jsonb),true);
end
$function$;

create or replace function private.iberfit_sync_client_access_activation_v26()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_client uuid;
begin
  if new.email_confirmed_at is null then return new; end if;
  select a.client_id into v_client from public.client_access_v26 a
  where a.auth_user_id=new.id and a.status='invitacion_pendiente'
  limit 1;
  if v_client is null then return new; end if;
  if not exists(select 1 from public.user_profiles up where up.user_id=new.id and lower(up.role::text)='client' and up.client_id=v_client) then return new; end if;
  update public.client_access_v26 set
    status='activo',activated_at=coalesce(activated_at,now()),
    invitation_delivery_status=coalesce(invitation_delivery_status,'sent'),
    invitation_error_code=null,updated_at=now(),revision=revision+1
  where client_id=v_client and auth_user_id=new.id and status='invitacion_pendiente';
  insert into public.audit_events(event_type,entity_type,entity_id,actor_user_id,payload)
  values('CLIENT_ACCESS_ACTIVATED','client',v_client::text,new.id,jsonb_build_object('authUserId',new.id,'source','hosted_auth_password_activation'));
  return new;
end
$function$;

drop trigger if exists iberfit_sync_client_access_activation_v26 on auth.users;
create trigger iberfit_sync_client_access_activation_v26
after update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function private.iberfit_sync_client_access_activation_v26();

revoke all on function public.iberfit_admin_create_client_v26(jsonb,jsonb) from public,anon;
revoke all on function public.iberfit_admin_client_invitation_prepare_v26(uuid,text) from public,anon;
revoke all on function public.iberfit_admin_client_invitation_bind_v26(uuid,uuid) from public,anon;
revoke all on function public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text) from public,anon;
grant execute on function public.iberfit_admin_create_client_v26(jsonb,jsonb) to authenticated;
grant execute on function public.iberfit_admin_client_invitation_prepare_v26(uuid,text) to authenticated;
grant execute on function public.iberfit_admin_client_invitation_bind_v26(uuid,uuid) to authenticated;
grant execute on function public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text) to authenticated;