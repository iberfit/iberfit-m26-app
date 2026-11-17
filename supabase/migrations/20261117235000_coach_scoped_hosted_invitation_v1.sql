-- IBERFIT: Hosted Auth invitation from an assigned Coach. Staged; never auto-deploy to PROD.
-- Preconditions: exact SQL parity, WebAuthn assurance, active org membership and Coach/client assignment.
-- Existing Admin authorization and Auth identity-binding guards remain.
BEGIN;
CREATE OR REPLACE FUNCTION private.iberfit_coach_invite_source_guard_v1()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $coach_invite_source_gate$
DECLARE v_environment text; v_production_blocked boolean;
BEGIN
  SELECT value#>>'{}' INTO v_environment FROM public.iberfit_system_settings WHERE key='environment';
  SELECT (value#>>'{}')::boolean INTO v_production_blocked FROM public.iberfit_system_settings WHERE key='production_blocked';
  IF (v_environment='PRODUCTION' AND v_production_blocked IS DISTINCT FROM false)
    OR (v_environment='QA' AND v_production_blocked IS DISTINCT FROM true)
    OR v_environment NOT IN ('QA','PRODUCTION') OR v_environment IS NULL
    THEN RAISE EXCEPTION 'M26_COACH_INVITE_ENVIRONMENT_DENIED' USING errcode='42501'; END IF;
  IF md5(pg_get_functiondef('public.iberfit_admin_client_invitation_prepare_v26(uuid,text)'::regprocedure))
        NOT IN ('6d3465abd99d9a10b95ff06b8c8f495c','9590d58f17eab222970db25a1f5cc339')
    OR md5(pg_get_functiondef('public.iberfit_admin_client_invitation_bind_v26(uuid,uuid)'::regprocedure))
        NOT IN ('a45e4b070927c45e41bc4bce097d5bb9','cc3d989b905efe1a71eb16632b4ef872')
    OR md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure))
        NOT IN ('66743cf255b81523a4733b63d1c98fc0','e3a2b7487aeb70247d0e94956e9ebcec')
    THEN RAISE EXCEPTION 'M26_COACH_INVITE_BASELINE_DRIFT' USING errcode='42501'; END IF;
  IF to_regclass('public.client_assignments') IS NULL
     OR to_regclass('public.iberfit_coach_client_assignments') IS NULL
     OR to_regclass('public.client_access_v26') IS NULL
     OR to_regclass('public.iberfit_organization_memberships') IS NULL
    THEN RAISE EXCEPTION 'M26_COACH_INVITE_SCHEMA_MISSING' USING errcode='42501'; END IF;
