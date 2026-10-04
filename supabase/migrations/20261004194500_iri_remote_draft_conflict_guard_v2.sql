-- IBERFIT M26 · IRI remote draft conflict guard v2
-- Prevents silent last-write-wins across tabs/devices while keeping the local-first workflow.
begin;

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
  v_expected_remote_revision bigint;
  v_current_draft jsonb;
  v_current_client_revision bigint;
  v_current_revision bigint;
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
  v_expected_remote_revision := greatest(
    coalesce(nullif(p_payload ->> 'remoteRevision','')::bigint,0),
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

  perform pg_advisory_xact_lock(
    hashtextextended(
      auth.uid()::text || ':' || v_client_id::text || ':' || v_assessment_id::text,
      0
    )
  );

  select
    id,
    draft_payload,
    client_revision,
    revision,
    updated_at
  into
    v_id,
    v_current_draft,
    v_current_client_revision,
    v_current_revision,
    v_updated_at
  from private.m26_iri_drafts_v1
  where owner_user_id = auth.uid()
    and client_id = v_client_id
    and assessment_id = v_assessment_id
  for update;

  if found then
    if v_expected_remote_revision <> v_current_revision then
      return jsonb_build_object(
        'ok', true,
        'saved', false,
        'conflict', true,
        'id', v_id,
        'clientId', v_client_id,
        'assessmentId', v_assessment_id,
        'revision', v_current_revision,
        'clientRevision', v_current_client_revision,
        'updatedAt', v_updated_at,
        'draft', v_current_draft
      );
    end if;

    if v_current_draft is not distinct from v_draft
       and v_current_client_revision = v_client_revision then
      return jsonb_build_object(
        'ok', true,
        'saved', true,
        'unchanged', true,
        'conflict', false,
        'id', v_id,
        'clientId', v_client_id,
        'assessmentId', v_assessment_id,
        'revision', v_current_revision,
        'clientRevision', v_current_client_revision,
        'updatedAt', v_updated_at
      );
    end if;

    update private.m26_iri_drafts_v1
    set
      draft_payload = v_draft,
      client_revision = v_client_revision,
      revision = revision + 1,
      updated_at = now()
    where id = v_id
    returning revision,updated_at
    into v_current_revision,v_updated_at;

    return jsonb_build_object(
      'ok', true,
      'saved', true,
      'unchanged', false,
      'conflict', false,
      'id', v_id,
      'clientId', v_client_id,
      'assessmentId', v_assessment_id,
      'revision', v_current_revision,
      'clientRevision', v_client_revision,
      'updatedAt', v_updated_at
    );
  end if;

  if v_expected_remote_revision <> 0 then
    return jsonb_build_object(
      'ok', true,
      'saved', false,
      'conflict', true,
      'missing', true,
      'clientId', v_client_id,
      'assessmentId', v_assessment_id,
      'revision', 0,
      'clientRevision', 0,
      'updatedAt', null,
      'draft', null
    );
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
  returning id,revision,updated_at
  into v_id,v_current_revision,v_updated_at;

  return jsonb_build_object(
    'ok', true,
    'saved', true,
    'unchanged', false,
    'conflict', false,
    'id', v_id,
    'clientId', v_client_id,
    'assessmentId', v_assessment_id,
    'revision', v_current_revision,
    'clientRevision', v_client_revision,
    'updatedAt', v_updated_at
  );
end
$function$;

comment on function public.m26_iri_draft_upsert_v1(jsonb)
is 'IBERFIT-POLICY: IRI remote draft compare-and-swap. remoteRevision must match the current row revision; conflicts return both revision metadata and the current remote draft without overwriting either side.';

commit;
