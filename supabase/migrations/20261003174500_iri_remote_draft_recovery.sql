-- IBERFIT M26 · IRI remote draft recovery v1
-- Migración estrictamente aditiva: no modifica ni elimina el backend RC43.1 de sesiones.
begin;

create table if not exists private.m26_iri_drafts_v1 (
  id uuid primary key default gen_random_uuid(),

  owner_user_id uuid not null default auth.uid()
    references auth.users(id)
    on delete cascade,

  client_id uuid not null
    references public.clients(id)
    on delete cascade,

  assessment_id uuid not null
    references public.iri_assessments(id)
    on delete cascade,

  draft_payload jsonb not null
    check (public.m26_json_safe_v43(draft_payload)),

  client_revision bigint not null default 0
    check (client_revision >= 0),

  revision bigint not null default 1
    check (revision > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_user_id, client_id, assessment_id)
);

create index if not exists m26_iri_drafts_owner_client_updated_v1
on private.m26_iri_drafts_v1 (
  owner_user_id,
  client_id,
  updated_at desc
);

create index if not exists m26_iri_drafts_assessment_v1
on private.m26_iri_drafts_v1 (
  assessment_id
);

alter table private.m26_iri_drafts_v1
  enable row level security;

create policy m26_iri_drafts_read_v1
on private.m26_iri_drafts_v1
for select
to authenticated
using (
  owner_user_id = (select auth.uid())
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

create policy m26_iri_drafts_insert_v1
on private.m26_iri_drafts_v1
for insert
to authenticated
with check (
  owner_user_id = (select auth.uid())
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

create policy m26_iri_drafts_update_v1
on private.m26_iri_drafts_v1
for update
to authenticated
using (
  owner_user_id = (select auth.uid())
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
)
with check (
  owner_user_id = (select auth.uid())
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

create policy m26_iri_drafts_delete_v1
on private.m26_iri_drafts_v1
for delete
to authenticated
using (
  owner_user_id = (select auth.uid())
  and (
    client_id = public.iberfit_client_id()
    or public.is_assigned_coach(client_id)
  )
);

revoke all on private.m26_iri_drafts_v1 from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant select, insert, update, delete on private.m26_iri_drafts_v1 to authenticated, service_role;

create or replace function public.m26_iri_draft_get_v1(
  p_client_id uuid,
  p_assessment_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_id uuid;
  v_draft jsonb;
  v_revision bigint;
  v_client_revision bigint;
  v_updated_at timestamptz;
begin
  perform public.iberfit_require_privileged_assurance_v65d();

  if auth.uid() is null then
    raise exception 'M26_IRI_DRAFT_AUTH_REQUIRED';
  end if;

  if p_client_id is null or p_assessment_id is null then
    raise exception 'M26_IRI_DRAFT_QUERY_INVALID';
  end if;

  if not (
    p_client_id = public.iberfit_client_id()
    or public.is_assigned_coach(p_client_id)
  ) then
    raise exception 'M26_IRI_DRAFT_CLIENT_SCOPE_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.iri_assessments assessment
    where assessment.id = p_assessment_id
      and assessment.client_id = p_client_id
  ) then
    raise exception 'M26_IRI_DRAFT_ASSESSMENT_SCOPE_FORBIDDEN';
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
  from private.m26_iri_drafts_v1
  where owner_user_id = auth.uid()
    and client_id = p_client_id
    and assessment_id = p_assessment_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'found', false,
      'clientId', p_client_id,
      'assessmentId', p_assessment_id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'id', v_id,
    'clientId', p_client_id,
    'assessmentId', p_assessment_id,
    'draft', v_draft,
    'revision', v_revision,
    'clientRevision', v_client_revision,
    'updatedAt', v_updated_at
  );
end
$function$;

create or replace function public.m26_iri_draft_upsert_v1(p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_id uuid;
  v_client_id uuid;
  v_assessment_id uuid;
  v_draft jsonb;
  v_client_revision bigint;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  perform public.iberfit_require_privileged_assurance_v65d();

  if auth.uid() is null then
    raise exception 'M26_IRI_DRAFT_AUTH_REQUIRED';
  end if;

  if jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 125000 then
    raise exception 'M26_IRI_DRAFT_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(p_payload ->> 'clientId','')::uuid;
  v_assessment_id := nullif(p_payload ->> 'assessmentId','')::uuid;
  v_draft := p_payload -> 'draft';
  v_client_revision := greatest(
    coalesce(nullif(p_payload ->> 'revision','')::bigint,0),
    0
  );

  if v_client_id is null
     or v_assessment_id is null
     or jsonb_typeof(v_draft) <> 'object'
     or not public.m26_json_safe_v43(v_draft)
     or nullif(v_draft ->> 'clientId','') is distinct from v_client_id::text
     or nullif(v_draft ->> 'assessmentId','') is distinct from v_assessment_id::text then
    raise exception 'M26_IRI_DRAFT_INVALID';
  end if;

  if not (
    v_client_id = public.iberfit_client_id()
    or public.is_assigned_coach(v_client_id)
  ) then
    raise exception 'M26_IRI_DRAFT_CLIENT_SCOPE_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.iri_assessments assessment
    where assessment.id = v_assessment_id
      and assessment.client_id = v_client_id
  ) then
    raise exception 'M26_IRI_DRAFT_ASSESSMENT_SCOPE_FORBIDDEN';
  end if;

  insert into private.m26_iri_drafts_v1 (
    owner_user_id,
    client_id,
    assessment_id,
    draft_payload,
    client_revision
  )
  values (
    auth.uid(),
    v_client_id,
    v_assessment_id,
    v_draft,
    v_client_revision
  )
  on conflict (owner_user_id,client_id,assessment_id)
  do update set
    draft_payload = excluded.draft_payload,
    client_revision = excluded.client_revision,
    revision = private.m26_iri_drafts_v1.revision + 1,
    updated_at = now()
  returning id,revision,updated_at
  into v_id,v_revision,v_updated_at;

  return jsonb_build_object(
    'ok', true,
    'saved', true,
    'id', v_id,
    'clientId', v_client_id,
    'assessmentId', v_assessment_id,
    'revision', v_revision,
    'clientRevision', v_client_revision,
    'updatedAt', v_updated_at
  );
end
$function$;

create or replace function public.m26_iri_draft_delete_v1(
  p_client_id uuid,
  p_assessment_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  perform public.iberfit_require_privileged_assurance_v65d();

  if auth.uid() is null then
    raise exception 'M26_IRI_DRAFT_AUTH_REQUIRED';
  end if;

  if p_client_id is null or p_assessment_id is null then
    raise exception 'M26_IRI_DRAFT_QUERY_INVALID';
  end if;

  if not (
    p_client_id = public.iberfit_client_id()
    or public.is_assigned_coach(p_client_id)
  ) then
    raise exception 'M26_IRI_DRAFT_CLIENT_SCOPE_FORBIDDEN';
  end if;

  delete from private.m26_iri_drafts_v1
  where owner_user_id = auth.uid()
    and client_id = p_client_id
    and assessment_id = p_assessment_id
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'deleted', v_id is not null,
    'clientId', p_client_id,
    'assessmentId', p_assessment_id
  );
end
$function$;

revoke all on function public.m26_iri_draft_get_v1(uuid,uuid) from public, anon;
revoke all on function public.m26_iri_draft_upsert_v1(jsonb) from public, anon;
revoke all on function public.m26_iri_draft_delete_v1(uuid,uuid) from public, anon;

grant execute on function public.m26_iri_draft_get_v1(uuid,uuid) to authenticated, service_role;
grant execute on function public.m26_iri_draft_upsert_v1(jsonb) to authenticated, service_role;
grant execute on function public.m26_iri_draft_delete_v1(uuid,uuid) to authenticated, service_role;

commit;
