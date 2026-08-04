-- IBERFIT M26 RC43 · backend operacional Canary.
-- Migración aditiva. No elimina ni modifica tablas históricas.
-- Aplicación autorizada exclusivamente contra el proyecto Supabase Canary.

begin;

do $m26_guard$
begin
  if to_regclass('public.clients') is null then
    raise exception 'M26_RC43_CLIENTS_TABLE_REQUIRED';
  end if;

  if to_regprocedure('public.iberfit_client_id()') is null then
    raise exception 'M26_RC43_CLIENT_ID_HELPER_REQUIRED';
  end if;

  if to_regprocedure('public.is_assigned_coach(uuid)') is null then
    raise exception 'M26_RC43_ASSIGNMENT_HELPER_REQUIRED';
  end if;

  if to_regprocedure('public.iberfit_bootstrap_v26()') is null then
    raise exception 'M26_RC43_V26_BOOTSTRAP_REQUIRED';
  end if;

  if to_regprocedure(
    'public.iberfit_command_preflight_v26(jsonb)'
  ) is null then
    raise exception 'M26_RC43_V26_PREFLIGHT_REQUIRED';
  end if;

  if to_regprocedure(
    'public.iberfit_execute_command_v26(jsonb)'
  ) is null then
    raise exception 'M26_RC43_V26_EXECUTE_REQUIRED';
  end if;
end
$m26_guard$;

create or replace function public.m26_json_safe_v43(
  p_value jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $m26$
  select case
    when jsonb_typeof(
      coalesce(p_value, '{}'::jsonb)
    ) <> 'object' then false
    when octet_length(
      coalesce(p_value, '{}'::jsonb)::text
    ) > 120000 then false
    else not exists (
      select 1
      from jsonb_object_keys(
        coalesce(p_value, '{}'::jsonb)
      ) as key_name
      where lower(key_name) = any (
        array[
          'password',
          'token',
          'access_token',
          'refresh_token',
          'service_role',
          'secret',
          'authorization',
          'email',
          'phone',
          'telefono'
        ]
      )
    )
  end;
$m26$;

revoke all
on function public.m26_json_safe_v43(jsonb)
from public, anon;

grant execute
on function public.m26_json_safe_v43(jsonb)
to authenticated;

create table if not exists public.m26_schema_releases_v43 (
  version text primary key,
  environment text not null
    check (environment = 'canary'),
  applied_at timestamptz not null default now(),
  production_modified boolean not null default false
    check (production_modified = false),
  production_deployed boolean not null default false
    check (production_deployed = false)
);

create table if not exists public.m26_client_measurements_v43 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.clients(id)
    on delete cascade,
  metric text not null
    check (metric ~ '^[a-z0-9_]{2,40}$'),
  value numeric(14,4) not null,
  unit text not null
    check (
      char_length(unit) between 1 and 24
    ),
  measured_at timestamptz not null default now(),
  source text not null default 'manual'
    check (
      source in (
        'manual',
        'wearable',
        'import',
        'computed'
      )
    ),
  notes text
    check (
      notes is null
      or char_length(notes) <= 1000
    ),
  metadata jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(metadata)
    ),
  revision bigint not null default 1
    check (revision > 0),
  created_by uuid not null default auth.uid()
    references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.m26_training_plans_v43 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.clients(id)
    on delete cascade,
  title text not null
    check (
      char_length(title) between 1 and 160
    ),
  status text not null default 'draft'
    check (
      status in (
        'draft',
        'active',
        'paused',
        'completed',
        'archived'
      )
    ),
  starts_on date,
  ends_on date,
  plan_payload jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(plan_payload)
    ),
  revision bigint not null default 1
    check (revision > 0),
  created_by uuid not null default auth.uid()
    references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    ends_on is null
    or starts_on is null
    or ends_on >= starts_on
  )
);

