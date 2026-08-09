-- IBERFIT RC45.8 · PROMOCIÓN CANÓNICA PRODUCTION-SAFE
-- FUENTE: canonical pjhmrhejsoofmouedavw
-- NO contiene filas provenientes del proyecto QA secundario.
-- Ejecutar únicamente dentro de una transacción controlada.

do $rc45_guard$
declare
  v_admins integer;
  v_targets integer;
begin
  if to_regclass('public.user_profiles') is null then
    raise exception 'RC45_PROD_USER_PROFILES_REQUIRED';
  end if;

  if to_regclass('public.clients') is null then
    raise exception 'RC45_PROD_CLIENTS_REQUIRED';
  end if;

  select count(*)
  into v_admins
  from public.user_profiles
  where case lower(role::text)
    when 'administrador' then 'admin'
    else lower(role::text)
  end='admin';

  if v_admins<1 then
    raise exception 'RC45_PROD_ADMIN_REQUIRED';
  end if;

  select count(*)
  into v_targets
  from unnest(array[
    'public.user_application_roles',
    'public.appointment_change_requests',
    'public.iberfit_organizations',
    'public.iberfit_organization_memberships',
    'public.iberfit_conversation_threads',
    'public.m26_schema_releases_v43',
    'public.m26_session_drafts_v431',
    'public.m26_wearable_connections_v44'
  ]) x
  where to_regclass(x) is not null;

  if v_targets<>0 then
    raise exception 'RC45_PROD_PROMOTION_TARGET_ALREADY_PRESENT:%',v_targets;
  end if;
end
$rc45_guard$;

-- IBERFIT RC39 · Roles de aplicación + solicitudes de cambio de cita
-- Migración aditiva y fail-closed para CANARY.
-- No modifica producción por sí sola. Ejecutar manualmente en Supabase SQL Editor
-- después de comprobar que el proyecto y el entorno son los autorizados.



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

-- RC45.8 production: normaliza roles YA existentes en canonical.
-- No crea usuarios ni copia identidades desde Canary.
insert into public.user_application_roles(
  user_id,
  role,
  active,
  granted_by
)
select
  up.user_id,
  case lower(up.role::text)
    when 'entrenador' then 'coach'
    when 'administrador' then 'admin'
    when 'cliente' then 'client'
    else lower(up.role::text)
  end,
  true,
  null
from public.user_profiles up
join auth.users u on u.id=up.user_id
where case lower(up.role::text)
  when 'entrenador' then 'coach'
  when 'administrador' then 'admin'
  when 'cliente' then 'client'
  else lower(up.role::text)
end in ('client','coach','admin')
on conflict(user_id,role) do nothing;

-- IBERFIT RC40 · Aplicación Admin integrada + comunicación Cliente–Coach
-- Migración aditiva para CANARY. NO se ejecuta automáticamente.
-- Pagos quedan fuera de RC40 y se implementarán al final, solo en Admin.



do $$
begin
  if to_regclass('public.user_profiles') is null then raise exception 'RC40_USER_PROFILES_REQUIRED'; end if;
  if to_regclass('public.user_application_roles') is null then raise exception 'RC40_APPLICATION_ROLES_REQUIRED'; end if;
  if to_regprocedure('public.iberfit_bootstrap_v26()') is null then raise exception 'RC40_BOOTSTRAP_REQUIRED'; end if;
end;
$$;

create table if not exists public.iberfit_organizations(
  id uuid primary key,
  slug text not null unique check(slug~'^[a-z0-9-]{3,80}$'),
  name text not null check(char_length(name) between 2 and 200),
  status text not null default 'active' check(status in('active','suspended','archived')),
  timezone text not null default 'America/Santiago',
  locale text not null default 'es-CL',
  settings jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check(revision>=1),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
insert into public.iberfit_organizations(id,slug,name)
values('00000000-0000-4000-8000-000000000140','iberfit','IBERFIT')
on conflict(id) do nothing;

create table if not exists public.iberfit_organization_memberships(
  organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check(status in('active','suspended','inactive')),
  revision integer not null default 1 check(revision>=1),
  joined_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  primary key(organization_id,user_id)
);

-- RC45.8 production: preprovisión única desde identidades YA existentes.
-- Usuarios futuros NO se autoinscriben al consultar contexto.
insert into public.iberfit_organization_memberships(
  organization_id,
  user_id,
  status
)
select
  '00000000-0000-4000-8000-000000000140'::uuid,
  up.user_id,
  'active'
from public.user_profiles up
join auth.users u on u.id=up.user_id
where case lower(up.role::text)
  when 'entrenador' then 'coach'
  when 'administrador' then 'admin'
  when 'cliente' then 'client'
  else lower(up.role::text)
end in ('client','coach','admin')
on conflict(organization_id,user_id) do nothing;

create table if not exists public.iberfit_coach_client_assignments(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id),
  client_id text not null check(char_length(client_id) between 1 and 200),
  status text not null default 'active' check(status in('active','ended','cancelled')),
  starts_at date not null,ends_at date null,
  reason text not null check(char_length(reason) between 3 and 500),
  created_by uuid not null references auth.users(id),ended_by uuid null references auth.users(id),
  revision integer not null default 1 check(revision>=1),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(ends_at is null or ends_at>=starts_at)
);
create unique index if not exists iberfit_assignment_active_unique on public.iberfit_coach_client_assignments(organization_id,coach_user_id,client_id) where status='active';

create table if not exists public.iberfit_leads(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  name text not null check(char_length(name) between 2 and 200),email text null,phone text null,source text null,objective text null,
  status text not null default 'new' check(status in('new','contacted','qualified','evaluation','won','lost')),
  owner_user_id uuid null references auth.users(id),next_action_at timestamptz null,
  revision integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.iberfit_client_lifecycle_events(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  client_id text not null,status text not null check(status in('lead','onboarding','active','paused','inactive','reactivation')),
  reason text not null check(char_length(reason) between 3 and 500),effective_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),revision integer not null default 1,created_at timestamptz not null default now()
);

create table if not exists public.iberfit_operational_tasks(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  type text not null,entity_type text null,entity_id text null,client_id text null,assignee_user_id uuid null references auth.users(id),
  status text not null default 'open' check(status in('open','in_progress','resolved','cancelled')),
  priority text not null default 'normal' check(priority in('low','normal','high','critical')),
  title text not null check(char_length(title) between 3 and 200),detail text null,due_at timestamptz null,
  created_by uuid not null references auth.users(id),resolved_by uuid null references auth.users(id),resolved_at timestamptz null,resolution_note text null,
  revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.iberfit_notification_templates(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  key text not null check(key~'^[a-z0-9_.:-]{3,80}$'),name text not null,channel text not null check(channel in('in_app','email','push')),
  subject text null,body text not null check(char_length(body) between 1 and 4000),status text not null default 'active' check(status in('draft','active','archived')),
  revision integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,key)
);

create table if not exists public.iberfit_automation_rules(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  key text not null check(key~'^[a-z0-9_.:-]{3,80}$'),name text not null,trigger_type text not null,action_type text not null,
  status text not null default 'draft' check(status in('draft','active','paused','archived')),configuration jsonb not null default '{}'::jsonb,
  revision integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organization_id,key)
);

create table if not exists public.iberfit_notification_deliveries(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  template_key text not null,recipient_type text not null,recipient_id text not null,channel text not null,
  status text not null default 'scheduled' check(status in('scheduled','sent','delivered','failed','cancelled')),
  scheduled_at timestamptz null,sent_at timestamptz null,error_code text null,revision integer not null default 1,created_at timestamptz not null default now()
);

create table if not exists public.iberfit_admin_audit_events(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  event_type text not null,actor_user_id uuid not null references auth.users(id),actor_application text not null default 'admin',
  entity_type text not null,entity_id text not null,summary text not null,trace_id text not null,revision integer not null default 1,occurred_at timestamptz not null default now()
);

create table if not exists public.iberfit_admin_mutation_receipts(
  operation_id text primary key,organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),command_type text not null,result jsonb not null,created_at timestamptz not null default now()
);

create table if not exists public.iberfit_conversation_threads(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  client_id text not null,coach_user_id uuid not null references auth.users(id),subject text not null default 'Seguimiento IBERFIT',
  status text not null default 'active' check(status in('active','closed')),revision integer not null default 1,
  created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(organization_id,coach_user_id,client_id)
);
create table if not exists public.iberfit_messages(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  thread_id uuid not null references public.iberfit_conversation_threads(id) on delete cascade,sender_user_id uuid not null references auth.users(id),
  sender_role text not null check(sender_role in('client','coach')),body text not null check(char_length(body) between 1 and 4000),
  read_by_client_at timestamptz null,read_by_coach_at timestamptz null,revision integer not null default 1,created_at timestamptz not null default now()
);
create table if not exists public.iberfit_in_app_notifications(
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  recipient_user_id uuid null references auth.users(id),recipient_client_id text null,title text not null,body text not null,
  action_area text null,action_entity_id text null,status text not null default 'unread' check(status in('unread','read','archived')),
  read_at timestamptz null,revision integer not null default 1,created_at timestamptz not null default now(),
  check((recipient_user_id is not null and recipient_client_id is null) or (recipient_user_id is null and recipient_client_id is not null))
);
create table if not exists public.iberfit_communication_receipts(
  operation_id text primary key,organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id),command_type text not null,result jsonb not null,created_at timestamptz not null default now()
);

-- Todas las tablas quedan inaccesibles directamente. Solo RPC security-definer.
do $$ declare r record; begin
  for r in select unnest(array['iberfit_organizations','iberfit_organization_memberships','iberfit_coach_client_assignments','iberfit_leads','iberfit_client_lifecycle_events','iberfit_operational_tasks','iberfit_notification_templates','iberfit_automation_rules','iberfit_notification_deliveries','iberfit_admin_audit_events','iberfit_admin_mutation_receipts','iberfit_conversation_threads','iberfit_messages','iberfit_in_app_notifications','iberfit_communication_receipts']) t loop
    execute format('alter table public.%I enable row level security',r.t);
    execute format('revoke all on public.%I from anon,authenticated',r.t);
  end loop;
end $$;

create or replace function public.iberfit_application_context_v14()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_primary text;v_org uuid:='00000000-0000-4000-8000-000000000140';v_status text;v_roles jsonb;v_clients jsonb;v_enforced boolean;
begin
  if v_user is null then raise exception using errcode='28000',message='V14_AUTH_REQUIRED'; end if;
  select status into v_status
  from public.iberfit_organization_memberships
  where organization_id=v_org and user_id=v_user;

  if v_status is null then
    raise exception using
      errcode='42501',
      message='V14_ORGANIZATION_MEMBERSHIP_REQUIRED';
  end if;

  if v_status<>'active' then
    raise exception using
      errcode='42501',
      message='V14_ORGANIZATION_ACCESS_SUSPENDED';
  end if;
  select lower(role::text) into v_primary from public.user_profiles where user_id=v_user;
  select coalesce(jsonb_agg(x.role order by case x.role when 'coach' then 1 when 'admin' then 2 else 3 end),'[]'::jsonb) into v_roles from(
    select case v_primary when 'entrenador' then 'coach' when 'administrador' then 'admin' when 'cliente' then 'client' else v_primary end role where v_primary is not null
    union select role from public.user_application_roles where user_id=v_user and active=true
  )x where x.role in('client','coach','admin');
  select exists(select 1 from public.iberfit_coach_client_assignments where organization_id=v_org and coach_user_id=v_user) into v_enforced;
  select coalesce(jsonb_agg(client_id order by client_id),'[]'::jsonb) into v_clients from public.iberfit_coach_client_assignments where organization_id=v_org and coach_user_id=v_user and status='active' and starts_at<=current_date and(ends_at is null or ends_at>=current_date);
  return jsonb_build_object('ok',true,'organizationId',v_org,'membershipStatus',v_status,'roles',v_roles,'assignmentScopeEnforced',coalesce(v_enforced,false),'assignedClientIds',v_clients,'revision',1,'serverTime',now());
