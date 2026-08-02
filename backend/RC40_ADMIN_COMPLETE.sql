-- IBERFIT RC40 · Aplicación Admin integrada + comunicación Cliente–Coach
-- Migración aditiva para CANARY. NO se ejecuta automáticamente.
-- Pagos quedan fuera de RC40 y se implementarán al final, solo en Admin.

begin;

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
  insert into public.iberfit_organization_memberships(organization_id,user_id,status) values(v_org,v_user,'active') on conflict do nothing;
  select status into v_status from public.iberfit_organization_memberships where organization_id=v_org and user_id=v_user;
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

notify pgrst,'reload schema';
commit;
