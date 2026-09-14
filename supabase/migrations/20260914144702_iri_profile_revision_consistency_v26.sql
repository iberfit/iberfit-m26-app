-- IRI/profile consistency hardening.
-- The client record remains the canonical operational profile.
-- Only IRI_COMPLETAR may synchronize personProfile, and it must prove that the
-- canonical client/profile revisions have not changed since the IRI was opened.

create or replace function public.iberfit_execute_command_v26_pre_rc74_4h(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_command jsonb;
  v_command_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_entity_type text;
  v_entity_id uuid;
  v_client_id uuid;
  v_result jsonb;
  v_body jsonb;
  v_status text;
  v_revision bigint;
  v_profile jsonb;
  v_modality public.client_modality;
  v_frequency text;
  v_email text;
  v_profile_id uuid;
  v_expected_client_revision bigint;
  v_expected_profile_revision bigint;
  v_current_client_revision bigint;
  v_current_profile_revision bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_command)<>'object' then raise exception 'INVALID_COMMAND' using errcode='22023'; end if;

  v_entity_type:=nullif(p_command->>'entityType','');
  v_entity_id:=nullif(p_command->>'entityId','')::uuid;
  v_client_id:=nullif(p_command->>'clientId','')::uuid;
  if not public.iberfit_can_access_client_v26(v_client_id) then
    raise exception 'CLIENT_ACCESS_DENIED' using errcode='42501';
  end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','M26_CANARY_NOT_ENABLED','serverAt',now());
  end if;
  if exists(select 1 from public.domain_entities_v26
    where entity_type=v_entity_type and entity_id=v_entity_id and client_id<>v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ENTITY_CLIENT_MISMATCH','serverAt',now());
  end if;

  if v_entity_type='iri' and v_command_type='IRI_COMPLETAR' then
    perform pg_advisory_xact_lock(hashtextextended(v_client_id::text,0));

    if coalesce(p_command#>>'{payload,patch,canonicalClientRevision}','') !~ '^[0-9]+$'
      or coalesce(p_command#>>'{payload,patch,canonicalProfileRevision}','') !~ '^[0-9]+$' then
      return jsonb_build_object(
        'kind','conflict',
        'operationId',p_command->>'operationId',
        'remoteRevision',null,
        'reason','V26_IRI_PROFILE_REVISION_CONFLICT',
        'serverAt',now()
      );
    end if;

    v_expected_client_revision:=(p_command#>>'{payload,patch,canonicalClientRevision}')::bigint;
    v_expected_profile_revision:=(p_command#>>'{payload,patch,canonicalProfileRevision}')::bigint;

    select c.revision
      into v_current_client_revision
    from public.clients c
    where c.id=v_client_id
    for update;
    if not found then
      raise exception 'V26_IRI_PROFILE_CLIENT_NOT_FOUND' using errcode='P0002';
    end if;

    select ap.id,ap.revision
      into v_profile_id,v_current_profile_revision
    from public.client_app_profiles ap
    where ap.client_id=v_client_id
    order by ap.version desc,ap.created_at desc
    limit 1
    for update;
    if v_profile_id is null then
      raise exception 'V26_IRI_PROFILE_ROW_MISSING' using errcode='P0001';
    end if;

    if v_current_client_revision<>v_expected_client_revision
      or v_current_profile_revision<>v_expected_profile_revision then
      return jsonb_build_object(
        'kind','conflict',
        'operationId',p_command->>'operationId',
        'remoteRevision',null,
        'reason','V26_IRI_PROFILE_REVISION_CONFLICT',
        'clientRevision',v_current_client_revision,
        'profileRevision',v_current_profile_revision,
        'serverAt',now()
      );
    end if;
  end if;

  v_command:=public.iberfit_prepare_command_rc30_v26(p_command);
  v_result:=public.iberfit_execute_command_v26_rc29(v_command);

  if v_entity_type='iri' and v_result->>'kind'='ack' then
    select e.body,e.status,e.revision into v_body,v_status,v_revision
    from public.domain_entities_v26 e
    where e.entity_type='iri' and e.entity_id=v_entity_id and e.client_id=v_client_id;
    if v_body is null then
      raise exception using errcode='P0001',message='V123_IRI_DOMAIN_BODY_MISSING_AFTER_ACK';
    end if;

    update public.iri_assessments set
      sections=v_body,
      status=(case v_status when 'completo' then 'revisión' when 'sustituido' then 'retirado'
        when 'anulado' then 'retirado' else v_status end)::public.publication_status,
      revision=v_revision,
      evaluated_at=coalesce(nullif(v_body->>'assessmentDate','')::date,evaluated_at),
      started_at=coalesce(started_at,clock_timestamp()),
      completed_at=case when nullif(v_body->>'firstSessionCompletedAt','') is not null
        then coalesce(completed_at,nullif(v_body->>'firstSessionCompletedAt','')::timestamptz)
        else completed_at end,
      current_step=case when nullif(v_body->>'firstSessionCompletedAt','') is not null then 'planAccion' else current_step end,
      approved_at=case when v_status='aprobado' then coalesce(approved_at,clock_timestamp()) else approved_at end,
      updated_at=clock_timestamp()
    where id=v_entity_id and client_id=v_client_id;
    if not found then raise exception using errcode='P0001',message='V123_IRI_TYPED_ROW_MISSING_AFTER_ACK'; end if;

    if v_command_type='IRI_COMPLETAR' then
      v_profile:=case when jsonb_typeof(v_body->'personProfile')='object' then v_body->'personProfile' else '{}'::jsonb end;
      if v_profile<>'{}'::jsonb then
        v_email:=lower(nullif(btrim(v_profile->>'email'),''));
        if v_email is not null and exists(
          select 1 from public.client_intake_profiles i
          where lower(btrim(i.email))=v_email and i.client_id<>v_client_id
        ) then
          raise exception using errcode='23505',message='V123_PROFILE_EMAIL_ALREADY_EXISTS';
        end if;

        begin
          v_modality:=case v_profile->>'modality'
            when 'presencial' then 'Presencial'::public.client_modality
            when 'hibrido' then 'Híbrido'::public.client_modality
            when 'online' then 'Online'::public.client_modality
            else null end;
        exception when others then v_modality:=null; end;

        v_frequency:=case when coalesce(v_profile->>'weeklyFrequency','') ~ '^[0-9]+$'
          and (v_profile->>'weeklyFrequency')::integer>0
          then (v_profile->>'weeklyFrequency')||' sesiones por semana' else null end;

        update public.client_app_profiles ap
        set profile=coalesce(ap.profile,'{}'::jsonb)||v_profile,
            modality=coalesce(v_modality,ap.modality),
            revision=ap.revision+1
        where ap.id=v_profile_id and ap.revision=v_current_profile_revision
        returning ap.revision into v_current_profile_revision;
        if not found then
          raise exception 'V26_IRI_PROFILE_REVISION_CONFLICT' using errcode='40001';
        end if;

        update public.clients c
        set objective=coalesce(nullif(btrim(v_profile->>'primaryObjective'),''),c.objective),
            modality=coalesce(v_modality,c.modality),
            revision=c.revision+1,
            updated_at=clock_timestamp()
        where c.id=v_client_id and c.revision=v_current_client_revision
        returning c.revision into v_current_client_revision;
        if not found then
          raise exception 'V26_IRI_PROFILE_REVISION_CONFLICT' using errcode='40001';
        end if;

        update public.client_intake_profiles set
          email=coalesce(v_email,email),
          address=coalesce(nullif(btrim(v_profile->>'trainingAddress'),''),address),
          zone=coalesce(nullif(btrim(v_profile->>'commune'),''),zone),
          frequency=coalesce(v_frequency,frequency),
          equipment=coalesce(nullif(btrim(case when jsonb_typeof(v_profile->'equipment')='array'
            then array_to_string(array(select jsonb_array_elements_text(v_profile->'equipment')),', ')
            else v_profile->>'equipment' end),''),equipment),
          preferences=coalesce(nullif(btrim(v_profile->>'preferences'),''),preferences),
          restrictions=coalesce(nullif(btrim(v_body#>>'{interview,restrictions}'),''),restrictions),
          pain=coalesce(nullif(btrim(v_body#>>'{interview,currentPain}'),''),pain),
          history=coalesce(nullif(btrim(v_body#>>'{interview,trainingHistory}'),''),history),
          updated_by=auth.uid(),updated_at=clock_timestamp()
        where client_id=v_client_id;

        v_result:=v_result||jsonb_build_object(
          'clientRevision',v_current_client_revision,
          'profileRevision',v_current_profile_revision
        );
      end if;
    end if;
  end if;

  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end
$function$;

revoke all on function public.iberfit_execute_command_v26_pre_rc74_4h(jsonb)
  from public,anon,authenticated;
grant execute on function public.iberfit_execute_command_v26_pre_rc74_4h(jsonb)
  to service_role;