end $$;

create or replace function public.iberfit_admin_require_v14()
returns uuid language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_user uuid:=auth.uid();begin
  select public.iberfit_application_context_v14() into v_context;
  if coalesce(v_context->>'membershipStatus','')<>'active' then raise exception using errcode='42501',message='V14_ORGANIZATION_ACCESS_SUSPENDED'; end if;
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception using errcode='42501',message='V14_ADMIN_REQUIRED'; end if;
  return(v_context->>'organizationId')::uuid;
end $$;

create or replace function public.iberfit_admin_bootstrap_v14()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid:=public.iberfit_admin_require_v14();v_users jsonb;v_roles jsonb;v_coaches jsonb;v_assign jsonb;v_leads jsonb;v_life jsonb;v_tasks jsonb;v_templates jsonb;v_rules jsonb;v_deliveries jsonb;v_audit jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'userId',u.id,'email',u.email,'name',coalesce(u.raw_user_meta_data->>'name',u.email),'status',m.status,'primaryRole',lower(coalesce(p.role::text,'')),'roles',coalesce((select jsonb_agg(role) from public.user_application_roles ar where ar.user_id=u.id and ar.active=true),'[]'::jsonb),'lastAccessAt',u.last_sign_in_at,'createdAt',u.created_at,'updatedAt',m.updated_at,'revision',m.revision)),'[]'::jsonb) into v_users from public.iberfit_organization_memberships m join auth.users u on u.id=m.user_id left join public.user_profiles p on p.user_id=u.id where m.organization_id=v_org;
  select coalesce(jsonb_agg(jsonb_build_object('id',concat(user_id,':',role),'userId',user_id,'role',role,'active',active,'grantedAt',granted_at,'grantedBy',granted_by,'revision',1)),'[]'::jsonb) into v_roles from public.user_application_roles;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'userId',u.id,'email',u.email,'name',coalesce(u.raw_user_meta_data->>'name',u.email),'status',m.status,'clientCount',(select count(*) from public.iberfit_coach_client_assignments a where a.coach_user_id=u.id and a.status='active'),'revision',m.revision)),'[]'::jsonb) into v_coaches from public.iberfit_organization_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org and exists(select 1 from public.user_application_roles ar where ar.user_id=u.id and ar.role in('coach','admin') and ar.active=true);
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) into v_assign from public.iberfit_coach_client_assignments a where a.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc),'[]'::jsonb) into v_leads from public.iberfit_leads l where l.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.effective_at desc),'[]'::jsonb) into v_life from(select distinct on(client_id)* from public.iberfit_client_lifecycle_events where organization_id=v_org order by client_id,effective_at desc)x;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into v_tasks from(select * from public.iberfit_operational_tasks where organization_id=v_org order by created_at desc limit 1000)t;
  select coalesce(jsonb_agg(to_jsonb(t) order by key),'[]'::jsonb) into v_templates from public.iberfit_notification_templates t where t.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(r) order by key),'[]'::jsonb) into v_rules from public.iberfit_automation_rules r where r.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(d) order by created_at desc),'[]'::jsonb) into v_deliveries from(select * from public.iberfit_notification_deliveries where organization_id=v_org order by created_at desc limit 250)d;
  select coalesce(jsonb_agg(to_jsonb(a) order by occurred_at desc),'[]'::jsonb) into v_audit from(select * from public.iberfit_admin_audit_events where organization_id=v_org order by occurred_at desc limit 500)a;
  return jsonb_build_object('ok',true,'organization',(select jsonb_build_object('id',id,'slug',slug,'name',name,'status',status,'timezone',timezone,'locale',locale,'settings',settings,'revision',revision) from public.iberfit_organizations where id=v_org),'permissions',jsonb_build_array('organization.read','organization.settings.manage','user.read_summary','user.manage_status','role.read','role.manage','assignment.read','assignment.manage','client.lifecycle.read','client.lifecycle.manage','appointment.manage_global','operation.read_global','operation.manage_global','message.read','message.manage_templates','automation.read','automation.manage','analytics.read','audit.read'),'permissionRevision',1,'data',jsonb_build_object('organizationUsers',v_users,'applicationRoles',v_roles,'coachProfiles',v_coaches,'coachClientAssignments',v_assign,'leads',v_leads,'clientLifecycle',v_life,'operationalTasks',v_tasks,'notificationTemplates',v_templates,'notificationDeliveries',v_deliveries,'automationRules',v_rules,'auditEvents',v_audit),'analytics',jsonb_build_object('activeClients',(select count(*) from(select distinct on(client_id)client_id,status from public.iberfit_client_lifecycle_events where organization_id=v_org order by client_id,effective_at desc)x where status='active'),'averageAdherence',null,'churn30d',null,'conversionRate',null),'revision',1,'serverTime',now());
end $$;

create or replace function public.iberfit_admin_execute_v14(p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org uuid:=public.iberfit_admin_require_v14();v_actor uuid:=auth.uid();v_op text:=btrim(coalesce(p_command->>'operationId',''));v_type text:=upper(btrim(coalesce(p_command->>'type','')));v_entity text:=btrim(coalesce(p_command->>'entityId',''));v_reason text:=btrim(coalesce(p_command->>'reason',''));v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);v_base integer:=coalesce((p_command->>'baseRevision')::integer,0);v_result jsonb;v_existing jsonb;v_id uuid;v_revision integer:=1;v_user uuid;v_role text;v_status text;
begin
  if v_op='' then raise exception using errcode='22023',message='V14_OPERATION_ID_INVALID'; end if;
  select result into v_existing from public.iberfit_admin_mutation_receipts where operation_id=v_op and actor_user_id=v_actor and command_type=v_type;if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate');end if;
  if exists(select 1 from public.iberfit_admin_mutation_receipts where operation_id=v_op)then raise exception using errcode='23505',message='V14_OPERATION_COLLISION';end if;
  if v_type in('ADMIN_USUARIO_CAMBIAR_ESTADO','ADMIN_ROL_OTORGAR','ADMIN_ROL_REVOCAR','ADMIN_ASIGNACION_CREAR','ADMIN_ASIGNACION_FINALIZAR','ADMIN_LEAD_ACTUALIZAR','ADMIN_CLIENTE_CAMBIAR_CICLO','ADMIN_TAREA_RESOLVER','ADMIN_ORGANIZACION_ACTUALIZAR')and char_length(v_reason)<3 then raise exception using errcode='22023',message='V14_REASON_REQUIRED';end if;
  case v_type
    when 'ADMIN_USUARIO_CAMBIAR_ESTADO' then v_user:=(v_payload->>'userId')::uuid;v_status:=lower(v_payload->>'status');if v_user=v_actor and v_status<>'active' then raise exception using errcode='42501',message='V14_SELF_SUSPENSION_FORBIDDEN';end if;update public.iberfit_organization_memberships set status=v_status,revision=revision+1,updated_at=now()where organization_id=v_org and user_id=v_user and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_user::text;
    when 'ADMIN_ROL_OTORGAR' then v_user:=(v_payload->>'userId')::uuid;v_role:=lower(v_payload->>'role');if v_role not in('client','coach','admin')then raise exception using errcode='22023',message='V14_ROLE_INVALID';end if;insert into public.user_application_roles(user_id,role,active,granted_by)values(v_user,v_role,true,v_actor)on conflict(user_id,role)do update set active=true,granted_at=now(),granted_by=v_actor;v_entity:=concat(v_user,':',v_role);
    when 'ADMIN_ROL_REVOCAR' then v_user:=(v_payload->>'userId')::uuid;v_role:=lower(v_payload->>'role');if v_user=v_actor and v_role='admin' then raise exception using errcode='42501',message='V14_SELF_ADMIN_REVOCATION_FORBIDDEN';end if;if v_role='admin' and(select count(*)from public.user_application_roles where role='admin'and active=true)<=1 then raise exception using errcode='42501',message='V14_LAST_ADMIN_PROTECTED';end if;update public.user_application_roles set active=false,granted_at=now(),granted_by=v_actor where user_id=v_user and role=v_role and active=true;if not found then raise exception using errcode='P0002',message='V14_ROLE_NOT_FOUND';end if;v_entity:=concat(v_user,':',v_role);
    when 'ADMIN_ASIGNACION_CREAR' then insert into public.iberfit_coach_client_assignments(organization_id,coach_user_id,client_id,starts_at,reason,created_by)values(v_org,(v_payload->>'coachUserId')::uuid,btrim(v_payload->>'clientId'),(v_payload->>'startsAt')::date,v_reason,v_actor)returning id into v_id;insert into public.iberfit_conversation_threads(organization_id,client_id,coach_user_id,created_by)values(v_org,btrim(v_payload->>'clientId'),(v_payload->>'coachUserId')::uuid,v_actor)on conflict(organization_id,coach_user_id,client_id)do update set status='active',updated_at=now(),revision=public.iberfit_conversation_threads.revision+1;v_entity:=v_id::text;
    when 'ADMIN_ASIGNACION_FINALIZAR' then v_id:=(v_payload->>'assignmentId')::uuid;update public.iberfit_coach_client_assignments set status='ended',ends_at=current_date,ended_by=v_actor,reason=v_reason,revision=revision+1,updated_at=now()where id=v_id and organization_id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_id::text;
    when 'ADMIN_LEAD_CREAR' then insert into public.iberfit_leads(organization_id,name,email,phone,source,objective,created_by,updated_by)values(v_org,btrim(v_payload->>'name'),nullif(lower(btrim(v_payload->>'email')),''),nullif(btrim(v_payload->>'phone'),''),nullif(btrim(v_payload->>'source'),''),nullif(btrim(v_payload->>'objective'),''),v_actor,v_actor)returning id into v_id;v_entity:=v_id::text;
    when 'ADMIN_LEAD_ACTUALIZAR' then v_id:=(v_payload->>'leadId')::uuid;update public.iberfit_leads set status=lower(v_payload->>'status'),next_action_at=nullif(v_payload->>'nextActionAt','')::timestamptz,updated_by=v_actor,revision=revision+1,updated_at=now()where id=v_id and organization_id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_id::text;
    when 'ADMIN_CLIENTE_CAMBIAR_CICLO' then insert into public.iberfit_client_lifecycle_events(organization_id,client_id,status,reason,changed_by)values(v_org,btrim(v_payload->>'clientId'),lower(v_payload->>'status'),v_reason,v_actor)returning id into v_id;v_entity:=btrim(v_payload->>'clientId');
    when 'ADMIN_TAREA_CREAR' then insert into public.iberfit_operational_tasks(organization_id,type,priority,title,detail,created_by)values(v_org,btrim(coalesce(v_payload->>'taskType','manual_review')),lower(coalesce(v_payload->>'priority','normal')),btrim(v_payload->>'title'),nullif(btrim(v_payload->>'detail'),''),v_actor)returning id into v_id;v_entity:=v_id::text;
    when 'ADMIN_TAREA_RESOLVER' then v_id:=(v_payload->>'taskId')::uuid;update public.iberfit_operational_tasks set status='resolved',resolved_by=v_actor,resolved_at=now(),resolution_note=v_reason,revision=revision+1,updated_at=now()where id=v_id and organization_id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_id::text;
    when 'ADMIN_PLANTILLA_GUARDAR' then insert into public.iberfit_notification_templates(organization_id,key,name,channel,subject,body,created_by,updated_by)values(v_org,lower(v_payload->>'key'),btrim(v_payload->>'name'),lower(v_payload->>'channel'),nullif(btrim(v_payload->>'subject'),''),btrim(v_payload->>'body'),v_actor,v_actor)on conflict(organization_id,key)do update set name=excluded.name,channel=excluded.channel,subject=excluded.subject,body=excluded.body,revision=public.iberfit_notification_templates.revision+1,updated_at=now(),updated_by=v_actor;v_entity:=lower(v_payload->>'key');
    when 'ADMIN_AUTOMATIZACION_GUARDAR' then insert into public.iberfit_automation_rules(organization_id,key,name,trigger_type,action_type,status,configuration,created_by,updated_by)values(v_org,lower(v_payload->>'key'),btrim(v_payload->>'name'),lower(v_payload->>'triggerType'),lower(v_payload->>'actionType'),lower(v_payload->>'status'),coalesce(v_payload->'configuration','{}'::jsonb),v_actor,v_actor)on conflict(organization_id,key)do update set name=excluded.name,trigger_type=excluded.trigger_type,action_type=excluded.action_type,status=excluded.status,configuration=excluded.configuration,revision=public.iberfit_automation_rules.revision+1,updated_at=now(),updated_by=v_actor;v_entity:=lower(v_payload->>'key');
    when 'ADMIN_ORGANIZACION_ACTUALIZAR' then update public.iberfit_organizations set name=btrim(v_payload->>'name'),timezone=btrim(v_payload->>'timezone'),locale=btrim(v_payload->>'locale'),revision=revision+1,updated_at=now()where id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_org::text;
    else raise exception using errcode='22023',message='V14_COMMAND_INVALID';
  end case;
  insert into public.iberfit_admin_audit_events(organization_id,event_type,actor_user_id,actor_application,entity_type,entity_id,summary,trace_id,revision)values(v_org,v_type,v_actor,'admin','admin_mutation',v_entity,concat(v_type,' confirmado por backend.'),v_op,v_revision)returning id into v_id;
  v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'commandType',v_type,'entityId',v_entity,'revision',v_revision,'auditId',v_id,'serverTime',now());
  insert into public.iberfit_admin_mutation_receipts(operation_id,organization_id,actor_user_id,command_type,result)values(v_op,v_org,v_actor,v_type,v_result);return v_result;
