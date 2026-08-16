create table if not exists public.release_candidates (
  id uuid primary key default gen_random_uuid(), version text not null,
  environment text not null default 'SYNTHETIC_ONLY' check (environment = 'SYNTHETIC_ONLY'),
  status text not null check (status in ('blocked','candidate_ready','retired')),
  gate_results jsonb not null default '{}'::jsonb, manifest jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), retired_at timestamptz
);
create table if not exists public.device_conflict_trials (
  id uuid primary key default gen_random_uuid(), client_id uuid references public.clients(id), entity_type text not null,
  entity_id text not null, base_revision bigint not null, winning_device text not null, losing_device text not null,
  conflict_visible boolean not null default false, silent_overwrite boolean not null default false,
  result jsonb not null default '{}'::jsonb, executed_by uuid references auth.users(id), executed_at timestamptz not null default now()
);
create table if not exists public.rollback_checkpoints (
  id uuid primary key default gen_random_uuid(), release_candidate_id uuid references public.release_candidates(id),
  checkpoint text not null, plan jsonb not null, drill_status text not null check (drill_status in ('pending','pass','fail')) default 'pending',
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), executed_at timestamptz
);
create table if not exists public.preview_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  release_candidate_id uuid references public.release_candidates(id), audience text not null default 'interno' check (audience = 'interno'),
  active boolean not null default true, expires_at timestamptz not null, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.release_candidates enable row level security;
alter table public.device_conflict_trials enable row level security;
alter table public.rollback_checkpoints enable row level security;
alter table public.preview_sessions enable row level security;
create index if not exists idx_release_candidates_created_by on public.release_candidates(created_by);
create index if not exists idx_device_conflict_trials_client on public.device_conflict_trials(client_id, executed_at desc);
create index if not exists idx_device_conflict_trials_executed_by on public.device_conflict_trials(executed_by);
create index if not exists idx_rollback_checkpoints_candidate on public.rollback_checkpoints(release_candidate_id);
create index if not exists idx_rollback_checkpoints_created_by on public.rollback_checkpoints(created_by);
create index if not exists idx_preview_sessions_user_active on public.preview_sessions(user_id, active, expires_at);
create index if not exists idx_preview_sessions_candidate on public.preview_sessions(release_candidate_id);
create index if not exists idx_preview_sessions_created_by on public.preview_sessions(created_by);
drop policy if exists release_candidates_admin on public.release_candidates;
create policy release_candidates_admin on public.release_candidates for all to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role) with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role);
drop policy if exists release_candidates_coach_read on public.release_candidates;
create policy release_candidates_coach_read on public.release_candidates for select to authenticated using ((select public.iberfit_role()) in ('coach'::public.iberfit_role,'admin'::public.iberfit_role));
drop policy if exists device_trials_coach_admin on public.device_conflict_trials;
create policy device_trials_coach_admin on public.device_conflict_trials for all to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role or (client_id is not null and public.is_assigned_coach(client_id))) with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role or (client_id is not null and public.is_assigned_coach(client_id)));
drop policy if exists rollback_admin on public.rollback_checkpoints;
create policy rollback_admin on public.rollback_checkpoints for all to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role) with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role);
drop policy if exists preview_sessions_self_read on public.preview_sessions;
create policy preview_sessions_self_read on public.preview_sessions for select to authenticated using (user_id = (select auth.uid()) or (select public.iberfit_role()) = 'admin'::public.iberfit_role);
drop policy if exists preview_sessions_admin_write on public.preview_sessions;
create policy preview_sessions_admin_write on public.preview_sessions for all to authenticated using ((select public.iberfit_role()) = 'admin'::public.iberfit_role) with check ((select public.iberfit_role()) = 'admin'::public.iberfit_role);;