create table if not exists public.m26_training_sessions_v43 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.clients(id)
    on delete cascade,
  plan_id uuid
    references public.m26_training_plans_v43(id)
    on delete set null,
  title text not null
    check (
      char_length(title) between 1 and 160
    ),
  status text not null default 'planned'
    check (
      status in (
        'planned',
        'confirmed',
        'started',
        'completed',
        'cancelled'
      )
    ),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  session_payload jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(session_payload)
    ),
  result_payload jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(result_payload)
    ),
  revision bigint not null default 1
    check (revision > 0),
  created_by uuid not null default auth.uid()
    references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    completed_at is null
    or started_at is null
    or completed_at >= started_at
  )
);

create table if not exists public.m26_messages_v43 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null
    references public.clients(id)
    on delete cascade,
  sender_user_id uuid not null default auth.uid()
    references auth.users(id),
  body text not null
    check (
      char_length(body) between 1 and 4000
    ),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.m26_audit_events_v43 (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  client_id uuid references public.clients(id)
    on delete set null,
  event_type text not null
    check (
      event_type ~ '^[A-Z0-9_]{3,80}$'
    ),
  entity_type text not null
    check (
      entity_type ~ '^[a-z0-9_]{2,80}$'
    ),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (
      public.m26_json_safe_v43(metadata)
    ),
  created_at timestamptz not null default now()
);

create index if not exists
  m26_measurements_client_date_v43
on public.m26_client_measurements_v43 (
  client_id,
  measured_at desc
);

create index if not exists
  m26_plans_client_status_v43
on public.m26_training_plans_v43 (
  client_id,
  status
);

create index if not exists
  m26_sessions_client_date_v43
on public.m26_training_sessions_v43 (
  client_id,
  scheduled_at desc
);

create index if not exists
  m26_messages_client_date_v43
on public.m26_messages_v43 (
  client_id,
  created_at desc
);

create index if not exists
  m26_audit_client_date_v43
on public.m26_audit_events_v43 (
  client_id,
  created_at desc
);

create or replace function public.m26_touch_updated_at_v43()
returns trigger
language plpgsql
set search_path = ''
as $m26$
begin
  new.updated_at := now();

  if to_jsonb(new) ? 'revision' then
    new.revision := coalesce(old.revision, 0) + 1;
  end if;

  return new;
end
$m26$;

revoke all
on function public.m26_touch_updated_at_v43()
from public, anon, authenticated;

drop trigger if exists
  m26_measurements_touch_v43
on public.m26_client_measurements_v43;

create trigger m26_measurements_touch_v43
before update
on public.m26_client_measurements_v43
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
  m26_plans_touch_v43
on public.m26_training_plans_v43;

create trigger m26_plans_touch_v43
before update
on public.m26_training_plans_v43
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
  m26_sessions_touch_v43
on public.m26_training_sessions_v43;

create trigger m26_sessions_touch_v43
before update
on public.m26_training_sessions_v43
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
  m26_messages_touch_v43
on public.m26_messages_v43;

create trigger m26_messages_touch_v43
before update
on public.m26_messages_v43
for each row
execute function public.m26_touch_updated_at_v43();

