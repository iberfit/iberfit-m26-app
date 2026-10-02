-- IBERFIT: distinguish paid IRI-only people from active training clients.
-- Additive lifecycle state. Coach assignment remains independent so private IRI access can stay authorized.

alter table public.iberfit_client_lifecycle_events
  drop constraint if exists iberfit_client_lifecycle_events_status_check,
  add constraint iberfit_client_lifecycle_events_status_check
  check (status = any (array[
    'lead'::text,
    'onboarding'::text,
    'iri_only'::text,
    'active'::text,
    'paused'::text,
    'inactive'::text,
    'reactivation'::text
  ]));

-- Distinct event times even when creation and conversion share one transaction.
alter table public.iberfit_client_lifecycle_events
  alter column effective_at set default clock_timestamp();

comment on constraint iberfit_client_lifecycle_events_status_check
  on public.iberfit_client_lifecycle_events
  is 'Commercial lifecycle. iri_only means a person with a paid IRI/record but no active training service.';

create or replace function public.iberfit_admin_create_client_v26_pre_privileged_assurance(
  p_command jsonb,
  p_context jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_context jsonb:=coalesce(p_context,public.iberfit_application_context_v14());
  v_org uuid;
  v_actor uuid:=auth.uid();
  v_op text:=btrim(coalesce(p_command->>'operationId',''));
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_email text:=lower(btrim(coalesce(v_payload->>'email','')));
  v_name text:=btrim(coalesce(v_payload->>'name',''));
  v_initial_lifecycle text:=lower(btrim(coalesce(v_payload->>'initialLifecycleStatus','onboarding')));
  v_existing jsonb;
  v_created jsonb;
  v_client uuid;
  v_audit uuid;
  v_result jsonb;
  v_access public.client_access_v26%rowtype;
begin
  if v_actor is null then raise exception 'V26_ADMIN_CLIENT_CREATE_AUTH_REQUIRED' using errcode='28000'; end if;
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception 'V26_ADMIN_CLIENT_CREATE_ADMIN_REQUIRED' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then raise exception 'V26_ADMIN_CLIENT_CREATE_ORGANIZATION_REQUIRED' using errcode='42501'; end if;
  if v_type<>'ADMIN_CLIENTE_CREAR' then raise exception 'V26_ADMIN_CLIENT_CREATE_COMMAND_INVALID' using errcode='22023'; end if;
  if v_op='' then raise exception 'V14_OPERATION_ID_INVALID' using errcode='22023'; end if;
  if v_email='' or position('@' in v_email)<=1 then raise exception 'V12_EMAIL_INVALID' using errcode='22023'; end if;
  if char_length(v_name)<2 then raise exception 'V26_ADMIN_CLIENT_CREATE_NAME_INVALID' using errcode='22023'; end if;
  if v_initial_lifecycle not in ('onboarding','iri_only') then
    raise exception 'V26_ADMIN_CLIENT_CREATE_LIFECYCLE_INVALID' using errcode='22023';
  end if;

  select r.result into v_existing
  from public.iberfit_admin_mutation_receipts r
  where r.operation_id=v_op and r.actor_user_id=v_actor and r.command_type=v_type;
  if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate'); end if;
  if exists(select 1 from public.iberfit_admin_mutation_receipts r where r.operation_id=v_op) then
    raise exception 'V14_OPERATION_COLLISION' using errcode='23505';
  end if;

  v_created:=public.iberfit_create_client_draft_v12_pre_v65e(
    v_payload||jsonb_build_object('idempotencyKey',v_op)
  );
  begin v_client:=coalesce(v_created->>'clientId',v_created->>'client_id')::uuid;
  exception when others then raise exception 'V26_ADMIN_CLIENT_CREATE_RESULT_INVALID' using errcode='P0001'; end;
  if v_client is null then raise exception 'V26_ADMIN_CLIENT_CREATE_RESULT_INVALID' using errcode='P0001'; end if;

  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client::text);

  if not exists(
    select 1 from public.iberfit_client_lifecycle_events e
    where e.organization_id=v_org and e.client_id=v_client::text
  ) then
    insert into public.iberfit_client_lifecycle_events(
      organization_id,client_id,status,reason,changed_by
    ) values(
      v_org,
      v_client::text,
      v_initial_lifecycle,
      case
        when v_initial_lifecycle='iri_only' then 'Alta como persona con servicio IRI, sin entrenamiento activo.'
        else 'Alta de cliente desde Admin IBERFIT.'
      end,
      v_actor
    );
  end if;

  insert into public.client_access_v26(client_id,email,status)
  values(v_client,v_email,'invitacion_pendiente')
  on conflict(client_id) do update set
    email=excluded.email,
    status=case when public.client_access_v26.status='activo' then 'activo' else 'invitacion_pendiente' end,
    updated_at=now(),
    revision=public.client_access_v26.revision+1
  returning * into v_access;

  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,
    entity_type,entity_id,summary,trace_id,revision
  ) values(
    v_org,'ADMIN_CLIENTE_CREAR',v_actor,'admin','client',v_client::text,
    case when v_initial_lifecycle='iri_only'
      then 'Persona creada para servicio IRI y acceso preparado.'
      else 'Cliente creado y acceso preparado para invitación alojada.'
    end,
    v_op,coalesce(v_access.revision,0)::integer
  ) returning id into v_audit;

  v_result:=jsonb_build_object(
    'ok',true,'kind','ack','operationId',v_op,'commandType',v_type,
    'entityId',v_client::text,'clientId',v_client::text,'email',v_email,
    'initialLifecycleStatus',v_initial_lifecycle,
    'revision',coalesce(v_access.revision,0),'auditId',v_audit,'serverTime',now(),
    'invitation',jsonb_build_object(
      'accessStatus',v_access.status,
      'deliveryStatus',v_access.invitation_delivery_status,
      'attemptCount',v_access.invitation_attempt_count,
      'sentAt',v_access.invitation_sent_at,
      'activatedAt',v_access.activated_at
    )
  );
  insert into public.iberfit_admin_mutation_receipts(
    operation_id,organization_id,actor_user_id,command_type,result
  ) values(v_op,v_org,v_actor,v_type,v_result);
  return v_result;
