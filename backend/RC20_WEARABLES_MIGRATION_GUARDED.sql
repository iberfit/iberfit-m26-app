-- IBERFIT M26 RC20 · arquitectura de wearables preparada para RAMA/STAGING QA.
-- NO EJECUTAR EN PRODUCCIÓN. No almacena tokens OAuth ni datos clínicos crudos.
-- La ausencia de la marca qa-only o de las firmas remotas exactas revierte todo.

begin;

do $$
begin
  if current_setting('iberfit.allow_rc20_wearables',true) is distinct from 'qa-only' then
    raise exception 'M26_RC20_WEARABLES_GUARD_NOT_AUTHORIZED';
  end if;
  if to_regprocedure('public.iberfit_bootstrap_v26()') is null
     or to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null then
    raise exception 'M26_RC20_REQUIRED_RPC_SIGNATURE_MISMATCH';
  end if;
  if (select count(*) from public.domain_command_registry_v26 where enabled=true) not in (44,52) then
    raise exception 'M26_RC20_COMMAND_REGISTRY_UNEXPECTED';
  end if;
  if (select count(*) from public.m26_canary_clients_v26 where active=true) <> 1 then
    raise exception 'M26_RC20_CANARY_COUNT_MUST_BE_ONE';
  end if;
end $$;

create table if not exists public.wearable_connections_v26 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check(provider in ('apple_health','health_connect','garmin_connect','fitbit','oura')),
  status text not null default 'pendiente' check(status in ('pendiente','conectado','pausado','revocado','error')),
  scopes jsonb not null default '[]'::jsonb check(jsonb_typeof(scopes)='array'),
  consent_version text not null,
  consented_at timestamptz,
  revoked_at timestamptz,
  last_synced_at timestamptz,
  external_subject_hash text,
  cursor_encrypted bytea,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id,provider),
  check((status='conectado' and consented_at is not null) or status<>'conectado'),
  check((status='revocado' and revoked_at is not null) or status<>'revocado')
);

create table if not exists public.wearable_daily_summaries_v26 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check(provider in ('apple_health','health_connect','garmin_connect','fitbit','oura')),
  summary_date date not null,
  metrics jsonb not null check(jsonb_typeof(metrics)='object'),
  data_quality text not null default 'limitada' check(data_quality in ('limitada','media','alta')),
  source_record_count integer not null default 1 check(source_record_count between 1 and 100000),
  source_updated_at timestamptz not null,
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id,provider,summary_date),
  check(not (metrics ?| array['email','name','nombre','phone','telefono','token','access_token','refresh_token']))
);

create table if not exists public.wearable_sync_runs_v26 (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.wearable_connections_v26(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null check(status in ('iniciado','completado','parcial','fallido')),
  range_start date,
  range_end date,
  accepted_rows integer not null default 0 check(accepted_rows>=0),
  rejected_rows integer not null default 0 check(rejected_rows>=0),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check((status in ('completado','parcial','fallido') and completed_at is not null) or status='iniciado')
);

create index if not exists wearable_daily_client_date_idx on public.wearable_daily_summaries_v26(client_id,summary_date desc);
create index if not exists wearable_sync_connection_started_idx on public.wearable_sync_runs_v26(connection_id,started_at desc);

alter table public.wearable_connections_v26 enable row level security;
alter table public.wearable_daily_summaries_v26 enable row level security;
alter table public.wearable_sync_runs_v26 enable row level security;

-- Lectura: cliente propio o Coach/Admin asignado. Las escrituras directas permanecen cerradas.
create policy wearable_connections_read_v26 on public.wearable_connections_v26 for select to authenticated
  using (client_id=public.iberfit_client_id() or public.is_assigned_coach(client_id));
create policy wearable_daily_read_v26 on public.wearable_daily_summaries_v26 for select to authenticated
  using (client_id=public.iberfit_client_id() or public.is_assigned_coach(client_id));
create policy wearable_sync_read_v26 on public.wearable_sync_runs_v26 for select to authenticated
  using (client_id=public.iberfit_client_id() or public.is_assigned_coach(client_id));

revoke all on public.wearable_connections_v26 from anon;
revoke all on public.wearable_daily_summaries_v26 from anon;
revoke all on public.wearable_sync_runs_v26 from anon;

-- El bootstrap y la vía de mutación se incorporan únicamente después de comparar
-- el esquema remoto autenticado, las políticas exactas y el catálogo completo.
do $$ begin raise exception 'M26_RC20_REMOTE_BOOTSTRAP_AND_WRITE_PATH_REQUIRED'; end $$;

rollback;
