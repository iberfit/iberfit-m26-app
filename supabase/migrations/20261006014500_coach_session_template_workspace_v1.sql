-- IBERFIT · Coach Planning Productivity 360
-- Workspace remoto de plantillas de sesión por Coach/Admin.
-- Aditivo. No modifica borradores por cliente ni sesiones publicadas.

begin;



create or replace function public.iberfit_coach_template_workspace_safe_v1(
  p_value jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_templates jsonb;
  v_template jsonb;
  v_versions jsonb;
  v_version jsonb;
  v_snapshot jsonb;
begin
  if p_value is null
    or jsonb_typeof(p_value) <> 'object'
    or octet_length(p_value::text) > 900000
    or p_value ->> 'schemaVersion' <> 'iberfit.session-template.v1'
  then
    return false;
  end if;

  v_templates := p_value -> 'templates';
  if jsonb_typeof(v_templates) <> 'array'
    or jsonb_array_length(v_templates) > 20
  then
    return false;
  end if;

  for v_template in
    select value from jsonb_array_elements(v_templates)
  loop
    if jsonb_typeof(v_template) <> 'object'
      or length(trim(coalesce(v_template ->> 'id',''))) not between 1 and 160
      or length(trim(coalesce(v_template ->> 'name',''))) not between 1 and 60
      or length(coalesce(v_template ->> 'updatedAt','')) > 64
    then
      return false;
    end if;

    v_versions := v_template -> 'versions';
    if jsonb_typeof(v_versions) <> 'array'
      or jsonb_array_length(v_versions) not between 1 and 5
    then
      return false;
    end if;

    for v_version in
      select value from jsonb_array_elements(v_versions)
    loop
      if jsonb_typeof(v_version) <> 'object'
        or length(coalesce(v_version ->> 'createdAt','')) > 64
      then
        return false;
      end if;

      v_snapshot := v_version -> 'snapshot';
      if jsonb_typeof(v_snapshot) <> 'object'
        or not public.m26_json_safe_v43(v_snapshot)
      then
        return false;
      end if;
    end loop;
  end loop;

  return true;
exception
  when others then
    return false;
end
$function$;

revoke all
on function public.iberfit_coach_template_workspace_safe_v1(jsonb)
from public, anon;

grant execute
on function public.iberfit_coach_template_workspace_safe_v1(jsonb)
to authenticated;

-- IBERFIT-TABLE-ACCESS: public.coach_session_template_workspaces_v1 :: Workspace personal de plantillas visible y editable sólo por su Coach/Admin propietario autenticado; service_role queda reservado a operaciones backend y QA.
-- IBERFIT-POLICY: public.coach_session_template_workspaces_v1 = rls-client
create table if not exists public.coach_session_template_workspaces_v1 (
  id uuid primary key default gen_random_uuid(),

  owner_user_id uuid not null default auth.uid()
    references auth.users(id)
    on delete cascade,

  workspace_payload jsonb not null
    check (
      public.iberfit_coach_template_workspace_safe_v1(workspace_payload)
    ),

  revision bigint not null default 1
    check (revision > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_user_id)
);

create index if not exists coach_session_template_workspaces_updated_v1
on public.coach_session_template_workspaces_v1 (
  owner_user_id,
  updated_at desc
);

create trigger coach_session_template_workspaces_touch_v1
before update
on public.coach_session_template_workspaces_v1
for each row
execute function public.m26_touch_updated_at_v43();

create trigger coach_session_template_workspaces_audit_v1
after insert or update
on public.coach_session_template_workspaces_v1
for each row
execute function public.m26_audit_row_v43();

alter table public.coach_session_template_workspaces_v1
  enable row level security;

create policy coach_session_template_workspace_select_v1
on public.coach_session_template_workspaces_v1
for select
to authenticated
using (
  owner_user_id = (select auth.uid())
  and (select public.iberfit_role())::text in ('coach','admin')
);

create policy coach_session_template_workspace_insert_v1
on public.coach_session_template_workspaces_v1
for insert
to authenticated
with check (
  owner_user_id = (select auth.uid())
  and (select public.iberfit_role())::text in ('coach','admin')
);

create policy coach_session_template_workspace_update_v1
on public.coach_session_template_workspaces_v1
for update
to authenticated
using (
  owner_user_id = (select auth.uid())
  and (select public.iberfit_role())::text in ('coach','admin')
)
with check (
  owner_user_id = (select auth.uid())
  and (select public.iberfit_role())::text in ('coach','admin')
);

revoke all
on table public.coach_session_template_workspaces_v1
from public, anon, authenticated;

grant select, insert, update
on table public.coach_session_template_workspaces_v1
to authenticated;

grant all
on table public.coach_session_template_workspaces_v1
to service_role;

create or replace function public.iberfit_coach_template_workspace_get_v1()
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_id uuid;
  v_workspace jsonb;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'IBERFIT_COACH_TEMPLATE_AUTH_REQUIRED';
  end if;

  if coalesce(public.iberfit_role()::text,'') not in ('coach','admin') then
    raise exception 'IBERFIT_COACH_TEMPLATE_ROLE_FORBIDDEN';
  end if;

  select id, workspace_payload, revision, updated_at
  into v_id, v_workspace, v_revision, v_updated_at
  from public.coach_session_template_workspaces_v1
  where owner_user_id = auth.uid()
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'found', false,
      'revision', 0
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'id', v_id,
    'workspace', v_workspace,
    'revision', v_revision,
    'updatedAt', v_updated_at
  );