END
$coach_invite_source_gate$;
REVOKE ALL ON FUNCTION private.iberfit_coach_invite_source_guard_v1() FROM PUBLIC, anon, authenticated;
SELECT private.iberfit_coach_invite_source_guard_v1();
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
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if not (
    coalesce(v_context->'roles','[]'::jsonb)?'admin'
    or (
      coalesce(v_context->'roles','[]'::jsonb)?'coach'
      and v_actor is not null and v_org is not null
      and exists (
        select 1 from public.iberfit_organization_memberships m
        where m.user_id=v_actor and m.organization_id=v_org and m.status='active'
      )
      and (
        exists (
          select 1 from public.client_assignments a
          where a.client_id=p_client_id and a.coach_user_id=v_actor and a.active=true
        ) or exists (
          select 1 from public.iberfit_coach_client_assignments a
          where a.client_id=p_client_id::text and a.coach_user_id=v_actor
            and a.organization_id=v_org and a.status='active'
            and a.starts_at<=current_date
            and (a.ends_at is null or a.ends_at>=current_date)
        )
      )
    )
  ) then raise exception 'V26_INVITE_ROLE_OR_CLIENT_SCOPE_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or v_actor is null then raise exception 'V26_INVITE_CONTEXT_REQUIRED' using errcode='42501'; end if;
  if p_client_id is null or v_op='' then raise exception 'V26_INVITE_PREPARE_INVALID' using errcode='22023'; end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,p_client_id::text);

  select * into v_access from public.client_access_v26 a where a.client_id=p_client_id for update;
  if not found and coalesce(v_context->'roles','[]'::jsonb)?'coach' then
    insert into public.client_access_v26(client_id,email,status)
    select c.id,lower(btrim(i.email)),'invitacion_pendiente'
    from public.clients c join public.client_intake_profiles i on i.client_id=c.id
    where c.id=p_client_id and length(btrim(coalesce(i.email,'')))>=5
    on conflict(client_id) do nothing;
    select * into v_access from public.client_access_v26 a where a.client_id=p_client_id for update;
  end if;
  if not found then raise exception 'V26_INVITE_ACCESS_NOT_FOUND' using errcode='P0002'; end if;
  if coalesce(v_context->'roles','[]'::jsonb)?'coach'
    and not coalesce(v_context->'roles','[]'::jsonb)?'admin' then
    if v_access.status in ('suspendido','revocado') then
      raise exception 'V26_COACH_INVITE_ACCESS_REVOKED' using errcode='42501';
    end if;
    if nullif(lower(btrim(v_access.email)),'') is distinct from (
      select nullif(lower(btrim(i.email)),'')
      from public.client_intake_profiles i where i.client_id=p_client_id
    ) then
      raise exception 'V26_COACH_INVITE_CONTACT_DRIFT' using errcode='42501';
    end if;
  end if;
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

  if v_access.invitation_delivery_status='pending'
     and v_access.last_invitation_attempt_at>now()-interval '3 minutes'
     and v_access.last_invitation_operation_id is distinct from v_op then
    raise exception 'V26_INVITATION_RATE_LIMITED' using errcode='P0001';
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
  ) values(v_org,'ADMIN_CLIENT_INVITATION_ATTEMPT',v_actor,case when coalesce(v_context->'roles','[]'::jsonb)?'admin' then 'admin' else 'coach' end,'client_access',p_client_id::text,'Intento de invitación alojada iniciado.',v_op,v_access.revision::integer);

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
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if not (
    coalesce(v_context->'roles','[]'::jsonb)?'admin'
    or (
      coalesce(v_context->'roles','[]'::jsonb)?'coach'
      and v_actor is not null and v_org is not null
      and exists (
        select 1 from public.iberfit_organization_memberships m
        where m.user_id=v_actor and m.organization_id=v_org and m.status='active'
      )
      and (
        exists (
          select 1 from public.client_assignments a
          where a.client_id=p_client_id and a.coach_user_id=v_actor and a.active=true
        ) or exists (
          select 1 from public.iberfit_coach_client_assignments a
          where a.client_id=p_client_id::text and a.coach_user_id=v_actor
            and a.organization_id=v_org and a.status='active'
            and a.starts_at<=current_date
            and (a.ends_at is null or a.ends_at>=current_date)
        )
      )
    )
  ) then raise exception 'V26_INVITE_ROLE_OR_CLIENT_SCOPE_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or v_actor is null or p_client_id is null or p_auth_user_id is null then raise exception 'V26_INVITE_BIND_CONTEXT_REQUIRED' using errcode='42501'; end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,p_client_id::text);

  select * into v_access from public.client_access_v26 a where a.client_id=p_client_id for update;
  if not found then raise exception 'V26_INVITE_ACCESS_NOT_FOUND' using errcode='P0002'; end if;
  -- Scope and lifecycle can change between the prepare and bind RPCs.
  if coalesce(v_context->'roles','[]'::jsonb)?'coach'
    and not coalesce(v_context->'roles','[]'::jsonb)?'admin' then
    if v_access.status in ('suspendido','revocado') then
      raise exception 'V26_COACH_INVITE_ACCESS_REVOKED' using errcode='42501';
    end if;
    if nullif(lower(btrim(v_access.email)),'') is distinct from (
      select nullif(lower(btrim(i.email)),'')
      from public.client_intake_profiles i where i.client_id=p_client_id
    ) then
      raise exception 'V26_COACH_INVITE_CONTACT_DRIFT' using errcode='42501';
    end if;
  end if;
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
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if not (
    coalesce(v_context->'roles','[]'::jsonb)?'admin'
    or (
      coalesce(v_context->'roles','[]'::jsonb)?'coach'
      and v_actor is not null and v_org is not null
      and exists (
        select 1 from public.iberfit_organization_memberships m
        where m.user_id=v_actor and m.organization_id=v_org and m.status='active'
      )
      and (
        exists (
          select 1 from public.client_assignments a
          where a.client_id=p_client_id and a.coach_user_id=v_actor and a.active=true
        ) or exists (
          select 1 from public.iberfit_coach_client_assignments a
          where a.client_id=p_client_id::text and a.coach_user_id=v_actor
            and a.organization_id=v_org and a.status='active'
            and a.starts_at<=current_date
            and (a.ends_at is null or a.ends_at>=current_date)
        )
      )
    )
  ) then raise exception 'V26_INVITE_ROLE_OR_CLIENT_SCOPE_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or v_actor is null then raise exception 'V26_INVITE_FINALIZE_CONTEXT_REQUIRED' using errcode='42501'; end if;
  if v_status not in ('sent','error') then raise exception 'V26_INVITE_DELIVERY_STATUS_INVALID' using errcode='22023'; end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,p_client_id::text);

  -- Recheck lifecycle at final delivery; an Admin may revoke while email is sent.
  if coalesce(v_context->'roles','[]'::jsonb)?'coach'
     and not coalesce(v_context->'roles','[]'::jsonb)?'admin' then
    select * into v_access from public.client_access_v26 a
      where a.client_id=p_client_id for update;
    if not found then raise exception 'V26_INVITE_ACCESS_NOT_FOUND' using errcode='P0002'; end if;
    if v_access.status in ('suspendido','revocado') then
      raise exception 'V26_COACH_INVITE_ACCESS_REVOKED' using errcode='42501';
    end if;
  end if;
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
  ) values(v_org,case when v_status='sent' then 'ADMIN_CLIENT_INVITATION_SENT' else 'ADMIN_CLIENT_INVITATION_ERROR' end,v_actor,case when coalesce(v_context->'roles','[]'::jsonb)?'admin' then 'admin' else 'coach' end,'client_access',p_client_id::text,v_summary,btrim(coalesce(p_operation_id,'')),v_access.revision::integer);

  return jsonb_build_object('ok',true,'clientId',p_client_id,'accessStatus',v_access.status,'deliveryStatus',v_status,'attemptCount',v_access.invitation_attempt_count,'lastAttemptAt',v_access.last_invitation_attempt_at,'sentAt',v_access.invitation_sent_at,'errorCode',v_access.invitation_error_code,'activatedAt',v_access.activated_at);
end
$function$;
COMMIT;
