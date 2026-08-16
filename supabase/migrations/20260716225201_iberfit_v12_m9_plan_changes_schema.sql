create table if not exists public.plan_change_proposals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_id uuid not null references public.training_cycles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  intelligence_run_id uuid references public.intelligence_runs(id) on delete restrict,
  source_signal_code text not null,
  source_ruleset_version text not null,
  status text not null check (status in ('borrador','aprobado','publicado','descartado')),
  base_planning_revision bigint not null,
  target jsonb not null,
  previous_value numeric not null,
  proposed_value numeric not null,
  rationale text not null,
  evidence jsonb not null default '[]'::jsonb,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  published_by uuid references auth.users(id),
  published_at timestamptz,
  applied_planning_revision bigint,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (previous_value <> proposed_value),
  check ((status = 'aprobado' and approved_by is not null and approved_at is not null) or status <> 'aprobado'),
  check ((status = 'publicado' and published_by is not null and published_at is not null and applied_planning_revision is not null) or status <> 'publicado')
);
alter table public.plan_change_proposals enable row level security;
create policy plan_change_proposals_coach_read on public.plan_change_proposals for select using (public.iberfit_role() = 'admin' or public.is_assigned_coach(client_id));
create policy plan_change_proposals_coach_write on public.plan_change_proposals for all using (public.iberfit_role() = 'admin' or public.is_assigned_coach(client_id)) with check (public.iberfit_role() = 'admin' or public.is_assigned_coach(client_id));
create index if not exists idx_plan_change_proposals_client_created on public.plan_change_proposals(client_id, created_at desc);;
