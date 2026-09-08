alter table public.client_intake_profiles
  add column if not exists invitation_status text not null default 'not_started',
  add column if not exists invitation_attempt_count integer not null default 0,
  add column if not exists last_invitation_attempt_at timestamptz,
  add column if not exists invitation_sent_at timestamptz,
  add column if not exists invitation_error_code text,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

alter table public.client_intake_profiles
  drop constraint if exists client_intake_profiles_invitation_status_check;
alter table public.client_intake_profiles
  add constraint client_intake_profiles_invitation_status_check
  check (invitation_status in ('not_started','pending','sent','linked_existing','error'));

alter table public.client_intake_profiles
  drop constraint if exists client_intake_profiles_invitation_attempt_count_check;
alter table public.client_intake_profiles
  add constraint client_intake_profiles_invitation_attempt_count_check
  check (invitation_attempt_count >= 0);

create unique index if not exists client_intake_profiles_auth_user_unique_v26
  on public.client_intake_profiles(auth_user_id)
  where auth_user_id is not null;

create or replace function public.iberfit_client_invitation_begin_v26(
  p_client_id uuid,
  p_email text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text;
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_current_email text;
  v_attempt integer;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception using errcode='28000',message='IBERFIT_INVITATION_AUTH_REQUIRED'; end if;
  select lower(up.role::text) into v_role from public.user_profiles up where up.user_id=v_actor;
  if v_role not in ('admin','coach') then raise exception using errcode='42501',message='IBERFIT_INVITATION_ROLE_REQUIRED'; end if;
  if p_client_id is null or v_email='' or position('@' in v_email)<=1 then raise exception using errcode='22023',message='IBERFIT_INVITATION_INPUT_INVALID'; end if;
  select lower(btrim(i.email)) into v_current_email from public.client_intake_profiles i where i.client_id=p_client_id for update;
  if v_current_email is null then raise exception using errcode='P0002',message='IBERFIT_INVITATION_CLIENT_NOT_FOUND'; end if;
  if v_current_email<>v_email then raise exception using errcode='22023',message='IBERFIT_INVITATION_EMAIL_MISMATCH'; end if;
  if v_role='coach' and not exists(select 1 from public.client_assignments a where a.client_id=p_client_id and a.coach_user_id=v_actor and a.active=true) then
    raise exception using errcode='42501',message='IBERFIT_INVITATION_CLIENT_SCOPE_REQUIRED';
  end if;
  update public.client_intake_profiles set
    invitation_status='pending',
    invitation_attempt_count=invitation_attempt_count+1,
    last_invitation_attempt_at=clock_timestamp(),
    invitation_error_code=null,
    updated_at=clock_timestamp(),
    updated_by=v_actor
  where client_id=p_client_id
  returning invitation_attempt_count into v_attempt;
  insert into public.audit_events(event_type,entity_type,entity_id,actor_user_id,payload)
  values('CLIENTE_INVITACION_INTENTO','client',p_client_id::text,v_actor,jsonb_build_object('attempt',v_attempt,'email',v_email));
  return jsonb_build_object('ok',true,'clientId',p_client_id,'email',v_email,'status','pending','attemptCount',v_attempt);
end
$function$;

create or replace function public.iberfit_client_invitation_finalize_v26(
  p_client_id uuid,
  p_auth_user_id uuid,
  p_delivery text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text;
  v_email text;
  v_auth_email text;
  v_existing_role text;
  v_existing_client uuid;
  v_delivery text:=lower(btrim(coalesce(p_delivery,'')));
  v_status text;
  v_sent_at timestamptz;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception using errcode='28000',message='IBERFIT_INVITATION_AUTH_REQUIRED'; end if;
  select lower(up.role::text) into v_role from public.user_profiles up where up.user_id=v_actor;
  if v_role not in ('admin','coach') then raise exception using errcode='42501',message='IBERFIT_INVITATION_ROLE_REQUIRED'; end if;
  if p_client_id is null or p_auth_user_id is null or v_delivery not in ('sent','existing') then raise exception using errcode='22023',message='IBERFIT_INVITATION_FINALIZE_INVALID'; end if;
  select lower(btrim(i.email)) into v_email from public.client_intake_profiles i where i.client_id=p_client_id for update;
  if v_email is null then raise exception using errcode='P0002',message='IBERFIT_INVITATION_CLIENT_NOT_FOUND'; end if;
  if v_role='coach' and not exists(select 1 from public.client_assignments a where a.client_id=p_client_id and a.coach_user_id=v_actor and a.active=true) then
    raise exception using errcode='42501',message='IBERFIT_INVITATION_CLIENT_SCOPE_REQUIRED';
  end if;
  select lower(btrim(u.email)) into v_auth_email from auth.users u where u.id=p_auth_user_id;
  if v_auth_email is null or v_auth_email<>v_email then raise exception using errcode='22023',message='IBERFIT_INVITATION_AUTH_EMAIL_MISMATCH'; end if;
  select lower(up.role::text),up.client_id into v_existing_role,v_existing_client from public.user_profiles up where up.user_id=p_auth_user_id for update;
  if v_existing_role is not null and (v_existing_role<>'client' or v_existing_client is distinct from p_client_id) then
    raise exception using errcode='23505',message='IBERFIT_INVITATION_AUTH_USER_CONFLICT';
  end if;
  if exists(select 1 from public.client_intake_profiles i where i.auth_user_id=p_auth_user_id and i.client_id<>p_client_id) then
    raise exception using errcode='23505',message='IBERFIT_INVITATION_AUTH_USER_ALREADY_LINKED';
  end if;
  insert into public.user_profiles(user_id,role,client_id,display_name)
  select p_auth_user_id,'client'::public.iberfit_role,p_client_id,c.name from public.clients c where c.id=p_client_id
  on conflict(user_id) do update set client_id=excluded.client_id,display_name=excluded.display_name
  where public.user_profiles.role='client'::public.iberfit_role and public.user_profiles.client_id=excluded.client_id;
  if not exists(select 1 from public.user_profiles up where up.user_id=p_auth_user_id and up.role='client'::public.iberfit_role and up.client_id=p_client_id) then
    raise exception using errcode='P0001',message='IBERFIT_INVITATION_PROFILE_LINK_FAILED';
  end if;
  v_status:=case when v_delivery='sent' then 'sent' else 'linked_existing' end;
  v_sent_at:=case when v_delivery='sent' then clock_timestamp() else null end;
  update public.client_intake_profiles set
    auth_user_id=p_auth_user_id,
    invitation_status=v_status,
    invitation_sent_at=case when v_delivery='sent' then coalesce(invitation_sent_at,v_sent_at) else invitation_sent_at end,
    invitation_error_code=null,
    updated_at=clock_timestamp(),
    updated_by=v_actor
  where client_id=p_client_id;
  insert into public.client_timeline_events(client_id,event_type,title,summary,visibility,source_table,source_id,status,priority,payload)
  values(p_client_id,'CLIENTE_ACCESO_PREPARADO','Acceso IBERFIT preparado',case when v_delivery='sent' then 'Invitación de acceso enviada.' else 'Cuenta existente vinculada al expediente.' end,'coach','clients',p_client_id,'registrado','normal',jsonb_build_object('delivery',v_delivery,'authUserId',p_auth_user_id));
  insert into public.audit_events(event_type,entity_type,entity_id,actor_user_id,payload)
  values('CLIENTE_INVITACION_COMPLETADA','client',p_client_id::text,v_actor,jsonb_build_object('delivery',v_delivery,'authUserId',p_auth_user_id,'invitationSent',v_delivery='sent'));
  return jsonb_build_object('ok',true,'clientId',p_client_id,'authUserId',p_auth_user_id,'status',v_status,'invitationSentAt',v_sent_at);
end
$function$;

create or replace function public.iberfit_client_invitation_fail_v26(
  p_client_id uuid,
  p_error_code text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_role text;
  v_code text:=upper(regexp_replace(btrim(coalesce(p_error_code,'IBERFIT_INVITATION_FAILED')),'[^A-Z0-9_:-]','','g'));
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception using errcode='28000',message='IBERFIT_INVITATION_AUTH_REQUIRED'; end if;
  select lower(up.role::text) into v_role from public.user_profiles up where up.user_id=v_actor;
  if v_role not in ('admin','coach') then raise exception using errcode='42501',message='IBERFIT_INVITATION_ROLE_REQUIRED'; end if;
  if p_client_id is null then raise exception using errcode='22023',message='IBERFIT_INVITATION_CLIENT_REQUIRED'; end if;
  if length(v_code)<3 then v_code:='IBERFIT_INVITATION_FAILED'; end if;
  v_code:=left(v_code,120);
  if v_role='coach' and not exists(select 1 from public.client_assignments a where a.client_id=p_client_id and a.coach_user_id=v_actor and a.active=true) then
    raise exception using errcode='42501',message='IBERFIT_INVITATION_CLIENT_SCOPE_REQUIRED';
  end if;
  update public.client_intake_profiles set invitation_status='error',invitation_error_code=v_code,updated_at=clock_timestamp(),updated_by=v_actor where client_id=p_client_id;
  if not found then raise exception using errcode='P0002',message='IBERFIT_INVITATION_CLIENT_NOT_FOUND'; end if;
  insert into public.audit_events(event_type,entity_type,entity_id,actor_user_id,payload)
  values('CLIENTE_INVITACION_ERROR','client',p_client_id::text,v_actor,jsonb_build_object('code',v_code));
  return jsonb_build_object('ok',true,'clientId',p_client_id,'status','error','errorCode',v_code);
end
$function$;

revoke all on function public.iberfit_client_invitation_begin_v26(uuid,text) from public;
revoke all on function public.iberfit_client_invitation_finalize_v26(uuid,uuid,text) from public;
revoke all on function public.iberfit_client_invitation_fail_v26(uuid,text) from public;
grant execute on function public.iberfit_client_invitation_begin_v26(uuid,text) to authenticated;
grant execute on function public.iberfit_client_invitation_finalize_v26(uuid,uuid,text) to authenticated;
grant execute on function public.iberfit_client_invitation_fail_v26(uuid,text) to authenticated;