-- IBERFIT M26 Gate 15-Free · CANARY ADDITIVE MIGRATION
-- Compatible con el esquema real descubierto el 18-07-2026.
-- Esta migración NO activa ningún cliente. El Command Bus y el bootstrap M26
-- permanecen bloqueados hasta insertar explícitamente un cliente QA en
-- public.m26_canary_clients_v26 mediante 016_gate15_canary_activate_qa.sql.

begin;

-- ---------------------------------------------------------------------------
-- 0. Precondiciones estrictas. Si algo no coincide, toda la transacción revierte.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.clients') is null
     or to_regclass('public.user_profiles') is null
     or to_regclass('public.client_assignments') is null
     or to_regclass('public.reports') is null
     or to_regclass('public.iri_assessments') is null
     or to_regclass('public.training_cycles') is null
     or to_regclass('public.sessions') is null
     or to_regclass('public.session_executions') is null
     or to_regclass('public.intelligence_runs') is null then
    raise exception 'M26_PREFLIGHT_REQUIRED_TABLE_MISSING';
  end if;
  if to_regprocedure('public.iberfit_role()') is null
     or to_regprocedure('public.iberfit_client_id()') is null
     or to_regprocedure('public.is_assigned_coach(uuid)') is null then
    raise exception 'M26_PREFLIGHT_ACCESS_FUNCTION_MISSING';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sessions' and column_name='status' and udt_name='publication_status'
  ) then
    raise exception 'M26_PREFLIGHT_SESSIONS_STATUS_INCOMPATIBLE';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='session_executions' and column_name='execution_status'
  ) then
    raise exception 'M26_PREFLIGHT_EXECUTION_STATUS_MISSING';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Compatibilidad mínima con tablas existentes. No se crea un segundo status.
-- ---------------------------------------------------------------------------
alter table public.session_executions
  add column if not exists revision bigint not null default 0;
alter table public.intelligence_runs
  add column if not exists revision bigint not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='session_executions_revision_v26_check') then
    alter table public.session_executions
      add constraint session_executions_revision_v26_check check (revision >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='intelligence_runs_revision_v26_check') then
    alter table public.intelligence_runs
      add constraint intelligence_runs_revision_v26_check check (revision >= 0);
  end if;
end $$;

-- Agenda canónica M26. No existía en el esquema real.
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  appointment_type text not null default 'session'
    check (appointment_type in ('session','checkin','iri','seguimiento')),
  title text not null default 'Cita IBERFIT',
  mode text not null default 'presencial'
    check (mode in ('presencial','guiada_en_app','videollamada')),
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  time_zone text not null default 'America/Santiago',
  status text not null default 'propuesta'
    check (status in ('propuesta','confirmada','completada','cancelada')),
  revision bigint not null default 0 check (revision >= 0),
  created_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancellation_reason text,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_time_order_v26 check (end_at > start_at)
);
create index if not exists appointments_client_start_v26_idx
  on public.appointments(client_id,start_at);
create index if not exists appointments_active_range_v26_idx
  on public.appointments(start_at,end_at)
  where status in ('propuesta','confirmada');

