create table if not exists public.client_timeline_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  event_type text not null,
  title text not null,
  summary text,
  visibility text not null check (visibility in ('coach','cliente','sistema')),
  source_table text,
  source_id uuid,
  status text not null default 'registrado',
  priority text not null default 'normal' check (priority in ('normal','alta')),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.client_timeline_events enable row level security;
drop policy if exists client_timeline_admin_all on public.client_timeline_events;
create policy client_timeline_admin_all on public.client_timeline_events for all using (public.iberfit_current_role() = 'admin') with check (public.iberfit_current_role() = 'admin');
drop policy if exists client_timeline_coach_assigned on public.client_timeline_events;
create policy client_timeline_coach_assigned on public.client_timeline_events for select using (public.iberfit_current_role() = 'coach' and public.iberfit_is_assigned_coach(client_id));
drop policy if exists client_timeline_client_published on public.client_timeline_events;
create policy client_timeline_client_published on public.client_timeline_events for select using (public.iberfit_current_role() = 'client' and public.iberfit_current_client_id() = client_id and visibility = 'cliente');;
