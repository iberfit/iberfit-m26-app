-- IBERFIT · Persona → IRI → Servicio de entrenamiento v1
-- Canonical goals:
--   1) clients remains the physical person/record root for backward-compatible FKs.
--   2) IRI is independent: 0..1 protected initial diagnosis + 0..N longitudinal reevaluations.
--   3) Training service is an independent append-only dimension.
--   4) IRI is recommended, never a technical prerequisite for training.
--   5) Legacy iri_only remains readable historical data but is no longer written as a service state.

-- QA contains an older experimental service table from pre-production work.
-- It is intentionally left untouched: production never received it, and the canonical
-- v1 table below has a different name. No destructive cleanup belongs in this migration.

-- IBERFIT-TABLE-ACCESS: public.iberfit_training_service_events_v1 :: Canonical append-only service history; application users never access the table directly and all mutations cross the privileged Admin RPC membrane.
-- IBERFIT-POLICY: public.iberfit_training_service_events_v1 = service-role-only
create table if not exists public.iberfit_training_service_events_v1(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.iberfit_organizations(id) on delete restrict,
  person_id uuid not null references public.clients(id) on delete restrict,
  status text not null check(status in ('active','paused','ended')),
  reason text not null check(char_length(reason) between 3 and 500),
  changed_by uuid not null references auth.users(id),
  effective_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now()
);

comment on table public.iberfit_training_service_events_v1 is
  'Append-only training-service history. public.clients is the backward-compatible physical person root. IRI assessments are independent and never imply an active training service.';

create index if not exists iberfit_training_service_events_v1_org_person_effective_idx
  on public.iberfit_training_service_events_v1(
    organization_id,person_id,effective_at desc,created_at desc,id desc
  );

alter table public.iberfit_training_service_events_v1 enable row level security;
alter table public.iberfit_training_service_events_v1 force row level security;
revoke all on table public.iberfit_training_service_events_v1 from public,anon,authenticated;
grant select,insert on table public.iberfit_training_service_events_v1 to service_role;

