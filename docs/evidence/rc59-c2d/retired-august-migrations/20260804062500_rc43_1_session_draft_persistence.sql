-- IBERFIT M26 RC43.1 · persistencia remota de borradores.
-- Migración aditiva y exclusiva para Supabase Canary.
-- No elimina ni modifica datos RC43 existentes.

begin;

do $m26_guard$
begin
  if to_regclass(
    'public.m26_schema_releases_v43'
  ) is null then
    raise exception 'M26_RC431_RC43_SCHEMA_REQUIRED';
  end if;

  if to_regclass(
    'public.m26_audit_events_v43'
  ) is null then
    raise exception 'M26_RC431_AUDIT_TABLE_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_json_safe_v43(jsonb)'
  ) is null then
    raise exception 'M26_RC431_JSON_GUARD_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_touch_updated_at_v43()'
  ) is null then
    raise exception 'M26_RC431_TOUCH_TRIGGER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.m26_audit_row_v43()'
  ) is null then
    raise exception 'M26_RC431_AUDIT_TRIGGER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.iberfit_client_id()'
  ) is null then
    raise exception 'M26_RC431_CLIENT_HELPER_REQUIRED';
  end if;

  if to_regprocedure(
    'public.is_assigned_coach(uuid)'
  ) is null then
    raise exception 'M26_RC431_ASSIGNMENT_HELPER_REQUIRED';
  end if;
end
$m26_guard$;

