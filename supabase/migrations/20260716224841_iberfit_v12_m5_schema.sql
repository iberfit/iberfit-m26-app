create extension if not exists pgcrypto;

do $$ begin
  create type public.iberfit_role as enum ('client','coach','admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.client_modality as enum ('Presencial','Híbrido','Online');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.publication_status as enum ('borrador','revisión','aprobado','publicado','retirado');
exception when duplicate_object then null; end $$;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.iberfit_role not null,
  client_id uuid,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  modality public.client_modality not null,
  objective text,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add constraint user_profiles_client_id_fkey foreign key (client_id) references public.clients(id) on delete set null;

create table if not exists public.client_assignments (
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (client_id, coach_user_id)
);

create table if not exists public.client_app_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  modality public.client_modality not null,
  modules jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  revision bigint not null default 0,
  status public.publication_status not null default 'borrador',
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (client_id, version)
);

create table if not exists public.training_cycles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  goal text not null,
  weeks integer not null check (weeks between 1 and 52),
  active_week integer not null default 1,
  status public.publication_status not null default 'borrador',
  revision bigint not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  cycle_id uuid references public.training_cycles(id) on delete set null,
  title text not null,
  execution_type text not null check (execution_type in ('presencial','guiada_en_app')),
  prescription jsonb not null,
  status public.publication_status not null default 'borrador',
  revision bigint not null default 0,
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.session_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  session_id uuid not null references public.sessions(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null references auth.users(id),
  local_sequence bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.iri_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  sections jsonb not null,
  status public.publication_status not null default 'borrador',
  revision bigint not null default 0,
  approved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_type text,
  source_id uuid,
  title text not null,
  report_type text not null,
  audience text not null check (audience in ('coach','cliente')),
  summary text,
  content jsonb not null default '{}'::jsonb,
  status public.publication_status not null default 'borrador',
  revision bigint not null default 0,
  approved_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  lineage_id text not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  iri_id uuid references public.iri_assessments(id) on delete set null,
  title text not null,
  document_type text not null,
  version integer not null,
  audience text not null check (audience in ('coach','cliente')),
  status public.publication_status not null default 'borrador',
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (length(sha256) = 64),
  storage_path text not null,
  measured_at date,
  measurement_context jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (lineage_id, version),
  unique (sha256, client_id)
);

create table if not exists public.outbox_receipts (
  operation_id uuid primary key,
  entity_type text not null,
  entity_id text not null,
  remote_revision bigint not null default 0,
  append_only boolean not null,
  actor_user_id uuid not null references auth.users(id),
  processed_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  actor_user_id uuid not null references auth.users(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.iberfit_role()
returns public.iberfit_role
language sql stable security definer set search_path = public
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'iberfit_role', '')::public.iberfit_role,
    p.role
  )
  from public.user_profiles p
  where p.user_id = auth.uid()
$$;

create or replace function public.iberfit_client_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select p.client_id from public.user_profiles p where p.user_id = auth.uid()
$$;

create or replace function public.is_assigned_coach(target_client uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.client_assignments a
    where a.client_id = target_client and a.coach_user_id = auth.uid() and a.active
  ) or public.iberfit_role() = 'admin'
$$;

alter table public.user_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_assignments enable row level security;
alter table public.client_app_profiles enable row level security;
alter table public.training_cycles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_events enable row level security;
alter table public.iri_assessments enable row level security;
alter table public.reports enable row level security;
alter table public.documents enable row level security;
alter table public.outbox_receipts enable row level security;
alter table public.audit_events enable row level security;

create policy user_profiles_self on public.user_profiles for select using (user_id = auth.uid() or public.iberfit_role() = 'admin');
create policy clients_read on public.clients for select using (id = public.iberfit_client_id() or public.is_assigned_coach(id));
create policy clients_write_coach on public.clients for all using (public.is_assigned_coach(id)) with check (public.is_assigned_coach(id));
create policy assignments_admin_coach_read on public.client_assignments for select using (coach_user_id = auth.uid() or public.iberfit_role() = 'admin');
create policy profiles_read on public.client_app_profiles for select using (
  public.is_assigned_coach(client_id) or (client_id = public.iberfit_client_id() and status = 'publicado')
);
create policy profiles_write on public.client_app_profiles for all using (public.is_assigned_coach(client_id)) with check (public.is_assigned_coach(client_id));
create policy cycles_read on public.training_cycles for select using (
  public.is_assigned_coach(client_id) or (client_id = public.iberfit_client_id() and status = 'publicado')
);
create policy cycles_write on public.training_cycles for all using (public.is_assigned_coach(client_id)) with check (public.is_assigned_coach(client_id));
create policy sessions_read on public.sessions for select using (
  public.is_assigned_coach(client_id) or (client_id = public.iberfit_client_id() and status = 'publicado')
);
create policy sessions_write on public.sessions for all using (public.is_assigned_coach(client_id)) with check (public.is_assigned_coach(client_id));
create policy session_events_read on public.session_events for select using (client_id = public.iberfit_client_id() or public.is_assigned_coach(client_id));
create policy session_events_client_insert on public.session_events for insert with check (
  actor_user_id = auth.uid() and client_id = public.iberfit_client_id() and event_type in (
    'SESION_INICIADA','SERIE_COMPLETADA','INCIDENCIA_REGISTRADA','CHECKIN_REGISTRADO','FEEDBACK_REGISTRADO','SESION_CERRADA'
  )
);
create policy session_events_coach_insert on public.session_events for insert with check (actor_user_id = auth.uid() and public.is_assigned_coach(client_id));
create policy iri_read on public.iri_assessments for select using (public.is_assigned_coach(client_id));
create policy iri_write on public.iri_assessments for all using (public.is_assigned_coach(client_id)) with check (public.is_assigned_coach(client_id));
create policy reports_read on public.reports for select using (
  public.is_assigned_coach(client_id) or (client_id = public.iberfit_client_id() and status = 'publicado' and audience = 'cliente')
);
create policy reports_write on public.reports for all using (public.is_assigned_coach(client_id)) with check (public.is_assigned_coach(client_id));
create policy documents_read on public.documents for select using (
  public.is_assigned_coach(client_id) or (client_id = public.iberfit_client_id() and status = 'publicado' and audience = 'cliente')
);
create policy documents_write on public.documents for all using (public.is_assigned_coach(client_id)) with check (public.is_assigned_coach(client_id));
create policy receipts_actor_read on public.outbox_receipts for select using (actor_user_id = auth.uid() or public.iberfit_role() = 'admin');
create policy audit_admin_coach_read on public.audit_events for select using (public.iberfit_role() in ('coach','admin'));

create index if not exists idx_sessions_client_status on public.sessions(client_id, status);
create index if not exists idx_session_events_session_created on public.session_events(session_id, created_at);
create index if not exists idx_reports_client_status on public.reports(client_id, status, audience);
create index if not exists idx_documents_client_status on public.documents(client_id, status, audience);
create index if not exists idx_audit_entity on public.audit_events(entity_type, entity_id, created_at desc);;