-- ---------------------------------------------------------------------------
-- 2. Capa canaria M26. Inicialmente vacía e inerte.
-- ---------------------------------------------------------------------------
create table if not exists public.m26_canary_clients_v26 (
  client_id uuid primary key references public.clients(id) on delete cascade,
  active boolean not null default false,
  enabled_by uuid references auth.users(id) on delete set null,
  enabled_at timestamptz,
  disabled_at timestamptz,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.command_receipts_v26 (
  operation_id uuid primary key,
  command_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  base_revision bigint not null check (base_revision >= 0),
  remote_revision bigint not null check (remote_revision >= 0),
  response jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create table if not exists public.command_events_v26 (
  id bigint generated always as identity primary key,
  operation_id uuid not null,
  command_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  phase text not null check (phase in ('received','duplicate','conflict','applied','rejected','error')),
  base_revision bigint not null check (base_revision >= 0),
  remote_revision bigint check (remote_revision is null or remote_revision >= 0),
  reason text,
  payload_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.domain_entities_v26 (
  entity_type text not null,
  entity_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null,
  revision bigint not null default 0 check (revision >= 0),
  body jsonb not null default '{}'::jsonb,
  source_table text,
  source_revision bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(entity_type,entity_id)
);

create table if not exists public.domain_events_v26 (
  id bigint generated always as identity primary key,
  operation_id uuid not null,
  command_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  phase text not null check (phase in ('applied','related_applied','duplicate','conflict','rejected','error')),
  from_status text,
  to_status text,
  base_revision bigint not null check (base_revision >= 0),
  remote_revision bigint check (remote_revision is null or remote_revision >= 0),
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.active_execution_locks_v26 (
  client_id uuid primary key references public.clients(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  execution_id uuid not null unique,
  acquired_by uuid references auth.users(id) on delete set null,
  acquired_at timestamptz not null default now()
);

create table if not exists public.client_access_v26 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text,
  status text not null default 'sin_acceso'
    check (status in ('sin_acceso','invitacion_pendiente','activo','suspendido','revocado')),
  revision bigint not null default 0 check (revision >= 0),
  invitation_attempt_count integer not null default 0 check (invitation_attempt_count >= 0),
  invitation_sent_at timestamptz,
  activated_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_availability_v26 (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  mode text not null check (mode in ('presencial','guiada_en_app','videollamada')),
  location text,
  active boolean not null default true,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.domain_command_registry_v26 (
  command_type text primary key,
  entity_type text not null,
  event_name text not null,
  allowed_roles text[] not null,
  requires_reason boolean not null default false,
  requires_preview boolean not null default false,
  snapshot_on_apply boolean not null default false,
  conflict_sensitive boolean not null default true,
  bootstrap_allowed boolean not null default false,
  enabled boolean not null default true
);

create table if not exists public.domain_transitions_v26 (
  entity_type text not null,
  from_status text not null,
  event_name text not null,
  to_status text not null,
  primary key(entity_type,from_status,event_name)
);

create index if not exists command_events_v26_operation_idx on public.command_events_v26(operation_id,created_at);
create index if not exists command_events_v26_client_idx on public.command_events_v26(client_id,created_at desc);
create index if not exists command_receipts_v26_entity_idx on public.command_receipts_v26(entity_type,entity_id,processed_at desc);
create index if not exists domain_entities_v26_client_idx on public.domain_entities_v26(client_id,entity_type,updated_at desc);
create index if not exists domain_events_v26_client_idx on public.domain_events_v26(client_id,created_at desc);
create index if not exists domain_events_v26_operation_idx on public.domain_events_v26(operation_id,created_at);
create index if not exists coach_availability_v26_coach_day_idx
  on public.coach_availability_v26(coach_user_id,weekday,start_minute,end_minute)
  where active=true;

-- ---------------------------------------------------------------------------
-- 3. Registro de comandos y máquinas de estado canónicas.
-- ---------------------------------------------------------------------------
insert into public.domain_command_registry_v26(
  command_type,entity_type,event_name,allowed_roles,requires_reason,requires_preview,
  snapshot_on_apply,conflict_sensitive,bootstrap_allowed,enabled
) values
  ('CLIENTE_INVITAR','client_access','INVITAR',array['admin','coach'],false,false,false,true,true,true),
  ('CLIENTE_REENVIAR_INVITACION','client_access','REENVIAR',array['admin','coach'],false,false,false,true,false,true),
  ('CLIENTE_CANCELAR_INVITACION','client_access','CANCELAR_INVITACION',array['admin','coach'],true,false,false,true,false,true),
  ('CLIENTE_ACTIVAR','client_access','ACTIVAR',array['admin','sistema'],false,false,false,true,false,true),
  ('CLIENTE_SUSPENDER','client_access','SUSPENDER',array['admin','coach'],true,false,false,true,false,true),
  ('CLIENTE_REACTIVAR','client_access','REACTIVAR',array['admin','coach'],true,false,false,true,false,true),
  ('CLIENTE_REVOCAR','client_access','REVOCAR',array['admin'],true,false,false,true,false,true),
  ('CLIENTE_REINVITAR','client_access','REINVITAR',array['admin'],false,false,false,true,false,true),
  ('IRI_COMPLETAR','iri','COMPLETAR',array['admin','coach'],false,false,false,true,false,true),
  ('IRI_REABRIR','iri','REABRIR',array['admin','coach'],true,false,false,true,false,true),
  ('IRI_APROBAR','iri','APROBAR',array['admin','coach'],false,false,false,true,false,true),
  ('IRI_SUSTITUIR','iri','SUSTITUIR',array['admin','coach'],true,false,false,true,false,true),
  ('IRI_ANULAR','iri','ANULAR',array['admin'],true,false,false,true,false,true),
  ('INFORME_APROBAR','report','APROBAR',array['admin','coach'],false,false,false,true,false,true),
  ('INFORME_PUBLICAR','report','PUBLICAR',array['admin','coach'],false,true,true,true,false,true),
  ('INFORME_RETIRAR','report','RETIRAR',array['admin','coach'],true,false,false,true,false,true),
  ('INFORME_ANULAR','report','ANULAR',array['admin'],true,false,false,true,false,true),
  ('PLAN_VALIDAR','planning','VALIDAR',array['admin','coach'],false,false,false,true,true,true),
  ('PLAN_REABRIR','planning','REABRIR',array['admin','coach'],true,false,false,true,false,true),
  ('PLAN_APROBAR','planning','APROBAR',array['admin','coach'],false,false,false,true,false,true),
  ('PLAN_PUBLICAR','planning','PUBLICAR',array['admin','coach'],false,true,true,true,false,true),
  ('PLAN_ARCHIVAR','planning','ARCHIVAR',array['admin','coach'],true,false,false,true,false,true),
  ('CITA_CREAR','appointment','CREAR',array['admin','coach'],false,false,false,true,true,true),
  ('CITA_CONFIRMAR','appointment','CONFIRMAR',array['admin','coach','cliente'],false,false,false,true,false,true),
  ('CITA_REPROGRAMAR','appointment','REPROGRAMAR',array['admin','coach'],true,false,false,true,false,true),
  ('CITA_CANCELAR','appointment','CANCELAR',array['admin','coach','cliente'],true,false,false,true,false,true),
  ('CITA_COMPLETAR','appointment','COMPLETAR',array['admin','coach'],false,false,false,true,false,true),
  ('SESION_APROBAR','session','APROBAR',array['admin','coach'],false,false,false,true,false,true),
  ('SESION_PUBLICAR','session','PUBLICAR',array['admin','coach'],false,true,true,true,false,true),
  ('SESION_HABILITAR','session','HABILITAR',array['admin','coach','sistema'],false,false,false,true,false,true),
  ('SESION_INICIAR','session','INICIAR',array['admin','coach','cliente'],false,false,false,true,false,true),
  ('SESION_COMPLETAR','session','COMPLETAR',array['admin','coach','sistema'],false,false,false,true,false,true),
  ('SESION_CANCELAR','session','CANCELAR',array['admin','coach'],true,false,false,true,false,true),
  ('EJECUCION_INICIAR','session_execution','INICIAR',array['admin','coach','cliente'],false,false,false,true,false,true),
  ('EJECUCION_GUARDAR_PROGRESO','session_execution','GUARDAR',array['admin','coach','cliente'],false,false,false,false,false,true),
  ('EJECUCION_PAUSAR','session_execution','PAUSAR',array['admin','coach','cliente'],false,false,false,true,false,true),
  ('EJECUCION_REANUDAR','session_execution','REANUDAR',array['admin','coach','cliente'],false,false,false,true,false,true),
  ('EJECUCION_COMPLETAR','session_execution','COMPLETAR',array['admin','coach','cliente'],false,false,false,true,false,true),
  ('EJECUCION_CANCELAR','session_execution','CANCELAR',array['admin','coach'],true,false,false,true,false,true),
  ('INTELIGENCIA_GENERAR','intelligence','GENERAR',array['admin','coach'],false,false,false,true,true,true),
  ('INTELIGENCIA_REVISAR','intelligence','REVISAR',array['admin','coach'],false,false,false,true,false,true),
  ('INTELIGENCIA_APROBAR','intelligence','APROBAR',array['admin','coach'],false,false,false,true,false,true),
  ('INTELIGENCIA_DESCARTAR','intelligence','DESCARTAR',array['admin','coach'],true,false,false,true,false,true),
  ('INTELIGENCIA_APLICAR_A_BORRADOR','intelligence','APLICAR',array['admin','coach'],false,false,false,true,false,true)
on conflict(command_type) do update set
  entity_type=excluded.entity_type,event_name=excluded.event_name,allowed_roles=excluded.allowed_roles,
  requires_reason=excluded.requires_reason,requires_preview=excluded.requires_preview,
  snapshot_on_apply=excluded.snapshot_on_apply,conflict_sensitive=excluded.conflict_sensitive,
  bootstrap_allowed=excluded.bootstrap_allowed,enabled=excluded.enabled;

insert into public.domain_transitions_v26(entity_type,from_status,event_name,to_status) values
  ('client_access','sin_acceso','INVITAR','invitacion_pendiente'),
  ('client_access','invitacion_pendiente','ACTIVAR','activo'),
  ('client_access','invitacion_pendiente','CANCELAR_INVITACION','sin_acceso'),
  ('client_access','invitacion_pendiente','REENVIAR','invitacion_pendiente'),
  ('client_access','activo','SUSPENDER','suspendido'),
  ('client_access','activo','REVOCAR','revocado'),
  ('client_access','suspendido','REACTIVAR','activo'),
  ('client_access','suspendido','REVOCAR','revocado'),
  ('client_access','revocado','REINVITAR','invitacion_pendiente'),
  ('iri','borrador','COMPLETAR','completo'),('iri','borrador','ANULAR','anulado'),
  ('iri','completo','REABRIR','borrador'),('iri','completo','APROBAR','aprobado'),('iri','completo','ANULAR','anulado'),
  ('iri','aprobado','SUSTITUIR','sustituido'),('iri','aprobado','ANULAR','anulado'),
  ('report','borrador','APROBAR','aprobado'),('report','borrador','ANULAR','anulado'),
  ('report','aprobado','PUBLICAR','publicado'),('report','aprobado','ANULAR','anulado'),
  ('report','publicado','RETIRAR','retirado'),
  ('planning','borrador','VALIDAR','validado'),('planning','borrador','ARCHIVAR','archivado'),
  ('planning','validado','REABRIR','borrador'),('planning','validado','APROBAR','aprobado'),('planning','validado','ARCHIVAR','archivado'),
  ('planning','aprobado','PUBLICAR','publicado'),('planning','aprobado','ARCHIVAR','archivado'),
  ('planning','publicado','ARCHIVAR','archivado'),
  ('appointment','propuesta','CREAR','propuesta'),('appointment','propuesta','CONFIRMAR','confirmada'),
  ('appointment','propuesta','REPROGRAMAR','propuesta'),('appointment','propuesta','CANCELAR','cancelada'),
  ('appointment','confirmada','REPROGRAMAR','propuesta'),('appointment','confirmada','COMPLETAR','completada'),
  ('appointment','confirmada','CANCELAR','cancelada'),
  ('session','borrador','APROBAR','aprobada'),('session','borrador','CANCELAR','cancelada'),
  ('session','aprobada','PUBLICAR','publicada'),('session','aprobada','CANCELAR','cancelada'),
  ('session','publicada','HABILITAR','disponible'),('session','publicada','CANCELAR','cancelada'),
  ('session','disponible','INICIAR','en_curso'),('session','disponible','CANCELAR','cancelada'),
  ('session','en_curso','COMPLETAR','completada'),('session','en_curso','CANCELAR','cancelada'),
  ('session_execution','creada','INICIAR','en_curso'),('session_execution','creada','GUARDAR','creada'),('session_execution','creada','CANCELAR','cancelada'),
  ('session_execution','en_curso','GUARDAR','en_curso'),('session_execution','en_curso','PAUSAR','pausada'),
  ('session_execution','en_curso','COMPLETAR','completada'),('session_execution','en_curso','CANCELAR','cancelada'),
  ('session_execution','pausada','GUARDAR','pausada'),('session_execution','pausada','REANUDAR','en_curso'),
  ('session_execution','pausada','COMPLETAR','completada'),('session_execution','pausada','CANCELAR','cancelada'),
  ('intelligence','borrador','GENERAR','propuesta'),
  ('intelligence','propuesta','REVISAR','en_revision'),('intelligence','propuesta','DESCARTAR','descartada'),
  ('intelligence','en_revision','APROBAR','aprobada'),('intelligence','en_revision','DESCARTAR','descartada'),
  ('intelligence','aprobada','APLICAR','aplicada'),('intelligence','aprobada','DESCARTAR','descartada')
on conflict(entity_type,from_status,event_name) do update set to_status=excluded.to_status;

-- ---------------------------------------------------------------------------
-- 4. Funciones de acceso y canario.
-- ---------------------------------------------------------------------------
create or replace function public.iberfit_current_role_v26()
returns text
language sql stable security definer set search_path=''
as $$
  select case coalesce(public.iberfit_role()::text,'sin_rol')
    when 'client' then 'cliente'
    else coalesce(public.iberfit_role()::text,'sin_rol')
  end
$$;

create or replace function public.iberfit_can_access_client_v26(p_client_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select case
    when auth.uid() is null then false
    when public.iberfit_current_role_v26()='admin' then true
    when public.iberfit_current_role_v26()='coach' then public.is_assigned_coach(p_client_id)
    when public.iberfit_current_role_v26()='cliente' then public.iberfit_client_id()=p_client_id
    else false
  end
$$;

create or replace function public.iberfit_canary_enabled_v26(p_client_id uuid)
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.m26_canary_clients_v26 c
    where c.client_id=p_client_id and c.active=true
  )
$$;

create or replace function public.iberfit_base_entity_v26(
  p_entity_type text,p_entity_id uuid,p_client_id uuid
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if p_entity_type='report' then
    select to_jsonb(r) || jsonb_build_object(
      'id',r.id,'clientId',r.client_id,'status',r.status::text,'revision',r.revision,
      'publishedAt',r.published_at,'approvedAt',r.approved_at
    ) into v_result from public.reports r where r.id=p_entity_id and r.client_id=p_client_id;
  elsif p_entity_type='iri' then
    select to_jsonb(i) || jsonb_build_object(
      'id',i.id,'clientId',i.client_id,
      'status',case i.status::text when 'revisión' then 'completo' when 'retirado' then 'sustituido' else i.status::text end,
      'revision',i.revision,'approvedAt',i.approved_at,'publishedAt',i.published_at
    ) into v_result from public.iri_assessments i where i.id=p_entity_id and i.client_id=p_client_id;
  elsif p_entity_type='planning' then
    select to_jsonb(t) || jsonb_build_object(
      'id',t.id,'clientId',t.client_id,'title',t.title,'objective',t.goal,
      'durationWeeks',t.weeks,
      'status',case t.status::text when 'revisión' then 'validado' when 'retirado' then 'archivado' else t.status::text end,
      'revision',t.revision,'publishedAt',t.published_at,
      'sessions',coalesce((
        select jsonb_agg(to_jsonb(s) || jsonb_build_object(
          'id',s.id,'clientId',s.client_id,'cycleId',s.cycle_id,'type',s.execution_type,
          'status',case s.status::text when 'aprobado' then 'aprobada' when 'publicado' then 'publicada' when 'retirado' then 'cancelada' else s.status::text end,
          'revision',s.revision,'blocks',coalesce(s.prescription->'blocks','[]'::jsonb)
        ) order by s.created_at)
        from public.sessions s where s.cycle_id=t.id and s.client_id=t.client_id
      ),'[]'::jsonb)
    ) into v_result from public.training_cycles t where t.id=p_entity_id and t.client_id=p_client_id;
  elsif p_entity_type='session' then
    select to_jsonb(s) || jsonb_build_object(
      'id',s.id,'clientId',s.client_id,'cycleId',s.cycle_id,'type',s.execution_type,
      'status',case s.status::text when 'aprobado' then 'aprobada' when 'publicado' then 'publicada' when 'retirado' then 'cancelada' else s.status::text end,
      'revision',s.revision,'publishedAt',s.published_at,
      'blocks',coalesce(s.prescription->'blocks','[]'::jsonb)
    ) into v_result from public.sessions s where s.id=p_entity_id and s.client_id=p_client_id;
  elsif p_entity_type='session_execution' then
    select coalesce(e.summary,'{}'::jsonb) || jsonb_build_object(
      'id',e.id,'clientId',e.client_id,'sessionId',e.session_id,
      'status',case e.execution_status
        when 'activa' then 'en_curso' when 'pausada' then 'pausada'
        when 'cerrada_confirmada' then 'completada' else 'cancelada' end,
      'revision',e.revision,'updatedAt',e.updated_at
    ) into v_result from public.session_executions e where e.id=p_entity_id and e.client_id=p_client_id;
  elsif p_entity_type='intelligence' then
    select to_jsonb(i) || jsonb_build_object(
      'id',i.id,'clientId',i.client_id,
      'status',case i.status when 'aprobada' then 'aprobada' when 'descartada' then 'descartada' else 'propuesta' end,
      'revision',i.revision,'proposal',i.recommendation
    ) into v_result from public.intelligence_runs i where i.id=p_entity_id and i.client_id=p_client_id;
  elsif p_entity_type='appointment' then
    select to_jsonb(a) || jsonb_build_object(
      'id',a.id,'clientId',a.client_id,'sessionId',a.session_id,'type',a.appointment_type,
      'startAt',a.start_at,'endAt',a.end_at,'timeZone',a.time_zone,'revision',a.revision
    ) into v_result from public.appointments a where a.id=p_entity_id and a.client_id=p_client_id;
  elsif p_entity_type='client_access' then
    select to_jsonb(a) || jsonb_build_object(
      'id',a.id,'clientId',a.client_id,'authUserId',a.auth_user_id,
      'invitationAttemptCount',a.invitation_attempt_count,'invitationSentAt',a.invitation_sent_at,
      'activatedAt',a.activated_at,'closedAt',a.closed_at,'closeReason',a.close_reason
    ) into v_result
    from public.client_access_v26 a
    where a.client_id=p_client_id and (a.id=p_entity_id or p_entity_id=p_client_id);
  end if;
  return v_result;
end $$;

create or replace function public.iberfit_persist_entity_v26(
  p_entity_type text,p_entity_id uuid,p_client_id uuid,p_status text,p_revision bigint,p_body jsonb
) returns void
language plpgsql security definer set search_path=''
as $$
declare v_existing_status public.publication_status;
begin
  insert into public.domain_entities_v26(entity_type,entity_id,client_id,status,revision,body,updated_at)
  values(p_entity_type,p_entity_id,p_client_id,p_status,p_revision,p_body,now())
  on conflict(entity_type,entity_id) do update set
    client_id=excluded.client_id,status=excluded.status,revision=excluded.revision,
    body=excluded.body,updated_at=excluded.updated_at;

  if p_entity_type='appointment' then
    insert into public.appointments(
      id,client_id,session_id,appointment_type,title,mode,location,start_at,end_at,time_zone,
      status,revision,created_by,confirmed_at,confirmed_by,cancelled_at,cancelled_by,
      cancellation_reason,completed_at,completed_by,payload,updated_at
    ) values(
      p_entity_id,p_client_id,nullif(p_body->>'sessionId','')::uuid,
      coalesce(nullif(p_body->>'type',''),'session'),coalesce(nullif(p_body->>'title',''),'Cita IBERFIT'),
      coalesce(nullif(p_body->>'mode',''),'presencial'),nullif(p_body->>'location',''),
      (p_body->>'startAt')::timestamptz,(p_body->>'endAt')::timestamptz,
      coalesce(nullif(p_body->>'timeZone',''),'America/Santiago'),p_status,p_revision,
      nullif(p_body->>'createdBy','')::uuid,
      nullif(p_body->>'confirmedAt','')::timestamptz,nullif(p_body->>'confirmedBy','')::uuid,
      nullif(p_body->>'cancelledAt','')::timestamptz,nullif(p_body->>'cancelledBy','')::uuid,
      nullif(p_body->>'closeReason',''),nullif(p_body->>'completedAt','')::timestamptz,
      nullif(p_body->>'completedBy','')::uuid,p_body,now()
    ) on conflict(id) do update set
      session_id=excluded.session_id,appointment_type=excluded.appointment_type,title=excluded.title,
      mode=excluded.mode,location=excluded.location,start_at=excluded.start_at,end_at=excluded.end_at,
      time_zone=excluded.time_zone,status=excluded.status,revision=excluded.revision,
      confirmed_at=excluded.confirmed_at,confirmed_by=excluded.confirmed_by,
      cancelled_at=excluded.cancelled_at,cancelled_by=excluded.cancelled_by,
      cancellation_reason=excluded.cancellation_reason,completed_at=excluded.completed_at,
      completed_by=excluded.completed_by,payload=excluded.payload,updated_at=now();
  elsif p_entity_type='client_access' then
    insert into public.client_access_v26(
      id,client_id,auth_user_id,email,status,revision,invitation_attempt_count,
      invitation_sent_at,activated_at,closed_at,close_reason,updated_at
    ) values(
      p_entity_id,p_client_id,nullif(p_body->>'authUserId','')::uuid,p_body->>'email',p_status,p_revision,
      coalesce((p_body->>'invitationAttemptCount')::integer,0),
      nullif(p_body->>'invitationSentAt','')::timestamptz,
      nullif(p_body->>'activatedAt','')::timestamptz,
      nullif(p_body->>'closedAt','')::timestamptz,p_body->>'closeReason',now()
    ) on conflict(client_id) do update set
      auth_user_id=excluded.auth_user_id,email=excluded.email,status=excluded.status,
      revision=excluded.revision,invitation_attempt_count=excluded.invitation_attempt_count,
      invitation_sent_at=excluded.invitation_sent_at,activated_at=excluded.activated_at,
      closed_at=excluded.closed_at,close_reason=excluded.close_reason,updated_at=now();
  elsif p_entity_type='session_execution' then
    insert into public.session_executions(
      id,session_id,client_id,execution_status,summary,started_by,updated_at,revision
    ) values(
      p_entity_id,(p_body->>'sessionId')::uuid,p_client_id,
      case p_status when 'pausada' then 'pausada' when 'completada' then 'cerrada_confirmada'
        when 'cancelada' then 'cierre_rechazado' else 'activa' end,
      p_body,nullif(p_body->>'startedBy','')::uuid,now(),p_revision
    ) on conflict(id) do update set
      execution_status=excluded.execution_status,summary=excluded.summary,
      updated_at=now(),revision=excluded.revision;
  elsif p_entity_type='report' then
    update public.reports set
      status=(case p_status when 'anulado' then 'retirado' else p_status end)::public.publication_status,
      revision=p_revision,
      approved_at=case when p_status='aprobado' then coalesce(approved_at,now()) else approved_at end,
      published_at=case when p_status='publicado' then coalesce(published_at,now()) else published_at end
    where id=p_entity_id and client_id=p_client_id;
  elsif p_entity_type='iri' then
    update public.iri_assessments set
      status=(case p_status when 'completo' then 'revisión' when 'sustituido' then 'retirado'
        when 'anulado' then 'retirado' else p_status end)::public.publication_status,
      revision=p_revision,
      approved_at=case when p_status='aprobado' then coalesce(approved_at,now()) else approved_at end,
      updated_at=now()
    where id=p_entity_id and client_id=p_client_id;
  elsif p_entity_type='planning' then
    update public.training_cycles set
      status=(case p_status when 'validado' then 'revisión' when 'archivado' then 'retirado' else p_status end)::public.publication_status,
      revision=p_revision,
      published_at=case when p_status='publicado' then coalesce(published_at,now()) else published_at end
    where id=p_entity_id and client_id=p_client_id;
  elsif p_entity_type='session' then
    select status into v_existing_status from public.sessions where id=p_entity_id and client_id=p_client_id;
    update public.sessions set
      status=(case
        when p_status='aprobada' then 'aprobado'
        when p_status in ('publicada','disponible','en_curso','completada') then 'publicado'
        when p_status='cancelada' then 'retirado'
        else coalesce(v_existing_status::text,'borrador') end)::public.publication_status,
      revision=greatest(revision,p_revision),
      published_at=case when p_status in ('publicada','disponible','en_curso','completada') then coalesce(published_at,now()) else published_at end
    where id=p_entity_id and client_id=p_client_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Command Bus transaccional M26.
-- ---------------------------------------------------------------------------
create or replace function public.iberfit_command_preflight_v26(p_command jsonb)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_operation_id uuid; v_entity_type text; v_entity_id uuid; v_client_id uuid;
  v_base_revision bigint; v_receipt public.command_receipts_v26%rowtype;
  v_body jsonb; v_revision bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  v_operation_id:=(p_command->>'operationId')::uuid;
  v_entity_type:=nullif(p_command->>'entityType','');
  v_entity_id:=(p_command->>'entityId')::uuid;
  v_client_id:=(p_command->>'clientId')::uuid;
  v_base_revision:=(p_command->>'baseRevision')::bigint;
  if not public.iberfit_can_access_client_v26(v_client_id) then raise exception 'CLIENT_ACCESS_DENIED' using errcode='42501'; end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason','M26_CANARY_NOT_ENABLED','serverAt',now());
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_entity_type||':'||v_entity_id::text,0));
  select * into v_receipt from public.command_receipts_v26 where operation_id=v_operation_id;
  if found then
    return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_receipt.remote_revision,
      'serverAt',v_receipt.processed_at,'duplicate',true,'receipt',to_jsonb(v_receipt));
  end if;
  select body,revision into v_body,v_revision from public.domain_entities_v26
    where entity_type=v_entity_type and entity_id=v_entity_id and client_id=v_client_id;
  if v_body is null then v_body:=public.iberfit_base_entity_v26(v_entity_type,v_entity_id,v_client_id); end if;
  v_revision:=coalesce((v_body->>'revision')::bigint,v_revision,0);
  if coalesce((p_command->>'conflictSensitive')::boolean,true) and v_base_revision<>v_revision then
    return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,
      'reason','REVISION_MISMATCH','serverAt',now());
  end if;
  return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_revision,
    'serverAt',now(),'duplicate',false,'decision','apply');
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end $$;

create or replace function public.iberfit_execute_command_v26(p_command jsonb)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_operation_id uuid; v_command_type text; v_entity_type text; v_entity_id uuid; v_client_id uuid;
  v_base_revision bigint; v_conflict_sensitive boolean; v_payload jsonb; v_role text; v_now timestamptz:=now();
  v_def public.domain_command_registry_v26%rowtype; v_receipt public.command_receipts_v26%rowtype;
  v_body jsonb; v_next_body jsonb; v_status text; v_to_status text; v_revision bigint; v_next_revision bigint;
  v_reason text; v_response jsonb:='{}'::jsonb; v_related jsonb; v_related_revision bigint;
  v_appointment jsonb; v_execution_id uuid; v_appointment_id uuid; v_plan_id uuid; v_plan jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_command)<>'object' then raise exception 'INVALID_COMMAND' using errcode='22023'; end if;

  v_operation_id:=(p_command->>'operationId')::uuid;
  v_command_type:=nullif(p_command->>'type','');
  v_entity_type:=nullif(p_command->>'entityType','');
  v_entity_id:=(p_command->>'entityId')::uuid;
  v_client_id:=(p_command->>'clientId')::uuid;
  v_base_revision:=(p_command->>'baseRevision')::bigint;
  v_conflict_sensitive:=coalesce((p_command->>'conflictSensitive')::boolean,true);
  v_payload:=coalesce(p_command->'payload','{}'::jsonb);
  v_role:=public.iberfit_current_role_v26();
  v_reason:=nullif(btrim(v_payload->>'reason'),'');

  if v_command_type is null or v_entity_type is null or v_base_revision<0 then
    raise exception 'INVALID_COMMAND' using errcode='22023';
  end if;
  if not public.iberfit_can_access_client_v26(v_client_id) then raise exception 'CLIENT_ACCESS_DENIED' using errcode='42501'; end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','M26_CANARY_NOT_ENABLED','serverAt',v_now);
  end if;

  select * into v_def from public.domain_command_registry_v26 where command_type=v_command_type and enabled=true;
  if not found or v_def.entity_type<>v_entity_type then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','COMMAND_NOT_ALLOWED','serverAt',v_now);
  end if;
  if not (v_role=any(v_def.allowed_roles)) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','ROLE_NOT_ALLOWED','serverAt',v_now);
  end if;
  if v_def.requires_reason and v_reason is null then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','REASON_REQUIRED','serverAt',v_now);
  end if;
  if v_def.requires_preview and (
    coalesce((v_payload->>'previewConfirmed')::boolean,false)=false
    or nullif(v_payload->>'targetClientId','')::uuid is distinct from v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','PREVIEW_CONFIRMATION_REQUIRED','serverAt',v_now);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_entity_type||':'||v_entity_id::text,0));
  select * into v_receipt from public.command_receipts_v26 where operation_id=v_operation_id;
  if found then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'duplicate',v_base_revision,v_receipt.remote_revision,'Recibo existente');
    return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_receipt.remote_revision,
      'serverAt',v_receipt.processed_at,'duplicate',true,'receipt',to_jsonb(v_receipt));
  end if;

  select body,status,revision into v_body,v_status,v_revision
  from public.domain_entities_v26
  where entity_type=v_entity_type and entity_id=v_entity_id and client_id=v_client_id;
  if v_body is null then
    v_body:=public.iberfit_base_entity_v26(v_entity_type,v_entity_id,v_client_id);
    v_status:=v_body->>'status'; v_revision:=coalesce((v_body->>'revision')::bigint,0);
  end if;
  if v_body is null and v_def.bootstrap_allowed then
    v_status:=case v_entity_type
      when 'client_access' then 'sin_acceso' when 'planning' then 'borrador'
      when 'appointment' then 'propuesta' when 'intelligence' then 'borrador' else null end;
    v_revision:=0;
    v_body:=jsonb_build_object('id',v_entity_id,'clientId',v_client_id,'status',v_status,'revision',0,
      'createdAt',v_now,'updatedAt',v_now);
  end if;
  if v_body is null then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'rejected',v_base_revision,'ENTITY_NOT_FOUND');
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason','ENTITY_NOT_FOUND','serverAt',v_now);
  end if;

  v_status:=coalesce(v_status,v_body->>'status');
  v_revision:=coalesce(v_revision,(v_body->>'revision')::bigint,0);
  if v_conflict_sensitive and v_base_revision<>v_revision then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'conflict',v_base_revision,v_revision,'REVISION_MISMATCH');
    insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_role,'conflict',v_status,v_status,v_base_revision,v_revision,'REVISION_MISMATCH');
    return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,'reason','REVISION_MISMATCH','serverAt',v_now);
  end if;

  select to_status into v_to_status from public.domain_transitions_v26
  where entity_type=v_entity_type and from_status=v_status and event_name=v_def.event_name;
  if v_to_status is null then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'rejected',v_base_revision,v_revision,'INVALID_TRANSITION');
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','INVALID_TRANSITION','serverAt',v_now);
  end if;

  v_next_revision:=v_revision+1;
  v_next_body:=v_body || case when jsonb_typeof(v_payload->'patch')='object' then v_payload->'patch' else '{}'::jsonb end;

  if v_command_type='PLAN_VALIDAR' and jsonb_typeof(v_payload->'draft')='object' then
    v_next_body:=v_next_body || (v_payload->'draft');
  elsif v_command_type in ('CITA_CREAR','CITA_REPROGRAMAR') and jsonb_typeof(v_payload->'appointment')='object' then
    v_next_body:=v_next_body || (v_payload->'appointment');
    if nullif(v_next_body->>'startAt','') is null or nullif(v_next_body->>'endAt','') is null
       or (v_next_body->>'endAt')::timestamptz <= (v_next_body->>'startAt')::timestamptz then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','INVALID_APPOINTMENT_RANGE','serverAt',v_now);
    end if;
    if exists(
      select 1 from public.appointments a
      where a.client_id=v_client_id and a.id<>v_entity_id and a.status in ('propuesta','confirmada')
        and tstzrange(a.start_at,a.end_at,'[)') && tstzrange((v_next_body->>'startAt')::timestamptz,(v_next_body->>'endAt')::timestamptz,'[)')
    ) then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','APPOINTMENT_OVERLAP','serverAt',v_now);
    end if;
  elsif v_command_type='INTELIGENCIA_GENERAR' then
    if jsonb_typeof(v_payload->'proposal')<>'object' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','STRUCTURED_PROPOSAL_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object(
      'proposal',v_payload->'proposal','provider',v_payload->>'provider','providerMode',v_payload->>'providerMode',
      'providerModel',v_payload->>'model','providerRequestId',v_payload->>'requestId',
      'fallbackReason',v_payload->>'fallbackReason','generatedAt',v_now,'generatedBy',auth.uid()
    );
  elsif v_command_type='INTELIGENCIA_REVISAR' then
    if nullif(btrim(v_payload->>'reviewSummary'),'') is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','REVIEW_SUMMARY_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object('reviewSummary',v_payload->>'reviewSummary','reviewedAt',v_now,'reviewedBy',auth.uid());
  elsif v_command_type in ('CLIENTE_INVITAR','CLIENTE_REINVITAR','CLIENTE_REENVIAR_INVITACION') then
    if nullif(v_payload->>'email','') is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EMAIL_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object('email',v_payload->>'email','invitationSentAt',v_now,
      'invitationSentBy',auth.uid(),'invitationAttemptCount',coalesce((v_body->>'invitationAttemptCount')::integer,0)+1);
  elsif v_command_type='CLIENTE_ACTIVAR' then
    v_next_body:=v_next_body || jsonb_build_object('authUserId',v_payload->>'authUserId','activatedAt',v_now);
  elsif v_command_type='EJECUCION_GUARDAR_PROGRESO' then
    if jsonb_typeof(v_payload->'progressSnapshot')<>'object' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PROGRESS_SNAPSHOT_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object(
      'progressSnapshot',v_payload->'progressSnapshot','items',coalesce(v_payload->'progressSnapshot'->'items','[]'::jsonb),
      'cursor',coalesce(v_payload->'progressSnapshot'->'cursor','{}'::jsonb),
      'incidents',coalesce(v_payload->'progressSnapshot'->'incidents','[]'::jsonb),
      'progressSavedAt',v_now,'progressSavedBy',auth.uid()
    );
  end if;

  if v_command_type='SESION_INICIAR' then
    v_execution_id:=nullif(v_payload->>'executionId','')::uuid;
    v_appointment_id:=nullif(v_payload->>'appointmentId','')::uuid;
    if v_execution_id is null or v_appointment_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EXECUTION_AND_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    if exists(select 1 from public.active_execution_locks_v26 where client_id=v_client_id) then
      return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,'reason','ACTIVE_EXECUTION_EXISTS','serverAt',v_now);
    end if;
    v_appointment:=public.iberfit_base_entity_v26('appointment',v_appointment_id,v_client_id);
    if v_appointment is null or v_appointment->>'status'<>'confirmada'
       or nullif(v_appointment->>'sessionId','')::uuid is distinct from v_entity_id then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','CONFIRMED_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    v_related:=jsonb_build_object(
      'id',v_execution_id,'clientId',v_client_id,'sessionId',v_entity_id,'appointmentId',v_appointment_id,
      'status','en_curso','revision',1,'startedAt',v_now,'startedBy',auth.uid(),
      'mode',coalesce(v_next_body->>'type',v_next_body->>'execution_type'),
      'sourceRevision',v_revision,'sourceSnapshot',coalesce(v_next_body->'publishedSnapshot',v_next_body->'prescription',v_next_body),
      'items',coalesce(v_next_body->'publishedSnapshot'->'items',v_next_body->'prescription'->'items',v_next_body->'blocks','[]'::jsonb),
      'cursor',jsonb_build_object('itemIndex',0,'setIndex',0),'incidents','[]'::jsonb
    );
    perform public.iberfit_persist_entity_v26('session_execution',v_execution_id,v_client_id,'en_curso',1,v_related);
    insert into public.active_execution_locks_v26(client_id,session_id,execution_id,acquired_by)
    values(v_client_id,v_entity_id,v_execution_id,auth.uid());
    v_next_body:=v_next_body || jsonb_build_object('activeExecutionId',v_execution_id,'appointmentId',v_appointment_id,'startedAt',v_now,'startedBy',auth.uid());
    v_response:=jsonb_build_object('executionId',v_execution_id,'executionRevision',1,'appointmentId',v_appointment_id);
    insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,details)
    values(v_operation_id,v_command_type,'session_execution',v_execution_id,v_client_id,auth.uid(),v_role,'related_applied','creada','en_curso',0,1,jsonb_build_object('sessionId',v_entity_id));
  elsif v_command_type='EJECUCION_COMPLETAR' then
    delete from public.active_execution_locks_v26 where client_id=v_client_id and execution_id=v_entity_id;
    if nullif(v_body->>'sessionId','') is not null then
      v_related:=public.iberfit_base_entity_v26('session',(v_body->>'sessionId')::uuid,v_client_id);
      select body,revision into v_plan,v_related_revision from public.domain_entities_v26
        where entity_type='session' and entity_id=(v_body->>'sessionId')::uuid and client_id=v_client_id;
      v_related:=coalesce(v_plan,v_related);
      if v_related is not null then
        v_related_revision:=coalesce(v_related_revision,(v_related->>'revision')::bigint,0)+1;
        v_related:=v_related || jsonb_build_object('status','completada','revision',v_related_revision,'completedAt',v_now,'updatedAt',v_now);
        perform public.iberfit_persist_entity_v26('session',(v_body->>'sessionId')::uuid,v_client_id,'completada',v_related_revision,v_related);
      end if;
    end if;
    if nullif(v_body->>'appointmentId','') is not null then
      v_related:=public.iberfit_base_entity_v26('appointment',(v_body->>'appointmentId')::uuid,v_client_id);
      if v_related is not null then
        v_related_revision:=coalesce((v_related->>'revision')::bigint,0)+1;
        v_related:=v_related || jsonb_build_object('status','completada','revision',v_related_revision,'completedAt',v_now,'completedBy',auth.uid(),'updatedAt',v_now);
        perform public.iberfit_persist_entity_v26('appointment',(v_body->>'appointmentId')::uuid,v_client_id,'completada',v_related_revision,v_related);
      end if;
    end if;
    v_next_body:=v_next_body || jsonb_build_object('completedAt',v_now,'completedBy',auth.uid(),'feedback',coalesce(v_payload->'feedback','{}'::jsonb));
  elsif v_command_type='INTELIGENCIA_APLICAR_A_BORRADOR' then
    v_plan_id:=nullif(v_payload->>'planDraftId','')::uuid;
    if v_plan_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PLAN_DRAFT_REQUIRED','serverAt',v_now);
    end if;
    select body,revision into v_plan,v_related_revision from public.domain_entities_v26
      where entity_type='planning' and entity_id=v_plan_id and client_id=v_client_id;
    if v_plan is null then v_plan:=public.iberfit_base_entity_v26('planning',v_plan_id,v_client_id); end if;
    v_related_revision:=coalesce(v_related_revision,(v_plan->>'revision')::bigint,0);
    if v_plan is null or v_plan->>'status'<>'borrador' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PLAN_NOT_DRAFT','serverAt',v_now);
    end if;
    if v_related_revision<>coalesce((v_payload->>'planBaseRevision')::bigint,-1) then
      return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_related_revision,'reason','PLAN_REVISION_MISMATCH','serverAt',v_now);
    end if;
    v_related_revision:=v_related_revision+1;
    v_plan:=v_plan || jsonb_build_object('revision',v_related_revision,'updatedAt',v_now,
      'aiSuggestions',coalesce(v_plan->'aiSuggestions','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id',v_operation_id,'intelligenceRunId',v_entity_id,'proposal',v_body->'proposal','addedAt',v_now,
        'addedBy',auth.uid(),'status','pendiente_revision_editor')));
    perform public.iberfit_persist_entity_v26('planning',v_plan_id,v_client_id,'borrador',v_related_revision,v_plan);
    v_next_body:=v_next_body || jsonb_build_object('appliedAt',v_now,'appliedBy',auth.uid(),'appliedPlanId',v_plan_id);
    v_response:=jsonb_build_object('planId',v_plan_id,'planRevision',v_related_revision,'suggestionId',v_operation_id);
  end if;

  if v_to_status in ('aprobado','aprobada') then
    v_next_body:=v_next_body || jsonb_build_object('approvedAt',v_now,'approvedBy',auth.uid());
  elsif v_to_status in ('publicado','publicada') then
    v_next_body:=v_next_body || jsonb_build_object('publishedAt',v_now,'publishedBy',auth.uid());
  elsif v_to_status='retirado' then
    v_next_body:=v_next_body || jsonb_build_object('retiredAt',v_now,'retiredBy',auth.uid(),'retireReason',v_reason);
  elsif v_to_status in ('cancelada','anulado','archivado','descartada','revocado','suspendido') then
    v_next_body:=v_next_body || jsonb_build_object('closedAt',v_now,'closedBy',auth.uid(),'closeReason',v_reason);
  end if;
  if v_def.snapshot_on_apply then
    v_next_body:=v_next_body || jsonb_build_object('publishedSnapshot',coalesce(v_next_body->'content',v_next_body->'sessions',v_next_body->'blocks',v_next_body),
      'publishedRevision',v_next_revision);
  end if;

  v_next_body:=v_next_body || jsonb_build_object('id',v_entity_id,'clientId',v_client_id,'status',v_to_status,
    'revision',v_next_revision,'updatedAt',v_now);
  perform public.iberfit_persist_entity_v26(v_entity_type,v_entity_id,v_client_id,v_to_status,v_next_revision,v_next_body);

  insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,payload_hash)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'applied',v_base_revision,v_next_revision,md5(v_payload::text));
  insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,reason,details)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_role,'applied',v_status,v_to_status,v_base_revision,v_next_revision,v_reason,v_response);

  insert into public.command_receipts_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,base_revision,remote_revision,response,processed_at)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_base_revision,v_next_revision,v_response,v_now)
  returning * into v_receipt;

  return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_next_revision,
    'serverAt',v_now,'duplicate',false,'receipt',to_jsonb(v_receipt));
