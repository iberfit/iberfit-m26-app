create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(), event_type text not null,
  severity text not null check (severity in ('info','warning','critical')),
  environment text not null default 'SYNTHETIC_ONLY' check (environment = 'SYNTHETIC_ONLY'),
  client_id uuid references public.clients(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  operation_id uuid,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.backup_manifests (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('local_repository','client_scope','staging_snapshot')),
  schema_version integer not null,
  environment text not null default 'SYNTHETIC_ONLY' check (environment = 'SYNTHETIC_ONLY'),
  checksum_sha256 text not null check (length(checksum_sha256) = 64),
  counts jsonb not null default '{}'::jsonb,
  status text not null check (status in ('created','validated','restored','failed')),
  client_id uuid references public.clients(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.preview_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  environment text not null default 'SYNTHETIC_ONLY' check (environment = 'SYNTHETIC_ONLY'),
  audience text not null default 'interno' check (audience = 'interno'),
  expires_at timestamptz, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.beta_runs (
  id uuid primary key default gen_random_uuid(), name text not null, build_version text not null,
  environment text not null default 'SYNTHETIC_ONLY' check (environment = 'SYNTHETIC_ONLY'),
  status text not null check (status in ('draft','running','passed','failed','blocked')),
  checks jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.operational_events enable row level security;
alter table public.backup_manifests enable row level security;
alter table public.preview_access enable row level security;
alter table public.beta_runs enable row level security;
create index if not exists idx_operational_events_client_created on public.operational_events(client_id, created_at desc);
create index if not exists idx_operational_events_actor_created on public.operational_events(actor_user_id, created_at desc);
create index if not exists idx_operational_events_severity_created on public.operational_events(severity, created_at desc);
create index if not exists idx_backup_manifests_client_created on public.backup_manifests(client_id, created_at desc);
create index if not exists idx_backup_manifests_created_by on public.backup_manifests(created_by);
create index if not exists idx_beta_runs_created_by on public.beta_runs(created_by);;