end $$;

create or replace function public.iberfit_communication_bootstrap_v14(p_application text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_org uuid;v_user uuid:=auth.uid();v_app text:=lower(btrim(p_application));v_snapshot jsonb;v_client text;v_threads jsonb;v_messages jsonb;v_notifications jsonb;
begin
  select public.iberfit_application_context_v14() into v_context;if coalesce(v_context->>'membershipStatus','')<>'active' then raise exception using errcode='42501',message='V14_ORGANIZATION_ACCESS_SUSPENDED';end if;if not coalesce(v_context->'roles','[]'::jsonb)?v_app or v_app not in('client','coach')then raise exception using errcode='42501',message='V14_COMMUNICATION_ROLE_FORBIDDEN';end if;v_org:=(v_context->>'organizationId')::uuid;select public.iberfit_bootstrap_v26()into v_snapshot;v_client:=coalesce(v_snapshot#>>'{user,clientId}',v_snapshot#>>'{user,client_id}','');
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'clientId',t.client_id,'coachUserId',t.coach_user_id,'status',t.status,'subject',t.subject,'clientName',coalesce((select c->>'name' from jsonb_array_elements(coalesce(v_snapshot#>'{data,clients}','[]'::jsonb))c where c->>'id'=t.client_id limit 1),'Cliente'),'coachName',coalesce((select raw_user_meta_data->>'name' from auth.users where id=t.coach_user_id),(select email from auth.users where id=t.coach_user_id),'Coach IBERFIT'),'createdAt',t.created_at,'updatedAt',t.updated_at,'unreadCount',(select count(*)from public.iberfit_messages m where m.thread_id=t.id and((v_app='client'and m.read_by_client_at is null and m.sender_role<>'client')or(v_app='coach'and m.read_by_coach_at is null and m.sender_role<>'coach'))),'revision',t.revision)order by t.updated_at desc),'[]'::jsonb)into v_threads from public.iberfit_conversation_threads t where t.organization_id=v_org and t.status='active'and((v_app='client'and t.client_id=v_client)or(v_app='coach'and t.coach_user_id=v_user));
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'threadId',m.thread_id,'senderUserId',m.sender_user_id,'senderRole',m.sender_role,'body',m.body,'createdAt',m.created_at,'readByClientAt',m.read_by_client_at,'readByCoachAt',m.read_by_coach_at,'revision',m.revision)order by m.created_at),'[]'::jsonb)into v_messages from public.iberfit_messages m join public.iberfit_conversation_threads t on t.id=m.thread_id where t.organization_id=v_org and((v_app='client'and t.client_id=v_client)or(v_app='coach'and t.coach_user_id=v_user));
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'status',n.status,'createdAt',n.created_at,'readAt',n.read_at,'actionArea',n.action_area,'actionEntityId',n.action_entity_id,'revision',n.revision)order by n.created_at desc),'[]'::jsonb)into v_notifications from public.iberfit_in_app_notifications n where n.organization_id=v_org and((v_app='client'and n.recipient_client_id=v_client)or(v_app='coach'and n.recipient_user_id=v_user));
  return jsonb_build_object('ok',true,'threads',v_threads,'messages',v_messages,'notifications',v_notifications,'revision',1,'serverTime',now());
end $$;

create or replace function public.iberfit_communication_execute_v14(p_application text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_context jsonb;v_org uuid;v_user uuid:=auth.uid();v_app text:=lower(btrim(p_application));v_snapshot jsonb;v_client text;v_op text:=btrim(p_command->>'operationId');v_type text:=upper(btrim(p_command->>'type'));v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);v_existing jsonb;v_result jsonb;v_thread public.iberfit_conversation_threads;v_id uuid;v_body text;
begin
  select public.iberfit_application_context_v14()into v_context;if not coalesce(v_context->'roles','[]'::jsonb)?v_app or v_app not in('client','coach')then raise exception using errcode='42501',message='V14_COMMUNICATION_ROLE_FORBIDDEN';end if;v_org:=(v_context->>'organizationId')::uuid;select result into v_existing from public.iberfit_communication_receipts where operation_id=v_op and actor_user_id=v_user and command_type=v_type;if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate');end if;select public.iberfit_bootstrap_v26()into v_snapshot;v_client:=coalesce(v_snapshot#>>'{user,clientId}',v_snapshot#>>'{user,client_id}','');
  if v_type='MESSAGE_THREAD_OPEN' then if v_app<>'coach' then raise exception using errcode='42501',message='V14_THREAD_OPEN_FORBIDDEN';end if;if coalesce((v_context->>'assignmentScopeEnforced')::boolean,false)and not coalesce(v_context->'assignedClientIds','[]'::jsonb)?btrim(v_payload->>'clientId')then raise exception using errcode='42501',message='V14_CLIENT_NOT_ASSIGNED';end if;insert into public.iberfit_conversation_threads(organization_id,client_id,coach_user_id,subject,created_by)values(v_org,btrim(v_payload->>'clientId'),v_user,left(coalesce(nullif(btrim(v_payload->>'subject'),''),'Seguimiento IBERFIT'),160),v_user)on conflict(organization_id,coach_user_id,client_id)do update set status='active',subject=excluded.subject,revision=public.iberfit_conversation_threads.revision+1,updated_at=now()returning * into v_thread;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'revision',v_thread.revision,'serverTime',now());
  elsif v_type='MESSAGE_SEND' then select * into v_thread from public.iberfit_conversation_threads where id=(v_payload->>'threadId')::uuid and organization_id=v_org and status='active'and((v_app='coach'and coach_user_id=v_user)or(v_app='client'and client_id=v_client))for update;if not found then raise exception using errcode='42501',message='V14_THREAD_NOT_VISIBLE';end if;v_body:=btrim(v_payload->>'body');if char_length(v_body)not between 1 and 4000 then raise exception using errcode='22023',message='V14_MESSAGE_BODY_INVALID';end if;insert into public.iberfit_messages(organization_id,thread_id,sender_user_id,sender_role,body,read_by_client_at,read_by_coach_at)values(v_org,v_thread.id,v_user,v_app,v_body,case when v_app='client'then now()end,case when v_app='coach'then now()end)returning id into v_id;update public.iberfit_conversation_threads set updated_at=now(),revision=revision+1 where id=v_thread.id returning * into v_thread;if v_app='coach'then insert into public.iberfit_in_app_notifications(organization_id,recipient_client_id,title,body,action_area,action_entity_id)values(v_org,v_thread.client_id,'Nuevo mensaje de tu Coach',left(v_body,300),'mensajes',v_thread.id::text);else insert into public.iberfit_in_app_notifications(organization_id,recipient_user_id,title,body,action_area,action_entity_id)values(v_org,v_thread.coach_user_id,'Nuevo mensaje de un cliente',left(v_body,300),'mensajes',v_thread.id::text);end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'messageId',v_id,'revision',v_thread.revision,'serverTime',now());
  elsif v_type='MESSAGE_MARK_READ' then select * into v_thread from public.iberfit_conversation_threads where id=(v_payload->>'threadId')::uuid and organization_id=v_org and((v_app='coach'and coach_user_id=v_user)or(v_app='client'and client_id=v_client));if not found then raise exception using errcode='42501',message='V14_THREAD_NOT_VISIBLE';end if;if v_app='coach'then update public.iberfit_messages set read_by_coach_at=coalesce(read_by_coach_at,now()),revision=revision+1 where thread_id=v_thread.id and sender_role<>'coach';else update public.iberfit_messages set read_by_client_at=coalesce(read_by_client_at,now()),revision=revision+1 where thread_id=v_thread.id and sender_role<>'client';end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'serverTime',now());
  elsif v_type='NOTIFICATION_MARK_READ' then if v_app='coach'then update public.iberfit_in_app_notifications set status='read',read_at=now(),revision=revision+1 where id=(v_payload->>'notificationId')::uuid and recipient_user_id=v_user;else update public.iberfit_in_app_notifications set status='read',read_at=now(),revision=revision+1 where id=(v_payload->>'notificationId')::uuid and recipient_client_id=v_client;end if;if not found then raise exception using errcode='P0002',message='V14_NOTIFICATION_NOT_FOUND';end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'serverTime',now());
  else raise exception using errcode='22023',message='V14_COMMUNICATION_COMMAND_INVALID';end if;
  insert into public.iberfit_communication_receipts(operation_id,organization_id,actor_user_id,command_type,result)values(v_op,v_org,v_user,v_type,v_result);return v_result;
end $$;

revoke all on function public.iberfit_application_context_v14() from public,anon;
revoke all on function public.iberfit_admin_require_v14() from public,anon;
revoke all on function public.iberfit_admin_bootstrap_v14() from public,anon;
revoke all on function public.iberfit_admin_execute_v14(jsonb) from public,anon;
revoke all on function public.iberfit_communication_bootstrap_v14(text) from public,anon;
revoke all on function public.iberfit_communication_execute_v14(text,jsonb) from public,anon;
grant execute on function public.iberfit_application_context_v14() to authenticated;
grant execute on function public.iberfit_admin_bootstrap_v14() to authenticated;
grant execute on function public.iberfit_admin_execute_v14(jsonb) to authenticated;
grant execute on function public.iberfit_communication_bootstrap_v14(text) to authenticated;
grant execute on function public.iberfit_communication_execute_v14(text,jsonb) to authenticated;

-- IBERFIT M26 RC43 · backend operacional Canary.
-- Migración aditiva. No elimina ni modifica tablas históricas.
-- Aplicación autorizada exclusivamente contra el proyecto Supabase Canary.



