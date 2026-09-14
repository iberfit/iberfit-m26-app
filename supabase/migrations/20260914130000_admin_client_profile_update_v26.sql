-- Real Admin client profile editing.
-- Keeps access identity/email separate, protects confirmed IRI history, uses
-- optimistic concurrency on clients.revision and leaves an auditable receipt.

create or replace function public.iberfit_admin_update_client_profile_v26(
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
  v_actor uuid:=auth.uid();
  v_org uuid;
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_op text:=btrim(coalesce(p_command->>'operationId',''));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_client uuid;
  v_base_revision bigint;
  v_current_revision bigint;
  v_new_revision bigint;
  v_name text:=btrim(coalesce(v_payload->>'name',''));
  v_objective text:=btrim(coalesce(v_payload->>'objective',v_payload->>'primaryObjective',''));
  v_modality public.client_modality;
  v_weekly integer;
  v_duration integer;
  v_frequency text;
  v_profile_id uuid;
  v_old_profile jsonb;
  v_profile jsonb;
  v_iri_id uuid;
  v_existing jsonb;
  v_existing_actor uuid;
  v_existing_type text;
  v_audit uuid;
  v_result jsonb;
begin
  perform public.iberfit_require_privileged_assurance_v65d();

  if v_actor is null then
    raise exception 'V26_CLIENT_PROFILE_AUTH_REQUIRED' using errcode='28000';
  end if;
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then
    raise exception 'V26_CLIENT_PROFILE_ADMIN_REQUIRED' using errcode='42501';
  end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then
    raise exception 'V26_CLIENT_PROFILE_ORGANIZATION_REQUIRED' using errcode='42501';
  end if;
  if v_type<>'ADMIN_CLIENTE_ACTUALIZAR_FICHA' or v_op='' then
    raise exception 'V26_CLIENT_PROFILE_COMMAND_INVALID' using errcode='22023';
  end if;

  begin v_client:=(v_payload->>'clientId')::uuid;
  exception when others then
    raise exception 'V26_CLIENT_PROFILE_CLIENT_INVALID' using errcode='22023';
  end;
  begin v_base_revision:=(p_command->>'baseRevision')::bigint;
  exception when others then
    raise exception 'V26_CLIENT_PROFILE_REVISION_INVALID' using errcode='22023';
  end;
  if v_base_revision is null or v_base_revision<0 then
    raise exception 'V26_CLIENT_PROFILE_REVISION_INVALID' using errcode='22023';
  end if;

  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client::text);

  select r.result,r.actor_user_id,r.command_type
    into v_existing,v_existing_actor,v_existing_type
  from public.iberfit_admin_mutation_receipts r
  where r.operation_id=v_op;
  if found then
    if v_existing_actor is distinct from v_actor or v_existing_type<>v_type then
      raise exception 'V14_OPERATION_COLLISION' using errcode='23505';
    end if;
    return v_existing||jsonb_build_object('kind','duplicate');
  end if;

  if char_length(v_name)<2 or char_length(v_name)>200 then
    raise exception 'V26_CLIENT_PROFILE_NAME_INVALID' using errcode='22023';
  end if;
  if v_objective='' or char_length(v_objective)>1000 then
    raise exception 'V26_CLIENT_PROFILE_OBJECTIVE_INVALID' using errcode='22023';
  end if;
  begin v_modality:=(v_payload->>'modality')::public.client_modality;
  exception when others then
    raise exception 'V26_CLIENT_PROFILE_MODALITY_INVALID' using errcode='22023';
  end;
  begin v_weekly:=nullif(btrim(coalesce(v_payload->>'weeklyFrequency','')),'')::integer;
  exception when others then
    raise exception 'V26_CLIENT_PROFILE_FREQUENCY_INVALID' using errcode='22023';
  end;
  begin v_duration:=nullif(btrim(coalesce(v_payload->>'sessionDurationMinutes','')),'')::integer;
  exception when others then
    raise exception 'V26_CLIENT_PROFILE_DURATION_INVALID' using errcode='22023';
  end;
  if v_weekly is null or v_weekly<1 or v_weekly>14 then
    raise exception 'V26_CLIENT_PROFILE_FREQUENCY_INVALID' using errcode='22023';
  end if;
  if v_duration is null or v_duration<20 or v_duration>240 or mod(v_duration,5)<>0 then
    raise exception 'V26_CLIENT_PROFILE_DURATION_INVALID' using errcode='22023';
  end if;
  v_frequency:=v_weekly::text||' sesiones por semana';

  perform pg_advisory_xact_lock(hashtextextended(v_client::text,0));

  select c.revision into v_current_revision
  from public.clients c
  where c.id=v_client
  for update;
  if not found then
    raise exception 'V26_CLIENT_PROFILE_NOT_FOUND' using errcode='P0002';
  end if;
  if v_current_revision<>v_base_revision then
    raise exception 'V26_CLIENT_PROFILE_REVISION_CONFLICT' using errcode='40001';
  end if;

  select p.id,coalesce(p.profile,'{}'::jsonb)
    into v_profile_id,v_old_profile
  from public.client_app_profiles p
  where p.client_id=v_client
  order by p.version desc,p.created_at desc
  limit 1
  for update;
  if v_profile_id is null then
    raise exception 'V26_CLIENT_PROFILE_ROW_MISSING' using errcode='P0001';
  end if;

  v_profile:=(
    v_old_profile - array[
      'phone','birthDate','sexForNorms','preferredContactChannel','preferredContactTime',
      'modality','weeklyFrequency','sessionDurationMinutes','preferredSchedule',
      'commune','trainingAddress','locationType','accessInstructions',
      'primaryObjective','secondaryObjectives','experienceLevel','trainingHistory',
      'currentTraining','restrictions','pain','equipment','equipmentAvailable',
      'preferences','emergencyContactName','emergencyContactRelation','emergencyContactPhone',
      'initialAssessmentMode'
    ]::text[]
  ) || jsonb_strip_nulls(jsonb_build_object(
    'phone',nullif(btrim(coalesce(v_payload->>'phone','')),''),
    'birthDate',nullif(btrim(coalesce(v_payload->>'birthDate','')),''),
    'sexForNorms',nullif(btrim(coalesce(v_payload->>'sexForNorms','')),''),
    'preferredContactChannel',nullif(btrim(coalesce(v_payload->>'preferredContactChannel','')),''),
    'preferredContactTime',nullif(btrim(coalesce(v_payload->>'preferredContactTime','')),''),
    'modality',v_modality::text,
    'weeklyFrequency',v_weekly,
    'sessionDurationMinutes',v_duration,
    'preferredSchedule',nullif(btrim(coalesce(v_payload->>'preferredSchedule','')),''),
    'commune',nullif(btrim(coalesce(v_payload->>'zone',v_payload->>'commune','')),''),
    'trainingAddress',nullif(btrim(coalesce(v_payload->>'address',v_payload->>'trainingAddress','')),''),
    'locationType',nullif(btrim(coalesce(v_payload->>'locationType','')),''),
    'accessInstructions',nullif(btrim(coalesce(v_payload->>'accessInstructions','')),''),
    'primaryObjective',v_objective,
    'secondaryObjectives',nullif(btrim(coalesce(v_payload->>'secondaryObjectives','')),''),
    'experienceLevel',nullif(btrim(coalesce(v_payload->>'level',v_payload->>'experienceLevel','')),''),
    'trainingHistory',nullif(btrim(coalesce(v_payload->>'history',v_payload->>'trainingHistory','')),''),
    'currentTraining',nullif(btrim(coalesce(v_payload->>'currentTraining','')),''),
    'restrictions',nullif(btrim(coalesce(v_payload->>'restrictions','')),''),
    'pain',nullif(btrim(coalesce(v_payload->>'pain','')),''),
    'equipment',nullif(btrim(coalesce(v_payload->>'equipment','')),''),
    'equipmentAvailable',nullif(btrim(coalesce(v_payload->>'equipment','')),''),
    'preferences',nullif(btrim(coalesce(v_payload->>'preferences','')),''),
    'emergencyContactName',nullif(btrim(coalesce(v_payload->>'emergencyContactName','')),''),
    'emergencyContactRelation',nullif(btrim(coalesce(v_payload->>'emergencyContactRelation','')),''),
    'emergencyContactPhone',nullif(btrim(coalesce(v_payload->>'emergencyContactPhone','')),''),
    'initialAssessmentMode',coalesce(nullif(btrim(coalesce(v_payload->>'initialAssessmentMode','')),''),'iri')
  ));

  update public.clients c
  set name=v_name,
      modality=v_modality,
      objective=v_objective,
      revision=c.revision+1,
      updated_at=now()
  where c.id=v_client and c.revision=v_base_revision
  returning c.revision into v_new_revision;
  if not found then
    raise exception 'V26_CLIENT_PROFILE_REVISION_CONFLICT' using errcode='40001';
  end if;

  update public.client_intake_profiles i
  set address=nullif(btrim(coalesce(v_payload->>'address',v_payload->>'trainingAddress','')),''),
      zone=nullif(btrim(coalesce(v_payload->>'zone',v_payload->>'commune','')),''),
      level=nullif(btrim(coalesce(v_payload->>'level',v_payload->>'experienceLevel','')),''),
      frequency=v_frequency,
      restrictions=nullif(btrim(coalesce(v_payload->>'restrictions','')),''),
      pain=nullif(btrim(coalesce(v_payload->>'pain','')),''),
      history=nullif(btrim(coalesce(v_payload->>'history',v_payload->>'trainingHistory','')),''),
      equipment=nullif(btrim(coalesce(v_payload->>'equipment','')),''),
      preferences=nullif(btrim(coalesce(v_payload->>'preferences','')),''),
      updated_by=v_actor,
      updated_at=now()
  where i.client_id=v_client;
  if not found then
    raise exception 'V26_CLIENT_PROFILE_INTAKE_MISSING' using errcode='P0001';
  end if;

  update public.client_app_profiles p
  set modality=v_modality,
      profile=v_profile,
      revision=p.revision+1
  where p.id=v_profile_id;

  update public.user_profiles up
  set display_name=v_name
  where up.client_id=v_client and lower(up.role::text)='client';

  select i.id into v_iri_id
  from public.iri_assessments i
  where i.client_id=v_client
    and i.assessment_type='inicial'
    and i.status='borrador'
  order by i.created_at desc
  limit 1
  for update;

  if v_iri_id is not null then
    update public.iri_assessments i
    set sections=jsonb_set(coalesce(i.sections,'{}'::jsonb),'{personProfile}',v_profile,true),
        updated_at=now()
    where i.id=v_iri_id and i.client_id=v_client and i.status='borrador';

    update public.domain_entities_v26 d
    set body=jsonb_set(coalesce(d.body,'{}'::jsonb),'{personProfile}',v_profile,true),
        updated_at=now()
    where d.entity_type='iri'
      and d.entity_id=v_iri_id
      and d.client_id=v_client
      and d.status='borrador';
  end if;

  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,
    entity_type,entity_id,summary,trace_id,revision
  ) values(
    v_org,'ADMIN_CLIENTE_ACTUALIZAR_FICHA',v_actor,'admin',
    'client',v_client::text,'Ficha operativa del cliente actualizada.',
    v_op,least(v_new_revision,2147483647)::integer
  ) returning id into v_audit;

  v_result:=jsonb_build_object(
    'ok',true,'kind','ack','operationId',v_op,'commandType',v_type,
    'entityId',v_client::text,'clientId',v_client::text,
    'revision',v_new_revision,'auditId',v_audit,'serverTime',now(),
    'iriDraftSynchronized',v_iri_id is not null
  );

  insert into public.iberfit_admin_mutation_receipts(
    operation_id,organization_id,actor_user_id,command_type,result
  ) values(v_op,v_org,v_actor,v_type,v_result);

  return v_result;
