create table if not exists public.exercise_catalog_sync_runs(
 id uuid primary key default gen_random_uuid(),
 source text not null,
 status text not null,
 imported_count integer not null default 0,
 enriched_count integer not null default 0,
 rejected_count integer not null default 0,
 details jsonb not null default '{}'::jsonb,
 started_by uuid not null references auth.users(id),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 constraint exercise_catalog_sync_status_check check(status in('running','completed','partial','failed'))
);
alter table public.exercise_catalog_sync_runs enable row level security;
drop policy if exists exercise_catalog_sync_admin_read on public.exercise_catalog_sync_runs;
create policy exercise_catalog_sync_admin_read on public.exercise_catalog_sync_runs for select to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role);
drop policy if exists exercise_catalog_sync_admin_insert on public.exercise_catalog_sync_runs;
create policy exercise_catalog_sync_admin_insert on public.exercise_catalog_sync_runs for insert to authenticated with check((select public.iberfit_role())='admin'::public.iberfit_role and started_by=(select auth.uid()));
drop policy if exists exercise_catalog_sync_admin_update on public.exercise_catalog_sync_runs;
create policy exercise_catalog_sync_admin_update on public.exercise_catalog_sync_runs for update to authenticated using((select public.iberfit_role())='admin'::public.iberfit_role) with check((select public.iberfit_role())='admin'::public.iberfit_role);
grant select,insert,update on public.exercise_catalog_sync_runs to authenticated;;