-- Existing installations historically treated every non-iri_only person as training.
-- Preserve that meaning once, without manufacturing service for IRI-only/lead records.
with latest as (
  select distinct on (e.organization_id,e.client_id)
    e.organization_id,
    e.client_id,
    e.status,
    e.effective_at,
    e.created_at
  from public.iberfit_client_lifecycle_events e
  order by e.organization_id,e.client_id,e.effective_at desc,e.created_at desc,e.id desc
),
mapped as (
  select
    l.organization_id,
    l.client_id::uuid as person_id,
    case
      when l.status in ('onboarding','active','reactivation') then 'active'
      when l.status='paused' then 'paused'
      when l.status='inactive' then 'ended'
      else null
    end as training_status,
    l.effective_at
  from latest l
  where l.client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
insert into public.iberfit_training_service_events_v1(
  organization_id,person_id,status,reason,changed_by,effective_at
)
select
  m.organization_id,
  m.person_id,
  m.training_status,
  'Migración Persona/IRI/Servicio: se conserva la relación de entrenamiento histórica conocida.',
  coalesce((
    select e.changed_by
    from public.iberfit_client_lifecycle_events e
    where e.organization_id=m.organization_id
      and e.client_id=m.person_id::text
    order by e.effective_at desc,e.created_at desc,e.id desc
    limit 1
  ),(
    select p.user_id
    from public.user_profiles p
    where lower(p.role::text)='admin'
    order by p.user_id
    limit 1
  )),
  m.effective_at
from mapped m
where m.training_status is not null
  and exists(select 1 from public.clients c where c.id=m.person_id)
  and not exists(
    select 1
    from public.iberfit_training_service_events_v1 s
    where s.organization_id=m.organization_id
      and s.person_id=m.person_id
  );

-- Initial diagnosis and longitudinal reassessment are intentionally separate.
-- iri_assessments remains the protected 0..1 initial diagnosis. Follow-up/evolution
-- uses a dedicated append-only-compatible table, avoiding any relaxation of the
-- initial-only constraint or its unique baseline index.
-- IBERFIT-TABLE-ACCESS: public.iri_reevaluations_v1 :: Private longitudinal assessment storage; exposed only through governed IRI workflows, never by direct client/coach table access.
-- IBERFIT-POLICY: public.iri_reevaluations_v1 = service-role-only
create table if not exists public.iri_reevaluations_v1(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.iberfit_organizations(id) on delete restrict,
  person_id uuid not null references public.clients(id) on delete restrict,
  initial_assessment_id uuid not null references public.iri_assessments(id) on delete restrict,
  sequence integer not null check(sequence>=1),
  status text not null default 'borrador'
    check(status in ('borrador','revision','completo','publicado')),
  evaluated_at date,
  protocol_version text not null default '1.0.0',
  sections jsonb not null default '{}'::jsonb
    check(jsonb_typeof(sections)='object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id,sequence)
);

comment on table public.iri_reevaluations_v1 is
  'Longitudinal IRI reassessments. Kept physically separate from the unique initial diagnosis so follow-up/evolution never mutates baseline semantics.';

create index if not exists iri_reevaluations_v1_person_evaluated_idx
  on public.iri_reevaluations_v1(person_id,evaluated_at desc,sequence desc);

alter table public.iri_reevaluations_v1 enable row level security;
alter table public.iri_reevaluations_v1 force row level security;
revoke all on table public.iri_reevaluations_v1 from public,anon,authenticated;
grant select,insert,update on table public.iri_reevaluations_v1 to service_role;

create or replace function public.iberfit_admin_set_training_service_v1(
  p_command jsonb,
  p_context jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb:=coalesce(p_context,public.iberfit_application_context_v14());
  v_org uuid;
  v_actor uuid:=auth.uid();
  v_op text:=btrim(coalesce(p_command->>'operationId',''));
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_person uuid;
  v_status text:=lower(btrim(coalesce(v_payload->>'status','')));
  v_reason text:=btrim(coalesce(p_command->>'reason',''));
  v_existing jsonb;
  v_current text;
  v_event uuid;
  v_audit uuid;
  v_lifecycle text;
  v_result jsonb;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception 'V1_TRAINING_SERVICE_AUTH_REQUIRED' using errcode='28000'; end if;
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V1_TRAINING_SERVICE_ADMIN_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then raise exception 'V1_TRAINING_SERVICE_ORGANIZATION_REQUIRED' using errcode='42501'; end if;
  if v_type<>'ADMIN_CLIENTE_CAMBIAR_SERVICIO' then raise exception 'V1_TRAINING_SERVICE_COMMAND_INVALID' using errcode='22023'; end if;
  if v_op='' then raise exception 'V14_OPERATION_ID_INVALID' using errcode='22023'; end if;
  if char_length(v_reason)<3 or char_length(v_reason)>500 then raise exception 'V14_REASON_REQUIRED' using errcode='22023'; end if;
  if v_status not in ('active','paused','ended') then raise exception 'V1_TRAINING_SERVICE_STATUS_INVALID' using errcode='22023'; end if;
  begin v_person:=(v_payload->>'clientId')::uuid;
  exception when others then raise exception 'V1_TRAINING_SERVICE_PERSON_INVALID' using errcode='22023'; end;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_person::text);

  select r.result into v_existing
  from public.iberfit_admin_mutation_receipts r
  where r.operation_id=v_op and r.actor_user_id=v_actor and r.command_type=v_type;
  if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate'); end if;
  if exists(select 1 from public.iberfit_admin_mutation_receipts r where r.operation_id=v_op) then
    raise exception 'V14_OPERATION_COLLISION' using errcode='23505';
  end if;

  select s.status into v_current
  from public.iberfit_training_service_events_v1 s
  where s.organization_id=v_org and s.person_id=v_person
  order by s.effective_at desc,s.created_at desc,s.id desc
  limit 1;

  if v_current is distinct from v_status then
    insert into public.iberfit_training_service_events_v1(
      organization_id,person_id,status,reason,changed_by
    ) values(v_org,v_person,v_status,v_reason,v_actor)
    returning id into v_event;
  end if;

  -- Compatibility projection only. Training service remains the canonical source.
  v_lifecycle:=case
    when v_status='active' and v_current='ended' then 'reactivation'
    when v_status='active' then 'active'
    when v_status='paused' then 'paused'
    else 'inactive'
  end;
  if coalesce((
    select e.status
    from public.iberfit_client_lifecycle_events e
    where e.organization_id=v_org and e.client_id=v_person::text
    order by e.effective_at desc,e.created_at desc,e.id desc
    limit 1
  ),'')<>v_lifecycle then
    insert into public.iberfit_client_lifecycle_events(
      organization_id,client_id,status,reason,changed_by
    ) values(v_org,v_person::text,v_lifecycle,v_reason,v_actor);
  end if;

  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,
    entity_type,entity_id,summary,trace_id,revision
  ) values(
    v_org,'ADMIN_CLIENTE_CAMBIAR_SERVICIO',v_actor,'admin','client',v_person::text,
    concat('Servicio de entrenamiento actualizado a ',v_status,'.'),v_op,1
  ) returning id into v_audit;

  v_result:=jsonb_build_object(
    'ok',true,'kind',case when v_event is null then 'noop' else 'ack' end,
    'operationId',v_op,'commandType',v_type,
    'entityId',v_person::text,'clientId',v_person::text,
    'trainingServiceStatus',v_status,
    'trainingServiceEventId',v_event,
    'auditId',v_audit,'serverTime',now()
  );
  insert into public.iberfit_admin_mutation_receipts(
    operation_id,organization_id,actor_user_id,command_type,result
  ) values(v_op,v_org,v_actor,v_type,v_result);
  return v_result;
end
$function$;

revoke all on function public.iberfit_admin_set_training_service_v1(jsonb,jsonb) from public,anon;
grant execute on function public.iberfit_admin_set_training_service_v1(jsonb,jsonb) to authenticated,service_role;

-- Person records must remain editable without inventing training frequency/duration.
-- Reuse the mature audited profile mutation and restore training-only fields inside
-- the same transaction when no training service is active or paused.
alter function public.iberfit_admin_update_client_profile_v26(jsonb,jsonb)
  rename to iberfit_admin_update_client_profile_v26_pre_person_service_v1;

create or replace function public.iberfit_admin_update_client_profile_v26(
  p_command jsonb,
  p_context jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb:=coalesce(p_context,public.iberfit_application_context_v14());
  v_org uuid:=nullif(v_context->>'organizationId','')::uuid;
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_person uuid;
  v_service text;
  v_weekly_missing boolean;
  v_duration_missing boolean;
  v_profile_id uuid;
  v_profile_before jsonb;
  v_profile_after jsonb;
  v_frequency_before text;
  v_command jsonb;
  v_result jsonb;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if auth.uid() is null then raise exception 'V26_CLIENT_PROFILE_AUTH_REQUIRED' using errcode='28000'; end if;
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V26_CLIENT_PROFILE_ADMIN_REQUIRED' using errcode='42501'; end if;
  if v_org is null then raise exception 'V26_CLIENT_PROFILE_ORGANIZATION_REQUIRED' using errcode='42501'; end if;

  begin v_person:=(v_payload->>'clientId')::uuid;
  exception when others then raise exception 'V26_CLIENT_PROFILE_CLIENT_INVALID' using errcode='22023'; end;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_person::text);

  select e.status into v_service
  from public.iberfit_training_service_events_v1 e
  where e.organization_id=v_org and e.person_id=v_person
  order by e.effective_at desc,e.created_at desc,e.id desc
  limit 1;

  if v_service in ('active','paused') then
    return public.iberfit_admin_update_client_profile_v26_pre_person_service_v1(
      p_command,v_context
    );
  end if;

  v_weekly_missing:=nullif(btrim(coalesce(v_payload->>'weeklyFrequency','')),'') is null;
  v_duration_missing:=nullif(btrim(coalesce(v_payload->>'sessionDurationMinutes','')),'') is null;

  select p.id,coalesce(p.profile,'{}'::jsonb)
    into v_profile_id,v_profile_before
  from public.client_app_profiles p
  where p.client_id=v_person
  order by p.version desc,p.created_at desc
  limit 1;

  select i.frequency into v_frequency_before
  from public.client_intake_profiles i
  where i.client_id=v_person;

  if v_profile_id is null or v_frequency_before is null then
    raise exception 'V1_PERSON_PROFILE_SOURCE_MISSING' using errcode='P0001';
  end if;

  v_payload:=v_payload||jsonb_build_object(
    'weeklyFrequency',case
      when v_weekly_missing then to_jsonb(1)
      else v_payload->'weeklyFrequency'
    end,
    'sessionDurationMinutes',case
      when v_duration_missing then to_jsonb(60)
      else v_payload->'sessionDurationMinutes'
    end
  );
  v_command:=jsonb_set(p_command,'{payload}',v_payload,true);

  v_result:=public.iberfit_admin_update_client_profile_v26_pre_person_service_v1(
    v_command,v_context
  );
  if coalesce(v_result->>'kind','')='duplicate' then return v_result; end if;

  if v_weekly_missing or v_duration_missing then
    select coalesce(p.profile,'{}'::jsonb) into v_profile_after
    from public.client_app_profiles p
    where p.id=v_profile_id
    for update;

    if v_weekly_missing then
      v_profile_after:=case
        when v_profile_before?'weeklyFrequency'
          then jsonb_set(v_profile_after,'{weeklyFrequency}',v_profile_before->'weeklyFrequency',true)
        else v_profile_after-'weeklyFrequency'
      end;
    end if;
    if v_duration_missing then
      v_profile_after:=case
        when v_profile_before?'sessionDurationMinutes'
          then jsonb_set(v_profile_after,'{sessionDurationMinutes}',v_profile_before->'sessionDurationMinutes',true)
        else v_profile_after-'sessionDurationMinutes'
      end;
    end if;

    update public.client_app_profiles
    set profile=v_profile_after
    where id=v_profile_id;

    update public.client_intake_profiles
    set frequency=v_frequency_before
    where client_id=v_person;
  end if;

  return v_result||jsonb_build_object(
    'trainingFieldsRequired',false,
    'trainingServiceStatus',coalesce(v_service,'none')
  );
end
$function$;

revoke all on function public.iberfit_admin_update_client_profile_v26(jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.iberfit_admin_update_client_profile_v26(jsonb,jsonb)
  to service_role;

-- Dispatch the new canonical service command without copying the legacy command membrane.
alter function public.iberfit_admin_execute_v14(jsonb)
  rename to iberfit_admin_execute_v14_pre_person_service_v1;

create or replace function public.iberfit_admin_execute_v14(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
begin
  if v_type='ADMIN_CLIENTE_CAMBIAR_SERVICIO' then
    return public.iberfit_admin_set_training_service_v1(
      p_command,
      public.iberfit_application_context_v14()
    );
  end if;
  return public.iberfit_admin_execute_v14_pre_person_service_v1(p_command);
end
$function$;

revoke all on function public.iberfit_admin_execute_v14(jsonb) from public,anon;
grant execute on function public.iberfit_admin_execute_v14(jsonb) to authenticated,service_role;

-- Keep the mature creation pipeline, but normalize its public semantics:
-- entryIntent=iri creates a person + IRI with no training service;
-- entryIntent=training activates training independently of IRI.
alter function public.iberfit_admin_create_client_v26(jsonb,jsonb)
  rename to iberfit_admin_create_client_v26_pre_person_service_v1;

create or replace function public.iberfit_admin_create_client_v26(
  p_command jsonb,
  p_context jsonb default null::jsonb
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
  v_entry text:=lower(btrim(coalesce(
    nullif(v_payload->>'entryIntent',''),
    case when lower(btrim(coalesce(v_payload->>'relationshipType','')) )='iri_only' then 'iri' else 'training' end
  )));
  v_assessment text:=lower(btrim(coalesce(v_payload->>'initialAssessmentMode','iri')));
  v_access text;
  v_email text:=lower(btrim(coalesce(v_payload->>'email','')));
  v_existing_person uuid;
  v_had_iri boolean:=false;
  v_result jsonb;
  v_person uuid;
  v_created_iri uuid;
  v_cleaned_placeholder boolean:=false;
  v_deleted integer:=0;
  v_current_service text;
  v_current_lifecycle text;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception 'V26_ADMIN_CLIENT_CREATE_AUTH_REQUIRED' using errcode='28000'; end if;
  if v_entry not in ('iri','training') then raise exception 'V1_PERSON_ENTRY_INTENT_INVALID' using errcode='22023'; end if;
  if v_assessment not in ('iri','deferred') then raise exception 'V1_INITIAL_ASSESSMENT_MODE_INVALID' using errcode='22023'; end if;
  if v_entry='iri' then v_assessment:='iri'; end if;
  v_access:=lower(btrim(coalesce(
    nullif(v_payload->>'accessMode',''),
    case when v_entry='iri' then 'internal' else 'app' end
  )));
  if v_access not in ('internal','app') then raise exception 'V26_ADMIN_CLIENT_CREATE_ACCESS_MODE_INVALID' using errcode='22023'; end if;

  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then raise exception 'V26_ADMIN_CLIENT_CREATE_ORGANIZATION_REQUIRED' using errcode='42501'; end if;

  select i.client_id into v_existing_person
  from public.client_intake_profiles i
  where lower(btrim(i.email))=v_email
  order by i.client_id
  limit 1;
  if v_existing_person is not null then
    select exists(select 1 from public.iri_assessments a where a.client_id=v_existing_person)
    into v_had_iri;
  end if;

  v_payload:=v_payload||jsonb_build_object(
    'entryIntent',v_entry,
    'initialAssessmentMode',v_assessment,
    'initialLifecycleStatus','onboarding',
    'relationshipType','training',
    'accessMode',v_access,
    'frequency',case
      when v_entry='iri' then 'Evaluación IRI puntual'
      else coalesce(v_payload->>'frequency','')
    end
  );

  v_result:=public.iberfit_admin_create_client_v26_pre_person_service_v1(
    jsonb_set(p_command,'{payload}',v_payload,true),
    v_context
  );

  begin v_person:=coalesce(v_result->>'clientId',v_result->>'entityId')::uuid;
  exception when others then raise exception 'V26_ADMIN_CLIENT_CREATE_RESULT_INVALID' using errcode='P0001'; end;
  if v_person is null then raise exception 'V26_ADMIN_CLIENT_CREATE_RESULT_INVALID' using errcode='P0001'; end if;

  select s.status into v_current_service
  from public.iberfit_training_service_events_v1 s
  where s.organization_id=v_org and s.person_id=v_person
  order by s.effective_at desc,s.created_at desc,s.id desc
  limit 1;

  if v_entry='training' and v_current_service is distinct from 'active' then
    insert into public.iberfit_training_service_events_v1(
      organization_id,person_id,status,reason,changed_by
    ) values(
      v_org,v_person,'active',
      case
        when v_current_service='ended' then 'Reactivación del servicio de entrenamiento desde Admin IBERFIT.'
        when v_current_service='paused' then 'Reanudación del servicio de entrenamiento desde Admin IBERFIT.'
        else 'Alta de servicio de entrenamiento desde Admin IBERFIT.'
      end,
      v_actor
    );
    v_current_service:='active';

    select e.status into v_current_lifecycle
    from public.iberfit_client_lifecycle_events e
    where e.organization_id=v_org and e.client_id=v_person::text
    order by e.effective_at desc,e.created_at desc,e.id desc
    limit 1;

    if v_current_lifecycle is distinct from
      (case when v_current_lifecycle='inactive' then 'reactivation' else 'active' end)
    then
      insert into public.iberfit_client_lifecycle_events(
        organization_id,client_id,status,reason,changed_by
      ) values(
        v_org,v_person::text,
        case when v_current_lifecycle='inactive' then 'reactivation' else 'active' end,
        'Compatibilidad de ciclo tras activar el servicio de entrenamiento.',
        v_actor
      );
    end if;
  end if;

  if v_current_service is null then
    select s.status into v_current_service
    from public.iberfit_training_service_events_v1 s
    where s.organization_id=v_org and s.person_id=v_person
    order by s.effective_at desc,s.created_at desc,s.id desc
    limit 1;
  end if;

  -- The legacy helper creates a draft IRI for every new record.
  -- Remove only the brand-new untouched placeholder when the user explicitly deferred IRI.
  if v_entry='training' and v_assessment='deferred' and not v_had_iri then
    begin v_created_iri:=nullif(v_result->>'iri_id','')::uuid;
    exception when others then v_created_iri:=null; end;
    if v_created_iri is not null
      and exists(
        select 1 from public.iri_assessments a
        where a.id=v_created_iri and a.client_id=v_person
          and a.status::text='borrador' and a.revision=0
      )
      and not exists(select 1 from public.iri_consents_v1 c where c.assessment_id=v_created_iri)
      and not exists(select 1 from public.iri_external_reports_v26 r where r.assessment_id=v_created_iri)
      and not exists(select 1 from public.iri_photo_report_permissions_v1 p where p.assessment_id=v_created_iri)
      and not exists(select 1 from public.iri_photogrammetry_analyses_v1 a where a.assessment_id=v_created_iri)
      and not exists(select 1 from public.iri_photogrammetry_analyses_v2 a where a.assessment_id=v_created_iri)
      and not exists(select 1 from public.iri_photogrammetry_captures_v1 p where p.assessment_id=v_created_iri)
      and not exists(select 1 from public.iri_report_issuances_v1 r where r.assessment_id=v_created_iri)
      and not exists(select 1 from public.documents d where d.iri_id=v_created_iri)
      and not exists(select 1 from private.m26_iri_drafts_v1 d where d.assessment_id=v_created_iri)
    then
      delete from public.domain_entities_v26
      where entity_type='iri' and entity_id=v_created_iri and client_id=v_person
        and revision=0;
      delete from public.iri_assessments
      where id=v_created_iri and client_id=v_person
        and status::text='borrador' and revision=0;
      get diagnostics v_deleted=row_count;
      v_cleaned_placeholder:=v_deleted>0;
    end if;
  end if;

  v_result:=v_result-'relationshipType'-'initialLifecycleStatus';
  if v_assessment='deferred' and v_cleaned_placeholder then
    v_result:=v_result-'iri_id'-'iri_entity_available';
  end if;

  return v_result||jsonb_build_object(
    'entryIntent',v_entry,
    'trainingServiceStatus',coalesce(v_current_service,'none'),
    'initialAssessmentMode',v_assessment,
    'iriCreated',case when v_assessment='iri' then true else not v_cleaned_placeholder and v_had_iri end
  );
end
$function$;

revoke all on function public.iberfit_admin_create_client_v26(jsonb,jsonb) from public,anon;
grant execute on function public.iberfit_admin_create_client_v26(jsonb,jsonb) to authenticated,service_role;

-- Add the canonical service projection to the existing production bootstrap.
alter function public.iberfit_bootstrap_v26()
  rename to iberfit_bootstrap_v26_pre_person_service_v1;

create or replace function public.iberfit_bootstrap_v26()
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_payload jsonb;
  v_org uuid;
  v_clients jsonb;
begin
  v_payload:=public.iberfit_bootstrap_v26_pre_person_service_v1();
  v_org:=nullif(public.iberfit_application_context_v14()->>'organizationId','')::uuid;

  select coalesce(jsonb_agg(
    c.value||jsonb_build_object(
      'trainingServiceStatus',coalesce(s.status,'none')
    )
    order by c.ordinality
  ),'[]'::jsonb)
  into v_clients
  from jsonb_array_elements(coalesce(v_payload#>'{data,clients}','[]'::jsonb))
       with ordinality c(value,ordinality)
  left join lateral (
    select e.status
    from public.iberfit_training_service_events_v1 e
    where e.organization_id=v_org
      and e.person_id=nullif(c.value->>'id','')::uuid
    order by e.effective_at desc,e.created_at desc,e.id desc
    limit 1
  ) s on true;

  return jsonb_set(v_payload,'{data,clients}',coalesce(v_clients,'[]'::jsonb),true);
end
$function$;

revoke all on function public.iberfit_bootstrap_v26() from public,anon;
grant execute on function public.iberfit_bootstrap_v26() to authenticated,service_role;

-- Keep Admin analytics and Coach capacity aligned with the canonical training service.
alter function public.iberfit_admin_bootstrap_v14()
  rename to iberfit_admin_bootstrap_v14_pre_person_service_v1;

create or replace function public.iberfit_admin_bootstrap_v14()
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_org uuid;
  v_coaches jsonb;
  v_active integer;
begin
  v_base:=public.iberfit_admin_bootstrap_v14_pre_person_service_v1();
  v_org:=nullif(v_base#>>'{organization,id}','')::uuid;

  select count(*) into v_active
  from (
    select distinct on (e.person_id) e.person_id,e.status
    from public.iberfit_training_service_events_v1 e
    where e.organization_id=v_org
    order by e.person_id,e.effective_at desc,e.created_at desc,e.id desc
  ) current_service
  where current_service.status='active';

  select coalesce(jsonb_agg(
    c.value||jsonb_build_object(
      'clientCount',(
        select count(distinct a.client_id)
        from public.iberfit_coach_client_assignments a
        where a.organization_id=v_org
          and a.coach_user_id=(c.value->>'userId')::uuid
          and a.status='active'
          and exists(
            select 1
            from (
              select e.status
              from public.iberfit_training_service_events_v1 e
              where e.organization_id=v_org
                and e.person_id=a.client_id::uuid
              order by e.effective_at desc,e.created_at desc,e.id desc
              limit 1
            ) latest
            where latest.status='active'
          )
      )
    )
  ),'[]'::jsonb)
  into v_coaches
  from jsonb_array_elements(coalesce(v_base#>'{data,coachProfiles}','[]'::jsonb)) c;

  v_base:=jsonb_set(v_base,'{data,coachProfiles}',coalesce(v_coaches,'[]'::jsonb),true);
  v_base:=jsonb_set(v_base,'{analytics,activeClients}',to_jsonb(coalesce(v_active,0)),true);
  return v_base;
end
$function$;

revoke all on function public.iberfit_admin_bootstrap_v14() from public,anon;
grant execute on function public.iberfit_admin_bootstrap_v14() to authenticated,service_role;

comment on function public.iberfit_admin_create_client_v26(jsonb,jsonb) is
  'Creates/reuses a person record. entryIntent controls IRI-vs-training entry; training service and IRI are independent.';
comment on function public.iberfit_admin_set_training_service_v1(jsonb,jsonb) is
  'Canonical privileged mutation for training service state. Does not create, require or delete IRI assessments.';