do $m26_guard$
begin
  if to_regclass('public.clients') is null then
    raise exception 'M26_RC43_CLIENTS_TABLE_REQUIRED';
  end if;

  if to_regprocedure('public.iberfit_client_id()') is null then
    raise exception 'M26_RC43_CLIENT_ID_HELPER_REQUIRED';
  end if;

  if to_regprocedure('public.is_assigned_coach(uuid)') is null then
    raise exception 'M26_RC43_ASSIGNMENT_HELPER_REQUIRED';
  end if;

  if to_regprocedure('public.iberfit_bootstrap_v26()') is null then
    raise exception 'M26_RC43_V26_BOOTSTRAP_REQUIRED';
  end if;

  if to_regprocedure(
    'public.iberfit_command_preflight_v26(jsonb)'
  ) is null then
    raise exception 'M26_RC43_V26_PREFLIGHT_REQUIRED';
  end if;

  if to_regprocedure(
    'public.iberfit_execute_command_v26(jsonb)'
  ) is null then
    raise exception 'M26_RC43_V26_EXECUTE_REQUIRED';
  end if;
end
$m26_guard$;

create or replace function public.m26_json_safe_v43(
  p_value jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $m26$
  select case
    when jsonb_typeof(
      coalesce(p_value, '{}'::jsonb)
    ) <> 'object' then false
    when octet_length(
      coalesce(p_value, '{}'::jsonb)::text
    ) > 120000 then false
    else not exists (
      select 1
      from jsonb_object_keys(
        coalesce(p_value, '{}'::jsonb)
      ) as key_name
      where lower(key_name) = any (
        array[
          'password',
          'token',
          'access_token',
          'refresh_token',
          'service_role',
          'secret',
          'authorization',
          'email',
          'phone',
          'telefono'
        ]
      )
    )
  end;
$m26$;

revoke all
on function public.m26_json_safe_v43(jsonb)
from public, anon;

grant execute
on function public.m26_json_safe_v43(jsonb)
to authenticated;

create table if not exists public.m26_schema_releases_v43 (
  version text primary key,
  environment text not null
    check (environment = 'production'),
  applied_at timestamptz not null default now(),
  production_modified boolean not null default true
    check (production_modified = true),
  production_deployed boolean not null default true
    check (production_deployed = true)
);

create table if not exists public.m26_client_measurements_v43 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.clients(id)
    on delete cascade,
  metric text not null
    check (metric ~ '^[a-z0-9_]{2,40}$'),
  value numeric(14,4) not null,
  unit text not null
    check (
      char_length(unit) between 1 and 24
    ),
  measured_at timestamptz not null default now(),
  source text not null default 'manual'
    check (
      source in (
        'manual',
        'wearable',
        'import',
        'computed'
      )
    ),
  notes text
    check (
      notes is null
      or char_length(notes) <= 1000
    ),
  metadata jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(metadata)
    ),
  revision bigint not null default 1
    check (revision > 0),
  created_by uuid not null default auth.uid()
    references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.m26_training_plans_v43 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.clients(id)
    on delete cascade,
  title text not null
    check (
      char_length(title) between 1 and 160
    ),
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'active',
        'paused',
        'completed',
        'archived'
      )
    ),
  starts_on date,
  ends_on date,
  plan_payload jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(plan_payload)
    ),
  revision bigint not null default 1
    check (revision > 0),
  created_by uuid not null default auth.uid()
    references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    ends_on is null
    or starts_on is null
    or ends_on >= starts_on
  )
);

create table if not exists public.m26_training_sessions_v43 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.clients(id)
    on delete cascade,
  plan_id uuid
    references public.m26_training_plans_v43(id)
    on delete set null,
  title text not null
    check (
      char_length(title) between 1 and 160
    ),
  status text not null default 'planned'
    check (
      status in (
        'planned',
        'confirmed',
        'started',
        'completed',
        'cancelled'
      )
    ),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  session_payload jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(session_payload)
    ),
  result_payload jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(result_payload)
    ),
  revision bigint not null default 1
    check (revision > 0),
  created_by uuid not null default auth.uid()
    references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    completed_at is null
    or started_at is null
    or completed_at >= started_at
  )
);

create table if not exists public.m26_messages_v43 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.clients(id)
    on delete cascade,
  sender_user_id uuid not null default auth.uid()
    references auth.users(id),
  body text not null
    check (
      char_length(body) between 1 and 4000
    ),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.m26_audit_events_v43 (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  client_id uuid references public.clients(id)
    on delete set null,
  event_type text not null
    check (
      event_type ~ '^[A-Z0-9_]{3,80}$'
    ),
  entity_type text not null
    check (
      entity_type ~ '^[a-z0-9_]{2,80}$'
    ),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(metadata)
    ),
  created_at timestamptz not null default now()
);

create index if not exists
  m26_measurements_client_date_v43
on public.m26_client_measurements_v43 (
  client_id,
  measured_at desc
);

create index if not exists
  m26_plans_client_status_v43
on public.m26_training_plans_v43 (
  client_id,
  status
);

create index if not exists
  m26_sessions_client_date_v43
on public.m26_training_sessions_v43 (
  client_id,
  scheduled_at desc
);

create index if not exists
  m26_messages_client_date_v43
on public.m26_messages_v43 (
  client_id,
  created_at desc
);

create index if not exists
  m26_audit_client_date_v43
on public.m26_audit_events_v43 (
  client_id,
  created_at desc
);

create or replace function public.m26_touch_updated_at_v43()
returns trigger
language plpgsql
set search_path = ''
as $m26$
begin
  new.updated_at := now();

  if to_jsonb(new) ? 'revision' then
    new.revision := coalesce(old.revision, 0) + 1;
  end if;

  return new;
end
$m26$;

revoke all
on function public.m26_touch_updated_at_v43()
from public, anon, authenticated;

drop trigger if exists
  m26_measurements_touch_v43
on public.m26_client_measurements_v43;

create trigger m26_measurements_touch_v43
before update
on public.m26_client_measurements_v43
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
  m26_plans_touch_v43
on public.m26_training_plans_v43;

create trigger m26_plans_touch_v43
before update
on public.m26_training_plans_v43
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
  m26_sessions_touch_v43
on public.m26_training_sessions_v43;

create trigger m26_sessions_touch_v43
before update
on public.m26_training_sessions_v43
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
  m26_messages_touch_v43
on public.m26_messages_v43;

create trigger m26_messages_touch_v43
before update
on public.m26_messages_v43
for each row
execute function public.m26_touch_updated_at_v43();

create or replace function public.m26_audit_row_v43()
returns trigger
language plpgsql
security definer
set search_path = ''
as $m26$
declare
  v_row jsonb;
  v_client_id uuid;
  v_entity_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  v_client_id := nullif(
    v_row ->> 'client_id',
    ''
  )::uuid;

  v_entity_id := nullif(
    v_row ->> 'id',
    ''
  )::uuid;

  insert into public.m26_audit_events_v43 (
    actor_user_id,
    client_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    auth.uid(),
    v_client_id,
    'ROW_' || tg_op,
    tg_table_name,
    v_entity_id,
    jsonb_build_object(
      'operation',
      tg_op
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$m26$;

revoke all
on function public.m26_audit_row_v43()
from public, anon, authenticated;

drop trigger if exists
  m26_measurements_audit_v43
on public.m26_client_measurements_v43;

create trigger m26_measurements_audit_v43
after insert or update or delete
on public.m26_client_measurements_v43
for each row
execute function public.m26_audit_row_v43();

drop trigger if exists
  m26_plans_audit_v43
on public.m26_training_plans_v43;

create trigger m26_plans_audit_v43
after insert or update or delete
on public.m26_training_plans_v43
for each row
execute function public.m26_audit_row_v43();

drop trigger if exists
  m26_sessions_audit_v43
on public.m26_training_sessions_v43;

create trigger m26_sessions_audit_v43
after insert or update or delete
on public.m26_training_sessions_v43
for each row
execute function public.m26_audit_row_v43();

drop trigger if exists
  m26_messages_audit_v43
on public.m26_messages_v43;

create trigger m26_messages_audit_v43
after insert or update or delete
on public.m26_messages_v43
for each row
execute function public.m26_audit_row_v43();

alter table public.m26_schema_releases_v43
  enable row level security;

alter table public.m26_client_measurements_v43
  enable row level security;

alter table public.m26_training_plans_v43
  enable row level security;

alter table public.m26_training_sessions_v43
  enable row level security;

alter table public.m26_messages_v43
  enable row level security;

alter table public.m26_audit_events_v43
  enable row level security;

drop policy if exists
  m26_measurements_read_v43
on public.m26_client_measurements_v43;

create policy m26_measurements_read_v43
on public.m26_client_measurements_v43
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_measurements_write_v43
on public.m26_client_measurements_v43;

create policy m26_measurements_write_v43
on public.m26_client_measurements_v43
for all
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
)
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and created_by = auth.uid()
);

drop policy if exists
  m26_plans_read_v43
on public.m26_training_plans_v43;

create policy m26_plans_read_v43
on public.m26_training_plans_v43
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_plans_write_v43
on public.m26_training_plans_v43;

create policy m26_plans_write_v43
on public.m26_training_plans_v43
for all
to authenticated
using (
  public.is_assigned_coach(client_id)
)
with check (
  public.is_assigned_coach(client_id)
  and created_by = auth.uid()
);

drop policy if exists
  m26_sessions_read_v43
on public.m26_training_sessions_v43;

create policy m26_sessions_read_v43
on public.m26_training_sessions_v43
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_sessions_write_v43
on public.m26_training_sessions_v43;

create policy m26_sessions_write_v43
on public.m26_training_sessions_v43
for all
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
)
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and created_by = auth.uid()
);

drop policy if exists
  m26_messages_read_v43
on public.m26_messages_v43;

create policy m26_messages_read_v43
on public.m26_messages_v43
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_messages_insert_v43
on public.m26_messages_v43;

create policy m26_messages_insert_v43
on public.m26_messages_v43
for insert
to authenticated
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and sender_user_id = auth.uid()
);

drop policy if exists
  m26_messages_update_v43
on public.m26_messages_v43;

