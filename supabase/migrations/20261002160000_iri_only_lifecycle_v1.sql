-- IBERFIT · standalone IRI lifecycle.
-- A paid IRI can exist as a complete person record without becoming an active training client.
-- Coach assignment remains an authorization relationship and is not equivalent to active training.

alter table public.iberfit_client_lifecycle_events
  drop constraint if exists iberfit_client_lifecycle_events_status_check;

alter table public.iberfit_client_lifecycle_events
  add constraint iberfit_client_lifecycle_events_status_check
  check (status = any(array[
    'lead','onboarding','iri_only','active','paused','inactive','reactivation'
  ]::text[]));

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
  v_engagement text:=lower(btrim(coalesce(v_payload->>'engagementType','training')));
  v_coach_raw text:=btrim(coalesce(v_payload->>'coachUserId',''));
  v_coach uuid;
  v_client text;
  v_assignment uuid;
  v_result jsonb;
  v_create_payload jsonb;
  v_create_command jsonb;
  v_latest_lifecycle text;
begin
  perform public.iberfit_require_privileged_assurance_v65d();

  if v_actor is null then
    raise exception 'V26_ADMIN_CLIENT_CREATE_AUTH_REQUIRED' using errcode='28000';
  end if;

  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then
    raise exception 'V26_ADMIN_CLIENT_CREATE_ORGANIZATION_REQUIRED' using errcode='42501';
  end if;

  if v_engagement not in ('training','iri_only') then
    raise exception 'V26_ADMIN_CLIENT_CREATE_ENGAGEMENT_INVALID' using errcode='22023';
  end if;

  if v_coach_raw<>'' then
    begin
      v_coach:=v_coach_raw::uuid;
    exception when others then
      raise exception 'V26_ADMIN_CLIENT_CREATE_COACH_INVALID' using errcode='22023';
    end;
    perform public.iberfit_assert_org_user_scope_v65e(v_org,v_coach,true,'coach');
  end if;

  v_create_payload:=v_payload||jsonb_build_object(
    'engagementType',v_engagement,
    'profile',coalesce(v_payload->'profile','{}'::jsonb)||jsonb_build_object('engagementType',v_engagement)
  );

  if v_engagement='iri_only' then
    v_create_payload:=v_create_payload||jsonb_build_object(
      'modality',coalesce(nullif(btrim(v_payload->>'modality'),''),'Presencial'),
      'frequency','Solo IRI · sin recurrencia',
      'objective',coalesce(nullif(btrim(coalesce(v_payload->>'objective',v_payload->>'primaryObjective')),''),'Diagnóstico IRI independiente')
    );
  end if;

  v_create_command:=jsonb_set(p_command,'{payload}',v_create_payload,true);

  -- Canonical create + lifecycle/access adjustments remain inside one transaction.
  v_result:=public.iberfit_admin_create_client_v26_pre_privileged_assurance(
    v_create_command,
    v_context
  );

  v_client:=btrim(coalesce(v_result->>'clientId',v_result->>'entityId',''));
  if v_client='' then
    raise exception 'V26_ADMIN_CLIENT_CREATE_RESULT_INVALID' using errcode='P0001';
  end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);

  if v_engagement='iri_only' then
    select e.status into v_latest_lifecycle
    from public.iberfit_client_lifecycle_events e
    where e.organization_id=v_org and e.client_id=v_client
    order by e.effective_at desc,e.created_at desc
    limit 1;

    if v_latest_lifecycle is distinct from 'iri_only' then
      insert into public.iberfit_client_lifecycle_events(
        organization_id,client_id,status,reason,changed_by
      ) values(
        v_org,v_client,'iri_only','Servicio independiente: Diagnóstico IRI sin entrenamiento activo.',v_actor
      );
    end if;

    update public.client_access_v26
    set status='sin_acceso',
        invitation_delivery_status=null,
        invitation_error_code=null,
        updated_at=now(),
        revision=revision+1
    where client_id=v_client::uuid
      and status='invitacion_pendiente'
      and auth_user_id is null;

    update public.client_intake_profiles
    set onboarding_status='iri_only',updated_at=now(),updated_by=v_actor
    where client_id=v_client::uuid;

    v_result:=v_result||jsonb_build_object(
      'engagementType','iri_only',
      'invitation',jsonb_build_object(
        'accessStatus','sin_acceso',
        'deliveryStatus',null,
        'reason','iri_only_no_invitation'
      )
    );
  else
    v_result:=v_result||jsonb_build_object('engagementType','training');
  end if;

  if v_coach is null then
    return v_result;
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
      case when v_engagement='iri_only'
        then 'Asignación para evaluación e informe IRI; no implica entrenamiento activo.'
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
  do update set status='active',updated_at=now(),revision=public.iberfit_conversation_threads.revision+1;

  return v_result||jsonb_build_object(
    'coachAssignment',
    jsonb_build_object(
      'id',v_assignment,
      'coachUserId',v_coach,
      'clientId',v_client,
      'status','active',
      'purpose',case when v_engagement='iri_only' then 'iri' else 'training' end
    )
  );
end
$function$;

revoke all on function public.iberfit_admin_create_client_v26(jsonb,jsonb)
  from public,anon,authenticated;