create or replace function public.m26_audit_row_v43()
returns trigger
language plpgsql
security definer
set search_path = ''
as $m26$
declare
  v_row jsonb;
  v_client_id uuid;
  v_entity_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  v_client_id := nullif(
    v_row ->> 'client_id',
    ''
  )::uuid;

  v_entity_id := nullif(
    v_row ->> 'id',
    ''
  )::uuid;

  insert into public.m26_audit_events_v43 (
    actor_user_id,
    client_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    auth.uid(),
    v_client_id,
    'ROW_' || tg_op,
    tg_table_name,
    v_entity_id,
    jsonb_build_object(
      'operation',
      tg_op
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$m26$;

revoke all
on function public.m26_audit_row_v43()
from public, anon, authenticated;

drop trigger if exists
  m26_measurements_audit_v43
on public.m26_client_measurements_v43;

create trigger m26_measurements_audit_v43
after insert or update or delete
on public.m26_client_measurements_v43
for each row
execute function public.m26_audit_row_v43();

drop trigger if exists
  m26_plans_audit_v43
on public.m26_training_plans_v43;

create trigger m26_plans_audit_v43
after insert or update or delete
on public.m26_training_plans_v43
for each row
execute function public.m26_audit_row_v43();

drop trigger if exists
  m26_sessions_audit_v43
on public.m26_training_sessions_v43;

create trigger m26_sessions_audit_v43
after insert or update or delete
on public.m26_training_sessions_v43
for each row
execute function public.m26_audit_row_v43();

drop trigger if exists
  m26_messages_audit_v43
on public.m26_messages_v43;

create trigger m26_messages_audit_v43
after insert or update or delete
on public.m26_messages_v43
for each row
execute function public.m26_audit_row_v43();

alter table public.m26_schema_releases_v43
  enable row level security;

alter table public.m26_client_measurements_v43
  enable row level security;

alter table public.m26_training_plans_v43
  enable row level security;

alter table public.m26_training_sessions_v43
  enable row level security;

alter table public.m26_messages_v43
  enable row level security;

alter table public.m26_audit_events_v43
  enable row level security;

drop policy if exists
  m26_measurements_read_v43
on public.m26_client_measurements_v43;

create policy m26_measurements_read_v43
on public.m26_client_measurements_v43
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_measurements_write_v43
on public.m26_client_measurements_v43;

create policy m26_measurements_write_v43
on public.m26_client_measurements_v43
for all
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
)
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and created_by = auth.uid()
);

drop policy if exists
  m26_plans_read_v43
on public.m26_training_plans_v43;

create policy m26_plans_read_v43
on public.m26_training_plans_v43
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_plans_write_v43
on public.m26_training_plans_v43;

create policy m26_plans_write_v43
on public.m26_training_plans_v43
for all
to authenticated
using (
  public.is_assigned_coach(client_id)
)
with check (
  public.is_assigned_coach(client_id)
  and created_by = auth.uid()
);

drop policy if exists
  m26_sessions_read_v43
on public.m26_training_sessions_v43;

create policy m26_sessions_read_v43
on public.m26_training_sessions_v43
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_sessions_write_v43
on public.m26_training_sessions_v43;

create policy m26_sessions_write_v43
on public.m26_training_sessions_v43
for all
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
)
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and created_by = auth.uid()
);

drop policy if exists
  m26_messages_read_v43
on public.m26_messages_v43;

create policy m26_messages_read_v43
on public.m26_messages_v43
for select
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_messages_insert_v43
on public.m26_messages_v43;