create policy m26_messages_update_v43
on public.m26_messages_v43
for update
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
)
with check (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_audit_read_v43
on public.m26_audit_events_v43;

create policy m26_audit_read_v43
on public.m26_audit_events_v43
for select
to authenticated
using (
  actor_user_id = auth.uid()
  or (
    client_id is not null
    and (
      client_id = public.iberfit_client_id()
      or public.is_assigned_coach(client_id)
    )
  )
);

revoke all
on public.m26_schema_releases_v43
from anon, authenticated;

revoke all
on public.m26_client_measurements_v43
from anon, authenticated;

revoke all
on public.m26_training_plans_v43
from anon, authenticated;

revoke all
on public.m26_training_sessions_v43
from anon, authenticated;

revoke all
on public.m26_messages_v43
from anon, authenticated;

revoke all
on public.m26_audit_events_v43
from anon, authenticated;

grant select, insert, update, delete
on public.m26_client_measurements_v43
to authenticated;

grant select, insert, update, delete
on public.m26_training_plans_v43
to authenticated;

grant select, insert, update, delete
on public.m26_training_sessions_v43
to authenticated;

grant select, insert
on public.m26_messages_v43
to authenticated;

grant update (read_at)
on public.m26_messages_v43
to authenticated;

grant select
on public.m26_audit_events_v43
to authenticated;

create or replace function public.m26_backend_health_v43()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $m26$
  with backend_tables as (
    select unnest(
      array[
        'public.m26_schema_releases_v43',
        'public.m26_client_measurements_v43',
        'public.m26_training_plans_v43',
        'public.m26_training_sessions_v43',
        'public.m26_messages_v43',
        'public.m26_audit_events_v43'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,
      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from backend_tables
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 6 and rls_count = 6,
    'version',
    'RC43',
    'environment',
    'production',
    'tables',
    table_count,
    'rlsTables',
    rls_count,
    'productionModified',
    true,
    'productionDeployed',
    true
  )
  from table_state;
$m26$;

revoke all
on function public.m26_backend_health_v43()
from public;

grant execute
on function public.m26_backend_health_v43()
to anon, authenticated;

create or replace function public.m26_backend_bootstrap_v43()
returns jsonb
language sql
stable
set search_path = ''
as $m26$
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    true,
    'version',
    'RC43',
    'userId',
    auth.uid(),
    'clientId',
    public.iberfit_client_id(),
    'counts',
    jsonb_build_object(
      'measurements',
      (
        select count(*)
        from public.m26_client_measurements_v43
      ),
      'plans',
      (
        select count(*)
        from public.m26_training_plans_v43
      ),
      'sessions',
      (
        select count(*)
        from public.m26_training_sessions_v43
      ),
      'messages',
      (
        select count(*)
        from public.m26_messages_v43
      )
    )
  )
  where auth.uid() is not null;
$m26$;

revoke all
on function public.m26_backend_bootstrap_v43()
from public, anon;

grant execute
on function public.m26_backend_bootstrap_v43()
to authenticated;

create or replace function public.m26_record_measurement_v43(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_metric text;
  v_value numeric;
  v_unit text;
  v_source text;
  v_measured_at timestamptz;
  v_notes text;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_metric := lower(
    trim(p_payload ->> 'metric')
  );

  v_value := (
    p_payload ->> 'value'
  )::numeric;

  v_unit := trim(
    p_payload ->> 'unit'
  );

  v_source := coalesce(
    nullif(
      lower(trim(p_payload ->> 'source')),
      ''
    ),
    'manual'
  );

  v_measured_at := coalesce(
    nullif(
      p_payload ->> 'measuredAt',
      ''
    )::timestamptz,
    now()
  );

  v_notes := nullif(
    trim(p_payload ->> 'notes'),
    ''
  );

  v_metadata := coalesce(
    p_payload -> 'metadata',
    '{}'::jsonb
  );

  insert into public.m26_client_measurements_v43 (
    client_id,
    metric,
    value,
    unit,
    measured_at,
    source,
    notes,
    metadata
  )
  values (
    v_client_id,
    v_metric,
    v_value,
    v_unit,
    v_measured_at,
    v_source,
    v_notes,
    v_metadata
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$m26$;

revoke all
on function public.m26_record_measurement_v43(jsonb)
from public, anon;

grant execute
on function public.m26_record_measurement_v43(jsonb)
to authenticated;

create or replace function public.m26_save_training_session_v43(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_plan_id uuid;
  v_title text;
  v_status text;
  v_scheduled_at timestamptz;
  v_session_payload jsonb;
  v_result_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_id := nullif(
    p_payload ->> 'id',
    ''
  )::uuid;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_plan_id := nullif(
    p_payload ->> 'planId',
    ''
  )::uuid;

  v_title := trim(
    p_payload ->> 'title'
  );

  v_status := coalesce(
    nullif(
      lower(trim(p_payload ->> 'status')),
      ''
    ),
    'planned'
  );

  v_scheduled_at := nullif(
    p_payload ->> 'scheduledAt',
    ''
  )::timestamptz;

  v_session_payload := coalesce(
    p_payload -> 'session',
    '{}'::jsonb
  );

  v_result_payload := coalesce(
    p_payload -> 'result',
    '{}'::jsonb
  );

  if v_id is null then
    insert into public.m26_training_sessions_v43 (
      client_id,
      plan_id,
      title,
      status,
      scheduled_at,
      session_payload,
      result_payload
    )
    values (
      v_client_id,
      v_plan_id,
      v_title,
      v_status,
      v_scheduled_at,
      v_session_payload,
      v_result_payload
    )
    returning id into v_id;
  else
    update public.m26_training_sessions_v43
    set
      plan_id = v_plan_id,
      title = v_title,
      status = v_status,
      scheduled_at = v_scheduled_at,
      session_payload = v_session_payload,
      result_payload = v_result_payload
    where id = v_id
      and client_id = v_client_id
    returning id into v_id;

    if not found then
      raise exception 'M26_RC43_SESSION_NOT_FOUND';
    end if;
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$m26$;

revoke all
on function public.m26_save_training_session_v43(jsonb)
from public, anon;

grant execute
on function public.m26_save_training_session_v43(jsonb)
to authenticated;

create or replace function public.m26_send_message_v43(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_body := trim(
    p_payload ->> 'body'
  );

  insert into public.m26_messages_v43 (
    client_id,
    body
  )
  values (
    v_client_id,
    v_body
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$m26$;

revoke all
on function public.m26_send_message_v43(jsonb)
from public, anon;

grant execute
on function public.m26_send_message_v43(jsonb)
to authenticated;

insert into public.m26_schema_releases_v43 (
  version,
  environment,
  production_modified,
  production_deployed
)
values (
  'RC43',
  'production',
  true,
  true
)
on conflict (version)
do update set
  environment = excluded.environment,
  applied_at = now(),
  production_modified = true,
  production_deployed = true;

do $m26_postcheck$
declare
  v_tables integer;
  v_rls integer;
begin
  select count(*)
  into v_tables
  from unnest(
    array[
      'public.m26_schema_releases_v43',
      'public.m26_client_measurements_v43',
      'public.m26_training_plans_v43',
      'public.m26_training_sessions_v43',
      'public.m26_messages_v43',
      'public.m26_audit_events_v43'
    ]
  ) as relations(relation_name)
  where to_regclass(relation_name) is not null;

  select count(*)
  into v_rls
  from pg_catalog.pg_class
  where oid = any (
    array[
      'public.m26_schema_releases_v43'::regclass,
      'public.m26_client_measurements_v43'::regclass,
      'public.m26_training_plans_v43'::regclass,
      'public.m26_training_sessions_v43'::regclass,
      'public.m26_messages_v43'::regclass,
      'public.m26_audit_events_v43'::regclass
    ]
  )
  and relrowsecurity is true;

  if v_tables <> 6 then
    raise exception 'M26_RC43_TABLE_POSTCHECK_FAILED';
  end if;

  if v_rls <> 6 then
    raise exception 'M26_RC43_RLS_POSTCHECK_FAILED';
  end if;

  if to_regprocedure(
    'public.m26_backend_health_v43()'
  ) is null then
    raise exception 'M26_RC43_HEALTH_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_backend_bootstrap_v43()'
  ) is null then
    raise exception 'M26_RC43_BOOTSTRAP_RPC_MISSING';
  end if;
end
$m26_postcheck$;

-- IBERFIT M26 RC43.1 · persistencia remota de borradores.
-- Migración aditiva y exclusiva para Supabase Canary.
-- No elimina ni modifica datos RC43 existentes.



do $m26_guard$
begin
  if to_regclass(
    'public.m26_schema_releases_v43'
  ) is null then
    raise exception 'M26_RC431_RC43_SCHEMA_REQUIRED';
  end if;

  if to_regclass(
    'public.m26_audit_events_v43'
  ) is null then
    raise exception 'M26_RC431_AUDIT_TABLE_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_json_safe_v43(jsonb)'
  ) is null then
    raise exception 'M26_RC431_JSON_GUARD_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_touch_updated_at_v43()'
  ) is null then
    raise exception 'M26_RC431_TOUCH_TRIGGER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_audit_row_v43()'
  ) is null then
    raise exception 'M26_RC431_AUDIT_TRIGGER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.iberfit_client_id()'
  ) is null then
    raise exception 'M26_RC431_CLIENT_HELPER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.is_assigned_coach(uuid)'
  ) is null then
    raise exception 'M26_RC431_ASSIGNMENT_HELPER_REQUIRED';
  end if;
end
$m26_guard$;

create table if not exists
public.m26_session_drafts_v431 (
  id uuid primary key default gen_random_uuid(),

  owner_user_id uuid not null default auth.uid()
    references auth.users(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  scope text not null default 'session-builder'
    check (
      scope = 'session-builder'
    ),

  draft_payload jsonb not null
    check (
      public.m26_json_safe_v43(draft_payload)
    ),

  client_revision bigint not null default 0
    check (
      client_revision >= 0
    ),

  revision bigint not null default 1
    check (
      revision > 0
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    owner_user_id,
    client_id,
    scope
  )
);

create index if not exists
m26_session_drafts_owner_client_v431
on public.m26_session_drafts_v431 (
  owner_user_id,
  client_id,
  updated_at desc
);

drop trigger if exists
m26_session_drafts_touch_v431
on public.m26_session_drafts_v431;

create trigger m26_session_drafts_touch_v431
before update
on public.m26_session_drafts_v431
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
m26_session_drafts_audit_v431
on public.m26_session_drafts_v431;

create trigger m26_session_drafts_audit_v431
after insert or update or delete
on public.m26_session_drafts_v431
for each row
execute function public.m26_audit_row_v43();

alter table public.m26_session_drafts_v431
  enable row level security;

drop policy if exists
m26_session_drafts_read_v431
on public.m26_session_drafts_v431;

create policy m26_session_drafts_read_v431
on public.m26_session_drafts_v431
for select
to authenticated
using (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

drop policy if exists
m26_session_drafts_insert_v431
on public.m26_session_drafts_v431;

create policy m26_session_drafts_insert_v431
on public.m26_session_drafts_v431
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

drop policy if exists
m26_session_drafts_update_v431
on public.m26_session_drafts_v431;

create policy m26_session_drafts_update_v431
on public.m26_session_drafts_v431
for update
to authenticated
using (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
)
with check (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

drop policy if exists
m26_session_drafts_delete_v431
on public.m26_session_drafts_v431;

create policy m26_session_drafts_delete_v431
on public.m26_session_drafts_v431
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

revoke all
on public.m26_session_drafts_v431
from anon, authenticated;

grant select, insert, update, delete
on public.m26_session_drafts_v431
to authenticated;

create or replace function
public.m26_draft_upsert_v431(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_scope text;
  v_draft jsonb;
  v_client_revision bigint;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 125000
  then
    raise exception 'M26_RC431_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_scope := coalesce(
    nullif(
      trim(p_payload ->> 'scope'),
      ''
    ),
    'session-builder'
  );

  v_draft := p_payload -> 'draft';

  v_client_revision := greatest(
    coalesce(
      nullif(
        p_payload ->> 'revision',
        ''
      )::bigint,
      0
    ),
    0
  );

  if
    v_client_id is null
    or v_scope <> 'session-builder'
    or jsonb_typeof(v_draft) <> 'object'
    or not public.m26_json_safe_v43(v_draft)
  then
    raise exception 'M26_RC431_DRAFT_INVALID';
  end if;

  if not (
    v_client_id = public.iberfit_client_id()
    or public.is_assigned_coach(v_client_id)
  ) then
    raise exception 'M26_RC431_CLIENT_SCOPE_FORBIDDEN';
  end if;

  insert into public.m26_session_drafts_v431 (
    owner_user_id,
    client_id,
    scope,
    draft_payload,
    client_revision
  )
  values (
    auth.uid(),
    v_client_id,
    v_scope,
    v_draft,
    v_client_revision
  )
  on conflict (
    owner_user_id,
    client_id,
    scope
  )
  do update set
    draft_payload = excluded.draft_payload,
    client_revision = excluded.client_revision,
    updated_at = now()
  returning
    id,
    revision,
    updated_at
  into
    v_id,
    v_revision,
    v_updated_at;

  return jsonb_build_object(
    'ok',
    true,
    'saved',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id,
    'scope',
    v_scope,
    'revision',
    v_revision,
    'clientRevision',
    v_client_revision,
    'updatedAt',
    v_updated_at
  );
end
$m26$;

revoke all
on function public.m26_draft_upsert_v431(jsonb)
from public, anon;

grant execute
on function public.m26_draft_upsert_v431(jsonb)
to authenticated;

create or replace function
public.m26_draft_get_v431(
  p_client_id uuid,
  p_scope text default 'session-builder'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_draft jsonb;
  v_revision bigint;
  v_client_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope <> 'session-builder'
  then
    raise exception 'M26_RC431_DRAFT_QUERY_INVALID';
  end if;

  if not (
    p_client_id = public.iberfit_client_id()
    or public.is_assigned_coach(p_client_id)
  ) then
    raise exception 'M26_RC431_CLIENT_SCOPE_FORBIDDEN';
  end if;

  select
    id,
    draft_payload,
    revision,
    client_revision,
    updated_at
  into
    v_id,
    v_draft,
    v_revision,
    v_client_revision,
    v_updated_at
  from public.m26_session_drafts_v431
  where owner_user_id = auth.uid()
    and client_id = p_client_id
    and scope = p_scope
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok',
      true,
      'found',
      false,
      'clientId',
      p_client_id,
      'scope',
      p_scope
    );
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'found',
    true,
    'id',
    v_id,
    'clientId',
    p_client_id,
    'scope',
    p_scope,
    'draft',
    v_draft,
    'revision',
    v_revision,
    'clientRevision',
    v_client_revision,
    'updatedAt',
    v_updated_at
  );
end
$m26$;

revoke all
on function
public.m26_draft_get_v431(uuid,text)
from public, anon;

grant execute
on function
public.m26_draft_get_v431(uuid,text)
to authenticated;

create or replace function
public.m26_draft_delete_v431(
  p_client_id uuid,
  p_scope text default 'session-builder'
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope <> 'session-builder'
  then
    raise exception 'M26_RC431_DRAFT_QUERY_INVALID';
  end if;

  if not (
    p_client_id = public.iberfit_client_id()
    or public.is_assigned_coach(p_client_id)
  ) then
    raise exception 'M26_RC431_CLIENT_SCOPE_FORBIDDEN';
  end if;

  delete from public.m26_session_drafts_v431
  where owner_user_id = auth.uid()
    and client_id = p_client_id
    and scope = p_scope
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'deleted',
    v_id is not null,
    'clientId',
    p_client_id,
    'scope',
    p_scope
  );
end
$m26$;

revoke all
on function
public.m26_draft_delete_v431(uuid,text)
from public, anon;

grant execute
on function
public.m26_draft_delete_v431(uuid,text)
to authenticated;

create or replace function
public.m26_backend_health_v431()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $m26$
  with backend_tables as (
    select unnest(
      array[
        'public.m26_schema_releases_v43',
        'public.m26_client_measurements_v43',
        'public.m26_training_plans_v43',
        'public.m26_training_sessions_v43',
        'public.m26_messages_v43',
        'public.m26_audit_events_v43',
        'public.m26_session_drafts_v431'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,

      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from backend_tables
  ),
  policy_state as (
    select count(*) as policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'm26_session_drafts_v431'
  ),
  rpc_state as (
    select count(*) as rpc_count
    from unnest(
      array[
        'public.m26_draft_upsert_v431(jsonb)',
        'public.m26_draft_get_v431(uuid,text)',
        'public.m26_draft_delete_v431(uuid,text)'
      ]
    ) as rpc_name
    where to_regprocedure(rpc_name) is not null
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 7
      and rls_count = 7
      and policy_count >= 4
      and rpc_count = 3,
    'version',
    'RC43.1',
    'environment',
    'production',
    'tables',
    table_count,
    'rlsTables',
    rls_count,
    'draftPolicies',
    policy_count,
    'draftRpcs',
    rpc_count,
    'productionModified',
    true,
    'productionDeployed',
    true
  )
  from table_state
  cross join policy_state
  cross join rpc_state;
$m26$;

revoke all
on function public.m26_backend_health_v431()
from public;

grant execute
on function public.m26_backend_health_v431()
to anon, authenticated;

insert into public.m26_schema_releases_v43 (
  version,
  environment,
  production_modified,
  production_deployed
)
values (
  'RC43.1',
  'production',
  true,
  true
)
on conflict (version)
do update set
  environment = excluded.environment,
  applied_at = now(),
  production_modified = true,
  production_deployed = true;

do $m26_postcheck$
declare
  v_rls boolean;
  v_policies integer;
begin
  if to_regclass(
    'public.m26_session_drafts_v431'
  ) is null then
    raise exception 'M26_RC431_TABLE_POSTCHECK_FAILED';
  end if;

  select relrowsecurity
  into v_rls
  from pg_catalog.pg_class
  where oid = 'public.m26_session_drafts_v431'::regclass;

  if v_rls is not true then
    raise exception 'M26_RC431_RLS_POSTCHECK_FAILED';
  end if;

  select count(*)
  into v_policies
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'm26_session_drafts_v431';

  if v_policies < 4 then
    raise exception 'M26_RC431_POLICY_POSTCHECK_FAILED';
  end if;

  if to_regprocedure(
    'public.m26_draft_upsert_v431(jsonb)'
  ) is null then
    raise exception 'M26_RC431_UPSERT_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_draft_get_v431(uuid,text)'
  ) is null then
    raise exception 'M26_RC431_GET_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_draft_delete_v431(uuid,text)'
  ) is null then
    raise exception 'M26_RC431_DELETE_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_backend_health_v431()'
  ) is null then
    raise exception 'M26_RC431_HEALTH_RPC_MISSING';
  end if;
end
$m26_postcheck$;

-- IBERFIT M26 RC44 · núcleo wearable sin coste fijo.
-- Migración aditiva y exclusiva para Supabase Canary.
-- No almacena claves OAuth, access tokens ni refresh tokens.



do $m26_guard$
begin
  if to_regclass(
    'public.m26_schema_releases_v43'
  ) is null then
    raise exception 'M26_RC44_RC43_SCHEMA_REQUIRED';
  end if;

  if to_regclass(
    'public.m26_audit_events_v43'
  ) is null then
    raise exception 'M26_RC44_AUDIT_REQUIRED';
  end if;

  if to_regprocedure(
    'public.iberfit_client_id()'
  ) is null then
    raise exception 'M26_RC44_CLIENT_HELPER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.is_assigned_coach(uuid)'
  ) is null then
    raise exception 'M26_RC44_ASSIGNMENT_HELPER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_touch_updated_at_v43()'
  ) is null then
    raise exception 'M26_RC44_TOUCH_TRIGGER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_audit_row_v43()'
  ) is null then
    raise exception 'M26_RC44_AUDIT_TRIGGER_REQUIRED';
  end if;
