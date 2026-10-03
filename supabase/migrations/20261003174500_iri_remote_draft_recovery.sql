-- IBERFIT M26 · IRI remote draft recovery
-- Extiende el backend RC43.1 existente sin crear una segunda superficie de borradores.
begin;

alter table public.m26_session_drafts_v431
  drop constraint if exists m26_session_drafts_v431_scope_check;

alter table public.m26_session_drafts_v431
  add constraint m26_session_drafts_v431_scope_check
  check (scope in ('session-builder','iri-first-session'));

create or replace function public.m26_draft_get_v431(
  p_client_id uuid,
  p_scope text default 'session-builder'
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
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope not in ('session-builder','iri-first-session')
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
      'ok', true,
      'found', false,
      'clientId', p_client_id,
      'scope', p_scope
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'id', v_id,
    'clientId', p_client_id,
    'scope', p_scope,
    'draft', v_draft,
    'revision', v_revision,
    'clientRevision', v_client_revision,
    'updatedAt', v_updated_at
  );
end
$function$;

create or replace function public.m26_draft_upsert_v431(p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  v_id uuid;
  v_client_id uuid;
  v_scope text;
  v_draft jsonb;
  v_client_revision bigint;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 125000
  then
    raise exception 'M26_RC431_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(p_payload ->> 'clientId','')::uuid;
  v_scope := coalesce(nullif(trim(p_payload ->> 'scope'),''),'session-builder');
  v_draft := p_payload -> 'draft';
  v_client_revision := greatest(
    coalesce(nullif(p_payload ->> 'revision','')::bigint,0),
    0
  );

  if
    v_client_id is null
    or v_scope not in ('session-builder','iri-first-session')
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
  on conflict (owner_user_id,client_id,scope)
  do update set
    draft_payload = excluded.draft_payload,
    client_revision = excluded.client_revision,
    updated_at = now()
  returning id,revision,updated_at
  into v_id,v_revision,v_updated_at;

  return jsonb_build_object(
    'ok', true,
    'saved', true,
    'id', v_id,
    'clientId', v_client_id,
    'scope', v_scope,
    'revision', v_revision,
    'clientRevision', v_client_revision,
    'updatedAt', v_updated_at
  );
end
$function$;

create or replace function public.m26_draft_delete_v431(
  p_client_id uuid,
  p_scope text default 'session-builder'
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
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope not in ('session-builder','iri-first-session')
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
    'ok', true,
    'deleted', v_id is not null,
    'clientId', p_client_id,
    'scope', p_scope
  );
end
$function$;

revoke all on function public.m26_draft_get_v431(uuid,text) from public, anon;
revoke all on function public.m26_draft_upsert_v431(jsonb) from public, anon;
revoke all on function public.m26_draft_delete_v431(uuid,text) from public, anon;

grant execute on function public.m26_draft_get_v431(uuid,text) to authenticated, service_role;
grant execute on function public.m26_draft_upsert_v431(jsonb) to authenticated, service_role;
grant execute on function public.m26_draft_delete_v431(uuid,text) to authenticated, service_role;

commit;
