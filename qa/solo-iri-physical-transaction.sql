-- QA ONLY: synthetic technical fixture for Solo IRI physical-consent / command-bus certification.
-- It intentionally bypasses commercial client creation because that path is certified separately
-- in qa/iri-only-lifecycle-transaction.sql. No Auth user/session is created.
-- Every database fixture rolls back.

begin;
do $test$
declare
  actor uuid;
  client uuid:=gen_random_uuid();
  iri uuid:=gen_random_uuid();
  op uuid:=gen_random_uuid();
  result jsonb;
  denied boolean:=false;
  email text:='qa-iri-physical-'||gen_random_uuid()::text||'@example.invalid';
begin
  select p.user_id into actor
  from public.user_profiles p
  where lower(p.role::text)='admin'
  order by p.user_id limit 1;
  if actor is null then raise exception 'QA_ADMIN_REQUIRED'; end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',actor,'role','authenticated','aal','aal1')::text,
    true
  );

  insert into public.clients(id,name,modality,objective,revision)
  values(client,'QA Synthetic Solo IRI','Presencial','QA physical IRI certification',0);

  insert into public.client_app_profiles(client_id,modality,profile,version,revision,status,created_by)
  values(
    client,'Presencial',
    jsonb_build_object('email',email,'modality','presencial','primaryObjective','QA physical IRI certification'),
    1,0,'borrador',actor
  );

  insert into public.client_intake_profiles(
    client_id,email,frequency,onboarding_status,created_by,updated_by
  ) values(client,email,'','expediente',actor,actor);

  insert into public.iri_assessments(
    id,client_id,sections,status,revision,created_by,assessment_type,protocol_version,current_step
  ) values(iri,client,'{}'::jsonb,'borrador',0,actor,'inicial','4.0.0','contexto');

  insert into public.domain_entities_v26(
    entity_type,entity_id,client_id,status,revision,body,source_table,source_revision
  ) values(
    'iri',iri,client,'borrador',0,
    jsonb_build_object('id',iri,'clientId',client,'status','borrador','revision',0),
    'iri_assessments',0
  );

  insert into public.m26_canary_clients_v26(client_id,active,enabled_by,enabled_at,reason)
  values(client,true,actor,now(),'QA synthetic transaction');

  denied:=false;
  begin
    update public.iri_assessments set status='revisión' where id=iri;
  exception when others then
    denied:=sqlerrm='IRI_V4_PHYSICAL_CONSENT_REQUIRED';
  end;
  if not denied then raise exception 'QA_PHYSICAL_CONSENT_GUARD_FAILED'; end if;

  perform public.iberfit_record_iri_consent_v1(
    client,iri,'physical_assessment','granted','qa-physical-v1','Synthetic QA'
  );
  perform public.iberfit_record_iri_consent_v1(
    client,iri,'photography','declined','qa-photo-v1','Independent synthetic QA decline'
  );
  if not public.iberfit_iri_consent_active_v1(iri,'physical_assessment') then
    raise exception 'QA_PHYSICAL_CONSENT_INACTIVE';
  end if;
  if public.iberfit_iri_consent_active_v1(iri,'photography') then
    raise exception 'QA_PHOTO_DECLINE_FAILED';
  end if;

  result:=public.iberfit_execute_command_v26(jsonb_build_object(
    'operationId',op,
    'type','IRI_COMPLETAR',
    'entityType','iri',
    'entityId',iri,
    'clientId',client,
    'baseRevision',0,
    'payload',jsonb_build_object(
      'patch',jsonb_build_object(
        'canonicalClientRevision',0,
        'canonicalProfileRevision',0,
        'assessmentDate',current_date::text,
        'birthDate','1990-04-10',
        'sexForNorms','female',
        'firstSessionSchema','iri-first-session-v4',
        'firstSessionCompletedAt',now()::text,
        'personProfile',jsonb_build_object(
          'email',email,
          'birthDate','1990-04-10',
          'sexForNorms','female',
          'modality','presencial',
          'primaryObjective','QA physical IRI certification'
        ),
        'bodyComposition',jsonb_build_object(
          'skipped',false,'weightKg',70,'heightCm',165,'bodyFatPercent',30
        ),
        'strengthAssessment',jsonb_build_object(
          'skipped',false,
          'lowerBody',jsonb_build_object('skipped',false),
          'squat60',jsonb_build_object('repetitions',30,'valid',true),
          'push',jsonb_build_object('skipped',false,'variant','knees','repetitions',12,'valid',true),
          'trxRow',jsonb_build_object('skipped',true,'skipReason','QA sin TRX'),
          'core',jsonb_build_object('skipped',false,'frontPlankSeconds',45)
        ),
        'cardio',jsonb_build_object(
          'skipped',false,'protocol','treadmill-3min-field','durationSeconds',180,
          'speedKmh',5.5,'inclinePercent',1,'locomotionMode','walk',
          'hrMethod','chest-strap','recoveryMode','standing-passive',
          'finalHr',145,'oneMinuteHr',118,'valid',true
        ),
        'diagnosis',jsonb_build_object(
          'strengths',jsonb_build_array('QA fortaleza'),
          'priorities',jsonb_build_array('QA prioridad'),
          'coachInterpretation','Interpretación profesional sintética para certificar el flujo IRI completo.',
          'initialPlan','Plan inicial sintético para certificar el flujo IRI sin entrenamiento activo.',
          'reviewAccepted',true
        )
      )
    )
  ));

  if result->>'kind'<>'ack' then
    raise exception 'QA_IRI_COMMAND_NOT_ACK:%',result::text;
  end if;

  if not exists(
    select 1 from public.iri_assessments a
    where a.id=iri and a.status='revisión'
      and a.current_step='planAccion'
      and a.completed_at is not null
  ) then raise exception 'QA_TYPED_IRI_NOT_COMPLETED'; end if;

  if not exists(
    select 1 from public.domain_entities_v26 e
    where e.entity_type='iri'
      and e.entity_id=iri
      and e.client_id=client
      and e.status='completo'
      and e.body#>>'{cardio,protocol}'='treadmill-3min-field'
      and e.body#>>'{strengthAssessment,push,variant}'='knees'
      and (e.body#>>'{strengthAssessment,trxRow,skipped}')::boolean=true
  ) then raise exception 'QA_DOMAIN_IRI_FIELD_PAYLOAD_FAILED'; end if;

  perform public.iberfit_record_iri_consent_v1(
    client,iri,'photography','granted','qa-photo-v1','Grant after explicit decline'
  );
  if not public.iberfit_iri_consent_active_v1(iri,'photography') then
    raise exception 'QA_PHOTO_GRANT_FAILED';
  end if;
  if not public.iberfit_iri_consent_active_v1(iri,'physical_assessment') then
    raise exception 'QA_PHYSICAL_CONSENT_CHANGED';
  end if;
  if exists(
    select 1 from public.iri_photogrammetry_captures_v1 p
    where p.client_id=client
  ) then raise exception 'QA_PHOTO_CAPTURE_INVENTED'; end if;
end
$test$;

select 'Solo IRI physical consent / independent photo consent / IRI_COMPLETAR / typed+domain persistence: PASS; fixtures rolled back' as certification;
rollback;