end
$function$;

revoke all
on function public.iberfit_coach_template_workspace_get_v1()
from public, anon;

grant execute
on function public.iberfit_coach_template_workspace_get_v1()
to authenticated;

create or replace function public.iberfit_coach_template_workspace_upsert_v1(
  p_payload jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_workspace jsonb;
  v_remote_revision bigint;
  v_id uuid;
  v_current_workspace jsonb;
  v_current_revision bigint;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'IBERFIT_COACH_TEMPLATE_AUTH_REQUIRED';
  end if;

  if coalesce(public.iberfit_role()::text,'') not in ('coach','admin') then
    raise exception 'IBERFIT_COACH_TEMPLATE_ROLE_FORBIDDEN';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 950000
  then
    raise exception 'IBERFIT_COACH_TEMPLATE_PAYLOAD_INVALID';
  end if;

  v_workspace := p_payload -> 'workspace';
  v_remote_revision := greatest(
    coalesce(nullif(p_payload ->> 'remoteRevision','')::bigint,0),
    0
  );

  if not public.iberfit_coach_template_workspace_safe_v1(v_workspace) then
    raise exception 'IBERFIT_COACH_TEMPLATE_WORKSPACE_INVALID';
  end if;

  select id, workspace_payload, revision, updated_at
  into v_id, v_current_workspace, v_current_revision, v_updated_at
  from public.coach_session_template_workspaces_v1
  where owner_user_id = auth.uid()
  for update;

  if found then
    if v_remote_revision <> v_current_revision then
      return jsonb_build_object(
        'ok', true,
        'saved', false,
        'conflict', true,
        'found', true,
        'id', v_id,
        'workspace', v_current_workspace,
        'revision', v_current_revision,
        'updatedAt', v_updated_at
      );
    end if;

    update public.coach_session_template_workspaces_v1
    set
      workspace_payload = v_workspace,
      revision = revision + 1
    where id = v_id
    returning revision, updated_at
    into v_revision, v_updated_at;

    return jsonb_build_object(
      'ok', true,
      'saved', true,
      'conflict', false,
      'found', true,
      'id', v_id,
      'workspace', v_workspace,
      'revision', v_revision,
      'updatedAt', v_updated_at
    );
  end if;

  if v_remote_revision <> 0 then
    return jsonb_build_object(
      'ok', true,
      'saved', false,
      'conflict', true,
      'found', false,
      'workspace', null,
      'revision', 0
    );
  end if;

  insert into public.coach_session_template_workspaces_v1 (
    owner_user_id,
    workspace_payload
  )
  values (
    auth.uid(),
    v_workspace
  )
  on conflict (owner_user_id)
  do nothing
  returning id, revision, updated_at
  into v_id, v_revision, v_updated_at;

  if v_id is not null then
    return jsonb_build_object(
      'ok', true,
      'saved', true,
      'conflict', false,
      'found', true,
      'id', v_id,
      'workspace', v_workspace,
      'revision', v_revision,
      'updatedAt', v_updated_at
    );
  end if;

  select id, workspace_payload, revision, updated_at
  into v_id, v_current_workspace, v_current_revision, v_updated_at
  from public.coach_session_template_workspaces_v1
  where owner_user_id = auth.uid()
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'saved', false,
    'conflict', true,
    'found', v_id is not null,
    'id', v_id,
    'workspace', v_current_workspace,
    'revision', coalesce(v_current_revision,0),
    'updatedAt', v_updated_at
  );
end
$function$;

revoke all
on function public.iberfit_coach_template_workspace_upsert_v1(jsonb)
from public, anon;

grant execute
on function public.iberfit_coach_template_workspace_upsert_v1(jsonb)
to authenticated;

notify pgrst, 'reload schema';



commit;
