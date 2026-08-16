create table if not exists public.rollout_plans_v18 (
 id uuid primary key default gen_random_uuid(), release_candidate_id uuid references public.release_candidates(id), candidate_version text not null,
 environment text not null default 'SYNTHETIC_ONLY' check(environment='SYNTHETIC_ONLY'), status text not null check(status in ('draft','approved','active','paused','completed','rolled_back')) default 'draft',
 rollback_checkpoint text not null, production_activation boolean not null default false, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.rollout_waves_v18 (
 id uuid primary key default gen_random_uuid(), rollout_id uuid not null references public.rollout_plans_v18(id), wave_key text not null,
 wave_order integer not null, percentage numeric not null check(percentage between 0 and 100), minimum_hours integer not null check(minimum_hours>0),
 status text not null check(status in ('blocked','ready','observing','passed','failed','rolled_back')) default 'blocked', started_at timestamptz, completed_at timestamptz, unique(rollout_id,wave_key)
);
create table if not exists public.rollout_metrics_v18 (
 id uuid primary key default gen_random_uuid(), wave_id uuid not null references public.rollout_waves_v18(id), sessions integer not null default 0,
 sync_failures integer not null default 0, crashes integer not null default 0, data_loss integer not null default 0, critical_incidents integer not null default 0,
 p95_interaction_ms numeric not null default 0, observed_at timestamptz not null default now()
);
create table if not exists public.rollback_events_v18 (
 id uuid primary key default gen_random_uuid(), rollout_id uuid not null references public.rollout_plans_v18(id), wave_id uuid references public.rollout_waves_v18(id),
 reasons jsonb not null, automatic_execution boolean not null default false, owner_confirmed boolean not null default false,
 executed_by uuid references auth.users(id), created_at timestamptz not null default now(), executed_at timestamptz
);
create table if not exists public.feature_flags_v18 (
 id uuid primary key default gen_random_uuid(), key text not null unique, enabled boolean not null default false, environment text not null default 'SYNTHETIC_ONLY',
 roles jsonb not null default '[]'::jsonb, client_ids jsonb not null default '[]'::jsonb, percentage numeric not null default 0 check(percentage between 0 and 100),
 created_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
alter table public.rollout_plans_v18 enable row level security;
alter table public.rollout_waves_v18 enable row level security;
alter table public.rollout_metrics_v18 enable row level security;
alter table public.rollback_events_v18 enable row level security;
alter table public.feature_flags_v18 enable row level security;
create index if not exists idx_rollout_plans_candidate on public.rollout_plans_v18(release_candidate_id);
create index if not exists idx_rollout_plans_created_by on public.rollout_plans_v18(created_by);
create index if not exists idx_rollout_waves_rollout_order on public.rollout_waves_v18(rollout_id,wave_order);
create index if not exists idx_rollout_metrics_wave on public.rollout_metrics_v18(wave_id,observed_at desc);
create index if not exists idx_rollback_events_rollout on public.rollback_events_v18(rollout_id,created_at desc);
create index if not exists idx_rollback_events_wave on public.rollback_events_v18(wave_id);
create index if not exists idx_rollback_events_executed_by on public.rollback_events_v18(executed_by);
create index if not exists idx_feature_flags_created_by on public.feature_flags_v18(created_by);
create policy rollout_plans_admin_all on public.rollout_plans_v18 for all to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
create policy rollout_plans_coach_read on public.rollout_plans_v18 for select to authenticated using((select public.iberfit_role()) in ('coach'::public.iberfit_role,'admin'::public.iberfit_role));
create policy rollout_waves_staff_read on public.rollout_waves_v18 for select to authenticated using((select public.iberfit_role()) in ('coach'::public.iberfit_role,'admin'::public.iberfit_role));
create policy rollout_waves_admin_write on public.rollout_waves_v18 for all to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
create policy rollout_metrics_staff_read on public.rollout_metrics_v18 for select to authenticated using((select public.iberfit_role()) in ('coach'::public.iberfit_role,'admin'::public.iberfit_role));
create policy rollout_metrics_admin_write on public.rollout_metrics_v18 for all to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
create policy rollback_admin_all on public.rollback_events_v18 for all to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
create policy feature_flags_read on public.feature_flags_v18 for select to authenticated using(true);
create policy feature_flags_admin_write on public.feature_flags_v18 for all to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);;