end
$function$;

revoke all on function public.iberfit_admin_update_client_profile_v26(jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.iberfit_admin_update_client_profile_v26(jsonb,jsonb)
  to service_role;

create or replace function public.iberfit_admin_execute_v14(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb;
  v_org uuid;
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_target_user uuid;
  v_role text;
  v_client text;
  v_coach uuid;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_context:=public.iberfit_application_context_v14();
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V65E_ADMIN_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then raise exception 'V65E_ORGANIZATION_REQUIRED' using errcode='42501'; end if;
  if v_type='ADMIN_CLIENTE_CREAR' then
    return public.iberfit_admin_create_client_v26(p_command,v_context);
  elsif v_type='ADMIN_CLIENTE_ACTUALIZAR_FICHA' then
    return public.iberfit_admin_update_client_profile_v26(p_command,v_context);
  elsif v_type='ADMIN_USUARIO_ELIMINAR' then
    return public.iberfit_admin_decommission_user_v1(p_command,v_context);
  elsif v_type in ('ADMIN_ROL_OTORGAR','ADMIN_ROL_REVOCAR') then
    begin v_target_user:=(v_payload->>'userId')::uuid; exception when others then raise exception 'V65E_TARGET_USER_INVALID' using errcode='22023'; end;
    v_role:=lower(btrim(coalesce(v_payload->>'role','')));
    if v_role not in ('client','coach','admin') then raise exception 'V65E_ROLE_INVALID' using errcode='22023'; end if;
    perform public.iberfit_assert_org_user_scope_v65e(v_org,v_target_user,v_type='ADMIN_ROL_OTORGAR',null);
    perform public.iberfit_assert_global_role_mutation_scope_v65e(v_org,v_target_user);
  elsif v_type='ADMIN_ASIGNACION_CREAR' then
    begin v_coach:=(v_payload->>'coachUserId')::uuid; exception when others then raise exception 'V65E_COACH_USER_INVALID' using errcode='22023'; end;
    perform public.iberfit_assert_org_user_scope_v65e(v_org,v_coach,true,'coach');
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
  elsif v_type='ADMIN_CLIENTE_ELIMINAR' then
    return public.iberfit_admin_delete_client_v26(p_command,v_context);
  elsif v_type='ADMIN_CLIENTE_CAMBIAR_CICLO' then
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
  end if;
  return public.iberfit_admin_execute_v14_pre_v65e(p_command);
end
$function$;

revoke all on function public.iberfit_admin_execute_v14(jsonb) from public,anon;
grant execute on function public.iberfit_admin_execute_v14(jsonb) to authenticated;