exception
  when invalid_text_representation or numeric_value_out_of_range or null_value_not_allowed then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end $$;

-- Bootstrap propio M26: filtra estrictamente por clientes canarios y acceso del actor.
create or replace function public.iberfit_bootstrap_v26()
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_role text; v_has_canary boolean; v_data jsonb; v_revisions jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  v_role:=public.iberfit_current_role_v26();
  select exists(
    select 1 from public.m26_canary_clients_v26 c
    where c.active=true and public.iberfit_can_access_client_v26(c.client_id)
  ) into v_has_canary;
  if not v_has_canary then raise exception 'M26_CANARY_NOT_ENABLED' using errcode='42501'; end if;

  select jsonb_build_object(
    'clients',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.clients c
      join public.m26_canary_clients_v26 q on q.client_id=c.id and q.active=true
      where public.iberfit_can_access_client_v26(c.id)),'[]'::jsonb),
    'userProfiles',coalesce((select jsonb_agg(to_jsonb(u)) from public.user_profiles u
      where u.client_id in (select q.client_id from public.m26_canary_clients_v26 q where q.active=true and public.iberfit_can_access_client_v26(q.client_id))
         or u.user_id=auth.uid()),'[]'::jsonb),
    'clientProfiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.client_app_profiles p
      join public.m26_canary_clients_v26 q on q.client_id=p.client_id and q.active=true
      where public.iberfit_can_access_client_v26(p.client_id)),'[]'::jsonb),
    'clientAccess',coalesce((select jsonb_agg(to_jsonb(a)) from public.client_access_v26 a
      join public.m26_canary_clients_v26 q on q.client_id=a.client_id and q.active=true
      where public.iberfit_can_access_client_v26(a.client_id)),'[]'::jsonb),
    'iriAssessments',coalesce((select jsonb_agg(to_jsonb(i)) from public.iri_assessments i
      join public.m26_canary_clients_v26 q on q.client_id=i.client_id and q.active=true
      where public.iberfit_can_access_client_v26(i.client_id)),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r
      join public.m26_canary_clients_v26 q on q.client_id=r.client_id and q.active=true
      where public.iberfit_can_access_client_v26(r.client_id)),'[]'::jsonb),
    'trainingCycles',coalesce((select jsonb_agg(to_jsonb(t)) from public.training_cycles t
      join public.m26_canary_clients_v26 q on q.client_id=t.client_id and q.active=true
      where public.iberfit_can_access_client_v26(t.client_id)),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from public.sessions s
      join public.m26_canary_clients_v26 q on q.client_id=s.client_id and q.active=true
      where public.iberfit_can_access_client_v26(s.client_id)),'[]'::jsonb),
    'appointments',coalesce((select jsonb_agg(to_jsonb(a)) from public.appointments a
      join public.m26_canary_clients_v26 q on q.client_id=a.client_id and q.active=true
      where public.iberfit_can_access_client_v26(a.client_id)),'[]'::jsonb),
    'sessionExecutions',coalesce((select jsonb_agg(to_jsonb(e)) from public.session_executions e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'intelligenceRuns',coalesce((select jsonb_agg(to_jsonb(i)) from public.intelligence_runs i
      join public.m26_canary_clients_v26 q on q.client_id=i.client_id and q.active=true
      where public.iberfit_can_access_client_v26(i.client_id)),'[]'::jsonb),
    'timelineEvents',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc) from public.client_timeline_events e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'domainEvents',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.domain_events_v26 e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'coachAvailability',coalesce((select jsonb_agg(to_jsonb(a)) from public.coach_availability_v26 a
      where a.active=true and (a.coach_user_id=auth.uid() or v_role='admin')),'[]'::jsonb),
    'm26Entities',coalesce((select jsonb_agg(jsonb_build_object(
      'entityType',e.entity_type,'entityId',e.entity_id,'clientId',e.client_id,'status',e.status,
      'revision',e.revision,'body',e.body,'updatedAt',e.updated_at
    )) from public.domain_entities_v26 e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'metrics',jsonb_build_object('checkin',null,'progress',null,'iri',null)
  ) into v_data;

  select coalesce(jsonb_object_agg(entity_type||':'||entity_id::text,revision),'{}'::jsonb)
  into v_revisions from public.domain_entities_v26 e
  join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
  where public.iberfit_can_access_client_v26(e.client_id);

  return jsonb_build_object(
    'environment',coalesce((select value #>> '{}' from public.iberfit_system_settings where key='environment'),'UNSET'),
    'serverTime',now(),
    'canary',jsonb_build_object('version','M26-GATE15-FREE-RC1','active',true,'scope','allowlist'),
    'user',jsonb_build_object('id',auth.uid(),'role',v_role,'clientId',public.iberfit_client_id(),
      'name',(select display_name from public.user_profiles where user_id=auth.uid())),
    'remoteRevisions',v_revisions,
    'data',v_data
  );
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS y privilegios. Authenticated solo lee; todas las mutaciones pasan por RPC.
-- ---------------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.m26_canary_clients_v26 enable row level security;
alter table public.command_receipts_v26 enable row level security;
alter table public.command_events_v26 enable row level security;
alter table public.domain_entities_v26 enable row level security;
alter table public.domain_events_v26 enable row level security;
alter table public.active_execution_locks_v26 enable row level security;
alter table public.client_access_v26 enable row level security;
alter table public.coach_availability_v26 enable row level security;
alter table public.domain_command_registry_v26 enable row level security;
alter table public.domain_transitions_v26 enable row level security;

-- Políticas idempotentes.
drop policy if exists appointments_v26_select on public.appointments;
create policy appointments_v26_select on public.appointments for select to authenticated
using (public.iberfit_canary_enabled_v26(client_id) and public.iberfit_can_access_client_v26(client_id));
drop policy if exists command_receipts_v26_select on public.command_receipts_v26;
create policy command_receipts_v26_select on public.command_receipts_v26 for select to authenticated
using (public.iberfit_canary_enabled_v26(client_id) and public.iberfit_can_access_client_v26(client_id));
drop policy if exists command_events_v26_select on public.command_events_v26;
create policy command_events_v26_select on public.command_events_v26 for select to authenticated
using (public.iberfit_canary_enabled_v26(client_id) and public.iberfit_can_access_client_v26(client_id));
drop policy if exists domain_entities_v26_select on public.domain_entities_v26;
create policy domain_entities_v26_select on public.domain_entities_v26 for select to authenticated
using (public.iberfit_canary_enabled_v26(client_id) and public.iberfit_can_access_client_v26(client_id));
drop policy if exists domain_events_v26_select on public.domain_events_v26;
create policy domain_events_v26_select on public.domain_events_v26 for select to authenticated
using (public.iberfit_canary_enabled_v26(client_id) and public.iberfit_can_access_client_v26(client_id));
drop policy if exists client_access_v26_select on public.client_access_v26;
create policy client_access_v26_select on public.client_access_v26 for select to authenticated
using (public.iberfit_canary_enabled_v26(client_id) and public.iberfit_can_access_client_v26(client_id));
drop policy if exists coach_availability_v26_select on public.coach_availability_v26;
create policy coach_availability_v26_select on public.coach_availability_v26 for select to authenticated
using (coach_user_id=auth.uid() or public.iberfit_current_role_v26()='admin');
drop policy if exists domain_command_registry_v26_select on public.domain_command_registry_v26;
create policy domain_command_registry_v26_select on public.domain_command_registry_v26 for select to authenticated using(enabled=true);
drop policy if exists domain_transitions_v26_select on public.domain_transitions_v26;
create policy domain_transitions_v26_select on public.domain_transitions_v26 for select to authenticated using(true);

revoke all on public.m26_canary_clients_v26 from anon,authenticated;
revoke insert,update,delete,truncate on public.appointments,public.command_receipts_v26,public.command_events_v26,
  public.domain_entities_v26,public.domain_events_v26,public.active_execution_locks_v26,
  public.client_access_v26,public.coach_availability_v26,public.domain_command_registry_v26,
  public.domain_transitions_v26 from anon,authenticated;
grant select on public.appointments,public.command_receipts_v26,public.command_events_v26,
  public.domain_entities_v26,public.domain_events_v26,public.client_access_v26,
  public.coach_availability_v26,public.domain_command_registry_v26,public.domain_transitions_v26 to authenticated;

revoke all on function public.iberfit_current_role_v26() from public;
revoke all on function public.iberfit_can_access_client_v26(uuid) from public;
revoke all on function public.iberfit_canary_enabled_v26(uuid) from public;
revoke all on function public.iberfit_base_entity_v26(text,uuid,uuid) from public;
revoke all on function public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb) from public;
revoke all on function public.iberfit_command_preflight_v26(jsonb) from public;
revoke all on function public.iberfit_execute_command_v26(jsonb) from public;
revoke all on function public.iberfit_bootstrap_v26() from public;

grant execute on function public.iberfit_current_role_v26() to authenticated;
grant execute on function public.iberfit_can_access_client_v26(uuid) to authenticated;
grant execute on function public.iberfit_canary_enabled_v26(uuid) to authenticated;
grant execute on function public.iberfit_command_preflight_v26(jsonb) to authenticated;
grant execute on function public.iberfit_execute_command_v26(jsonb) to authenticated;
grant execute on function public.iberfit_bootstrap_v26() to authenticated;

comment on table public.m26_canary_clients_v26 is 'Allowlist de clientes QA M26. La migración la deja vacía e inactiva.';
comment on function public.iberfit_execute_command_v26(jsonb) is 'Command Bus M26 atómico: entidad, eventos y recibo se confirman en una sola transacción.';
comment on function public.iberfit_bootstrap_v26() is 'Bootstrap M26 filtrado únicamente a clientes canarios accesibles para el actor.';

commit;