create table if not exists
public.m26_session_drafts_v431 (
  id uuid primary key default gen_random_uuid(),

  owner_user_id uuid not null default auth.uid()
    references auth.users(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  scope text not null default 'session-builder'
    check (
      scope = 'session-builder'
    ),

  draft_payload jsonb not null
    check (
      public.m26_json_safe_v43(draft_payload)
    ),

  client_revision bigint not null default 0
    check (
      client_revision >= 0
    ),

  revision bigint not null default 1
    check (
      revision > 0
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    owner_user_id,
    client_id,
    scope
  )
);

create index if not exists
m26_session_drafts_owner_client_v431
on public.m26_session_drafts_v431 (
  owner_user_id,
  client_id,
  updated_at desc
);

drop trigger if exists
m26_session_drafts_touch_v431
on public.m26_session_drafts_v431;

create trigger m26_session_drafts_touch_v431
before update
on public.m26_session_drafts_v431
for each row
execute function public.m26_touch_updated_at_v43();

drop trigger if exists
m26_session_drafts_audit_v431
on public.m26_session_drafts_v431;

create trigger m26_session_drafts_audit_v431
after insert or update or delete
on public.m26_session_drafts_v431
for each row
execute function public.m26_audit_row_v43();

alter table public.m26_session_drafts_v431
  enable row level security;

drop policy if exists
m26_session_drafts_read_v431
on public.m26_session_drafts_v431;

create policy m26_session_drafts_read_v431
on public.m26_session_drafts_v431
for select
to authenticated
using (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

drop policy if exists
m26_session_drafts_insert_v431
on public.m26_session_drafts_v431;

create policy m26_session_drafts_insert_v431
on public.m26_session_drafts_v431
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

drop policy if exists
m26_session_drafts_update_v431
on public.m26_session_drafts_v431;

create policy m26_session_drafts_update_v431
on public.m26_session_drafts_v431
for update
to authenticated
using (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
)
with check (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

drop policy if exists
m26_session_drafts_delete_v431
on public.m26_session_drafts_v431;

create policy m26_session_drafts_delete_v431
on public.m26_session_drafts_v431
for delete
to authenticated
using (
  owner_user_id = auth.uid()
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

revoke all
on public.m26_session_drafts_v431
from anon, authenticated;

grant select, insert, update, delete
on public.m26_session_drafts_v431
to authenticated;

create or replace function
public.m26_draft_upsert_v431(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_client_id uuid;
  v_scope text;
  v_draft jsonb;
  v_client_revision bigint;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 125000
  then
    raise exception 'M26_RC431_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_scope := coalesce(
    nullif(
      trim(p_payload ->> 'scope'),
      ''
    ),
    'session-builder'
  );

  v_draft := p_payload -> 'draft';

  v_client_revision := greatest(
    coalesce(
      nullif(
        p_payload ->> 'revision',
        ''
      )::bigint,
      0
    ),
    0
  );

  if
    v_client_id is null
    or v_scope <> 'session-builder'
    or jsonb_typeof(v_draft) <> 'object'
    or not public.m26_json_safe_v43(v_draft)
  then
    raise exception 'M26_RC431_DRAFT_INVALID';
  end if;

  if not (
    v_client_id = public.iberfit_client_id()
    or public.is_assigned_coach(v_client_id)
  ) then
    raise exception 'M26_RC431_CLIENT_SCOPE_FORBIDDEN';
  end if;

  insert into public.m26_session_drafts_v431 (
    owner_user_id,
    client_id,
    scope,
    draft_payload,
    client_revision
  )
  values (
    auth.uid(),
    v_client_id,
    v_scope,
    v_draft,
    v_client_revision
  )
  on conflict (
    owner_user_id,
    client_id,
    scope
  )
  do update set
    draft_payload = excluded.draft_payload,
    client_revision = excluded.client_revision,
    updated_at = now()
  returning
    id,
    revision,
    updated_at
  into
    v_id,
    v_revision,
    v_updated_at;

  return jsonb_build_object(
    'ok',
    true,
    'saved',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id,
    'scope',
    v_scope,
    'revision',
    v_revision,
    'clientRevision',
    v_client_revision,
    'updatedAt',
    v_updated_at
  );
end
$m26$;

revoke all
on function public.m26_draft_upsert_v431(jsonb)
from public, anon;

grant execute
on function public.m26_draft_upsert_v431(jsonb)
to authenticated;

create or replace function
public.m26_draft_get_v431(
  p_client_id uuid,
  p_scope text default 'session-builder'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $m26$
declare
  v_id uuid;
  v_draft jsonb;
  v_revision bigint;
  v_client_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope <> 'session-builder'
  then
    raise exception 'M26_RC431_DRAFT_QUERY_INVALID';
  end if;

  if not (
    p_client_id = public.iberfit_client_id()
    or public.is_assigned_coach(p_client_id)
  ) then
    raise exception 'M26_RC431_CLIENT_SCOPE_FORBIDDEN';
  end if;

  select
    id,
    draft_payload,
    revision,
    client_revision,
    updated_at
  into
    v_id,
    v_draft,
    v_revision,
    v_client_revision,
    v_updated_at
  from public.m26_session_drafts_v431
  where owner_user_id = auth.uid()
    and client_id = p_client_id
    and scope = p_scope
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok',
      true,
      'found',
      false,
      'clientId',
      p_client_id,
      'scope',
      p_scope
    );
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'found',
    true,
    'id',
    v_id,
    'clientId',
    p_client_id,
    'scope',
    p_scope,
    'draft',
    v_draft,
    'revision',
    v_revision,
    'clientRevision',
    v_client_revision,
    'updatedAt',
    v_updated_at
  );
end
$m26$;

revoke all
on function
public.m26_draft_get_v431(uuid,text)
from public, anon;

grant execute
on function
public.m26_draft_get_v431(uuid,text)
to authenticated;

create or replace function
public.m26_draft_delete_v431(
  p_client_id uuid,
  p_scope text default 'session-builder'
)
returns jsonb
language plpgsql
set search_path = ''
as $m26$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope <> 'session-builder'
  then
    raise exception 'M26_RC431_DRAFT_QUERY_INVALID';
  end if;

  if not (
    p_client_id = public.iberfit_client_id()
    or public.is_assigned_coach(p_client_id)
  ) then
    raise exception 'M26_RC431_CLIENT_SCOPE_FORBIDDEN';
  end if;

  delete from public.m26_session_drafts_v431
  where owner_user_id = auth.uid()
    and client_id = p_client_id
    and scope = p_scope
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'deleted',
    v_id is not null,
    'clientId',
    p_client_id,
    'scope',
    p_scope
  );
end
$m26$;

revoke all
on function
public.m26_draft_delete_v431(uuid,text)
from public, anon;

grant execute
on function
public.m26_draft_delete_v431(uuid,text)
to authenticated;

create or replace function
public.m26_backend_health_v431()
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
        'public.m26_audit_events_v43',
        'public.m26_session_drafts_v431'
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
  ),
  policy_state as (
    select count(*) as policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'm26_session_drafts_v431'
  ),
  rpc_state as (
    select count(*) as rpc_count
    from unnest(
      array[
        'public.m26_draft_upsert_v431(jsonb)',
        'public.m26_draft_get_v431(uuid,text)',
        'public.m26_draft_delete_v431(uuid,text)'
      ]
    ) as rpc_name
    where to_regprocedure(rpc_name) is not null
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 7
      and rls_count = 7
      and policy_count >= 4
      and rpc_count = 3,
    'version',
    'RC43.1',
    'environment',
    'canary',
    'tables',
    table_count,
    'rlsTables',
    rls_count,
    'draftPolicies',
    policy_count,
    'draftRpcs',
    rpc_count,
    'productionModified',
    false,
    'productionDeployed',
    false
  )
  from table_state
  cross join policy_state
  cross join rpc_state;
$m26$;

revoke all
on function public.m26_backend_health_v431()
from public;

grant execute
on function public.m26_backend_health_v431()
to anon, authenticated;

insert into public.m26_schema_releases_v43 (
  version,
  environment,
  production_modified,
  production_deployed
)
values (
  'RC43.1',
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
  v_rls boolean;
  v_policies integer;
begin
  if to_regclass(
    'public.m26_session_drafts_v431'
  ) is null then
    raise exception 'M26_RC431_TABLE_POSTCHECK_FAILED';
  end if;

  select relrowsecurity
  into v_rls
  from pg_catalog.pg_class
  where oid = 'public.m26_session_drafts_v431'::regclass;

  if v_rls is not true then
    raise exception 'M26_RC431_RLS_POSTCHECK_FAILED';
  end if;

  select count(*)
  into v_policies
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'm26_session_drafts_v431';

  if v_policies < 4 then
    raise exception 'M26_RC431_POLICY_POSTCHECK_FAILED';
  end if;

  if to_regprocedure(
    'public.m26_draft_upsert_v431(jsonb)'
  ) is null then
    raise exception 'M26_RC431_UPSERT_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_draft_get_v431(uuid,text)'
  ) is null then
    raise exception 'M26_RC431_GET_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_draft_delete_v431(uuid,text)'
  ) is null then
    raise exception 'M26_RC431_DELETE_RPC_MISSING';
  end if;

  if to_regprocedure(
    'public.m26_backend_health_v431()'
  ) is null then
    raise exception 'M26_RC431_HEALTH_RPC_MISSING';
  end if;
end
$m26_postcheck$;

commit;
