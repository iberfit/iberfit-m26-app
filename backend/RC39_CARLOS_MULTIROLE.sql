-- IBERFIT RC39 · Roles de aplicación + solicitudes de cambio de cita
-- Migración aditiva y fail-closed para CANARY.
-- No modifica producción por sí sola. Ejecutar manualmente en Supabase SQL Editor
-- después de comprobar que el proyecto y el entorno son los autorizados.

begin;

do $$
begin
  if to_regclass('public.user_profiles') is null then
    raise exception 'RC39_USER_PROFILES_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_bootstrap_v26()') is null then
    raise exception 'RC39_BOOTSTRAP_REQUIRED';
  end if;
end;
$$;

create table if not exists public.user_application_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('coach','admin','client')),
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid null references auth.users(id),
  primary key (user_id,role)
);

create table if not exists public.appointment_change_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id text not null,
  client_id text not null,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id),
  resolution_note text null check (resolution_note is null or char_length(resolution_note)<=500)
);

create unique index if not exists appointment_change_requests_one_pending
  on public.appointment_change_requests(appointment_id,requester_user_id)
  where status='pending';

create index if not exists appointment_change_requests_client_created
  on public.appointment_change_requests(client_id,created_at desc);

alter table public.user_application_roles enable row level security;
alter table public.appointment_change_requests enable row level security;

revoke all on public.user_application_roles from anon,authenticated;
revoke all on public.appointment_change_requests from anon,authenticated;

create or replace function public.iberfit_authorized_application_roles_v13()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_primary text;
  v_roles jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;

  select lower(up.role::text)
    into v_primary
    from public.user_profiles up
   where up.user_id=v_user;

  select coalesce(
    jsonb_agg(r.role order by case r.role when 'coach' then 1 when 'admin' then 2 else 3 end),
    '[]'::jsonb
  )
  into v_roles
  from (
    select v_primary as role
    where v_primary in ('coach','admin','client')
    union
    select uar.role
    from public.user_application_roles uar
    where uar.user_id=v_user and uar.active=true
  ) r;

  return jsonb_build_object(
    'ok',true,
    'roles',v_roles,
    'primaryRole',v_primary
  );
end;
$$;

create or replace function public.iberfit_request_appointment_change_v13(
  p_appointment_id text,
  p_client_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_own_client text;
  v_item jsonb;
  v_start timestamptz;
  v_found boolean:=false;
  v_request public.appointment_change_requests;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;
  if nullif(btrim(p_appointment_id),'') is null
     or nullif(btrim(p_client_id),'') is null
     or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception using errcode='22023',message='V13_CHANGE_REQUEST_INVALID';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  v_own_client:=coalesce(
    v_snapshot#>>'{user,clientId}',
    v_snapshot#>>'{user,client_id}',
    ''
  );

  if v_role not in ('client','cliente') or v_own_client<>btrim(p_client_id) then
    raise exception using errcode='42501',message='V13_CLIENT_SCOPE_FORBIDDEN';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb))
  loop
    if coalesce(v_item->>'id',v_item->>'entityId',v_item->>'entity_id','')=btrim(p_appointment_id)
       and coalesce(v_item->>'clientId',v_item->>'client_id','')=btrim(p_client_id) then
      v_found:=true;
      begin
        v_start:=coalesce(
          nullif(v_item->>'startAt','')::timestamptz,
          nullif(v_item->>'start_at','')::timestamptz,
          nullif(v_item->>'scheduledAt','')::timestamptz,
          nullif(v_item->>'scheduled_at','')::timestamptz
        );
      exception when others then
        v_start:=null;
      end;
      exit;
    end if;
  end loop;

  if not v_found then
    raise exception using errcode='42501',message='V13_APPOINTMENT_NOT_VISIBLE';
  end if;
  if v_start is null
     or now()<v_start-interval '48 hours'
     or now()>=v_start-interval '2 hours' then
    raise exception using errcode='22023',message='V13_CONFIRMATION_WINDOW_CLOSED';
  end if;

  insert into public.appointment_change_requests(
    appointment_id,client_id,requester_user_id,reason,status
  )
  values(
    btrim(p_appointment_id),
    btrim(p_client_id),
    v_user,
    btrim(p_reason),
    'pending'
  )
  on conflict(appointment_id,requester_user_id) where status='pending'
  do update set
    reason=excluded.reason,
    created_at=now()
  returning * into v_request;

  return jsonb_build_object(
    'ok',true,
    'requestId',v_request.id,
    'appointmentId',v_request.appointment_id,
    'status',v_request.status,
    'createdAt',v_request.created_at
  );