create policy m26_messages_insert_v43
on public.m26_messages_v43
for insert
to authenticated
with check (
  (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
  and sender_user_id = auth.uid()
);

drop policy if exists
  m26_messages_update_v43
on public.m26_messages_v43;

create policy m26_messages_update_v43
on public.m26_messages_v43
for update
to authenticated
using (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
)
with check (
  client_id = public.iberfit_client_id()
  or public.is_assigned_coach(client_id)
);

drop policy if exists
  m26_audit_read_v43
on public.m26_audit_events_v43;

create policy m26_audit_read_v43
on public.m26_audit_events_v43
for select
to authenticated
using (
  actor_user_id = auth.uid()
  or (
    client_id is not null
    and (
      client_id = public.iberfit_client_id()
      or public.is_assigned_coach(client_id)
    )
  )
);

revoke all
on public.m26_schema_releases_v43
from anon, authenticated;

revoke all
on public.m26_client_measurements_v43
from anon, authenticated;

revoke all
on public.m26_training_plans_v43
from anon, authenticated;

revoke all
on public.m26_training_sessions_v43
from anon, authenticated;

revoke all
on public.m26_messages_v43
from anon, authenticated;

revoke all
on public.m26_audit_events_v43
from anon, authenticated;

grant select, insert, update, delete
on public.m26_client_measurements_v43
to authenticated;

grant select, insert, update, delete
on public.m26_training_plans_v43
to authenticated;

grant select, insert, update, delete
on public.m26_training_sessions_v43
to authenticated;

grant select, insert
on public.m26_messages_v43
to authenticated;

grant update (read_at)
on public.m26_messages_v43
to authenticated;

grant select
on public.m26_audit_events_v43
to authenticated;

create or replace function public.m26_backend_health_v43()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $m26$
  with backend_tables as (
    select unnest(
      array[
        'public.m26_schema_releases_v43',
        'public.m26_client_measurements_v43',
        'public.m26_training_plans_v43',
        'public.m26_training_sessions_v43',
        'public.m26_messages_v43',
        'public.m26_audit_events_v43'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,
      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from backend_tables
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 6 and rls_count = 6,
    'version',
    'RC43',
    'environment',
    'canary',
    'tables',
    table_count,
    'rlsTables',
    rls_count,
    'productionModified',
    false,
    'productionDeployed',
    false
  )
  from table_state;
$m26$;

revoke all
on function public.m26_backend_health_v43()
from public;

grant execute
on function public.m26_backend_health_v43()
to anon, authenticated;

create or replace function public.m26_backend_bootstrap_v43()
returns jsonb
language sql
stable
set search_path = ''
as $m26$
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    true,
    'version',
    'RC43',
    'userId',
    auth.uid(),
    'clientId',
    public.iberfit_client_id(),
    'counts',
    jsonb_build_object(
      'measurements',
      (
        select count(*)
        from public.m26_client_measurements_v43
      ),
      'plans',
      (
        select count(*)
        from public.m26_training_plans_v43
      ),
      'sessions',
      (
        select count(*)
        from public.m26_training_sessions_v43
      ),
      'messages',
      (
        select count(*)
        from public.m26_messages_v43
      )
    )
  )
  where auth.uid() is not null;
$m26$;

revoke all
on function public.m26_backend_bootstrap_v43()
from public, anon;

grant execute
on function public.m26_backend_bootstrap_v43()
to authenticated;

create or replace function public.m26_record_measurement_v43(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_metric text;
  v_value numeric;
  v_unit text;
  v_source text;
  v_measured_at timestamptz;
  v_notes text;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_metric := lower(
    trim(p_payload ->> 'metric')
  );

  v_value := (
    p_payload ->> 'value'
  )::numeric;

  v_unit := trim(
    p_payload ->> 'unit'
  );

  v_source := coalesce(
    nullif(
      lower(trim(p_payload ->> 'source')),
      ''
    ),
    'manual'
  );

  v_measured_at := coalesce(
    nullif(
      p_payload ->> 'measuredAt',
      ''
    )::timestamptz,
    now()
  );

  v_notes := nullif(
    trim(p_payload ->> 'notes'),
    ''
  );

  v_metadata := coalesce(
    p_payload -> 'metadata',
    '{}'::jsonb
  );

  insert into public.m26_client_measurements_v43 (
    client_id,
    metric,
    value,
    unit,
    measured_at,
    source,
    notes,
    metadata
  )
  values (
    v_client_id,
    v_metric,
    v_value,
    v_unit,
    v_measured_at,
    v_source,
    v_notes,
    v_metadata
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$m26$;

revoke all
on function public.m26_record_measurement_v43(jsonb)
from public, anon;

grant execute
on function public.m26_record_measurement_v43(jsonb)
to authenticated;

create or replace function public.m26_save_training_session_v43(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_plan_id uuid;
  v_title text;
  v_status text;
  v_scheduled_at timestamptz;
  v_session_payload jsonb;
  v_result_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_id := nullif(
    p_payload ->> 'id',
    ''
  )::uuid;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_plan_id := nullif(
    p_payload ->> 'planId',
    ''
  )::uuid;

  v_title := trim(
    p_payload ->> 'title'
  );

  v_status := coalesce(
    nullif(
      lower(trim(p_payload ->> 'status')),
      ''
    ),
    'planned'
  );

  v_scheduled_at := nullif(
    p_payload ->> 'scheduledAt',
    ''
  )::timestamptz;

  v_session_payload := coalesce(
    p_payload -> 'session',
    '{}'::jsonb
  );

  v_result_payload := coalesce(
    p_payload -> 'result',
    '{}'::jsonb
  );

  if v_id is null then
    insert into public.m26_training_sessions_v43 (
      client_id,
      plan_id,
      title,
      status,
      scheduled_at,
      session_payload,
      result_payload
    )
    values (
      v_client_id,
      v_plan_id,
      v_title,
      v_status,
      v_scheduled_at,
      v_session_payload,
      v_result_payload
    )
    returning id into v_id;
  else
    update public.m26_training_sessions_v43
    set
      plan_id = v_plan_id,
      title = v_title,
      status = v_status,
      scheduled_at = v_scheduled_at,
      session_payload = v_session_payload,
      result_payload = v_result_payload
    where id = v_id
      and client_id = v_client_id
    returning id into v_id;

    if not found then
      raise exception 'M26_RC43_SESSION_NOT_FOUND';
    end if;
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$m26$;

revoke all
on function public.m26_save_training_session_v43(jsonb)
from public, anon;

grant execute
on function public.m26_save_training_session_v43(jsonb)
to authenticated;

create or replace function public.m26_send_message_v43(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_body := trim(
    p_payload ->> 'body'
  );

  insert into public.m26_messages_v43 (
    client_id,
    body
  )
  values (
    v_client_id,
    v_body
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$m26$;

revoke all
on function public.m26_send_message_v43(jsonb)
from public, anon;

grant execute
on function public.m26_send_message_v43(jsonb)
to authenticated;

insert into public.m26_schema_releases_v43 (
  version,
  environment,
  production_modified,
  production_deployed
)
values (
  'RC43',
  'canary',
  false,
  false
)
on conflict (version)
do update set
  environment = excluded.environment,
  applied_at = now(),
  production_modified = false,
  production_deployed = false;

do $m26_postcheck$
declare
  v_tables integer;
  v_rls integer;
begin
  select count(*)
  into v_tables
  from unnest(
    array[
      'public.m26_schema_releases_v43',
      'public.m26_client_measurements_v43',
      'public.m26_training_plans_v43',
      'public.m26_training_sessions_v43',
      'public.m26_messages_v43',
      'public.m26_audit_events_v43'
    ]
  ) as relations(relation_name)
  where to_regclass(relation_name) is not null;

  select count(*)
  into v_rls
  from pg_catalog.pg_class
  where oid = any (
    array[
      'public.m26_schema_releases_v43'::regclass,
      'public.m26_client_measurements_v43'::regclass,
      'public.m26_training_plans_v43'::regclass,
      'public.m26_training_sessions_v43'::regclass,
      'public.m26_messages_v43'::regclass,
      'public.m26_audit_events_v43'::regclass
    ]
  )
  and relrowsecurity is true;

  if v_tables <> 6 then
    raise exception 'M26_RC43_TABLE_POSTCHECK_FAILED';
  end if;

  if v_rls <> 6 then
    raise exception 'M26_RC43_RLS_POSTCHECK_FAILED';
  end if;

  if to_regprocedure(
    'public.m26_backend_health_v43()'
  ) is null then
    raise exception 'M26_RC43_HEALTH_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_backend_bootstrap_v43()'
  ) is null then
    raise exception 'M26_RC43_BOOTSTRAP_RPC_MISSING';
  end if;
end
$m26_postcheck$;

commit;