end
$m26_guard$;

create or replace function
public.m26_json_has_forbidden_key_v44(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $m26$
declare
  v_key text;
  v_child jsonb;
begin
  if p_value is null then
    return false;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select key, value
      from jsonb_each(p_value)
    loop
      if lower(v_key) = any (
        array[
          'password',
          'token',
          'access_token',
          'refresh_token',
          'service_role',
          'secret',
          'authorization',
          'client_secret',
          'email',
          'phone',
          'telefono',
          'name',
          'nombre'
        ]
      ) then
        return true;
      end if;

      if public.m26_json_has_forbidden_key_v44(
        v_child
      ) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in
      select value
      from jsonb_array_elements(p_value)
    loop
      if public.m26_json_has_forbidden_key_v44(
        v_child
      ) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end
$m26$;

revoke all
on function
public.m26_json_has_forbidden_key_v44(jsonb)
from public, anon;

grant execute
on function
public.m26_json_has_forbidden_key_v44(jsonb)
to authenticated;

create table if not exists
public.m26_wearable_connections_v44 (
  id uuid primary key default gen_random_uuid(),

  owner_user_id uuid not null default auth.uid()
    references auth.users(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  provider text not null
    check (
      provider in (
        'normalized_file',
        'health_connect',
        'samsung_health',
        'apple_health',
        'strava',
        'garmin_connect',
        'fitbit',
        'oura'
      )
    ),

  status text not null default 'active'
    check (
      status in (
        'active',
        'paused',
        'revoked'
      )
    ),

  sync_enabled boolean not null default true,

  granted_scopes text[] not null default '{}'::text[]
    check (
      granted_scopes <@ array[
        'steps',
        'activeMinutes',
        'sleepMinutes',
        'restingHeartRate',
        'hrvMs',
        'activeEnergyKcal',
        'workoutMinutes'
      ]::text[]
    ),

  consent_version text not null default 'v44-zero-cost'
    check (
      consent_version = 'v44-zero-cost'
    ),

  last_synced_at timestamptz,

  metadata jsonb not null default '{}'::jsonb
    check (
      octet_length(metadata::text) <= 10000
      and not public.m26_json_has_forbidden_key_v44(
        metadata
      )
    ),

  revision bigint not null default 1
    check (
      revision > 0
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    owner_user_id,
    client_id,
    provider
  )
);

create table if not exists
public.m26_wearable_daily_summaries_v44 (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  provider text not null
    check (
      provider in (
        'normalized_file',
        'health_connect',
        'samsung_health',
        'apple_health',
        'strava',
        'garmin_connect',
        'fitbit',
        'oura'
      )
    ),

  record_date date not null,

  steps integer
    check (
      steps is null
      or steps between 0 and 200000
    ),

  active_minutes integer
    check (
      active_minutes is null
      or active_minutes between 0 and 1440
    ),

  sleep_minutes integer
    check (
      sleep_minutes is null
      or sleep_minutes between 0 and 1440
    ),

  resting_heart_rate numeric(7,2)
    check (
      resting_heart_rate is null
      or resting_heart_rate between 25 and 240
    ),

  hrv_ms numeric(8,2)
    check (
      hrv_ms is null
      or hrv_ms between 0 and 1000
    ),

  active_energy_kcal numeric(10,2)
    check (
      active_energy_kcal is null
      or active_energy_kcal between 0 and 20000
    ),

  workout_minutes integer
    check (
      workout_minutes is null
      or workout_minutes between 0 and 1440
    ),

  quality text not null default 'limitada'
    check (
      quality in (
        'alta',
        'media',
        'limitada'
      )
    ),

  source_updated_at timestamptz not null,
  source_record_count integer not null default 1
    check (
      source_record_count between 1 and 100000
    ),

  imported_by uuid not null default auth.uid()
    references auth.users(id),

  revision bigint not null default 1
    check (
      revision > 0
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    client_id,
    provider,
    record_date
  ),

  check (
    steps is not null
    or active_minutes is not null
    or sleep_minutes is not null
    or resting_heart_rate is not null
    or hrv_ms is not null
    or active_energy_kcal is not null
    or workout_minutes is not null
  )
);

create table if not exists
public.m26_wearable_consents_v44 (
  id uuid primary key default gen_random_uuid(),

  actor_user_id uuid not null default auth.uid()
    references auth.users(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  provider text not null
    check (
      provider in (
        'normalized_file',
        'health_connect',
        'samsung_health',
        'apple_health',
        'strava',
        'garmin_connect',
        'fitbit',
        'oura'
      )
    ),

  action text not null
    check (
      action in (
        'grant',
        'pause',
        'resume',
        'revoke',
        'delete'
      )
    ),

  scopes text[] not null default '{}'::text[]
    check (
      scopes <@ array[
        'steps',
        'activeMinutes',
        'sleepMinutes',
        'restingHeartRate',
        'hrvMs',
        'activeEnergyKcal',
        'workoutMinutes'
      ]::text[]
    ),

  policy_version text not null default 'v44-zero-cost'
    check (
      policy_version = 'v44-zero-cost'
    ),

  created_at timestamptz not null default now()
);

create index if not exists
m26_wearable_connections_client_v44
on public.m26_wearable_connections_v44 (
  client_id,
  provider
);

create index if not exists
m26_wearable_summaries_client_date_v44
on public.m26_wearable_daily_summaries_v44 (
  client_id,
  record_date desc
);

create index if not exists
m26_wearable_consents_client_date_v44
on public.m26_wearable_consents_v44 (
  client_id,
  created_at desc
);

drop trigger if exists
m26_wearable_connections_touch_v44
on public.m26_wearable_connections_v44;

create trigger m26_wearable_connections_touch_v44
before update
on public.m26_wearable_connections_v44
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
m26_wearable_summaries_touch_v44
on public.m26_wearable_daily_summaries_v44;

create trigger m26_wearable_summaries_touch_v44
before update
on public.m26_wearable_daily_summaries_v44
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
m26_wearable_connections_audit_v44
on public.m26_wearable_connections_v44;

create trigger m26_wearable_connections_audit_v44
after insert or update or delete
on public.m26_wearable_connections_v44
for each row
execute function public.m26_audit_row_v43();

drop trigger if exists
m26_wearable_summaries_audit_v44
on public.m26_wearable_daily_summaries_v44;

create trigger m26_wearable_summaries_audit_v44
after insert or update or delete
on public.m26_wearable_daily_summaries_v44
for each row
execute function public.m26_audit_row_v43();

alter table public.m26_wearable_connections_v44
  enable row level security;

alter table public.m26_wearable_daily_summaries_v44
  enable row level security;

alter table public.m26_wearable_consents_v44
  enable row level security;

drop policy if exists
m26_wearable_connections_read_v44
on public.m26_wearable_connections_v44;

create policy m26_wearable_connections_read_v44
on public.m26_wearable_connections_v44
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
m26_wearable_connections_insert_v44
on public.m26_wearable_connections_v44;

create policy m26_wearable_connections_insert_v44
on public.m26_wearable_connections_v44
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
);

drop policy if exists
m26_wearable_connections_update_v44
on public.m26_wearable_connections_v44;

create policy m26_wearable_connections_update_v44
on public.m26_wearable_connections_v44
for update
to authenticated
using (
  owner_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
)
with check (
  owner_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
);

drop policy if exists
m26_wearable_connections_delete_v44
on public.m26_wearable_connections_v44;

create policy m26_wearable_connections_delete_v44
on public.m26_wearable_connections_v44
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
);

drop policy if exists
m26_wearable_summaries_read_v44
on public.m26_wearable_daily_summaries_v44;

create policy m26_wearable_summaries_read_v44
on public.m26_wearable_daily_summaries_v44
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
m26_wearable_summaries_insert_v44
on public.m26_wearable_daily_summaries_v44;

create policy m26_wearable_summaries_insert_v44
on public.m26_wearable_daily_summaries_v44
for insert
to authenticated
with check (
  client_id = public.iberfit_client_id()
  and imported_by = auth.uid()
);

drop policy if exists
m26_wearable_summaries_update_v44
on public.m26_wearable_daily_summaries_v44;

create policy m26_wearable_summaries_update_v44
on public.m26_wearable_daily_summaries_v44
for update
to authenticated
using (
  client_id = public.iberfit_client_id()
  and imported_by = auth.uid()
)
with check (
  client_id = public.iberfit_client_id()
  and imported_by = auth.uid()
);

drop policy if exists
m26_wearable_summaries_delete_v44
on public.m26_wearable_daily_summaries_v44;

create policy m26_wearable_summaries_delete_v44
on public.m26_wearable_daily_summaries_v44
for delete
to authenticated
using (
  client_id = public.iberfit_client_id()
);

drop policy if exists
m26_wearable_consents_read_v44
on public.m26_wearable_consents_v44;

create policy m26_wearable_consents_read_v44
on public.m26_wearable_consents_v44
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
m26_wearable_consents_insert_v44
on public.m26_wearable_consents_v44;

create policy m26_wearable_consents_insert_v44
on public.m26_wearable_consents_v44
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and client_id = public.iberfit_client_id()
);

