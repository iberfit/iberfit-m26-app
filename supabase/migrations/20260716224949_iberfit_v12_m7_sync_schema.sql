create table if not exists public.iberfit_system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.iberfit_system_settings(key, value)
values ('environment', '"SYNTHETIC_ONLY"'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
create or replace function public.iberfit_current_role()
returns public.iberfit_role language sql stable security definer set search_path = public
as $$ select public.iberfit_role() $$;
create or replace function public.iberfit_current_client_id()
returns uuid language sql stable security definer set search_path = public
as $$ select public.iberfit_client_id() $$;
create or replace function public.iberfit_is_assigned_coach(target_client uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_assigned_coach(target_client) $$;
create table if not exists public.sync_entities (
  entity_type text not null,
  entity_id text not null,
  client_id uuid references public.clients(id) on delete cascade,
  revision bigint not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);
create table if not exists public.sync_events (
  operation_id uuid primary key,
  entity_type text not null,
  entity_id text not null,
  client_id uuid references public.clients(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null references auth.users(id),
  local_sequence bigint not null default 0,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);
alter table public.iberfit_system_settings enable row level security;
alter table public.sync_entities enable row level security;
alter table public.sync_events enable row level security;
create policy system_settings_admin_read on public.iberfit_system_settings for select using (public.iberfit_role() = 'admin');
create policy sync_entities_read on public.sync_entities for select using (
  public.iberfit_role() = 'admin' or (client_id is not null and public.is_assigned_coach(client_id)) or client_id = public.iberfit_client_id()
);
create policy sync_events_read on public.sync_events for select using (
  public.iberfit_role() = 'admin' or (client_id is not null and public.is_assigned_coach(client_id)) or client_id = public.iberfit_client_id()
);
create index if not exists idx_sync_entities_client on public.sync_entities(client_id, updated_at desc);
create index if not exists idx_sync_events_client on public.sync_events(client_id, received_at desc);
create index if not exists idx_sync_events_entity on public.sync_events(entity_type, entity_id, received_at desc);;
