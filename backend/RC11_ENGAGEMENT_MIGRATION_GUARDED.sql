-- IBERFIT M26 RC11 · CANDIDATA GUARDADA PARA RAMA/STAGING QA.
-- NO EJECUTAR EN PRODUCCIÓN sin completar el preflight, revisar la definición exacta
-- de transiciones/RPC y establecer explícitamente:
--   set local iberfit.allow_rc11_engagement = 'qa-only';
-- La ausencia de esa marca revierte toda la transacción.

begin;

do $$
begin
  if current_setting('iberfit.allow_rc11_engagement',true) is distinct from 'qa-only' then
    raise exception 'M26_RC11_GUARD_NOT_AUTHORIZED';
  end if;
  if (select count(*) from public.domain_command_registry_v26 where enabled=true) <> 44 then
    raise exception 'M26_RC11_BASE_COMMAND_COUNT_MISMATCH';
  end if;
  if (select count(*) from public.m26_canary_clients_v26 where active=true) <> 1 then
    raise exception 'M26_RC11_CANARY_COUNT_MUST_BE_ONE';
  end if;
  if to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_bootstrap_v26()') is null then
    raise exception 'M26_RC11_REQUIRED_RPC_SIGNATURE_MISMATCH';
  end if;
end $$;

create table if not exists public.client_checkins_v26 (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
  energy numeric(4,1) not null check(energy between 0 and 10), sleep numeric(4,1) not null check(sleep between 0 and 10),
  stress numeric(4,1) not null check(stress between 0 and 10), pain numeric(4,1) not null check(pain between 0 and 10),
  notes text not null default '', status text not null default 'confirmado', revision bigint not null default 1 check(revision>0),
  recorded_at timestamptz not null default now(), created_by uuid not null default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists client_checkins_v26_client_recorded_idx on public.client_checkins_v26(client_id,recorded_at desc);

create table if not exists public.client_habits_v26 (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id), title text not null,
  description text not null default '', target numeric not null check(target>0), unit text not null default 'veces', frequency text not null default 'diario',
  status text not null default 'activo', revision bigint not null default 1 check(revision>0), created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists client_habits_v26_client_status_idx on public.client_habits_v26(client_id,status);

create table if not exists public.client_habit_logs_v26 (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id), habit_id uuid not null references public.client_habits_v26(id),
  completed boolean not null default false, value jsonb, notes text not null default '', status text not null default 'confirmado', revision bigint not null default 1 check(revision>0),
  recorded_at timestamptz not null default now(), created_by uuid not null default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists client_habit_logs_v26_habit_recorded_idx on public.client_habit_logs_v26(habit_id,recorded_at desc);

create table if not exists public.coach_private_notes_v26 (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id), body text not null check(length(btrim(body))>=3),
  status text not null default 'activo', revision bigint not null default 1 check(revision>0), created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists coach_private_notes_v26_client_updated_idx on public.coach_private_notes_v26(client_id,updated_at desc);

alter table public.client_checkins_v26 enable row level security;
alter table public.client_habits_v26 enable row level security;
alter table public.client_habit_logs_v26 enable row level security;
alter table public.coach_private_notes_v26 enable row level security;

-- Las mutaciones directas no reciben políticas INSERT/UPDATE/DELETE: solo Command Bus/RPC propietario.
-- Las políticas SELECT definitivas deben copiar los helpers exactos del Gate 15. No se improvisan aquí.

do $$
begin
  if to_regclass('public.domain_transition_registry_v26') is null then
    raise exception 'M26_RC11_TRANSITION_REGISTRY_NOT_CONFIRMED';
  end if;
  -- El bloque de inserción de registro, transiciones, sincronización de source tables y extensión
  -- del bootstrap se genera solo después de capturar el esquema remoto autenticado.
  raise exception 'M26_RC11_REMOTE_SCHEMA_SNAPSHOT_REQUIRED';
end $$;

rollback;
