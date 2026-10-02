-- IBERFIT relationship model · Solo IRI versus active training
-- Safe additive runtime contract: no historical constraint replacement and no existing rows are rewritten.
-- relationshipType is persisted in the client profile JSON; lifecycle continues to describe training activity.

create or replace function public.iberfit_admin_create_client_v26(
  p_command jsonb,
  p_context jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb:=coalesce(p_context,public.iberfit_application_context_v14());
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_actor uuid:=auth.uid();
  v_org uuid;
  v_relationship text:=lower(btrim(coalesce(v_payload->>'relationshipType',v_payload#>>'{profile,relationshipType}','training')));
  v_coach_raw text:=btrim(coalesce(v_payload->>'coachUserId',''));
  v_coach uuid;
  v_client text;
  v_assignment uuid;
  v_result jsonb;
  v_latest_status text;
begin
  perform public.iberfit_require_privileged_assurance_v65d();

  if v_actor is null then
    raise exception 'V26_ADMIN_CLIENT_CREATE_AUTH_REQUIRED' using errcode='28000';
  end if;
  if v_relationship not in ('training','iri_only') then
    raise exception 'V26_ADMIN_CLIENT_CREATE_RELATIONSHIP_INVALID' using errcode='22023';
  end if;

  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then
    raise exception 'V26_ADMIN_CLIENT_CREATE_ORGANIZATION_REQUIRED' using errcode='42501';
  end if;

  if v_coach_raw<>'' then
    begin v_coach:=v_coach_raw::uuid;
    exception when others then
      raise exception 'V26_ADMIN_CLIENT_CREATE_COACH_INVALID' using errcode='22023';
    end;
    perform public.iberfit_assert_org_user_scope_v65e(v_org,v_coach,true,'coach');
  end if;

  v_result:=public.iberfit_admin_create_client_v26_pre_privileged_assurance(
    p_command,
    v_context
  );

  v_client:=btrim(coalesce(v_result->>'clientId',v_result->>'entityId',''));
  if v_client='' then
    raise exception 'V26_ADMIN_CLIENT_CREATE_RESULT_INVALID' using errcode='P0001';
  end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);

  -- A Solo IRI person has no active training lifecycle. Keep the standard lifecycle
  -- vocabulary and append an inactive event instead of mutating historical constraints.
  if v_relationship='iri_only' then
    select e.status into v_latest_status
    from public.iberfit_client_lifecycle_events e
    where e.organization_id=v_org and e.client_id=v_client
    order by e.effective_at desc,e.created_at desc,e.id desc
    limit 1;

    if v_latest_status is distinct from 'inactive' then
      insert into public.iberfit_client_lifecycle_events(
        organization_id,client_id,status,reason,changed_by
      ) values(
        v_org,v_client,'inactive',
        'Servicio puntual Diagnóstico IRI; sin servicio activo de entrenamiento.',
        v_actor
      );
    end if;
  end if;

  -- The Coach relationship remains active for IRI authorization and document custody.
  -- It is not used as a proxy for active training client metrics.
  if v_coach is null then
    return v_result||jsonb_build_object('relationshipType',v_relationship);
  end if;

  select a.id into v_assignment
  from public.iberfit_coach_client_assignments a
  where a.organization_id=v_org
    and a.coach_user_id=v_coach
    and a.client_id=v_client
    and a.status='active'
  order by a.created_at asc
  limit 1;

  if v_assignment is null then
    insert into public.iberfit_coach_client_assignments(
      organization_id,coach_user_id,client_id,status,starts_at,reason,created_by
    ) values(
      v_org,v_coach,v_client,'active',current_date,
      case when v_relationship='iri_only'
        then 'Asignación responsable para custodia y gestión del Diagnóstico IRI.'
        else 'Asignación inicial desde alta de cliente.'
      end,
      v_actor
    )
    returning id into v_assignment;
  end if;

  insert into public.iberfit_conversation_threads(
    organization_id,client_id,coach_user_id,created_by
  ) values(
    v_org,v_client,v_coach,v_actor
  )
  on conflict(organization_id,coach_user_id,client_id)
  do update set
    status='active',
    updated_at=now(),
    revision=public.iberfit_conversation_threads.revision+1;

  return v_result||jsonb_build_object(
    'relationshipType',v_relationship,
    'coachAssignment',
    jsonb_build_object(
      'id',v_assignment,
      'coachUserId',v_coach,
      'clientId',v_client,
      'status','active'
    )
  );
end
$function$;

revoke all on function public.iberfit_admin_create_client_v26(jsonb,jsonb)
  from public,anon,authenticated;