end;
$$;

create or replace function public.iberfit_appointment_change_requests_v13()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_own_client text;
  v_requests jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  v_own_client:=coalesce(
    v_snapshot#>>'{user,clientId}',
    v_snapshot#>>'{user,client_id}',
    ''
  );

  if v_role in ('client','cliente') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'appointmentId',r.appointment_id,
      'clientId',r.client_id,
      'reason',r.reason,
      'status',r.status,
      'createdAt',r.created_at,
      'resolvedAt',r.resolved_at,
      'resolutionNote',r.resolution_note
    ) order by r.created_at desc),'[]'::jsonb)
    into v_requests
    from public.appointment_change_requests r
    where r.requester_user_id=v_user
      and r.client_id=v_own_client;
  elsif v_role in ('coach','entrenador','admin','administrador') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'appointmentId',r.appointment_id,
      'clientId',r.client_id,
      'reason',r.reason,
      'status',r.status,
      'createdAt',r.created_at,
      'resolvedAt',r.resolved_at,
      'resolutionNote',r.resolution_note
    ) order by r.created_at desc),'[]'::jsonb)
    into v_requests
    from public.appointment_change_requests r
    where exists(
      select 1
      from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb)) a
      where coalesce(a->>'id',a->>'entityId',a->>'entity_id','')=r.appointment_id
        and coalesce(a->>'clientId',a->>'client_id','')=r.client_id
    );
  else
    raise exception using errcode='42501',message='V13_ROLE_FORBIDDEN';
  end if;

  return jsonb_build_object('ok',true,'requests',v_requests);
end;
$$;

create or replace function public.iberfit_resolve_appointment_change_v13(
  p_request_id text,
  p_resolution text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_request public.appointment_change_requests;
  v_resolution text:=lower(btrim(coalesce(p_resolution,'')));
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;
  if v_resolution not in ('accepted','rejected','resolved') then
    raise exception using errcode='22023',message='V13_RESOLUTION_INVALID';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  if v_role not in ('coach','entrenador','admin','administrador') then
    raise exception using errcode='42501',message='V13_ROLE_FORBIDDEN';
  end if;

  select * into v_request
  from public.appointment_change_requests
  where id::text=btrim(p_request_id)
    and status='pending'
  for update;

  if not found then
    raise exception using errcode='P0002',message='V13_CHANGE_REQUEST_NOT_FOUND';
  end if;

  if not exists(
    select 1
    from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb)) a
    where coalesce(a->>'id',a->>'entityId',a->>'entity_id','')=v_request.appointment_id
      and coalesce(a->>'clientId',a->>'client_id','')=v_request.client_id
  ) then
    raise exception using errcode='42501',message='V13_APPOINTMENT_NOT_VISIBLE';
  end if;

  update public.appointment_change_requests
     set status=v_resolution,
         resolved_at=now(),
         resolved_by=v_user,
         resolution_note=nullif(btrim(coalesce(p_note,'')),'')
   where id=v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'ok',true,
    'requestId',v_request.id,
    'status',v_request.status,
    'resolvedAt',v_request.resolved_at
  );
end;
$$;

revoke all on function public.iberfit_authorized_application_roles_v13() from public,anon;
revoke all on function public.iberfit_request_appointment_change_v13(text,text,text) from public,anon;
revoke all on function public.iberfit_appointment_change_requests_v13() from public,anon;
revoke all on function public.iberfit_resolve_appointment_change_v13(text,text,text) from public,anon;

grant execute on function public.iberfit_authorized_application_roles_v13() to authenticated;
grant execute on function public.iberfit_request_appointment_change_v13(text,text,text) to authenticated;
grant execute on function public.iberfit_appointment_change_requests_v13() to authenticated;
grant execute on function public.iberfit_resolve_appointment_change_v13(text,text,text) to authenticated;

-- Carlos: Coach y Admin, exactamente para la cuenta indicada.
do $$
declare
  v_user uuid;
  v_count integer;
begin
  select count(*),min(id::text)::uuid
    into v_count,v_user
    from auth.users
   where lower(email)=lower('iberfit.cl@gmail.com');

  if v_count<>1 then
    raise exception 'RC39_CARLOS_ACCOUNT_NOT_UNIQUE';
  end if;

  insert into public.user_application_roles(user_id,role,active,granted_by)
  values
    (v_user,'coach',true,auth.uid()),
    (v_user,'admin',true,auth.uid())
  on conflict(user_id,role) do update
    set active=true,
        granted_at=now(),
        granted_by=excluded.granted_by;
end;
$$;

notify pgrst,'reload schema';
commit;