end
$function$;

revoke all on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb) to service_role;
create or replace function public.iberfit_admin_execute_v14(p_command jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
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
$function$
;
create or replace function public.iberfit_admin_bootstrap_v14()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_base jsonb;
  v_org uuid;
  v_access jsonb;
begin
  v_base:=public.iberfit_admin_bootstrap_v14_pre_v65e();
  v_org:=nullif(v_base#>>'{organization,id}','')::uuid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',a.id,
        'clientId',a.client_id,
        'authUserId',a.auth_user_id,
        'email',a.email,
        'status',a.status,
        'revision',a.revision,
        'invitationAttemptCount',a.invitation_attempt_count,
        'lastInvitationAttemptAt',a.last_invitation_attempt_at,
        'invitationSentAt',a.invitation_sent_at,
        'invitationDeliveryStatus',a.invitation_delivery_status,
        'invitationErrorCode',a.invitation_error_code,
        'activatedAt',a.activated_at,
        'updatedAt',a.updated_at
      )
      order by a.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_access
  from public.client_access_v26 a
  where exists(
      select 1
      from public.iberfit_client_lifecycle_events e
      where e.organization_id=v_org
        and e.client_id=a.client_id::text
    )
    or exists(
      select 1
      from public.iberfit_coach_client_assignments ca
      where ca.organization_id=v_org
        and ca.client_id=a.client_id::text
    )
    or exists(
      select 1
      from public.iberfit_conversation_threads t
      where t.organization_id=v_org
        and t.client_id=a.client_id::text
    )
    or exists(
      select 1
      from public.iberfit_operational_tasks o
      where o.organization_id=v_org
        and o.client_id=a.client_id::text
    );

  return jsonb_set(
    v_base,
    '{data,clientAccess}',
    coalesce(v_access,'[]'::jsonb),
    true
  );
end
$function$
;

create or replace function public.iberfit_bootstrap_v26()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_payload jsonb;
  v_email text;
  v_last_access_at timestamptz;
  v_membership_status text;
  v_lifecycle_org uuid;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_payload:=public.iberfit_bootstrap_v26_pre_v65e();

  select u.email,u.last_sign_in_at
  into v_email,v_last_access_at
  from auth.users u
  where u.id=auth.uid();

  select m.status
  into v_membership_status
  from public.iberfit_organization_memberships m
  where m.organization_id='00000000-0000-4000-8000-000000000140'::uuid
    and m.user_id=auth.uid();

  v_payload:=jsonb_set(v_payload,'{user,email}',to_jsonb(coalesce(v_email,'')),true);
  v_payload:=jsonb_set(v_payload,'{user,status}',to_jsonb(coalesce(v_membership_status,'')),true);
  v_payload:=jsonb_set(v_payload,'{user,lastAccessAt}',coalesce(to_jsonb(v_last_access_at),'null'::jsonb),true);
  v_lifecycle_org:=(public.iberfit_application_context_v14()->>'organizationId')::uuid;
  -- Scope lifecycle to the already-authorized client payload; never widen access.
  v_payload:=jsonb_set(v_payload,'{data,clients}',coalesce((
    select jsonb_agg(c.value || jsonb_build_object('lifecycleStatus',(
      select e.status from public.iberfit_client_lifecycle_events e
      where e.organization_id=v_lifecycle_org
        and e.client_id=c.value->>'id'
      order by e.effective_at desc,e.created_at desc,e.id desc limit 1
    )))
    from jsonb_array_elements(coalesce(v_payload#>'{data,clients}','[]'::jsonb)) c
  ),'[]'::jsonb),true);
  return v_payload;
end
$function$
;
create or replace function public.iberfit_create_client_draft_v12_pre_v65e(p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_actor_role text;
  v_environment text;
  v_real_data_allowed boolean;
  v_production_blocked boolean;
  v_email text:=lower(btrim(coalesce(p_payload->>'email',p_payload#>>'{profile,email}','')));
  v_request_id text;
  v_raw jsonb;
  v_item jsonb;
  v_candidate_text text;
  v_candidate uuid;
  v_snapshot jsonb;
  v_clients jsonb;
  v_profiles jsonb;
  v_iris jsonb;
  v_profile jsonb;
  v_iri_id uuid;
  v_iri_sections jsonb;
  v_visible boolean:=false;
  v_profile_visible boolean:=false;
  v_iri_available boolean:=false;
  v_assignment_repaired boolean:=false;
  v_canary_activated boolean:=false;
  v_reused boolean:=false;
  v_row_count integer:=0;
  v_email_matches integer:=0;
  v_other_assignment boolean:=false;
  v_modality_normalized text;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='V12_AUTH_REQUIRED';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception using errcode='22023',message='V12_PAYLOAD_INVALID';
  end if;
  if v_email='' or position('@' in v_email)<=1 then
    raise exception using errcode='22023',message='V12_EMAIL_INVALID';
  end if;

  select lower(up.role::text) into v_actor_role
  from public.user_profiles up where up.user_id=v_actor;
  if v_actor_role not in ('admin','coach') then
    raise exception using errcode='42501',message='V12_COACH_ROLE_REQUIRED';
  end if;

  select s.value #>> '{}' into v_environment
  from public.iberfit_system_settings s where s.key='environment';
  select coalesce((s.value #>> '{}')::boolean,false) into v_real_data_allowed
  from public.iberfit_system_settings s where s.key='real_data_allowed';
  select coalesce((s.value #>> '{}')::boolean,true) into v_production_blocked
  from public.iberfit_system_settings s where s.key='production_blocked';
  -- PROD preserves the original three safety flags. QA admits only synthetic
  -- .invalid fixtures from the explicit QA origin, with production still blocked.
  if not (
    (v_environment='PRODUCTION' and v_real_data_allowed=true and v_production_blocked=false)
    or (v_environment='QA' and v_real_data_allowed=false and v_production_blocked=true
      and v_email like '%@example.invalid'
      and coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'origin','')='https://m26-canary.iberfit.cl')
  ) then
    raise exception using errcode='42501',message='V12_CLIENT_CREATE_ENVIRONMENT_BLOCKED';
  end if;

  v_request_id:=coalesce(nullif(btrim(p_payload->>'idempotencyKey'),''),nullif(btrim(p_payload->>'requestId'),''),v_email);
  perform pg_advisory_xact_lock(hashtextextended(v_email,0));

  select count(*),min(i.client_id::text) into v_email_matches,v_candidate_text
  from public.client_intake_profiles i join public.clients c on c.id=i.client_id
  where lower(btrim(i.email))=v_email;
  if v_email_matches>1 then
    raise exception using errcode='P0001',message='V12_CLIENT_EMAIL_AMBIGUOUS';
  end if;
  v_reused:=v_candidate_text is not null;

  if v_candidate_text is null then
    select public.iberfit_create_client_draft(p_payload) into v_raw;
    v_item:=case when jsonb_typeof(v_raw)='array' then v_raw->0 else v_raw end;
    v_candidate_text:=nullif(btrim(coalesce(
      v_item->>'client_id',v_item->>'clientId',v_item->>'cliente_id',
      v_item#>>'{client,id}',v_item#>>'{data,client_id}',v_item#>>'{data,clientId}',
      v_item#>>'{data,client,id}',v_item#>>'{result,client_id}',v_item#>>'{result,clientId}',
      v_item#>>'{result,client,id}',v_item->>'id',v_item#>>'{data,id}',v_item#>>'{result,id}'
    )), '');
    if v_candidate_text is null then
      select count(*),min(i.client_id::text) into v_email_matches,v_candidate_text
      from public.client_intake_profiles i join public.clients c on c.id=i.client_id
      where lower(btrim(i.email))=v_email;
      if v_email_matches>1 then
        raise exception using errcode='P0001',message='V12_CLIENT_EMAIL_AMBIGUOUS';
      end if;
    end if;
  else
    v_raw:=jsonb_build_object('reused',true,'client_id',v_candidate_text);
  end if;

  begin v_candidate:=v_candidate_text::uuid; exception when others then v_candidate:=null; end;
  if v_candidate is null or not exists(
    select 1 from public.clients c join public.client_intake_profiles i on i.client_id=c.id
    where c.id=v_candidate and lower(btrim(i.email))=v_email
  ) then
    raise exception using errcode='P0001',message='V12_CLIENT_ROW_NOT_CREATED';
  end if;

  if v_actor_role='coach' then
    select exists(select 1 from public.client_assignments a
      where a.client_id=v_candidate and a.coach_user_id is distinct from v_actor)
      into v_other_assignment;
    if v_other_assignment then
      raise exception using errcode='42501',message='V12_CLIENT_EMAIL_ASSIGNED_OTHER_COACH';
    end if;
    insert into public.client_assignments(client_id,coach_user_id,active)
    values(v_candidate,v_actor,true)
    on conflict(client_id,coach_user_id) do update set active=true;
    get diagnostics v_row_count=row_count;
    v_assignment_repaired:=v_row_count>0;
    if not exists(select 1 from public.client_assignments
      where client_id=v_candidate and coach_user_id=v_actor and active=true) then
      raise exception using errcode='P0001',message='V12_CLIENT_ASSIGNMENT_NOT_CREATED';
    end if;
  end if;

  insert into public.m26_canary_clients_v26(client_id,active,enabled_by,enabled_at,disabled_at,reason)
  values(v_candidate,true,v_actor,clock_timestamp(),null,'Alta transaccional IBERFIT V12.3')
  on conflict(client_id) do update set active=true,enabled_by=excluded.enabled_by,
    enabled_at=excluded.enabled_at,disabled_at=null,reason=excluded.reason;
  get diagnostics v_row_count=row_count;
  v_canary_activated:=v_row_count>0;

  v_modality_normalized:=case coalesce(p_payload#>>'{profile,modality}',p_payload->>'modality')
    when 'Presencial' then 'presencial' when 'presencial' then 'presencial'
    when 'Híbrido' then 'hibrido' when 'hibrido' then 'hibrido'
    when 'Online' then 'online' when 'online' then 'online' else null end;

  v_profile:=jsonb_strip_nulls(jsonb_build_object(
    'email',v_email,
    'phone',nullif(btrim(p_payload->>'phone'),''),
    'trainingAddress',nullif(btrim(p_payload->>'address'),''),
    'commune',nullif(btrim(p_payload->>'zone'),''),
    'modality',v_modality_normalized,
    'primaryObjective',nullif(btrim(p_payload->>'objective'),''),
    'equipment',nullif(btrim(p_payload->>'equipment'),''),
    'equipmentAvailable',nullif(btrim(p_payload->>'equipment'),''),
    'experienceLevel',nullif(btrim(p_payload->>'level'),''),
    'trainingHistory',nullif(btrim(p_payload->>'history'),''),
    'restrictions',nullif(btrim(p_payload->>'restrictions'),''),
    'pain',nullif(btrim(p_payload->>'pain'),''),
    'preferences',nullif(btrim(p_payload->>'preferences'),''),
    'timezone','America/Santiago'
  )) || case when jsonb_typeof(p_payload->'profile')='object' then p_payload->'profile' else '{}'::jsonb end;

  if jsonb_typeof(v_profile)<>'object' then
    raise exception using errcode='22023',message='V123_PROFILE_INVALID';
  end if;

  update public.client_app_profiles ap set profile=v_profile
  where ap.id=(select p.id from public.client_app_profiles p
    where p.client_id=v_candidate order by p.version desc,p.created_at desc limit 1);
  if not found then
    raise exception using errcode='P0001',message='V123_CLIENT_PROFILE_ROW_MISSING';
  end if;

  select i.id,i.sections into v_iri_id,v_iri_sections
  from public.iri_assessments i where i.client_id=v_candidate
  order by i.created_at desc limit 1;
  if v_iri_id is null then
    v_iri_id:=gen_random_uuid();
    v_iri_sections:=jsonb_build_object(
      'id',v_iri_id,'clientId',v_candidate,'status','borrador','revision',0,
      'personProfile',v_profile,'firstSessionSchema','iberfit-iri-first-session-v1'
    );
    insert into public.iri_assessments(
      id,client_id,sections,status,revision,created_by,assessment_type,
      protocol_version,current_step,started_at
    ) values(
      v_iri_id,v_candidate,v_iri_sections,'borrador',0,v_actor,'inicial',
      'iri-protocols-2026.07-v1','contexto',clock_timestamp()
    );
  elsif not (coalesce(v_iri_sections,'{}'::jsonb) ? 'personProfile') then
    v_iri_sections:=coalesce(v_iri_sections,'{}'::jsonb)||jsonb_build_object('personProfile',v_profile);
    update public.iri_assessments set sections=v_iri_sections,updated_at=clock_timestamp()
    where id=v_iri_id and client_id=v_candidate;
  end if;

  insert into public.domain_entities_v26(
    entity_type,entity_id,client_id,status,revision,body,source_table,source_revision,updated_at
  )
  select 'iri',i.id,i.client_id,
    case i.status::text when 'revisión' then 'completo' when 'retirado' then 'sustituido' else i.status::text end,
    i.revision,
    coalesce(i.sections,'{}'::jsonb)||jsonb_build_object(
      'id',i.id,'clientId',i.client_id,
      'status',case i.status::text when 'revisión' then 'completo' when 'retirado' then 'sustituido' else i.status::text end,
      'revision',i.revision
    ),
    'iri_assessments',i.revision,clock_timestamp()
  from public.iri_assessments i where i.id=v_iri_id and i.client_id=v_candidate
  on conflict(entity_type,entity_id) do update set
    client_id=excluded.client_id,
    body=case when public.domain_entities_v26.status='borrador' and public.domain_entities_v26.revision=0
      then public.domain_entities_v26.body||jsonb_build_object('personProfile',v_profile)
      else public.domain_entities_v26.body end,
    source_table=excluded.source_table,
    source_revision=excluded.source_revision,
    updated_at=clock_timestamp();

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_clients:=coalesce(v_snapshot#>'{data,clients}','[]'::jsonb);
  v_profiles:=coalesce(v_snapshot#>'{data,clientProfiles}','[]'::jsonb);
  v_iris:=coalesce(v_snapshot#>'{data,iriAssessments}','[]'::jsonb);

  select exists(select 1 from jsonb_array_elements(v_clients) item
    where coalesce(item->>'id',item->>'clientId',item->>'client_id')=v_candidate::text)
    into v_visible;
  select exists(select 1 from jsonb_array_elements(v_profiles) item
    where coalesce(item->>'clientId',item->>'client_id')=v_candidate::text
      and lower(coalesce(item->>'email',item#>>'{profile,email}',''))=v_email)
    into v_profile_visible;
  select exists(select 1 from jsonb_array_elements(v_iris) item
    where coalesce(item->>'clientId',item->>'client_id')=v_candidate::text
      and coalesce(item->>'id',item#>>'{body,id}')=v_iri_id::text)
    into v_iri_available;

  if not v_visible then raise exception using errcode='P0001',message='V12_CLIENT_NOT_VISIBLE_AFTER_CANARY_ACTIVATION'; end if;
  if not v_profile_visible then raise exception using errcode='P0001',message='V123_PROFILE_NOT_VISIBLE_AFTER_CREATE'; end if;
  if not v_iri_available then raise exception using errcode='P0001',message='V123_IRI_NOT_VISIBLE_AFTER_CREATE'; end if;

  return jsonb_build_object(
    'ok',true,'visible',true,'client_id',v_candidate,'request_id',v_request_id,
    'reused',v_reused,'assignment_repaired',v_assignment_repaired,
    'canary_activated',v_canary_activated,'profile_persisted',true,
    'iri_entity_available',true,'iri_id',v_iri_id,'version','v12.3'
  );
end
$function$
;
create or replace function public.iberfit_create_client_draft(p_payload jsonb)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$ declare actor_id uuid := auth.uid();
actor_role public.iberfit_role;
environment_name text;
allowed boolean;
blocked boolean;
v_client_id uuid := gen_random_uuid();
v_profile_id uuid := gen_random_uuid();
normalized_email text := lower(trim(coalesce(p_payload->>'email','')));
client_name text := trim(coalesce(p_payload->>'name',''));
modality public.client_modality;
objective_text text := trim(coalesce(p_payload->>'objective',''));
frequency_text text := trim(coalesce(p_payload->>'frequency',''));
modules jsonb;
begin perform public.iberfit_require_privileged_assurance_v65d();
if actor_id is null then raise exception 'Sesión no válida';
end if;
select role into actor_role from public.user_profiles where user_id = actor_id;
if actor_role is null or actor_role not in ('admin'::public.iberfit_role,'coach'::public.iberfit_role) then raise exception 'Solo Administración o Coach puede crear clientes';
end if;
select value #>> '{}' into environment_name from public.iberfit_system_settings where key='environment';
select coalesce((value #>> '{}')::boolean,false) into allowed from public.iberfit_system_settings where key='real_data_allowed';
select coalesce((value #>> '{}')::boolean,true) into blocked from public.iberfit_system_settings where key='production_blocked';
if not ((environment_name='PRODUCTION' and allowed=true and blocked=false) or (environment_name='QA' and allowed=false and blocked=true and normalized_email like '%@example.invalid' and coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'origin','')='https://m26-canary.iberfit.cl')) then raise exception 'El entorno productivo no está autorizado para el alta';
end if;
if length(client_name) < 2 then raise exception 'Ingresa el nombre del cliente';
end if;
if normalized_email = '' or position('@' in normalized_email) <= 1 then raise exception 'Ingresa un correo válido';
end if;
if objective_text = '' then raise exception 'Ingresa el objetivo principal';
end if;
if frequency_text = '' then if p_payload->>'initialLifecycleStatus'='iri_only' then frequency_text:='Evaluación IRI puntual';
else raise exception 'Ingresa la frecuencia prevista';
end if;
end if;
begin modality := (p_payload->>'modality')::public.client_modality;
exception when others then raise exception 'Modalidad no válida';
end;
if exists (select 1 from public.client_intake_profiles where lower(email)=normalized_email) then raise exception 'Ya existe un expediente con ese correo';
end if;
modules := case modality when 'Presencial'::public.client_modality then '["Inicio","Sesiones","Progreso","Informes"]'::jsonb else '["Inicio","Sesiones","Guiada en app","Progreso","Informes"]'::jsonb end;
insert into public.clients(id,name,modality,objective,revision) values (v_client_id,client_name,modality,objective_text,0);
insert into public.client_intake_profiles(client_id,email,address,zone,level,phase,frequency,restrictions,pain,history,equipment,preferences,primary_limiter,current_recommendation,pending,onboarding_status,created_by,updated_by) values (v_client_id,normalized_email,nullif(trim(p_payload->>'address'),''),nullif(trim(p_payload->>'zone'),''),nullif(trim(p_payload->>'level'),''),nullif(trim(p_payload->>'phase'),''),frequency_text,nullif(trim(p_payload->>'restrictions'),''),nullif(trim(p_payload->>'pain'),''),nullif(trim(p_payload->>'history'),''),nullif(trim(p_payload->>'equipment'),''),nullif(trim(p_payload->>'preferences'),''),nullif(trim(p_payload->>'primaryLimiter'),''),nullif(trim(p_payload->>'currentRecommendation'),''),nullif(trim(p_payload->>'pending'),''),'expediente',actor_id,actor_id);
insert into public.client_app_profiles(id,client_id,modality,modules,version,revision,status,created_by) values (v_profile_id,v_client_id,modality,modules,1,0,'borrador',actor_id);
if actor_role = 'coach'::public.iberfit_role then insert into public.client_assignments(client_id,coach_user_id,active) values (v_client_id,actor_id,true) on conflict (client_id,coach_user_id) do update set active=true;
end if;
insert into public.client_timeline_events(client_id,event_type,title,summary,visibility,source_table,source_id,status,priority,payload) values (v_client_id,'CLIENTE_CREADO','Expediente IBERFIT creado','Alta inicial preparada. El acceso del cliente todavía no ha sido enviado.','coach','clients',v_client_id,'registrado','normal',jsonb_build_object('modality',modality,'onboardingStatus','expediente','createdBy',actor_id));
insert into public.audit_events(event_type,entity_type,entity_id,actor_user_id,payload) values ('CLIENTE_CREADO','client',v_client_id::text,actor_id,jsonb_build_object('email',normalized_email,'modality',modality,'accessInvited',false));
return jsonb_build_object('client',(select to_jsonb(c) from public.clients c where c.id=v_client_id),'intake',(select to_jsonb(i) from public.client_intake_profiles i where i.client_id=v_client_id),'clientProfile',(select to_jsonb(p) from public.client_app_profiles p where p.id=v_profile_id),'accessInvited',false);
end $function$
;