revoke all
on public.m26_wearable_connections_v44
from anon, authenticated;

revoke all
on public.m26_wearable_daily_summaries_v44
from anon, authenticated;

revoke all
on public.m26_wearable_consents_v44
from anon, authenticated;

grant select, insert, update, delete
on public.m26_wearable_connections_v44
to authenticated;

grant select, insert, update, delete
on public.m26_wearable_daily_summaries_v44
to authenticated;

grant select, insert
on public.m26_wearable_consents_v44
to authenticated;

create or replace function
public.m26_wearable_bootstrap_v44()
returns jsonb
language sql
stable
set search_path = ''
as $m26$
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    true,
    'version',
    'RC44',
    'connections',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'status',
            status,
            'syncEnabled',
            sync_enabled,
            'scopes',
            granted_scopes,
            'lastSyncedAt',
            last_synced_at,
            'revision',
            revision
          )
          order by provider
        )
        from public.m26_wearable_connections_v44
      ),
      '[]'::jsonb
    ),
    'dailySummaries',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'date',
            record_date,
            'metrics',
            jsonb_build_object(
              'steps',
              steps,
              'activeMinutes',
              active_minutes,
              'sleepMinutes',
              sleep_minutes,
              'restingHeartRate',
              resting_heart_rate,
              'hrvMs',
              hrv_ms,
              'activeEnergyKcal',
              active_energy_kcal,
              'workoutMinutes',
              workout_minutes
            ),
            'quality',
            quality,
            'sourceUpdatedAt',
            source_updated_at,
            'sourceRecordCount',
            source_record_count,
            'revision',
            revision
          )
          order by record_date desc, provider
        )
        from public.m26_wearable_daily_summaries_v44
      ),
      '[]'::jsonb
    ),
    'consents',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'action',
            action,
            'scopes',
            scopes,
            'createdAt',
            created_at
          )
          order by created_at desc
        )
        from public.m26_wearable_consents_v44
      ),
      '[]'::jsonb
    )
  )
  where auth.uid() is not null;
$m26$;

revoke all
on function public.m26_wearable_bootstrap_v44()
from public, anon;

grant execute
on function public.m26_wearable_bootstrap_v44()
to authenticated;

create or replace function
public.m26_wearable_import_v44(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_records jsonb;
  v_record jsonb;
  v_metrics jsonb;
  v_client_id uuid;
  v_provider text;
  v_date date;
  v_source_updated_at timestamptz;
  v_source_count integer;
  v_quality text;
  v_steps integer;
  v_active_minutes integer;
  v_sleep_minutes integer;
  v_resting_hr numeric;
  v_hrv numeric;
  v_energy numeric;
  v_workout_minutes integer;
  v_row_count integer;
  v_accepted integer := 0;
  v_stale integer := 0;
  v_rejected integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or public.m26_json_has_forbidden_key_v44(
      p_payload
    )
    or octet_length(p_payload::text) > 900000
  then
    raise exception 'M26_RC44_IMPORT_PAYLOAD_INVALID';
  end if;

  v_records := p_payload -> 'records';

  if
    jsonb_typeof(v_records) <> 'array'
    or jsonb_array_length(v_records) < 1
    or jsonb_array_length(v_records) > 250
  then
    raise exception 'M26_RC44_IMPORT_BATCH_INVALID';
  end if;

  for v_record in
    select value
    from jsonb_array_elements(v_records)
  loop
    begin
      v_client_id := nullif(
        v_record ->> 'clientId',
        ''
      )::uuid;

      v_provider := lower(
        trim(v_record ->> 'provider')
      );

      v_date := nullif(
        v_record ->> 'date',
        ''
      )::date;

      v_metrics := v_record -> 'metrics';

      if
        v_client_id is null
        or v_client_id <> public.iberfit_client_id()
        or v_provider not in (
          'normalized_file',
          'health_connect',
          'samsung_health',
          'apple_health',
          'strava',
          'garmin_connect',
          'fitbit',
          'oura'
        )
        or v_date is null
        or jsonb_typeof(v_metrics) <> 'object'
      then
        raise exception 'M26_RC44_IMPORT_RECORD_INVALID';
      end if;

      v_steps := round(
        nullif(
          v_metrics ->> 'steps',
          ''
        )::numeric
      )::integer;

      v_active_minutes := round(
        nullif(
          v_metrics ->> 'activeMinutes',
          ''
        )::numeric
      )::integer;

      v_sleep_minutes := round(
        nullif(
          v_metrics ->> 'sleepMinutes',
          ''
        )::numeric
      )::integer;

      v_resting_hr := nullif(
        v_metrics ->> 'restingHeartRate',
        ''
      )::numeric;

      v_hrv := nullif(
        v_metrics ->> 'hrvMs',
        ''
      )::numeric;

      v_energy := nullif(
        v_metrics ->> 'activeEnergyKcal',
        ''
      )::numeric;

      v_workout_minutes := round(
        nullif(
          v_metrics ->> 'workoutMinutes',
          ''
        )::numeric
      )::integer;

      v_quality := coalesce(
        nullif(
          lower(trim(v_record ->> 'quality')),
          ''
        ),
        'limitada'
      );

      v_source_updated_at := coalesce(
        nullif(
          v_record ->> 'sourceUpdatedAt',
          ''
        )::timestamptz,
        (v_date::text || 'T12:00:00Z')::timestamptz
      );

      v_source_count := greatest(
        1,
        least(
          100000,
          coalesce(
            nullif(
              v_record ->> 'sourceRecordCount',
              ''
            )::integer,
            1
          )
        )
      );

      insert into
      public.m26_wearable_daily_summaries_v44 (
        client_id,
        provider,
        record_date,
        steps,
        active_minutes,
        sleep_minutes,
        resting_heart_rate,
        hrv_ms,
        active_energy_kcal,
        workout_minutes,
        quality,
        source_updated_at,
        source_record_count,
        imported_by
      )
      values (
        v_client_id,
        v_provider,
        v_date,
        v_steps,
        v_active_minutes,
        v_sleep_minutes,
        v_resting_hr,
        v_hrv,
        v_energy,
        v_workout_minutes,
        v_quality,
        v_source_updated_at,
        v_source_count,
        auth.uid()
      )
      on conflict (
        client_id,
        provider,
        record_date
      )
      do update set
        steps = excluded.steps,
        active_minutes = excluded.active_minutes,
        sleep_minutes = excluded.sleep_minutes,
        resting_heart_rate = excluded.resting_heart_rate,
        hrv_ms = excluded.hrv_ms,
        active_energy_kcal = excluded.active_energy_kcal,
        workout_minutes = excluded.workout_minutes,
        quality = excluded.quality,
        source_updated_at = excluded.source_updated_at,
        source_record_count = excluded.source_record_count,
        imported_by = auth.uid()
      where
        public.m26_wearable_daily_summaries_v44
          .source_updated_at
        <= excluded.source_updated_at;

      get diagnostics
        v_row_count = row_count;

      if v_row_count = 1 then
        v_accepted := v_accepted + 1;
      else
        v_stale := v_stale + 1;
      end if;
    exception
      when others then
        v_rejected := v_rejected + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok',
    true,
    'accepted',
    v_accepted,
    'stale',
    v_stale,
    'rejected',
    v_rejected,
    'total',
    jsonb_array_length(v_records)
  );
end
$m26$;

revoke all
on function public.m26_wearable_import_v44(jsonb)
from public, anon;

grant execute
on function public.m26_wearable_import_v44(jsonb)
to authenticated;

