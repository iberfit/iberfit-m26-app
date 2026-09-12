-- P0: safe Admin account/Coach decommission.
-- Access is revoked transactionally in Postgres; Auth identity is soft-deleted by the
-- companion Edge Function only after this receipt is committed.

create or replace function public.iberfit_admin_decommission_user_v1(
  p_command jsonb,
  p_context jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_org uuid;
  v_actor uuid:=auth.uid();
  v_operation text:=btrim(coalesce(p_command->>'operationId',''));
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_reason text:=btrim(coalesce(p_command->>'reason',''));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_existing jsonb;
  v_target uuid;
  v_confirm_target uuid;
  v_confirm_value text:=btrim(coalesce(v_payload->>'confirmValue',''));
  v_confirm_phrase text:=upper(btrim(coalesce(v_payload->>'confirmPhrase','')));
  v_email text;
  v_expected text;
  v_base integer:=coalesce((p_command->>'baseRevision')::integer,0);
  v_current_revision integer;
  v_current_status text;
  v_is_admin boolean:=false;
  v_rows integer:=0;
  v_assignments_ended integer:=0;
  v_legacy_assignments_disabled integer:=0;
  v_threads_closed integer:=0;
  v_availability_disabled integer:=0;
  v_access_revoked integer:=0;
  v_intake_detached integer:=0;
  v_roles_revoked integer:=0;
  v_webauthn_revoked integer:=0;
  v_assurance_revoked integer:=0;
  v_preview_removed integer:=0;
  v_audit_id uuid;
  v_result jsonb;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_org:=public.iberfit_admin_require_v14();

  if v_actor is null then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_AUTH_REQUIRED' using errcode='42501';
  end if;
  if v_type<>'ADMIN_USUARIO_ELIMINAR' then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_COMMAND_INVALID' using errcode='22023';
  end if;
  if v_operation='' then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_OPERATION_INVALID' using errcode='22023';
  end if;
  if char_length(v_reason)<8 then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_REASON_REQUIRED' using errcode='22023';
  end if;

  select result
    into v_existing
  from public.iberfit_admin_mutation_receipts
  where operation_id=v_operation
    and actor_user_id=v_actor
    and command_type=v_type;
  if v_existing is not null then
    return v_existing||jsonb_build_object('kind','duplicate');
  end if;
  if exists(select 1 from public.iberfit_admin_mutation_receipts where operation_id=v_operation) then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_OPERATION_COLLISION' using errcode='23505';
  end if;

  begin
    v_target:=(v_payload->>'userId')::uuid;
    v_confirm_target:=(v_payload->>'confirmUserId')::uuid;
  exception when others then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_TARGET_INVALID' using errcode='22023';
  end;

  if v_target is null
     or v_confirm_target is distinct from v_target
     or v_confirm_phrase<>'ELIMINAR' then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_CONFIRMATION_INVALID' using errcode='22023';
  end if;
  if v_target=v_actor then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_SELF_FORBIDDEN' using errcode='42501';
  end if;

  perform public.iberfit_assert_org_user_scope_v65e(v_org,v_target,false,null);
  perform public.iberfit_assert_global_role_mutation_scope_v65e(v_org,v_target);

  select m.revision,m.status
    into v_current_revision,v_current_status
  from public.iberfit_organization_memberships m
  where m.organization_id=v_org and m.user_id=v_target
  for update;
  if not found then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_NOT_FOUND' using errcode='P0002';
  end if;
  if v_base<1 or v_current_revision<>v_base then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_REVISION_CONFLICT' using errcode='40001';
  end if;

  select nullif(lower(btrim(u.email)),'')
    into v_email
  from auth.users u
  where u.id=v_target;
  if not found then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_AUTH_NOT_FOUND' using errcode='P0002';
  end if;

  v_expected:=coalesce(v_email,v_target::text);
  if lower(v_confirm_value)<>lower(v_expected) then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_CONFIRMATION_INVALID' using errcode='22023';
  end if;

  select exists(
    select 1 from public.user_application_roles r
    where r.user_id=v_target and r.role='admin' and r.active=true
  ) into v_is_admin;

  if v_is_admin and (
    select count(*)
    from public.user_application_roles r
    join public.iberfit_organization_memberships m on m.user_id=r.user_id
    where r.role='admin'
      and r.active=true
      and m.organization_id=v_org
      and m.status='active'
  )<=1 then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_LAST_ADMIN_PROTECTED' using errcode='42501';
  end if;

  update public.iberfit_coach_client_assignments
  set status='ended',
      ends_at=greatest(current_date,starts_at),
      ended_by=v_actor,
      reason=left(concat('Baja de cuenta: ',v_reason),500),
      revision=revision+1,
      updated_at=now()
  where organization_id=v_org
    and coach_user_id=v_target
    and status='active';
  get diagnostics v_assignments_ended=row_count;

  update public.client_assignments
  set active=false
  where coach_user_id=v_target and active=true;
  get diagnostics v_legacy_assignments_disabled=row_count;

  update public.iberfit_conversation_threads
  set status='closed',revision=revision+1,updated_at=now()
  where organization_id=v_org
    and coach_user_id=v_target
    and status='active';
  get diagnostics v_threads_closed=row_count;

  update public.coach_availability_v26
  set active=false,revision=revision+1,updated_at=now()
  where coach_user_id=v_target and active=true;
  get diagnostics v_availability_disabled=row_count;

  update public.client_access_v26
  set status='revocado',
      closed_at=coalesce(closed_at,now()),
      close_reason=left(v_reason,500),
      revision=revision+1,
      updated_at=now()
  where auth_user_id=v_target
    and status<>'revocado';
  get diagnostics v_access_revoked=row_count;

  update public.client_intake_profiles
  set auth_user_id=null
  where auth_user_id=v_target;
  get diagnostics v_intake_detached=row_count;

  delete from public.preview_sessions where user_id=v_target;
  get diagnostics v_rows=row_count;
  v_preview_removed:=v_preview_removed+coalesce(v_rows,0);

  delete from public.preview_access where user_id=v_target;
  get diagnostics v_rows=row_count;
  v_preview_removed:=v_preview_removed+coalesce(v_rows,0);

  delete from public.iberfit_webauthn_challenges_v1 where user_id=v_target;

  update public.iberfit_webauthn_credentials_v1
  set revoked_at=coalesce(revoked_at,now())
  where user_id=v_target and revoked_at is null;
  get diagnostics v_webauthn_revoked=row_count;

  update public.iberfit_privileged_assurance_v1
  set revoked_at=coalesce(revoked_at,now())
  where user_id=v_target and revoked_at is null;
  get diagnostics v_rows=row_count;
  v_assurance_revoked:=v_assurance_revoked+coalesce(v_rows,0);

  update public.iberfit_email_privileged_assurance_v1
  set revoked_at=coalesce(revoked_at,now())
  where user_id=v_target and revoked_at is null;
  get diagnostics v_rows=row_count;
  v_assurance_revoked:=v_assurance_revoked+coalesce(v_rows,0);

  update public.user_application_roles
  set active=false,granted_at=now(),granted_by=v_actor
  where user_id=v_target and active=true;
  get diagnostics v_roles_revoked=row_count;

  delete from public.user_profiles where user_id=v_target;

  update public.iberfit_organization_memberships
  set status='inactive',revision=revision+1,updated_at=now()
  where organization_id=v_org and user_id=v_target and revision=v_current_revision
  returning revision into v_current_revision;
  if not found then
    raise exception 'IBERFIT_ADMIN_USER_DELETE_REVISION_CONFLICT' using errcode='40001';
  end if;

  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,
    entity_type,entity_id,summary,trace_id,revision
  )
  values(
    v_org,v_type,v_actor,'admin','auth_user',v_target::text,
    concat(
      'Cuenta dada de baja por ADMIN. Motivo: ',left(v_reason,240),
      '. Asignaciones finalizadas: ',v_assignments_ended,
      '. Asignaciones legacy desactivadas: ',v_legacy_assignments_disabled,
      '. Conversaciones cerradas: ',v_threads_closed,
      '. Disponibilidades desactivadas: ',v_availability_disabled,
      '. Accesos Cliente revocados: ',v_access_revoked,
      '. Roles revocados: ',v_roles_revoked,
      '. Credenciales WebAuthn revocadas: ',v_webauthn_revoked,
      '. Assurance revocadas: ',v_assurance_revoked,
      '. La identidad Auth queda pendiente de soft-delete server-side.'
    ),
    v_operation,v_current_revision
  )
  returning id into v_audit_id;

  v_result:=jsonb_build_object(
    'ok',true,
    'kind','ack',
    'operationId',v_operation,
    'commandType',v_type,
    'entityId',v_target::text,
    'targetUserId',v_target::text,
    'targetEmail',v_email,
    'revision',v_current_revision,
    'membershipStatus','inactive',
    'assignmentsEnded',v_assignments_ended,
    'legacyAssignmentsDisabled',v_legacy_assignments_disabled,
    'threadsClosed',v_threads_closed,
    'availabilityDisabled',v_availability_disabled,
    'clientAccessRevoked',v_access_revoked,
    'intakeLinksDetached',v_intake_detached,
    'rolesRevoked',v_roles_revoked,
    'webauthnRevoked',v_webauthn_revoked,
    'assuranceRevoked',v_assurance_revoked,
    'previewRowsRemoved',v_preview_removed,
    'authSoftDeleteRequired',true,
    'auditId',v_audit_id,
    'serverTime',now()
  );

  insert into public.iberfit_admin_mutation_receipts(
    operation_id,organization_id,actor_user_id,command_type,result
  )
  values(v_operation,v_org,v_actor,v_type,v_result);

  return v_result;
end
$function$;

revoke all on function public.iberfit_admin_decommission_user_v1(jsonb,jsonb) from public,anon,authenticated;

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
  elsif v_type='ADMIN_CLIENTE_CAMBIAR_CICLO' then
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
  end if;
  return public.iberfit_admin_execute_v14_pre_v65e(p_command);
end
$function$;

-- Existing ACL on iberfit_admin_execute_v14 is preserved by CREATE OR REPLACE.
