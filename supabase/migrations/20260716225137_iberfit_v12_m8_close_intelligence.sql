create table if not exists public.session_executions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  execution_status text not null default 'activa' check (execution_status in ('activa','pausada','cerrada_local_pendiente_sync','cerrada_confirmada','cierre_conflicto','cierre_rechazado')),
  close_operation_id uuid unique,
  local_closed_at timestamptz,
  remote_confirmed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  started_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ruleset_version text not null,
  engine text not null,
  signal_code text not null,
  priority text not null,
  status text not null check (status in ('propuesta','aprobada','descartada')),
  input_snapshot jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  recommendation jsonb not null,
  confidence jsonb not null,
  limitations jsonb not null default '[]'::jsonb,
  missing_data jsonb not null default '[]'::jsonb,
  coach_decision jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  discarded_by uuid references auth.users(id),
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'aprobada' and approved_by is not null and approved_at is not null) or status <> 'aprobada'),
  check ((status = 'descartada' and discarded_by is not null and discarded_at is not null) or status <> 'descartada')
);
alter table public.session_executions enable row level security;
alter table public.intelligence_runs enable row level security;
create policy session_executions_read on public.session_executions for select using (public.iberfit_role() = 'admin' or public.is_assigned_coach(client_id) or client_id = public.iberfit_client_id());
create policy session_executions_client_insert on public.session_executions for insert with check (client_id = public.iberfit_client_id() and started_by = auth.uid());
create policy session_executions_coach_write on public.session_executions for all using (public.iberfit_role() = 'admin' or public.is_assigned_coach(client_id)) with check (public.iberfit_role() = 'admin' or public.is_assigned_coach(client_id));
create policy intelligence_runs_coach_read on public.intelligence_runs for select using (public.iberfit_role() = 'admin' or public.is_assigned_coach(client_id));
create policy intelligence_runs_coach_write on public.intelligence_runs for all using (public.iberfit_role() = 'admin' or public.is_assigned_coach(client_id)) with check (public.iberfit_role() = 'admin' or public.is_assigned_coach(client_id));
create index if not exists idx_session_executions_client_updated on public.session_executions(client_id, updated_at desc);
create index if not exists idx_intelligence_runs_client_created on public.intelligence_runs(client_id, created_at desc);;