create or replace function
public.m26_wearable_connection_upsert_v44(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_provider text;
  v_status text;
  v_sync_enabled boolean;
  v_scopes text[];
  v_metadata jsonb;
  v_action text;
  v_last_synced_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or public.m26_json_has_forbidden_key_v44(
      p_payload
    )
    or octet_length(p_payload::text) > 20000
  then
    raise exception 'M26_RC44_CONNECTION_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_provider := lower(
    trim(p_payload ->> 'provider')
  );

  v_status := coalesce(
    nullif(
      lower(trim(p_payload ->> 'status')),
      ''
    ),
    'active'
  );

  v_sync_enabled := coalesce(
    (p_payload ->> 'syncEnabled')::boolean,
    v_status = 'active'
  );

  v_scopes := array(
    select distinct value
    from jsonb_array_elements_text(
      coalesce(
        p_payload -> 'scopes',
        '[]'::jsonb
      )
    )
    where value = any (
      array[
        'steps',
        'activeMinutes',
        'sleepMinutes',
        'restingHeartRate',
        'hrvMs',
        'activeEnergyKcal',
        'workoutMinutes'
      ]
    )
    order by value
  );

  v_metadata := coalesce(
    p_payload -> 'metadata',
    '{}'::jsonb
  );

  v_last_synced_at := nullif(
    p_payload ->> 'lastSyncedAt',
    ''
  )::timestamptz;

  if
    v_client_id is null
    or v_client_id <> public.iberfit_client_id()
    or v_provider not in (
      'normalized_file',
      'health_connect',
      'samsung_health',
      'apple_health',
      'strava',
      'garmin_connect',
      'fitbit',
      'oura'
    )
    or v_status not in (
      'active',
      'paused',
      'revoked'
    )
  then
    raise exception 'M26_RC44_CONNECTION_INVALID';
  end if;

  insert into public.m26_wearable_connections_v44 (
    owner_user_id,
    client_id,
    provider,
    status,
    sync_enabled,
    granted_scopes,
    consent_version,
    last_synced_at,
    metadata
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    v_status,
    v_sync_enabled,
    v_scopes,
    'v44-zero-cost',
    v_last_synced_at,
    v_metadata
  )
  on conflict (
    owner_user_id,
    client_id,
    provider
  )
  do update set
    status = excluded.status,
    sync_enabled = excluded.sync_enabled,
    granted_scopes = excluded.granted_scopes,
    last_synced_at = excluded.last_synced_at,
    metadata = excluded.metadata
  returning id into v_id;

  v_action := case
    when v_status = 'paused' then 'pause'
    when v_status = 'revoked' then 'revoke'
    when v_sync_enabled then 'grant'
    else 'pause'
  end;

  insert into public.m26_wearable_consents_v44 (
    actor_user_id,
    client_id,
    provider,
    action,
    scopes,
    policy_version
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    v_action,
    v_scopes,
    'v44-zero-cost'
  );

  return jsonb_build_object(
    'ok',
    true,
    'saved',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id,
    'provider',
    v_provider,
    'status',
    v_status,
    'syncEnabled',
    v_sync_enabled
  );
end
$m26$;

revoke all
on function
public.m26_wearable_connection_upsert_v44(jsonb)
from public, anon;

grant execute
on function
public.m26_wearable_connection_upsert_v44(jsonb)
to authenticated;

create or replace function
public.m26_wearable_revoke_v44(
  p_provider text,
  p_delete_data boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();
  v_provider := lower(trim(p_provider));

  if
    v_client_id is null
    or v_provider not in (
      'normalized_file',
      'health_connect',
      'samsung_health',
      'apple_health',
      'strava',
      'garmin_connect',
      'fitbit',
      'oura'
    )
  then
    raise exception 'M26_RC44_REVOKE_INVALID';
  end if;

  update public.m26_wearable_connections_v44
  set
    status = 'revoked',
    sync_enabled = false
  where owner_user_id = auth.uid()
    and client_id = v_client_id
    and provider = v_provider;

  if coalesce(p_delete_data, false) then
    delete from public.m26_wearable_daily_summaries_v44
    where client_id = v_client_id
      and provider = v_provider;

    get diagnostics
      v_deleted = row_count;
  end if;

  insert into public.m26_wearable_consents_v44 (
    actor_user_id,
    client_id,
    provider,
    action,
    scopes,
    policy_version
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    case
      when coalesce(p_delete_data, false)
        then 'delete'
      else 'revoke'
    end,
    '{}'::text[],
    'v44-zero-cost'
  );

  return jsonb_build_object(
    'ok',
    true,
    'revoked',
    true,
    'provider',
    v_provider,
    'deleted',
    v_deleted
  );
end
$m26$;

revoke all
on function
public.m26_wearable_revoke_v44(text,boolean)
from public, anon;

grant execute
on function
public.m26_wearable_revoke_v44(text,boolean)
to authenticated;

create or replace function
public.m26_wearable_delete_all_v44()
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();

  if v_client_id is null then
    raise exception 'M26_RC44_CLIENT_REQUIRED';
  end if;

  for v_provider in
    select distinct provider
    from (
      select provider
      from public.m26_wearable_connections_v44
      where client_id = v_client_id

      union

      select provider
      from public.m26_wearable_daily_summaries_v44
      where client_id = v_client_id
    ) providers
  loop
    insert into public.m26_wearable_consents_v44 (
      actor_user_id,
      client_id,
      provider,
      action,
      scopes,
      policy_version
    )
    values (
      auth.uid(),
      v_client_id,
      v_provider,
      'delete',
      '{}'::text[],
      'v44-zero-cost'
    );
  end loop;

  delete from public.m26_wearable_daily_summaries_v44
  where client_id = v_client_id;

  get diagnostics
    v_deleted = row_count;

  delete from public.m26_wearable_connections_v44
  where owner_user_id = auth.uid()
    and client_id = v_client_id;

  return jsonb_build_object(
    'ok',
    true,
    'deleted',
    true,
    'recordsDeleted',
    v_deleted,
    'clientId',
    v_client_id
  );
end
$m26$;

revoke all
on function public.m26_wearable_delete_all_v44()
from public, anon;

grant execute
on function public.m26_wearable_delete_all_v44()
to authenticated;

create or replace function
public.m26_wearable_health_v44()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $m26$
  with wearable_tables as (
    select unnest(
      array[
        'public.m26_wearable_connections_v44',
        'public.m26_wearable_daily_summaries_v44',
        'public.m26_wearable_consents_v44'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,

      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from wearable_tables
  ),
  policy_state as (
    select count(*) as policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'm26_wearable_connections_v44',
        'm26_wearable_daily_summaries_v44',
        'm26_wearable_consents_v44'
      )
  ),
  rpc_state as (
    select count(*) as rpc_count
    from unnest(
      array[
        'public.m26_wearable_bootstrap_v44()',
        'public.m26_wearable_import_v44(jsonb)',
        'public.m26_wearable_connection_upsert_v44(jsonb)',
        'public.m26_wearable_revoke_v44(text,boolean)',
        'public.m26_wearable_delete_all_v44()'
      ]
    ) as rpc_name
    where to_regprocedure(rpc_name) is not null
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 3
      and rls_count = 3
      and policy_count >= 10
      and rpc_count = 5,
    'version',
    'RC44',
    'environment',
    'production',
    'wearableTables',
    table_count,
    'wearableRls',
    rls_count,
    'wearablePolicies',
    policy_count,
    'wearableRpcs',
    rpc_count,
    'productionModified',
    true,
    'productionDeployed',
    true
  )
  from table_state
  cross join policy_state
  cross join rpc_state;
$m26$;

revoke all
on function public.m26_wearable_health_v44()
from public;

grant execute
on function public.m26_wearable_health_v44()
to anon, authenticated;

insert into public.m26_schema_releases_v43 (
  version,
  environment,
  production_modified,
  production_deployed
)
values (
  'RC44',
  'production',
  true,
  true
)
on conflict (version)
do update set
  environment = excluded.environment,
  applied_at = now(),
  production_modified = true,
  production_deployed = true;

do $m26_postcheck$
declare
  v_tables integer;
  v_rls integer;
  v_policies integer;
begin
  select count(*)
  into v_tables
  from unnest(
    array[
      'public.m26_wearable_connections_v44',
      'public.m26_wearable_daily_summaries_v44',
      'public.m26_wearable_consents_v44'
    ]
  ) as relations(relation_name)
  where to_regclass(relation_name) is not null;

  select count(*)
  into v_rls
  from pg_catalog.pg_class
  where oid = any (
    array[
      'public.m26_wearable_connections_v44'::regclass,
      'public.m26_wearable_daily_summaries_v44'::regclass,
      'public.m26_wearable_consents_v44'::regclass
    ]
  )
  and relrowsecurity is true;

  select count(*)
  into v_policies
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in (
      'm26_wearable_connections_v44',
      'm26_wearable_daily_summaries_v44',
      'm26_wearable_consents_v44'
    );

  if v_tables <> 3 then
    raise exception 'M26_RC44_TABLE_POSTCHECK_FAILED';
  end if;

  if v_rls <> 3 then
    raise exception 'M26_RC44_RLS_POSTCHECK_FAILED';
  end if;

  if v_policies < 10 then
    raise exception 'M26_RC44_POLICY_POSTCHECK_FAILED';
  end if;

  if to_regprocedure(
    'public.m26_wearable_health_v44()'
  ) is null then
    raise exception 'M26_RC44_HEALTH_RPC_MISSING';
  end if;
end
$m26_postcheck$;

do $rc45_postcheck$
declare
  v_profiles integer;
  v_memberships integer;
  v_primary_roles integer;
  v_normalized_roles integer;
  v_releases integer;
begin
  select count(*)
  into v_profiles
  from public.user_profiles
  where case lower(role::text)
    when 'entrenador' then 'coach'
    when 'administrador' then 'admin'
    when 'cliente' then 'client'
    else lower(role::text)
  end in ('client','coach','admin');

  select count(*)
  into v_memberships
  from public.iberfit_organization_memberships
  where organization_id='00000000-0000-4000-8000-000000000140'
    and status='active';

  if v_memberships<>v_profiles then
    raise exception
      'RC45_PROD_MEMBERSHIP_BACKFILL_MISMATCH:%/%',
      v_memberships,
      v_profiles;
  end if;

  select count(*)
  into v_primary_roles
  from public.user_profiles
  where case lower(role::text)
    when 'entrenador' then 'coach'
    when 'administrador' then 'admin'
    when 'cliente' then 'client'
    else lower(role::text)
  end in ('client','coach','admin');

  select count(*)
  into v_normalized_roles
  from public.user_application_roles
  where active=true;

  if v_normalized_roles<v_primary_roles then
    raise exception
      'RC45_PROD_ROLE_BACKFILL_INCOMPLETE:%/%',
      v_normalized_roles,
      v_primary_roles;
  end if;

  select count(*)
  into v_releases
  from public.m26_schema_releases_v43
  where version in ('RC43','RC43.1','RC44')
    and environment='production'
    and production_modified=true
    and production_deployed=true;

  if v_releases<>3 then
    raise exception 'RC45_PROD_RELEASE_STATE_INVALID:%',v_releases;
  end if;

  if to_regprocedure('public.iberfit_application_context_v14()') is null then
    raise exception 'RC45_PROD_V14_CONTEXT_MISSING';
  end if;

  if to_regprocedure('public.m26_backend_health_v43()') is null
     or to_regprocedure('public.m26_backend_health_v431()') is null
     or to_regprocedure('public.m26_wearable_health_v44()') is null then
    raise exception 'RC45_PROD_HEALTH_RPC_MISSING';
  end if;
end
$rc45_postcheck$;