-- IBERFIT RC59 C2D · RECOVERED CURRENT PRODUCTION BASELINE · V2 CANDIDATE
-- Canonical version remains 20260815195022.
-- Current-state reconciliation baseline; no historical provenance claim.
-- V2 correction: the raw linked db diff already contains the ACL delta required
-- to transform 47 recorded July + recovered core into current production.
-- The redundant full pg_dump ACL replay from V1 is intentionally omitted.
-- RC46/RC46.1 are NOT asserted as historically applied.

-- IBERFIT RC59 C2D · RECOVERED CURRENT PRODUCTION BASELINE
-- Version: 20260815195022
-- Current-state reconciliation baseline; no historical provenance claim.
-- RC46/RC46.1 are NOT asserted as historically applied.

-- === PUBLIC STRUCTURAL DELTA ===
-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

COMMENT ON FUNCTION public.iberfit_base_entity_v26(text,uuid,uuid) IS NULL;

COMMENT ON FUNCTION public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb) IS NULL;

DROP POLICY command_events_v26_select ON public.command_events_v26;

DROP POLICY command_receipts_v26_select ON public.command_receipts_v26;

DROP POLICY domain_entities_v26_select ON public.domain_entities_v26;

DROP POLICY domain_events_v26_select ON public.domain_events_v26;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE FUNCTION public.iberfit_admin_bootstrap_v14()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_org uuid:=public.iberfit_admin_require_v14();v_users jsonb;v_roles jsonb;v_coaches jsonb;v_assign jsonb;v_leads jsonb;v_life jsonb;v_tasks jsonb;v_templates jsonb;v_rules jsonb;v_deliveries jsonb;v_audit jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'userId',u.id,'email',u.email,'name',coalesce(u.raw_user_meta_data->>'name',u.email),'status',m.status,'primaryRole',lower(coalesce(p.role::text,'')),'roles',coalesce((select jsonb_agg(role) from public.user_application_roles ar where ar.user_id=u.id and ar.active=true),'[]'::jsonb),'lastAccessAt',u.last_sign_in_at,'createdAt',u.created_at,'updatedAt',m.updated_at,'revision',m.revision)),'[]'::jsonb) into v_users from public.iberfit_organization_memberships m join auth.users u on u.id=m.user_id left join public.user_profiles p on p.user_id=u.id where m.organization_id=v_org;
  select coalesce(jsonb_agg(jsonb_build_object('id',concat(user_id,':',role),'userId',user_id,'role',role,'active',active,'grantedAt',granted_at,'grantedBy',granted_by,'revision',1)),'[]'::jsonb) into v_roles from public.user_application_roles;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'userId',u.id,'email',u.email,'name',coalesce(u.raw_user_meta_data->>'name',u.email),'status',m.status,'clientCount',(select count(*) from public.iberfit_coach_client_assignments a where a.coach_user_id=u.id and a.status='active'),'revision',m.revision)),'[]'::jsonb) into v_coaches from public.iberfit_organization_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org and exists(select 1 from public.user_application_roles ar where ar.user_id=u.id and ar.role in('coach','admin') and ar.active=true);
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) into v_assign from public.iberfit_coach_client_assignments a where a.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc),'[]'::jsonb) into v_leads from public.iberfit_leads l where l.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.effective_at desc),'[]'::jsonb) into v_life from(select distinct on(client_id)* from public.iberfit_client_lifecycle_events where organization_id=v_org order by client_id,effective_at desc)x;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into v_tasks from(select * from public.iberfit_operational_tasks where organization_id=v_org order by created_at desc limit 1000)t;
  select coalesce(jsonb_agg(to_jsonb(t) order by key),'[]'::jsonb) into v_templates from public.iberfit_notification_templates t where t.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(r) order by key),'[]'::jsonb) into v_rules from public.iberfit_automation_rules r where r.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(d) order by created_at desc),'[]'::jsonb) into v_deliveries from(select * from public.iberfit_notification_deliveries where organization_id=v_org order by created_at desc limit 250)d;
  select coalesce(jsonb_agg(to_jsonb(a) order by occurred_at desc),'[]'::jsonb) into v_audit from(select * from public.iberfit_admin_audit_events where organization_id=v_org order by occurred_at desc limit 500)a;
  return jsonb_build_object('ok',true,'organization',(select jsonb_build_object('id',id,'slug',slug,'name',name,'status',status,'timezone',timezone,'locale',locale,'settings',settings,'revision',revision) from public.iberfit_organizations where id=v_org),'permissions',jsonb_build_array('organization.read','organization.settings.manage','user.read_summary','user.manage_status','role.read','role.manage','assignment.read','assignment.manage','client.lifecycle.read','client.lifecycle.manage','appointment.manage_global','operation.read_global','operation.manage_global','message.read','message.manage_templates','automation.read','automation.manage','analytics.read','audit.read'),'permissionRevision',1,'data',jsonb_build_object('organizationUsers',v_users,'applicationRoles',v_roles,'coachProfiles',v_coaches,'coachClientAssignments',v_assign,'leads',v_leads,'clientLifecycle',v_life,'operationalTasks',v_tasks,'notificationTemplates',v_templates,'notificationDeliveries',v_deliveries,'automationRules',v_rules,'auditEvents',v_audit),'analytics',jsonb_build_object('activeClients',(select count(*) from(select distinct on(client_id)client_id,status from public.iberfit_client_lifecycle_events where organization_id=v_org order by client_id,effective_at desc)x where status='active'),'averageAdherence',null,'churn30d',null,'conversionRate',null),'revision',1,'serverTime',now());
end $function$;

REVOKE ALL ON FUNCTION public.iberfit_admin_bootstrap_v14() FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_admin_bootstrap_v14() TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_admin_bootstrap_v14() TO service_role;

CREATE FUNCTION public.iberfit_admin_execute_v14 (
  p_command jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_org uuid:=public.iberfit_admin_require_v14();v_actor uuid:=auth.uid();v_op text:=btrim(coalesce(p_command->>'operationId',''));v_type text:=upper(btrim(coalesce(p_command->>'type','')));v_entity text:=btrim(coalesce(p_command->>'entityId',''));v_reason text:=btrim(coalesce(p_command->>'reason',''));v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);v_base integer:=coalesce((p_command->>'baseRevision')::integer,0);v_result jsonb;v_existing jsonb;v_id uuid;v_revision integer:=1;v_user uuid;v_role text;v_status text;
begin
  if v_op='' then raise exception using errcode='22023',message='V14_OPERATION_ID_INVALID'; end if;
  select result into v_existing from public.iberfit_admin_mutation_receipts where operation_id=v_op and actor_user_id=v_actor and command_type=v_type;if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate');end if;
  if exists(select 1 from public.iberfit_admin_mutation_receipts where operation_id=v_op)then raise exception using errcode='23505',message='V14_OPERATION_COLLISION';end if;
  if v_type in('ADMIN_USUARIO_CAMBIAR_ESTADO','ADMIN_ROL_OTORGAR','ADMIN_ROL_REVOCAR','ADMIN_ASIGNACION_CREAR','ADMIN_ASIGNACION_FINALIZAR','ADMIN_LEAD_ACTUALIZAR','ADMIN_CLIENTE_CAMBIAR_CICLO','ADMIN_TAREA_RESOLVER','ADMIN_ORGANIZACION_ACTUALIZAR')and char_length(v_reason)<3 then raise exception using errcode='22023',message='V14_REASON_REQUIRED';end if;
  case v_type
    when 'ADMIN_USUARIO_CAMBIAR_ESTADO' then v_user:=(v_payload->>'userId')::uuid;v_status:=lower(v_payload->>'status');if v_user=v_actor and v_status<>'active' then raise exception using errcode='42501',message='V14_SELF_SUSPENSION_FORBIDDEN';end if;update public.iberfit_organization_memberships set status=v_status,revision=revision+1,updated_at=now()where organization_id=v_org and user_id=v_user and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_user::text;
    when 'ADMIN_ROL_OTORGAR' then v_user:=(v_payload->>'userId')::uuid;v_role:=lower(v_payload->>'role');if v_role not in('client','coach','admin')then raise exception using errcode='22023',message='V14_ROLE_INVALID';end if;insert into public.user_application_roles(user_id,role,active,granted_by)values(v_user,v_role,true,v_actor)on conflict(user_id,role)do update set active=true,granted_at=now(),granted_by=v_actor;v_entity:=concat(v_user,':',v_role);
    when 'ADMIN_ROL_REVOCAR' then v_user:=(v_payload->>'userId')::uuid;v_role:=lower(v_payload->>'role');if v_user=v_actor and v_role='admin' then raise exception using errcode='42501',message='V14_SELF_ADMIN_REVOCATION_FORBIDDEN';end if;if v_role='admin' and(select count(*)from public.user_application_roles where role='admin'and active=true)<=1 then raise exception using errcode='42501',message='V14_LAST_ADMIN_PROTECTED';end if;update public.user_application_roles set active=false,granted_at=now(),granted_by=v_actor where user_id=v_user and role=v_role and active=true;if not found then raise exception using errcode='P0002',message='V14_ROLE_NOT_FOUND';end if;v_entity:=concat(v_user,':',v_role);
    when 'ADMIN_ASIGNACION_CREAR' then insert into public.iberfit_coach_client_assignments(organization_id,coach_user_id,client_id,starts_at,reason,created_by)values(v_org,(v_payload->>'coachUserId')::uuid,btrim(v_payload->>'clientId'),(v_payload->>'startsAt')::date,v_reason,v_actor)returning id into v_id;insert into public.iberfit_conversation_threads(organization_id,client_id,coach_user_id,created_by)values(v_org,btrim(v_payload->>'clientId'),(v_payload->>'coachUserId')::uuid,v_actor)on conflict(organization_id,coach_user_id,client_id)do update set status='active',updated_at=now(),revision=public.iberfit_conversation_threads.revision+1;v_entity:=v_id::text;
    when 'ADMIN_ASIGNACION_FINALIZAR' then v_id:=(v_payload->>'assignmentId')::uuid;update public.iberfit_coach_client_assignments set status='ended',ends_at=current_date,ended_by=v_actor,reason=v_reason,revision=revision+1,updated_at=now()where id=v_id and organization_id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_id::text;
    when 'ADMIN_LEAD_CREAR' then insert into public.iberfit_leads(organization_id,name,email,phone,source,objective,created_by,updated_by)values(v_org,btrim(v_payload->>'name'),nullif(lower(btrim(v_payload->>'email')),''),nullif(btrim(v_payload->>'phone'),''),nullif(btrim(v_payload->>'source'),''),nullif(btrim(v_payload->>'objective'),''),v_actor,v_actor)returning id into v_id;v_entity:=v_id::text;
    when 'ADMIN_LEAD_ACTUALIZAR' then v_id:=(v_payload->>'leadId')::uuid;update public.iberfit_leads set status=lower(v_payload->>'status'),next_action_at=nullif(v_payload->>'nextActionAt','')::timestamptz,updated_by=v_actor,revision=revision+1,updated_at=now()where id=v_id and organization_id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_id::text;
    when 'ADMIN_CLIENTE_CAMBIAR_CICLO' then insert into public.iberfit_client_lifecycle_events(organization_id,client_id,status,reason,changed_by)values(v_org,btrim(v_payload->>'clientId'),lower(v_payload->>'status'),v_reason,v_actor)returning id into v_id;v_entity:=btrim(v_payload->>'clientId');
    when 'ADMIN_TAREA_CREAR' then insert into public.iberfit_operational_tasks(organization_id,type,priority,title,detail,created_by)values(v_org,btrim(coalesce(v_payload->>'taskType','manual_review')),lower(coalesce(v_payload->>'priority','normal')),btrim(v_payload->>'title'),nullif(btrim(v_payload->>'detail'),''),v_actor)returning id into v_id;v_entity:=v_id::text;
    when 'ADMIN_TAREA_RESOLVER' then v_id:=(v_payload->>'taskId')::uuid;update public.iberfit_operational_tasks set status='resolved',resolved_by=v_actor,resolved_at=now(),resolution_note=v_reason,revision=revision+1,updated_at=now()where id=v_id and organization_id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_id::text;
    when 'ADMIN_PLANTILLA_GUARDAR' then insert into public.iberfit_notification_templates(organization_id,key,name,channel,subject,body,created_by,updated_by)values(v_org,lower(v_payload->>'key'),btrim(v_payload->>'name'),lower(v_payload->>'channel'),nullif(btrim(v_payload->>'subject'),''),btrim(v_payload->>'body'),v_actor,v_actor)on conflict(organization_id,key)do update set name=excluded.name,channel=excluded.channel,subject=excluded.subject,body=excluded.body,revision=public.iberfit_notification_templates.revision+1,updated_at=now(),updated_by=v_actor;v_entity:=lower(v_payload->>'key');
    when 'ADMIN_AUTOMATIZACION_GUARDAR' then insert into public.iberfit_automation_rules(organization_id,key,name,trigger_type,action_type,status,configuration,created_by,updated_by)values(v_org,lower(v_payload->>'key'),btrim(v_payload->>'name'),lower(v_payload->>'triggerType'),lower(v_payload->>'actionType'),lower(v_payload->>'status'),coalesce(v_payload->'configuration','{}'::jsonb),v_actor,v_actor)on conflict(organization_id,key)do update set name=excluded.name,trigger_type=excluded.trigger_type,action_type=excluded.action_type,status=excluded.status,configuration=excluded.configuration,revision=public.iberfit_automation_rules.revision+1,updated_at=now(),updated_by=v_actor;v_entity:=lower(v_payload->>'key');
    when 'ADMIN_ORGANIZACION_ACTUALIZAR' then update public.iberfit_organizations set name=btrim(v_payload->>'name'),timezone=btrim(v_payload->>'timezone'),locale=btrim(v_payload->>'locale'),revision=revision+1,updated_at=now()where id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_org::text;
    else raise exception using errcode='22023',message='V14_COMMAND_INVALID';
  end case;
  insert into public.iberfit_admin_audit_events(organization_id,event_type,actor_user_id,actor_application,entity_type,entity_id,summary,trace_id,revision)values(v_org,v_type,v_actor,'admin','admin_mutation',v_entity,concat(v_type,' confirmado por backend.'),v_op,v_revision)returning id into v_id;
  v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'commandType',v_type,'entityId',v_entity,'revision',v_revision,'auditId',v_id,'serverTime',now());
  insert into public.iberfit_admin_mutation_receipts(operation_id,organization_id,actor_user_id,command_type,result)values(v_op,v_org,v_actor,v_type,v_result);return v_result;
end $function$;

REVOKE ALL ON FUNCTION public.iberfit_admin_execute_v14(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_admin_execute_v14(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_admin_execute_v14(jsonb) TO service_role;

CREATE FUNCTION public.iberfit_admin_require_v14()
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_context jsonb;v_user uuid:=auth.uid();begin
  select public.iberfit_application_context_v14() into v_context;
  if coalesce(v_context->>'membershipStatus','')<>'active' then raise exception using errcode='42501',message='V14_ORGANIZATION_ACCESS_SUSPENDED'; end if;
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception using errcode='42501',message='V14_ADMIN_REQUIRED'; end if;
  return(v_context->>'organizationId')::uuid;
end $function$;

REVOKE ALL ON FUNCTION public.iberfit_admin_require_v14() FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_admin_require_v14() TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_admin_require_v14() TO service_role;

CREATE FUNCTION public.iberfit_application_context_v14()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_user uuid:=auth.uid();v_primary text;v_org uuid:='00000000-0000-4000-8000-000000000140';v_status text;v_roles jsonb;v_clients jsonb;v_enforced boolean;
begin
  if v_user is null then raise exception using errcode='28000',message='V14_AUTH_REQUIRED'; end if;
  select status into v_status
  from public.iberfit_organization_memberships
  where organization_id=v_org and user_id=v_user;

  if v_status is null then
    raise exception using
      errcode='42501',
      message='V14_ORGANIZATION_MEMBERSHIP_REQUIRED';
  end if;

  if v_status<>'active' then
    raise exception using
      errcode='42501',
      message='V14_ORGANIZATION_ACCESS_SUSPENDED';
  end if;
  select lower(role::text) into v_primary from public.user_profiles where user_id=v_user;
  select coalesce(jsonb_agg(x.role order by case x.role when 'coach' then 1 when 'admin' then 2 else 3 end),'[]'::jsonb) into v_roles from(
    select case v_primary when 'entrenador' then 'coach' when 'administrador' then 'admin' when 'cliente' then 'client' else v_primary end role where v_primary is not null
    union select role from public.user_application_roles where user_id=v_user and active=true
  )x where x.role in('client','coach','admin');
  select exists(select 1 from public.iberfit_coach_client_assignments where organization_id=v_org and coach_user_id=v_user) into v_enforced;
  select coalesce(jsonb_agg(client_id order by client_id),'[]'::jsonb) into v_clients from public.iberfit_coach_client_assignments where organization_id=v_org and coach_user_id=v_user and status='active' and starts_at<=current_date and(ends_at is null or ends_at>=current_date);
  return jsonb_build_object('ok',true,'organizationId',v_org,'membershipStatus',v_status,'roles',v_roles,'assignmentScopeEnforced',coalesce(v_enforced,false),'assignedClientIds',v_clients,'revision',1,'serverTime',now());
end $function$;

REVOKE ALL ON FUNCTION public.iberfit_application_context_v14() FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_application_context_v14() TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_application_context_v14() TO service_role;

CREATE FUNCTION public.iberfit_appointment_change_requests_v13()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_own_client text;
  v_requests jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  v_own_client:=coalesce(
    v_snapshot#>>'{user,clientId}',
    v_snapshot#>>'{user,client_id}',
    ''
  );

  if v_role in ('client','cliente') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'appointmentId',r.appointment_id,
      'clientId',r.client_id,
      'reason',r.reason,
      'status',r.status,
      'createdAt',r.created_at,
      'resolvedAt',r.resolved_at,
      'resolutionNote',r.resolution_note
    ) order by r.created_at desc),'[]'::jsonb)
    into v_requests
    from public.appointment_change_requests r
    where r.requester_user_id=v_user
      and r.client_id=v_own_client;
  elsif v_role in ('coach','entrenador','admin','administrador') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'appointmentId',r.appointment_id,
      'clientId',r.client_id,
      'reason',r.reason,
      'status',r.status,
      'createdAt',r.created_at,
      'resolvedAt',r.resolved_at,
      'resolutionNote',r.resolution_note
    ) order by r.created_at desc),'[]'::jsonb)
    into v_requests
    from public.appointment_change_requests r
    where exists(
      select 1
      from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb)) a
      where coalesce(a->>'id',a->>'entityId',a->>'entity_id','')=r.appointment_id
        and coalesce(a->>'clientId',a->>'client_id','')=r.client_id
    );
  else
    raise exception using errcode='42501',message='V13_ROLE_FORBIDDEN';
  end if;

  return jsonb_build_object('ok',true,'requests',v_requests);
end;
$function$;

REVOKE ALL ON FUNCTION public.iberfit_appointment_change_requests_v13() FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_appointment_change_requests_v13() TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_appointment_change_requests_v13() TO service_role;

CREATE FUNCTION public.iberfit_authorized_application_roles_v13()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid:=auth.uid();
  v_primary text;
  v_roles jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;

  select lower(up.role::text)
    into v_primary
    from public.user_profiles up
   where up.user_id=v_user;

  select coalesce(
    jsonb_agg(r.role order by case r.role when 'coach' then 1 when 'admin' then 2 else 3 end),
    '[]'::jsonb
  )
  into v_roles
  from (
    select v_primary as role
    where v_primary in ('coach','admin','client')
    union
    select uar.role
    from public.user_application_roles uar
    where uar.user_id=v_user and uar.active=true
  ) r;

  return jsonb_build_object(
    'ok',true,
    'roles',v_roles,
    'primaryRole',v_primary
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.iberfit_authorized_application_roles_v13() FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_authorized_application_roles_v13() TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_authorized_application_roles_v13() TO service_role;

CREATE FUNCTION public.iberfit_base_entity_v26_rc29 (
  p_entity_type text,
  p_entity_id   uuid,
  p_client_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_result jsonb;
begin
  if p_entity_type='report' then
    select to_jsonb(r) || jsonb_build_object(
      'id',r.id,'clientId',r.client_id,'status',r.status::text,'revision',r.revision,
      'publishedAt',r.published_at,'approvedAt',r.approved_at
    ) into v_result from public.reports r where r.id=p_entity_id and r.client_id=p_client_id;
  elsif p_entity_type='iri' then
    select to_jsonb(i) || jsonb_build_object(
      'id',i.id,'clientId',i.client_id,
      'status',case i.status::text when 'revisi├│n' then 'completo' when 'retirado' then 'sustituido' else i.status::text end,
      'revision',i.revision,'approvedAt',i.approved_at,'publishedAt',i.published_at
    ) into v_result from public.iri_assessments i where i.id=p_entity_id and i.client_id=p_client_id;
  elsif p_entity_type='planning' then
    select to_jsonb(t) || jsonb_build_object(
      'id',t.id,'clientId',t.client_id,'title',t.title,'objective',t.goal,
      'durationWeeks',t.weeks,
      'status',case t.status::text when 'revisi├│n' then 'validado' when 'retirado' then 'archivado' else t.status::text end,
      'revision',t.revision,'publishedAt',t.published_at,
      'sessions',coalesce((
        select jsonb_agg(to_jsonb(s) || jsonb_build_object(
          'id',s.id,'clientId',s.client_id,'cycleId',s.cycle_id,'type',s.execution_type,
          'status',case s.status::text when 'aprobado' then 'aprobada' when 'publicado' then 'publicada' when 'retirado' then 'cancelada' else s.status::text end,
          'revision',s.revision,'blocks',coalesce(s.prescription->'blocks','[]'::jsonb)
        ) order by s.created_at)
        from public.sessions s where s.cycle_id=t.id and s.client_id=t.client_id
      ),'[]'::jsonb)
    ) into v_result from public.training_cycles t where t.id=p_entity_id and t.client_id=p_client_id;
  elsif p_entity_type='session' then
    select to_jsonb(s) || jsonb_build_object(
      'id',s.id,'clientId',s.client_id,'cycleId',s.cycle_id,'type',s.execution_type,
      'status',case s.status::text when 'aprobado' then 'aprobada' when 'publicado' then 'publicada' when 'retirado' then 'cancelada' else s.status::text end,
      'revision',s.revision,'publishedAt',s.published_at,
      'blocks',coalesce(s.prescription->'blocks','[]'::jsonb)
    ) into v_result from public.sessions s where s.id=p_entity_id and s.client_id=p_client_id;
  elsif p_entity_type='session_execution' then
    select coalesce(e.summary,'{}'::jsonb) || jsonb_build_object(
      'id',e.id,'clientId',e.client_id,'sessionId',e.session_id,
      'status',case e.execution_status
        when 'activa' then 'en_curso' when 'pausada' then 'pausada'
        when 'cerrada_confirmada' then 'completada' else 'cancelada' end,
      'revision',e.revision,'updatedAt',e.updated_at
    ) into v_result from public.session_executions e where e.id=p_entity_id and e.client_id=p_client_id;
  elsif p_entity_type='intelligence' then
    select to_jsonb(i) || jsonb_build_object(
      'id',i.id,'clientId',i.client_id,
      'status',case i.status when 'aprobada' then 'aprobada' when 'descartada' then 'descartada' else 'propuesta' end,
      'revision',i.revision,'proposal',i.recommendation
    ) into v_result from public.intelligence_runs i where i.id=p_entity_id and i.client_id=p_client_id;
  elsif p_entity_type='appointment' then
    select to_jsonb(a) || jsonb_build_object(
      'id',a.id,'clientId',a.client_id,'sessionId',a.session_id,'type',a.appointment_type,
      'startAt',a.start_at,'endAt',a.end_at,'timeZone',a.time_zone,'revision',a.revision
    ) into v_result from public.appointments a where a.id=p_entity_id and a.client_id=p_client_id;
  elsif p_entity_type='client_access' then
    select to_jsonb(a) || jsonb_build_object(
      'id',a.id,'clientId',a.client_id,'authUserId',a.auth_user_id,
      'invitationAttemptCount',a.invitation_attempt_count,'invitationSentAt',a.invitation_sent_at,
      'activatedAt',a.activated_at,'closedAt',a.closed_at,'closeReason',a.close_reason
    ) into v_result
    from public.client_access_v26 a
    where a.client_id=p_client_id and (a.id=p_entity_id or p_entity_id=p_client_id);
  end if;
  return v_result;
end $function$;

COMMENT ON FUNCTION public.iberfit_base_entity_v26_rc29(text,uuid,uuid) IS 'M26 internal helper. Not callable by anon/authenticated.';

REVOKE ALL ON FUNCTION public.iberfit_base_entity_v26_rc29(text, uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_base_entity_v26_rc29(text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_base_entity_v26 (
  p_entity_type text,
  p_entity_id   uuid,
  p_client_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_result jsonb;
begin
  if p_entity_type = 'checkin' then
    select to_jsonb(c) || jsonb_build_object(
      'id', c.id, 'clientId', c.client_id, 'recordedAt', c.recorded_at,
      'createdBy', c.created_by, 'createdAt', c.created_at, 'updatedAt', c.updated_at
    ) into v_result
    from public.client_checkins_v26 c
    where c.id = p_entity_id and c.client_id = p_client_id;
  elsif p_entity_type = 'habit' then
    select to_jsonb(h) || jsonb_build_object(
      'id', h.id, 'clientId', h.client_id, 'createdBy', h.created_by,
      'createdAt', h.created_at, 'updatedAt', h.updated_at
    ) into v_result
    from public.client_habits_v26 h
    where h.id = p_entity_id and h.client_id = p_client_id;
  elsif p_entity_type = 'habit_log' then
    select to_jsonb(l) || jsonb_build_object(
      'id', l.id, 'clientId', l.client_id, 'habitId', l.habit_id,
      'recordedAt', l.recorded_at, 'createdBy', l.created_by,
      'createdAt', l.created_at, 'updatedAt', l.updated_at
    ) into v_result
    from public.client_habit_logs_v26 l
    where l.id = p_entity_id and l.client_id = p_client_id;
  elsif p_entity_type = 'private_note' then
    select to_jsonb(n) || jsonb_build_object(
      'id', n.id, 'clientId', n.client_id, 'createdBy', n.created_by,
      'createdAt', n.created_at, 'updatedAt', n.updated_at,
      'visibility', 'coach_only'
    ) into v_result
    from public.coach_private_notes_v26 n
    where n.id = p_entity_id and n.client_id = p_client_id;
  else
    return public.iberfit_base_entity_v26_rc29(p_entity_type, p_entity_id, p_client_id);
  end if;

  if v_result is null then
    v_result := jsonb_build_object(
      'id', p_entity_id,
      'clientId', p_client_id,
      'status', 'borrador',
      'revision', 0,
      'createdAt', now(),
      'updatedAt', now()
    );
  end if;

  return v_result;
end
$function$;

GRANT ALL ON FUNCTION public.iberfit_bootstrap_core() TO service_role;

GRANT ALL ON FUNCTION public.iberfit_bootstrap_support() TO service_role;

CREATE FUNCTION public.iberfit_bootstrap_v26_rc29()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_role text; v_has_canary boolean; v_data jsonb; v_revisions jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  v_role:=public.iberfit_current_role_v26();
  select exists(
    select 1 from public.m26_canary_clients_v26 c
    where c.active=true and public.iberfit_can_access_client_v26(c.client_id)
  ) into v_has_canary;
  if not v_has_canary then raise exception 'M26_CANARY_NOT_ENABLED' using errcode='42501'; end if;

  select jsonb_build_object(
    'clients',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.clients c
      join public.m26_canary_clients_v26 q on q.client_id=c.id and q.active=true
      where public.iberfit_can_access_client_v26(c.id)),'[]'::jsonb),
    'userProfiles',coalesce((select jsonb_agg(to_jsonb(u)) from public.user_profiles u
      where u.client_id in (select q.client_id from public.m26_canary_clients_v26 q where q.active=true and public.iberfit_can_access_client_v26(q.client_id))
         or u.user_id=auth.uid()),'[]'::jsonb),
    'clientProfiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.client_app_profiles p
      join public.m26_canary_clients_v26 q on q.client_id=p.client_id and q.active=true
      where public.iberfit_can_access_client_v26(p.client_id)),'[]'::jsonb),
    'clientAccess',coalesce((select jsonb_agg(to_jsonb(a)) from public.client_access_v26 a
      join public.m26_canary_clients_v26 q on q.client_id=a.client_id and q.active=true
      where public.iberfit_can_access_client_v26(a.client_id)),'[]'::jsonb),
    'iriAssessments',coalesce((select jsonb_agg(to_jsonb(i)) from public.iri_assessments i
      join public.m26_canary_clients_v26 q on q.client_id=i.client_id and q.active=true
      where public.iberfit_can_access_client_v26(i.client_id)),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r
      join public.m26_canary_clients_v26 q on q.client_id=r.client_id and q.active=true
      where public.iberfit_can_access_client_v26(r.client_id)),'[]'::jsonb),
    'trainingCycles',coalesce((select jsonb_agg(to_jsonb(t)) from public.training_cycles t
      join public.m26_canary_clients_v26 q on q.client_id=t.client_id and q.active=true
      where public.iberfit_can_access_client_v26(t.client_id)),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from public.sessions s
      join public.m26_canary_clients_v26 q on q.client_id=s.client_id and q.active=true
      where public.iberfit_can_access_client_v26(s.client_id)),'[]'::jsonb),
    'appointments',coalesce((select jsonb_agg(to_jsonb(a)) from public.appointments a
      join public.m26_canary_clients_v26 q on q.client_id=a.client_id and q.active=true
      where public.iberfit_can_access_client_v26(a.client_id)),'[]'::jsonb),
    'sessionExecutions',coalesce((select jsonb_agg(to_jsonb(e)) from public.session_executions e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'intelligenceRuns',coalesce((select jsonb_agg(to_jsonb(i)) from public.intelligence_runs i
      join public.m26_canary_clients_v26 q on q.client_id=i.client_id and q.active=true
      where public.iberfit_can_access_client_v26(i.client_id)),'[]'::jsonb),
    'timelineEvents',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc) from public.client_timeline_events e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'domainEvents',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.domain_events_v26 e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'coachAvailability',coalesce((select jsonb_agg(to_jsonb(a)) from public.coach_availability_v26 a
      where a.active=true and (a.coach_user_id=auth.uid() or v_role='admin')),'[]'::jsonb),
    'm26Entities',coalesce((select jsonb_agg(jsonb_build_object(
      'entityType',e.entity_type,'entityId',e.entity_id,'clientId',e.client_id,'status',e.status,
      'revision',e.revision,'body',e.body,'updatedAt',e.updated_at
    )) from public.domain_entities_v26 e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'metrics',jsonb_build_object('checkin',null,'progress',null,'iri',null)
  ) into v_data;

  select coalesce(jsonb_object_agg(entity_type||':'||entity_id::text,revision),'{}'::jsonb)
  into v_revisions from public.domain_entities_v26 e
  join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
  where public.iberfit_can_access_client_v26(e.client_id);

  return jsonb_build_object(
    'environment',coalesce((select value #>> '{}' from public.iberfit_system_settings where key='environment'),'UNSET'),
    'serverTime',now(),
    'canary',jsonb_build_object('version','M26-GATE15-FREE-RC1','active',true,'scope','allowlist'),
    'user',jsonb_build_object('id',auth.uid(),'role',v_role,'clientId',public.iberfit_client_id(),
      'name',(select display_name from public.user_profiles where user_id=auth.uid())),
    'remoteRevisions',v_revisions,
    'data',v_data
  );
end $function$;

COMMENT ON FUNCTION public.iberfit_bootstrap_v26_rc29() IS 'Bootstrap M26 filtrado ├║nicamente a clientes canarios accesibles para el actor.';

REVOKE ALL ON FUNCTION public.iberfit_bootstrap_v26_rc29() FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_bootstrap_v26_rc29() TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_result jsonb;
  v_data jsonb;
  v_role text;
  v_revisions jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_role:=public.iberfit_current_role_v26();
  v_result:=public.iberfit_bootstrap_v26_rc29();
  v_data:=coalesce(v_result->'data','{}'::jsonb);

  -- Perfil ├║nico: conserva profile anidado y lo proyecta tambi├®n en primer nivel.
  v_data:=jsonb_set(v_data,'{clientProfiles}',coalesce((
    select jsonb_agg(
      item || coalesce(item->'profile','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'profile',coalesce(item->'profile','{}'::jsonb)
      )
    )
    from jsonb_array_elements(coalesce(v_data->'clientProfiles','[]'::jsonb)) item
  ),'[]'::jsonb),true);

  -- IRI tipado: sections es el cuerpo cl├¡nico-operativo; se proyecta sin duplicar la fuente.
  v_data:=jsonb_set(v_data,'{iriAssessments}',coalesce((
    select jsonb_agg(
      item || coalesce(item->'sections','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'assessmentDate',coalesce(item->>'evaluated_at',item#>>'{sections,assessmentDate}'),
        'body',coalesce(item->'sections','{}'::jsonb)||jsonb_build_object(
          'id',item->'id',
          'clientId',coalesce(item->>'client_id',item->>'clientId'),
          'status',case item->>'status' when 'revisi├│n' then 'completo' when 'retirado' then 'sustituido' else item->>'status' end,
          'revision',coalesce((item->>'revision')::bigint,0)
        )
      )
    )
    from jsonb_array_elements(coalesce(v_data->'iriAssessments','[]'::jsonb)) item
  ),'[]'::jsonb),true);

  v_data:=jsonb_set(v_data,'{checkins}',coalesce((
    select jsonb_agg(to_jsonb(c) order by c.recorded_at desc)
    from public.client_checkins_v26 c
    join public.m26_canary_clients_v26 q on q.client_id=c.client_id and q.active
    where public.iberfit_can_access_client_v26(c.client_id)
  ),'[]'::jsonb),true);
  v_data:=jsonb_set(v_data,'{habits}',coalesce((
    select jsonb_agg(to_jsonb(h) order by h.updated_at desc)
    from public.client_habits_v26 h
    join public.m26_canary_clients_v26 q on q.client_id=h.client_id and q.active
    where public.iberfit_can_access_client_v26(h.client_id)
  ),'[]'::jsonb),true);
  v_data:=jsonb_set(v_data,'{habitLogs}',coalesce((
    select jsonb_agg(to_jsonb(l) order by l.recorded_at desc)
    from public.client_habit_logs_v26 l
    join public.m26_canary_clients_v26 q on q.client_id=l.client_id and q.active
    where public.iberfit_can_access_client_v26(l.client_id)
  ),'[]'::jsonb),true);

  if v_role=any(array['admin','coach']) then
    v_data:=jsonb_set(v_data,'{privateNotes}',coalesce((
      select jsonb_agg(to_jsonb(n) order by n.updated_at desc)
      from public.coach_private_notes_v26 n
      join public.m26_canary_clients_v26 q on q.client_id=n.client_id and q.active
      where public.iberfit_can_access_client_v26(n.client_id)
    ),'[]'::jsonb),true);
  else
    v_data:=jsonb_set(v_data,'{privateNotes}','[]'::jsonb,true);
    v_data:=jsonb_set(v_data,'{intelligenceRuns}','[]'::jsonb,true);
    v_data:=jsonb_set(v_data,'{m26Entities}',coalesce((
      select jsonb_agg(item) from jsonb_array_elements(coalesce(v_data->'m26Entities','[]'::jsonb)) item
      where item->>'entityType' not in ('private_note','intelligence')
    ),'[]'::jsonb),true);
    v_data:=jsonb_set(v_data,'{domainEvents}',coalesce((
      select jsonb_agg(item) from jsonb_array_elements(coalesce(v_data->'domainEvents','[]'::jsonb)) item
      where item->>'entity_type' not in ('private_note','intelligence')
    ),'[]'::jsonb),true);
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_revisions
    from jsonb_each(coalesce(v_result->'remoteRevisions','{}'::jsonb))
    where key not like 'private_note:%' and key not like 'intelligence:%';
    v_result:=jsonb_set(v_result,'{remoteRevisions}',v_revisions,true);
  end if;

  v_result:=jsonb_set(v_result,'{data}',v_data,true);
  v_result:=jsonb_set(v_result,'{canary,version}','"M26-RC36-V12.3"'::jsonb,true);
  return v_result;
end
$function$;

COMMENT ON FUNCTION public.iberfit_bootstrap_v26() IS 'IBERFIT V12.3: proyecta clientProfiles.profile e iriAssessments.sections sin romper RC29/RC30.';

GRANT ALL ON FUNCTION public.iberfit_bootstrap() TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_can_access_client_v26 (
  p_client_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case
    when auth.uid() is null then false
    when public.iberfit_current_role_v26()='admin' then true
    when public.iberfit_current_role_v26()='coach' then public.is_assigned_coach(p_client_id)
    when public.iberfit_current_role_v26()='cliente' then public.iberfit_client_id()=p_client_id
    else false
  end
$function$;

CREATE FUNCTION public.iberfit_can_manage_iri_external_report_v12 (
  p_client_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case
    when auth.uid() is null or p_client_id is null then false
    when exists(select 1 from public.user_profiles u where u.user_id=auth.uid() and lower(u.role::text)='admin') then true
    when exists(select 1 from public.user_profiles u where u.user_id=auth.uid() and lower(u.role::text)='coach')
      and public.is_assigned_coach(p_client_id) then true
    else false
  end;
$function$;

REVOKE ALL ON FUNCTION public.iberfit_can_manage_iri_external_report_v12(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_can_manage_iri_external_report_v12(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_can_manage_iri_external_report_v12(uuid) TO service_role;

CREATE FUNCTION public.iberfit_can_read_iri_external_report_v12 (
  p_client_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(p_client_id=public.iberfit_client_id(),false)
      or public.iberfit_can_manage_iri_external_report_v12(p_client_id);
$function$;

REVOKE ALL ON FUNCTION public.iberfit_can_read_iri_external_report_v12(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_can_read_iri_external_report_v12(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_can_read_iri_external_report_v12(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_canary_enabled_v26 (
  p_client_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists(
    select 1 from public.m26_canary_clients_v26 c
    where c.client_id=p_client_id and c.active=true
  )
$function$;

GRANT ALL ON FUNCTION public.iberfit_client_id() TO service_role;

CREATE FUNCTION public.iberfit_client_onboarding_preflight_v12()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid:=auth.uid();
  v_role text;
  v_environment text;
  v_real_data_allowed boolean;
  v_production_blocked boolean;
  v_ready boolean;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='V12_AUTH_REQUIRED';
  end if;
  select lower(up.role::text) into v_role
  from public.user_profiles up where up.user_id=v_actor;
  if v_role not in ('admin','coach') then
    raise exception using errcode='42501',message='V12_COACH_ROLE_REQUIRED';
  end if;
  select s.value #>> '{}' into v_environment
  from public.iberfit_system_settings s where s.key='environment';
  select coalesce((s.value #>> '{}')::boolean,false) into v_real_data_allowed
  from public.iberfit_system_settings s where s.key='real_data_allowed';
  select coalesce((s.value #>> '{}')::boolean,true) into v_production_blocked
  from public.iberfit_system_settings s where s.key='production_blocked';

  v_ready:=
    exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='client_app_profiles' and column_name='profile' and udt_name='jsonb')
    and to_regclass('public.iri_assessments') is not null
    and to_regclass('public.domain_entities_v26') is not null
    and to_regprocedure('public.iberfit_bootstrap_v26()') is not null
    and to_regprocedure('public.iberfit_create_client_draft(jsonb)') is not null
    and coalesce(v_environment,'')='PRODUCTION'
    and coalesce(v_real_data_allowed,false)=true
    and coalesce(v_production_blocked,true)=false;

  return jsonb_build_object(
    'ok',true,'ready',v_ready,'version','v12.3',
    'role',v_role,'profileSource','client_app_profiles.profile',
    'iriSource','iri_assessments + domain_entities_v26',
    'environment',coalesce(v_environment,''),
    'realDataAllowed',coalesce(v_real_data_allowed,false),
    'productionBlocked',coalesce(v_production_blocked,true)
  );
end
$function$;

COMMENT ON FUNCTION public.iberfit_client_onboarding_preflight_v12() IS 'IBERFIT V12.2.1: preflight autenticado adaptado al esquema real de clients, intake y canary.';

REVOKE ALL ON FUNCTION public.iberfit_client_onboarding_preflight_v12() FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_client_onboarding_preflight_v12() TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_client_onboarding_preflight_v12() TO service_role;

CREATE FUNCTION public.iberfit_command_preflight_v26_rc29 (
  p_command jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_operation_id uuid; v_entity_type text; v_entity_id uuid; v_client_id uuid;
  v_base_revision bigint; v_receipt public.command_receipts_v26%rowtype;
  v_body jsonb; v_revision bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  v_operation_id:=(p_command->>'operationId')::uuid;
  v_entity_type:=nullif(p_command->>'entityType','');
  v_entity_id:=(p_command->>'entityId')::uuid;
  v_client_id:=(p_command->>'clientId')::uuid;
  v_base_revision:=(p_command->>'baseRevision')::bigint;
  if not public.iberfit_can_access_client_v26(v_client_id) then raise exception 'CLIENT_ACCESS_DENIED' using errcode='42501'; end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason','M26_CANARY_NOT_ENABLED','serverAt',now());
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_entity_type||':'||v_entity_id::text,0));
  select * into v_receipt from public.command_receipts_v26 where operation_id=v_operation_id;
  if found then
    return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_receipt.remote_revision,
      'serverAt',v_receipt.processed_at,'duplicate',true,'receipt',to_jsonb(v_receipt));
  end if;
  select body,revision into v_body,v_revision from public.domain_entities_v26
    where entity_type=v_entity_type and entity_id=v_entity_id and client_id=v_client_id;
  if v_body is null then v_body:=public.iberfit_base_entity_v26(v_entity_type,v_entity_id,v_client_id); end if;
  v_revision:=coalesce((v_body->>'revision')::bigint,v_revision,0);
  if coalesce((p_command->>'conflictSensitive')::boolean,true) and v_base_revision<>v_revision then
    return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,
      'reason','REVISION_MISMATCH','serverAt',now());
  end if;
  return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_revision,
    'serverAt',now(),'duplicate',false,'decision','apply');
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end $function$;

REVOKE ALL ON FUNCTION public.iberfit_command_preflight_v26_rc29(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_command_preflight_v26_rc29(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_command_preflight_v26 (
  p_command jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_command jsonb;
  v_result jsonb;
  v_def public.domain_command_registry_v26%rowtype;
  v_type text;
  v_entity_type text;
  v_entity_id uuid;
  v_client_id uuid;
  v_role text;
  v_reason text;
  v_body jsonb;
  v_status text;
  v_to_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_command) <> 'object' then
    raise exception 'INVALID_COMMAND' using errcode = '22023';
  end if;

  v_type := nullif(p_command->>'type','');
  v_entity_type := nullif(p_command->>'entityType','');
  v_entity_id := nullif(p_command->>'entityId','')::uuid;
  v_client_id := nullif(p_command->>'clientId','')::uuid;

  if not public.iberfit_can_access_client_v26(v_client_id) then
    raise exception 'CLIENT_ACCESS_DENIED' using errcode = '42501';
  end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','M26_CANARY_NOT_ENABLED','serverAt',now());
  end if;
  if exists (
    select 1 from public.domain_entities_v26
    where entity_type = v_entity_type and entity_id = v_entity_id and client_id <> v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ENTITY_CLIENT_MISMATCH','serverAt',now());
  end if;

  select * into v_def
  from public.domain_command_registry_v26
  where command_type = v_type and enabled;
  if not found or v_def.entity_type <> v_entity_type then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','COMMAND_NOT_ALLOWED','serverAt',now());
  end if;

  v_role := public.iberfit_current_role_v26();
  if not (v_role = any(v_def.allowed_roles)) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ROLE_NOT_ALLOWED','serverAt',now());
  end if;

  v_command := public.iberfit_prepare_command_rc30_v26(p_command);
  v_reason := nullif(btrim(v_command->'payload'->>'reason'), '');
  if v_def.requires_reason and v_reason is null then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','REASON_REQUIRED','serverAt',now());
  end if;
  if v_def.requires_preview and (
    coalesce((v_command->'payload'->>'previewConfirmed')::boolean,false) = false
    or nullif(v_command->'payload'->>'targetClientId','')::uuid is distinct from v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','PREVIEW_CONFIRMATION_REQUIRED','serverAt',now());
  end if;

  v_result := public.iberfit_command_preflight_v26_rc29(v_command);
  if v_result->>'kind' <> 'ack'
     or coalesce((v_result->>'duplicate')::boolean,false) then
    return v_result;
  end if;

  select body, status into v_body, v_status
  from public.domain_entities_v26
  where entity_type = v_entity_type and entity_id = v_entity_id and client_id = v_client_id;
  if v_body is null then
    v_body := public.iberfit_base_entity_v26(v_entity_type, v_entity_id, v_client_id);
    v_status := v_body->>'status';
  end if;
  if v_body is null then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ENTITY_NOT_FOUND','serverAt',now());
  end if;

  select to_status into v_to_status
  from public.domain_transitions_v26
  where entity_type = v_entity_type
    and from_status = coalesce(v_status, v_body->>'status')
    and event_name = v_def.event_name;
  if v_to_status is null then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',v_result->'remoteRevision','reason','INVALID_TRANSITION','serverAt',now());
  end if;

  return v_result || jsonb_build_object(
    'commandPolicy','server_registry',
    'eventName',v_def.event_name,
    'toStatus',v_to_status
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode = '22023';
end
$function$;

CREATE FUNCTION public.iberfit_communication_bootstrap_v14 (
  p_application text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_context jsonb;v_org uuid;v_user uuid:=auth.uid();v_app text:=lower(btrim(p_application));v_snapshot jsonb;v_client text;v_threads jsonb;v_messages jsonb;v_notifications jsonb;
begin
  select public.iberfit_application_context_v14() into v_context;if coalesce(v_context->>'membershipStatus','')<>'active' then raise exception using errcode='42501',message='V14_ORGANIZATION_ACCESS_SUSPENDED';end if;if not coalesce(v_context->'roles','[]'::jsonb)?v_app or v_app not in('client','coach')then raise exception using errcode='42501',message='V14_COMMUNICATION_ROLE_FORBIDDEN';end if;v_org:=(v_context->>'organizationId')::uuid;select public.iberfit_bootstrap_v26()into v_snapshot;v_client:=coalesce(v_snapshot#>>'{user,clientId}',v_snapshot#>>'{user,client_id}','');
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'clientId',t.client_id,'coachUserId',t.coach_user_id,'status',t.status,'subject',t.subject,'clientName',coalesce((select c->>'name' from jsonb_array_elements(coalesce(v_snapshot#>'{data,clients}','[]'::jsonb))c where c->>'id'=t.client_id limit 1),'Cliente'),'coachName',coalesce((select raw_user_meta_data->>'name' from auth.users where id=t.coach_user_id),(select email from auth.users where id=t.coach_user_id),'Coach IBERFIT'),'createdAt',t.created_at,'updatedAt',t.updated_at,'unreadCount',(select count(*)from public.iberfit_messages m where m.thread_id=t.id and((v_app='client'and m.read_by_client_at is null and m.sender_role<>'client')or(v_app='coach'and m.read_by_coach_at is null and m.sender_role<>'coach'))),'revision',t.revision)order by t.updated_at desc),'[]'::jsonb)into v_threads from public.iberfit_conversation_threads t where t.organization_id=v_org and t.status='active'and((v_app='client'and t.client_id=v_client)or(v_app='coach'and t.coach_user_id=v_user));
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'threadId',m.thread_id,'senderUserId',m.sender_user_id,'senderRole',m.sender_role,'body',m.body,'createdAt',m.created_at,'readByClientAt',m.read_by_client_at,'readByCoachAt',m.read_by_coach_at,'revision',m.revision)order by m.created_at),'[]'::jsonb)into v_messages from public.iberfit_messages m join public.iberfit_conversation_threads t on t.id=m.thread_id where t.organization_id=v_org and((v_app='client'and t.client_id=v_client)or(v_app='coach'and t.coach_user_id=v_user));
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'status',n.status,'createdAt',n.created_at,'readAt',n.read_at,'actionArea',n.action_area,'actionEntityId',n.action_entity_id,'revision',n.revision)order by n.created_at desc),'[]'::jsonb)into v_notifications from public.iberfit_in_app_notifications n where n.organization_id=v_org and((v_app='client'and n.recipient_client_id=v_client)or(v_app='coach'and n.recipient_user_id=v_user));
  return jsonb_build_object('ok',true,'threads',v_threads,'messages',v_messages,'notifications',v_notifications,'revision',1,'serverTime',now());
end $function$;

REVOKE ALL ON FUNCTION public.iberfit_communication_bootstrap_v14(text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_communication_bootstrap_v14(text) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_communication_bootstrap_v14(text) TO service_role;

CREATE FUNCTION public.iberfit_communication_execute_v14 (
  p_application text,
  p_command     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_context jsonb;v_org uuid;v_user uuid:=auth.uid();v_app text:=lower(btrim(p_application));v_snapshot jsonb;v_client text;v_op text:=btrim(p_command->>'operationId');v_type text:=upper(btrim(p_command->>'type'));v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);v_existing jsonb;v_result jsonb;v_thread public.iberfit_conversation_threads;v_id uuid;v_body text;
begin
  select public.iberfit_application_context_v14()into v_context;if not coalesce(v_context->'roles','[]'::jsonb)?v_app or v_app not in('client','coach')then raise exception using errcode='42501',message='V14_COMMUNICATION_ROLE_FORBIDDEN';end if;v_org:=(v_context->>'organizationId')::uuid;select result into v_existing from public.iberfit_communication_receipts where operation_id=v_op and actor_user_id=v_user and command_type=v_type;if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate');end if;select public.iberfit_bootstrap_v26()into v_snapshot;v_client:=coalesce(v_snapshot#>>'{user,clientId}',v_snapshot#>>'{user,client_id}','');
  if v_type='MESSAGE_THREAD_OPEN' then if v_app<>'coach' then raise exception using errcode='42501',message='V14_THREAD_OPEN_FORBIDDEN';end if;if coalesce((v_context->>'assignmentScopeEnforced')::boolean,false)and not coalesce(v_context->'assignedClientIds','[]'::jsonb)?btrim(v_payload->>'clientId')then raise exception using errcode='42501',message='V14_CLIENT_NOT_ASSIGNED';end if;insert into public.iberfit_conversation_threads(organization_id,client_id,coach_user_id,subject,created_by)values(v_org,btrim(v_payload->>'clientId'),v_user,left(coalesce(nullif(btrim(v_payload->>'subject'),''),'Seguimiento IBERFIT'),160),v_user)on conflict(organization_id,coach_user_id,client_id)do update set status='active',subject=excluded.subject,revision=public.iberfit_conversation_threads.revision+1,updated_at=now()returning * into v_thread;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'revision',v_thread.revision,'serverTime',now());
  elsif v_type='MESSAGE_SEND' then select * into v_thread from public.iberfit_conversation_threads where id=(v_payload->>'threadId')::uuid and organization_id=v_org and status='active'and((v_app='coach'and coach_user_id=v_user)or(v_app='client'and client_id=v_client))for update;if not found then raise exception using errcode='42501',message='V14_THREAD_NOT_VISIBLE';end if;v_body:=btrim(v_payload->>'body');if char_length(v_body)not between 1 and 4000 then raise exception using errcode='22023',message='V14_MESSAGE_BODY_INVALID';end if;insert into public.iberfit_messages(organization_id,thread_id,sender_user_id,sender_role,body,read_by_client_at,read_by_coach_at)values(v_org,v_thread.id,v_user,v_app,v_body,case when v_app='client'then now()end,case when v_app='coach'then now()end)returning id into v_id;update public.iberfit_conversation_threads set updated_at=now(),revision=revision+1 where id=v_thread.id returning * into v_thread;if v_app='coach'then insert into public.iberfit_in_app_notifications(organization_id,recipient_client_id,title,body,action_area,action_entity_id)values(v_org,v_thread.client_id,'Nuevo mensaje de tu Coach',left(v_body,300),'mensajes',v_thread.id::text);else insert into public.iberfit_in_app_notifications(organization_id,recipient_user_id,title,body,action_area,action_entity_id)values(v_org,v_thread.coach_user_id,'Nuevo mensaje de un cliente',left(v_body,300),'mensajes',v_thread.id::text);end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'messageId',v_id,'revision',v_thread.revision,'serverTime',now());
  elsif v_type='MESSAGE_MARK_READ' then select * into v_thread from public.iberfit_conversation_threads where id=(v_payload->>'threadId')::uuid and organization_id=v_org and((v_app='coach'and coach_user_id=v_user)or(v_app='client'and client_id=v_client));if not found then raise exception using errcode='42501',message='V14_THREAD_NOT_VISIBLE';end if;if v_app='coach'then update public.iberfit_messages set read_by_coach_at=coalesce(read_by_coach_at,now()),revision=revision+1 where thread_id=v_thread.id and sender_role<>'coach';else update public.iberfit_messages set read_by_client_at=coalesce(read_by_client_at,now()),revision=revision+1 where thread_id=v_thread.id and sender_role<>'client';end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'serverTime',now());
  elsif v_type='NOTIFICATION_MARK_READ' then if v_app='coach'then update public.iberfit_in_app_notifications set status='read',read_at=now(),revision=revision+1 where id=(v_payload->>'notificationId')::uuid and recipient_user_id=v_user;else update public.iberfit_in_app_notifications set status='read',read_at=now(),revision=revision+1 where id=(v_payload->>'notificationId')::uuid and recipient_client_id=v_client;end if;if not found then raise exception using errcode='P0002',message='V14_NOTIFICATION_NOT_FOUND';end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'serverTime',now());
  else raise exception using errcode='22023',message='V14_COMMUNICATION_COMMAND_INVALID';end if;
  insert into public.iberfit_communication_receipts(operation_id,organization_id,actor_user_id,command_type,result)values(v_op,v_org,v_user,v_type,v_result);return v_result;
end $function$;

REVOKE ALL ON FUNCTION public.iberfit_communication_execute_v14(text, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_communication_execute_v14(text, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_communication_execute_v14(text, jsonb) TO service_role;

CREATE FUNCTION public.iberfit_create_client_draft_v12 (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
  if coalesce(v_environment,'')<>'PRODUCTION'
     or coalesce(v_real_data_allowed,false)=false
     or coalesce(v_production_blocked,true)=true then
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
    when 'H├¡brido' then 'hibrido' when 'hibrido' then 'hibrido'
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
    case i.status::text when 'revisi├│n' then 'completo' when 'retirado' then 'sustituido' else i.status::text end,
    i.revision,
    coalesce(i.sections,'{}'::jsonb)||jsonb_build_object(
      'id',i.id,'clientId',i.client_id,
      'status',case i.status::text when 'revisi├│n' then 'completo' when 'retirado' then 'sustituido' else i.status::text end,
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
$function$;

COMMENT ON FUNCTION public.iberfit_create_client_draft_v12(jsonb) IS 'IBERFIT V12.3: alta idempotente con perfil ├║nico, borrador IRI f├¡sico y entidad can├│nica visible.';

REVOKE ALL ON FUNCTION public.iberfit_create_client_draft_v12(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_create_client_draft_v12(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_create_client_draft_v12(jsonb) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_create_client_draft(jsonb) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_current_client_id() TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_current_role_v26()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case coalesce(public.iberfit_role()::text,'sin_rol')
    when 'client' then 'cliente'
    else coalesce(public.iberfit_role()::text,'sin_rol')
  end
$function$;

GRANT ALL ON FUNCTION public.iberfit_current_role() TO service_role;

GRANT ALL ON FUNCTION public.iberfit_environment() TO service_role;

CREATE FUNCTION public.iberfit_execute_command_v26_rc29 (
  p_command jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_operation_id uuid; v_command_type text; v_entity_type text; v_entity_id uuid; v_client_id uuid;
  v_base_revision bigint; v_conflict_sensitive boolean; v_payload jsonb; v_role text; v_now timestamptz:=now();
  v_def public.domain_command_registry_v26%rowtype; v_receipt public.command_receipts_v26%rowtype;
  v_body jsonb; v_next_body jsonb; v_status text; v_to_status text; v_revision bigint; v_next_revision bigint;
  v_reason text; v_response jsonb:='{}'::jsonb; v_related jsonb; v_related_revision bigint;
  v_appointment jsonb; v_execution_id uuid; v_appointment_id uuid; v_plan_id uuid; v_plan jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_command)<>'object' then raise exception 'INVALID_COMMAND' using errcode='22023'; end if;

  v_operation_id:=(p_command->>'operationId')::uuid;
  v_command_type:=nullif(p_command->>'type','');
  v_entity_type:=nullif(p_command->>'entityType','');
  v_entity_id:=(p_command->>'entityId')::uuid;
  v_client_id:=(p_command->>'clientId')::uuid;
  v_base_revision:=(p_command->>'baseRevision')::bigint;
  v_conflict_sensitive:=coalesce((p_command->>'conflictSensitive')::boolean,true);
  v_payload:=coalesce(p_command->'payload','{}'::jsonb);
  v_role:=public.iberfit_current_role_v26();
  v_reason:=nullif(btrim(v_payload->>'reason'),'');

  if v_command_type is null or v_entity_type is null or v_base_revision<0 then
    raise exception 'INVALID_COMMAND' using errcode='22023';
  end if;
  if not public.iberfit_can_access_client_v26(v_client_id) then raise exception 'CLIENT_ACCESS_DENIED' using errcode='42501'; end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','M26_CANARY_NOT_ENABLED','serverAt',v_now);
  end if;

  select * into v_def from public.domain_command_registry_v26 where command_type=v_command_type and enabled=true;
  if not found or v_def.entity_type<>v_entity_type then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','COMMAND_NOT_ALLOWED','serverAt',v_now);
  end if;
  if not (v_role=any(v_def.allowed_roles)) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','ROLE_NOT_ALLOWED','serverAt',v_now);
  end if;
  if v_def.requires_reason and v_reason is null then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','REASON_REQUIRED','serverAt',v_now);
  end if;
  if v_def.requires_preview and (
    coalesce((v_payload->>'previewConfirmed')::boolean,false)=false
    or nullif(v_payload->>'targetClientId','')::uuid is distinct from v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','PREVIEW_CONFIRMATION_REQUIRED','serverAt',v_now);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_entity_type||':'||v_entity_id::text,0));
  select * into v_receipt from public.command_receipts_v26 where operation_id=v_operation_id;
  if found then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'duplicate',v_base_revision,v_receipt.remote_revision,'Recibo existente');
    return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_receipt.remote_revision,
      'serverAt',v_receipt.processed_at,'duplicate',true,'receipt',to_jsonb(v_receipt));
  end if;

  select body,status,revision into v_body,v_status,v_revision
  from public.domain_entities_v26
  where entity_type=v_entity_type and entity_id=v_entity_id and client_id=v_client_id;
  if v_body is null then
    v_body:=public.iberfit_base_entity_v26(v_entity_type,v_entity_id,v_client_id);
    v_status:=v_body->>'status'; v_revision:=coalesce((v_body->>'revision')::bigint,0);
  end if;
  if v_body is null and v_def.bootstrap_allowed then
    v_status:=case v_entity_type
      when 'client_access' then 'sin_acceso' when 'planning' then 'borrador'
      when 'appointment' then 'propuesta' when 'intelligence' then 'borrador' else null end;
    v_revision:=0;
    v_body:=jsonb_build_object('id',v_entity_id,'clientId',v_client_id,'status',v_status,'revision',0,
      'createdAt',v_now,'updatedAt',v_now);
  end if;
  if v_body is null then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'rejected',v_base_revision,'ENTITY_NOT_FOUND');
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason','ENTITY_NOT_FOUND','serverAt',v_now);
  end if;

  v_status:=coalesce(v_status,v_body->>'status');
  v_revision:=coalesce(v_revision,(v_body->>'revision')::bigint,0);
  if v_conflict_sensitive and v_base_revision<>v_revision then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'conflict',v_base_revision,v_revision,'REVISION_MISMATCH');
    insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_role,'conflict',v_status,v_status,v_base_revision,v_revision,'REVISION_MISMATCH');
    return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,'reason','REVISION_MISMATCH','serverAt',v_now);
  end if;

  select to_status into v_to_status from public.domain_transitions_v26
  where entity_type=v_entity_type and from_status=v_status and event_name=v_def.event_name;
  if v_to_status is null then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'rejected',v_base_revision,v_revision,'INVALID_TRANSITION');
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','INVALID_TRANSITION','serverAt',v_now);
  end if;

  v_next_revision:=v_revision+1;
  v_next_body:=v_body || case when jsonb_typeof(v_payload->'patch')='object' then v_payload->'patch' else '{}'::jsonb end;

  if v_command_type='PLAN_VALIDAR' and jsonb_typeof(v_payload->'draft')='object' then
    v_next_body:=v_next_body || (v_payload->'draft');
  elsif v_command_type in ('CITA_CREAR','CITA_REPROGRAMAR') and jsonb_typeof(v_payload->'appointment')='object' then
    v_next_body:=v_next_body || (v_payload->'appointment');
    if nullif(v_next_body->>'startAt','') is null or nullif(v_next_body->>'endAt','') is null
       or (v_next_body->>'endAt')::timestamptz <= (v_next_body->>'startAt')::timestamptz then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','INVALID_APPOINTMENT_RANGE','serverAt',v_now);
    end if;
    if exists(
      select 1 from public.appointments a
      where a.client_id=v_client_id and a.id<>v_entity_id and a.status in ('propuesta','confirmada')
        and tstzrange(a.start_at,a.end_at,'[)') && tstzrange((v_next_body->>'startAt')::timestamptz,(v_next_body->>'endAt')::timestamptz,'[)')
    ) then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','APPOINTMENT_OVERLAP','serverAt',v_now);
    end if;
  elsif v_command_type='INTELIGENCIA_GENERAR' then
    if jsonb_typeof(v_payload->'proposal')<>'object' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','STRUCTURED_PROPOSAL_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object(
      'proposal',v_payload->'proposal','provider',v_payload->>'provider','providerMode',v_payload->>'providerMode',
      'providerModel',v_payload->>'model','providerRequestId',v_payload->>'requestId',
      'fallbackReason',v_payload->>'fallbackReason','generatedAt',v_now,'generatedBy',auth.uid()
    );
  elsif v_command_type='INTELIGENCIA_REVISAR' then
    if nullif(btrim(v_payload->>'reviewSummary'),'') is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','REVIEW_SUMMARY_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object('reviewSummary',v_payload->>'reviewSummary','reviewedAt',v_now,'reviewedBy',auth.uid());
  elsif v_command_type in ('CLIENTE_INVITAR','CLIENTE_REINVITAR','CLIENTE_REENVIAR_INVITACION') then
    if nullif(v_payload->>'email','') is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EMAIL_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object('email',v_payload->>'email','invitationSentAt',v_now,
      'invitationSentBy',auth.uid(),'invitationAttemptCount',coalesce((v_body->>'invitationAttemptCount')::integer,0)+1);
  elsif v_command_type='CLIENTE_ACTIVAR' then
    v_next_body:=v_next_body || jsonb_build_object('authUserId',v_payload->>'authUserId','activatedAt',v_now);
  elsif v_command_type='EJECUCION_GUARDAR_PROGRESO' then
    if jsonb_typeof(v_payload->'progressSnapshot')<>'object' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PROGRESS_SNAPSHOT_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object(
      'progressSnapshot',v_payload->'progressSnapshot','items',coalesce(v_payload->'progressSnapshot'->'items','[]'::jsonb),
      'cursor',coalesce(v_payload->'progressSnapshot'->'cursor','{}'::jsonb),
      'incidents',coalesce(v_payload->'progressSnapshot'->'incidents','[]'::jsonb),
      'progressSavedAt',v_now,'progressSavedBy',auth.uid()
    );
  end if;

  if v_command_type='SESION_INICIAR' then
    v_execution_id:=nullif(v_payload->>'executionId','')::uuid;
    v_appointment_id:=nullif(v_payload->>'appointmentId','')::uuid;
    if v_execution_id is null or v_appointment_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EXECUTION_AND_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    if exists(select 1 from public.active_execution_locks_v26 where client_id=v_client_id) then
      return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,'reason','ACTIVE_EXECUTION_EXISTS','serverAt',v_now);
    end if;
    v_appointment:=public.iberfit_base_entity_v26('appointment',v_appointment_id,v_client_id);
    if v_appointment is null or v_appointment->>'status'<>'confirmada'
       or nullif(v_appointment->>'sessionId','')::uuid is distinct from v_entity_id then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','CONFIRMED_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    v_related:=jsonb_build_object(
      'id',v_execution_id,'clientId',v_client_id,'sessionId',v_entity_id,'appointmentId',v_appointment_id,
      'status','en_curso','revision',1,'startedAt',v_now,'startedBy',auth.uid(),
      'mode',coalesce(v_next_body->>'type',v_next_body->>'execution_type'),
      'sourceRevision',v_revision,'sourceSnapshot',coalesce(v_next_body->'publishedSnapshot',v_next_body->'prescription',v_next_body),
      'items',coalesce(v_next_body->'publishedSnapshot'->'items',v_next_body->'prescription'->'items',v_next_body->'blocks','[]'::jsonb),
      'cursor',jsonb_build_object('itemIndex',0,'setIndex',0),'incidents','[]'::jsonb
    );
    perform public.iberfit_persist_entity_v26('session_execution',v_execution_id,v_client_id,'en_curso',1,v_related);
    insert into public.active_execution_locks_v26(client_id,session_id,execution_id,acquired_by)
    values(v_client_id,v_entity_id,v_execution_id,auth.uid());
    v_next_body:=v_next_body || jsonb_build_object('activeExecutionId',v_execution_id,'appointmentId',v_appointment_id,'startedAt',v_now,'startedBy',auth.uid());
    v_response:=jsonb_build_object('executionId',v_execution_id,'executionRevision',1,'appointmentId',v_appointment_id);
    insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,details)
    values(v_operation_id,v_command_type,'session_execution',v_execution_id,v_client_id,auth.uid(),v_role,'related_applied','creada','en_curso',0,1,jsonb_build_object('sessionId',v_entity_id));
  elsif v_command_type='EJECUCION_COMPLETAR' then
    delete from public.active_execution_locks_v26 where client_id=v_client_id and execution_id=v_entity_id;
    if nullif(v_body->>'sessionId','') is not null then
      v_related:=public.iberfit_base_entity_v26('session',(v_body->>'sessionId')::uuid,v_client_id);
      select body,revision into v_plan,v_related_revision from public.domain_entities_v26
        where entity_type='session' and entity_id=(v_body->>'sessionId')::uuid and client_id=v_client_id;
      v_related:=coalesce(v_plan,v_related);
      if v_related is not null then
        v_related_revision:=coalesce(v_related_revision,(v_related->>'revision')::bigint,0)+1;
        v_related:=v_related || jsonb_build_object('status','completada','revision',v_related_revision,'completedAt',v_now,'updatedAt',v_now);
        perform public.iberfit_persist_entity_v26('session',(v_body->>'sessionId')::uuid,v_client_id,'completada',v_related_revision,v_related);
      end if;
    end if;
    if nullif(v_body->>'appointmentId','') is not null then
      v_related:=public.iberfit_base_entity_v26('appointment',(v_body->>'appointmentId')::uuid,v_client_id);
      if v_related is not null then
        v_related_revision:=coalesce((v_related->>'revision')::bigint,0)+1;
        v_related:=v_related || jsonb_build_object('status','completada','revision',v_related_revision,'completedAt',v_now,'completedBy',auth.uid(),'updatedAt',v_now);
        perform public.iberfit_persist_entity_v26('appointment',(v_body->>'appointmentId')::uuid,v_client_id,'completada',v_related_revision,v_related);
      end if;
    end if;
    v_next_body:=v_next_body || jsonb_build_object('completedAt',v_now,'completedBy',auth.uid(),'feedback',coalesce(v_payload->'feedback','{}'::jsonb));
  elsif v_command_type='INTELIGENCIA_APLICAR_A_BORRADOR' then
    v_plan_id:=nullif(v_payload->>'planDraftId','')::uuid;
    if v_plan_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PLAN_DRAFT_REQUIRED','serverAt',v_now);
    end if;
    select body,revision into v_plan,v_related_revision from public.domain_entities_v26
      where entity_type='planning' and entity_id=v_plan_id and client_id=v_client_id;
    if v_plan is null then v_plan:=public.iberfit_base_entity_v26('planning',v_plan_id,v_client_id); end if;
    v_related_revision:=coalesce(v_related_revision,(v_plan->>'revision')::bigint,0);
    if v_plan is null or v_plan->>'status'<>'borrador' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PLAN_NOT_DRAFT','serverAt',v_now);
    end if;
    if v_related_revision<>coalesce((v_payload->>'planBaseRevision')::bigint,-1) then
      return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_related_revision,'reason','PLAN_REVISION_MISMATCH','serverAt',v_now);
    end if;
    v_related_revision:=v_related_revision+1;
    v_plan:=v_plan || jsonb_build_object('revision',v_related_revision,'updatedAt',v_now,
      'aiSuggestions',coalesce(v_plan->'aiSuggestions','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id',v_operation_id,'intelligenceRunId',v_entity_id,'proposal',v_body->'proposal','addedAt',v_now,
        'addedBy',auth.uid(),'status','pendiente_revision_editor')));
    perform public.iberfit_persist_entity_v26('planning',v_plan_id,v_client_id,'borrador',v_related_revision,v_plan);
    v_next_body:=v_next_body || jsonb_build_object('appliedAt',v_now,'appliedBy',auth.uid(),'appliedPlanId',v_plan_id);
    v_response:=jsonb_build_object('planId',v_plan_id,'planRevision',v_related_revision,'suggestionId',v_operation_id);
  end if;

  if v_to_status in ('aprobado','aprobada') then
    v_next_body:=v_next_body || jsonb_build_object('approvedAt',v_now,'approvedBy',auth.uid());
  elsif v_to_status in ('publicado','publicada') then
    v_next_body:=v_next_body || jsonb_build_object('publishedAt',v_now,'publishedBy',auth.uid());
  elsif v_to_status='retirado' then
    v_next_body:=v_next_body || jsonb_build_object('retiredAt',v_now,'retiredBy',auth.uid(),'retireReason',v_reason);
  elsif v_to_status in ('cancelada','anulado','archivado','descartada','revocado','suspendido') then
    v_next_body:=v_next_body || jsonb_build_object('closedAt',v_now,'closedBy',auth.uid(),'closeReason',v_reason);
  end if;
  if v_def.snapshot_on_apply then
    v_next_body:=v_next_body || jsonb_build_object('publishedSnapshot',coalesce(v_next_body->'content',v_next_body->'sessions',v_next_body->'blocks',v_next_body),
      'publishedRevision',v_next_revision);
  end if;

  v_next_body:=v_next_body || jsonb_build_object('id',v_entity_id,'clientId',v_client_id,'status',v_to_status,
    'revision',v_next_revision,'updatedAt',v_now);
  perform public.iberfit_persist_entity_v26(v_entity_type,v_entity_id,v_client_id,v_to_status,v_next_revision,v_next_body);

  insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,payload_hash)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'applied',v_base_revision,v_next_revision,md5(v_payload::text));
  insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,reason,details)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_role,'applied',v_status,v_to_status,v_base_revision,v_next_revision,v_reason,v_response);

  insert into public.command_receipts_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,base_revision,remote_revision,response,processed_at)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_base_revision,v_next_revision,v_response,v_now)
  returning * into v_receipt;

  return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_next_revision,
    'serverAt',v_now,'duplicate',false,'receipt',to_jsonb(v_receipt));
exception
  when invalid_text_representation or numeric_value_out_of_range or null_value_not_allowed then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end $function$;

COMMENT ON FUNCTION public.iberfit_execute_command_v26_rc29(jsonb) IS 'Command Bus M26 at├│mico: entidad, eventos y recibo se confirman en una sola transacci├│n.';

REVOKE ALL ON FUNCTION public.iberfit_execute_command_v26_rc29(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_execute_command_v26_rc29(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_execute_command_v26 (
  p_command jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_command jsonb;
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
      status=(case v_status when 'completo' then 'revisi├│n' when 'sustituido' then 'retirado'
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

    v_profile:=case when jsonb_typeof(v_body->'personProfile')='object' then v_body->'personProfile' else '{}'::jsonb end;
    if v_profile<>'{}'::jsonb then
      v_email:=lower(nullif(btrim(v_profile->>'email'),''));
      if v_email is not null and exists(
        select 1 from public.client_intake_profiles i
        where lower(btrim(i.email))=v_email and i.client_id<>v_client_id
      ) then
        raise exception using errcode='23505',message='V123_PROFILE_EMAIL_ALREADY_EXISTS';
      end if;

      update public.client_app_profiles ap
      set profile=coalesce(ap.profile,'{}'::jsonb)||v_profile
      where ap.id=(select p.id from public.client_app_profiles p
        where p.client_id=v_client_id order by p.version desc,p.created_at desc limit 1);

      begin
        v_modality:=case v_profile->>'modality'
          when 'presencial' then 'Presencial'::public.client_modality
          when 'hibrido' then 'H├¡brido'::public.client_modality
          when 'online' then 'Online'::public.client_modality
          else null end;
      exception when others then v_modality:=null; end;
      v_frequency:=case when coalesce(v_profile->>'weeklyFrequency','') ~ '^[0-9]+$'
        and (v_profile->>'weeklyFrequency')::integer>0
        then (v_profile->>'weeklyFrequency')||' sesiones por semana' else null end;

      update public.clients set
        objective=coalesce(nullif(btrim(v_profile->>'primaryObjective'),''),objective),
        modality=coalesce(v_modality,modality)
      where id=v_client_id;

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
    end if;
  end if;

  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end
$function$;

COMMENT ON FUNCTION public.iberfit_execute_command_v26(jsonb) IS 'IBERFIT V12.3: tras ACK IRI sincroniza sections, perfil, intake y expediente.';

GRANT ALL ON FUNCTION public.iberfit_exercise_facets() TO service_role;

CREATE FUNCTION public.iberfit_external_report_path_assessment_v12 (
  p_name text
)
  RETURNS uuid
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare v_part text;
begin
  v_part:=split_part(coalesce(p_name,''),'/',2);
  if v_part is null or v_part !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return v_part::uuid;
exception when others then return null;
end
$function$;

GRANT ALL ON FUNCTION public.iberfit_external_report_path_assessment_v12(text) TO anon;

GRANT ALL ON FUNCTION public.iberfit_external_report_path_assessment_v12(text) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_external_report_path_assessment_v12(text) TO service_role;

CREATE FUNCTION public.iberfit_external_report_path_client_v12 (
  p_name text
)
  RETURNS uuid
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare v_part text;
begin
  v_part:=split_part(coalesce(p_name,''),'/',1);
  if v_part is null or v_part !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return v_part::uuid;
exception when others then return null;
end
$function$;

GRANT ALL ON FUNCTION public.iberfit_external_report_path_client_v12(text) TO anon;

GRANT ALL ON FUNCTION public.iberfit_external_report_path_client_v12(text) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_external_report_path_client_v12(text) TO service_role;

CREATE FUNCTION public.iberfit_iri_external_report_preflight_v12()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid:=auth.uid();
  v_role text;
  v_bucket_public boolean;
begin
  if v_actor is null then raise exception using errcode='28000',message='V124_AUTH_REQUIRED'; end if;
  select lower(u.role::text) into v_role from public.user_profiles u where u.user_id=v_actor;
  if v_role not in ('admin','coach','client','cliente') then raise exception using errcode='42501',message='V124_ROLE_REQUIRED'; end if;
  select b.public into v_bucket_public from storage.buckets b where b.id='iberfit-iri-external-reports';
  return jsonb_build_object(
    'ok',true,'ready',
      to_regclass('public.iri_external_reports_v26') is not null
      and coalesce(v_bucket_public,true)=false,
    'version','v12.4','role',v_role,
    'bucket','iberfit-iri-external-reports','private',coalesce(v_bucket_public,true)=false,
    'maxBytes',50000000,
    'mimeTypes',jsonb_build_array('application/pdf','image/jpeg','image/png')
  );
end
$function$;

REVOKE ALL ON FUNCTION public.iberfit_iri_external_report_preflight_v12() FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_iri_external_report_preflight_v12() TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_iri_external_report_preflight_v12() TO service_role;

GRANT ALL ON FUNCTION public.iberfit_is_assigned_coach(uuid) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_operation_allowed(text, uuid) TO service_role;

CREATE FUNCTION public.iberfit_persist_entity_v26_rc29 (
  p_entity_type text,
  p_entity_id   uuid,
  p_client_id   uuid,
  p_status      text,
  p_revision    bigint,
  p_body        jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare v_existing_status public.publication_status;
begin
  insert into public.domain_entities_v26(entity_type,entity_id,client_id,status,revision,body,updated_at)
  values(p_entity_type,p_entity_id,p_client_id,p_status,p_revision,p_body,now())
  on conflict(entity_type,entity_id) do update set
    client_id=excluded.client_id,status=excluded.status,revision=excluded.revision,
    body=excluded.body,updated_at=excluded.updated_at;

  if p_entity_type='appointment' then
    insert into public.appointments(
      id,client_id,session_id,appointment_type,title,mode,location,start_at,end_at,time_zone,
      status,revision,created_by,confirmed_at,confirmed_by,cancelled_at,cancelled_by,
      cancellation_reason,completed_at,completed_by,payload,updated_at
    ) values(
      p_entity_id,p_client_id,nullif(p_body->>'sessionId','')::uuid,
      coalesce(nullif(p_body->>'type',''),'session'),coalesce(nullif(p_body->>'title',''),'Cita IBERFIT'),
      coalesce(nullif(p_body->>'mode',''),'presencial'),nullif(p_body->>'location',''),
      (p_body->>'startAt')::timestamptz,(p_body->>'endAt')::timestamptz,
      coalesce(nullif(p_body->>'timeZone',''),'America/Santiago'),p_status,p_revision,
      nullif(p_body->>'createdBy','')::uuid,
      nullif(p_body->>'confirmedAt','')::timestamptz,nullif(p_body->>'confirmedBy','')::uuid,
      nullif(p_body->>'cancelledAt','')::timestamptz,nullif(p_body->>'cancelledBy','')::uuid,
      nullif(p_body->>'closeReason',''),nullif(p_body->>'completedAt','')::timestamptz,
      nullif(p_body->>'completedBy','')::uuid,p_body,now()
    ) on conflict(id) do update set
      session_id=excluded.session_id,appointment_type=excluded.appointment_type,title=excluded.title,
      mode=excluded.mode,location=excluded.location,start_at=excluded.start_at,end_at=excluded.end_at,
      time_zone=excluded.time_zone,status=excluded.status,revision=excluded.revision,
      confirmed_at=excluded.confirmed_at,confirmed_by=excluded.confirmed_by,
      cancelled_at=excluded.cancelled_at,cancelled_by=excluded.cancelled_by,
      cancellation_reason=excluded.cancellation_reason,completed_at=excluded.completed_at,
      completed_by=excluded.completed_by,payload=excluded.payload,updated_at=now();
  elsif p_entity_type='client_access' then
    insert into public.client_access_v26(
      id,client_id,auth_user_id,email,status,revision,invitation_attempt_count,
      invitation_sent_at,activated_at,closed_at,close_reason,updated_at
    ) values(
      p_entity_id,p_client_id,nullif(p_body->>'authUserId','')::uuid,p_body->>'email',p_status,p_revision,
      coalesce((p_body->>'invitationAttemptCount')::integer,0),
      nullif(p_body->>'invitationSentAt','')::timestamptz,
      nullif(p_body->>'activatedAt','')::timestamptz,
      nullif(p_body->>'closedAt','')::timestamptz,p_body->>'closeReason',now()
    ) on conflict(client_id) do update set
      auth_user_id=excluded.auth_user_id,email=excluded.email,status=excluded.status,
      revision=excluded.revision,invitation_attempt_count=excluded.invitation_attempt_count,
      invitation_sent_at=excluded.invitation_sent_at,activated_at=excluded.activated_at,
      closed_at=excluded.closed_at,close_reason=excluded.close_reason,updated_at=now();
  elsif p_entity_type='session_execution' then
    insert into public.session_executions(
      id,session_id,client_id,execution_status,summary,started_by,updated_at,revision
    ) values(
      p_entity_id,(p_body->>'sessionId')::uuid,p_client_id,
      case p_status when 'pausada' then 'pausada' when 'completada' then 'cerrada_confirmada'
        when 'cancelada' then 'cierre_rechazado' else 'activa' end,
      p_body,nullif(p_body->>'startedBy','')::uuid,now(),p_revision
    ) on conflict(id) do update set
      execution_status=excluded.execution_status,summary=excluded.summary,
      updated_at=now(),revision=excluded.revision;
  elsif p_entity_type='report' then
    update public.reports set
      status=(case p_status when 'anulado' then 'retirado' else p_status end)::public.publication_status,
      revision=p_revision,
      approved_at=case when p_status='aprobado' then coalesce(approved_at,now()) else approved_at end,
      published_at=case when p_status='publicado' then coalesce(published_at,now()) else published_at end
    where id=p_entity_id and client_id=p_client_id;
  elsif p_entity_type='iri' then
    update public.iri_assessments set
      status=(case p_status when 'completo' then 'revisi├│n' when 'sustituido' then 'retirado'
        when 'anulado' then 'retirado' else p_status end)::public.publication_status,
      revision=p_revision,
      approved_at=case when p_status='aprobado' then coalesce(approved_at,now()) else approved_at end,
      updated_at=now()
    where id=p_entity_id and client_id=p_client_id;
  elsif p_entity_type='planning' then
    update public.training_cycles set
      status=(case p_status when 'validado' then 'revisi├│n' when 'archivado' then 'retirado' else p_status end)::public.publication_status,
      revision=p_revision,
      published_at=case when p_status='publicado' then coalesce(published_at,now()) else published_at end
    where id=p_entity_id and client_id=p_client_id;
  elsif p_entity_type='session' then
    select status into v_existing_status from public.sessions where id=p_entity_id and client_id=p_client_id;
    update public.sessions set
      status=(case
        when p_status='aprobada' then 'aprobado'
        when p_status in ('publicada','disponible','en_curso','completada') then 'publicado'
        when p_status='cancelada' then 'retirado'
        else coalesce(v_existing_status::text,'borrador') end)::public.publication_status,
      revision=greatest(revision,p_revision),
      published_at=case when p_status in ('publicada','disponible','en_curso','completada') then coalesce(published_at,now()) else published_at end
    where id=p_entity_id and client_id=p_client_id;
  end if;
end $function$;

COMMENT ON FUNCTION public.iberfit_persist_entity_v26_rc29(text,uuid,uuid,text,bigint,jsonb) IS 'M26 internal mutation helper. Only called by the transactional command bus.';

REVOKE ALL ON FUNCTION public.iberfit_persist_entity_v26_rc29(text, uuid, uuid, text, bigint, jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_persist_entity_v26_rc29(text, uuid, uuid, text, bigint, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.iberfit_persist_entity_v26 (
  p_entity_type text,
  p_entity_id   uuid,
  p_client_id   uuid,
  p_status      text,
  p_revision    bigint,
  p_body        jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
begin
  if p_entity_type = any(array['checkin','habit','habit_log','private_note']) and exists (
    select 1 from public.domain_entities_v26
    where entity_type = p_entity_type
      and entity_id = p_entity_id
      and client_id <> p_client_id
  ) then
    raise exception 'ENTITY_CLIENT_MISMATCH' using errcode = '42501';
  end if;

  perform public.iberfit_persist_entity_v26_rc29(
    p_entity_type, p_entity_id, p_client_id, p_status, p_revision, p_body
  );

  if p_entity_type = 'checkin' then
    insert into public.client_checkins_v26(
      id, client_id, energy, sleep, stress, pain, notes, status, revision,
      recorded_at, created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, (p_body->>'energy')::numeric,
      (p_body->>'sleep')::numeric, (p_body->>'stress')::numeric,
      (p_body->>'pain')::numeric, coalesce(p_body->>'notes',''), p_status,
      p_revision, (p_body->>'recordedAt')::timestamptz,
      coalesce(nullif(p_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(p_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      energy = excluded.energy, sleep = excluded.sleep, stress = excluded.stress,
      pain = excluded.pain, notes = excluded.notes, status = excluded.status,
      revision = excluded.revision, recorded_at = excluded.recorded_at, updated_at = now()
    where client_checkins_v26.client_id = excluded.client_id;

  elsif p_entity_type = 'habit' then
    insert into public.client_habits_v26(
      id, client_id, title, description, target, unit, frequency, status,
      revision, created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, p_body->>'title', coalesce(p_body->>'description',''),
      (p_body->>'target')::numeric, p_body->>'unit', p_body->>'frequency',
      p_status, p_revision, coalesce(nullif(p_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(p_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      title = excluded.title, description = excluded.description, target = excluded.target,
      unit = excluded.unit, frequency = excluded.frequency, status = excluded.status,
      revision = excluded.revision, updated_at = now()
    where client_habits_v26.client_id = excluded.client_id;

  elsif p_entity_type = 'habit_log' then
    insert into public.client_habit_logs_v26(
      id, client_id, habit_id, completed, value, notes, status, revision,
      recorded_at, created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, (p_body->>'habitId')::uuid,
      coalesce((p_body->>'completed')::boolean, false), p_body->'value',
      coalesce(p_body->>'notes',''), p_status, p_revision,
      (p_body->>'recordedAt')::timestamptz,
      coalesce(nullif(p_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(p_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      completed = excluded.completed, value = excluded.value, notes = excluded.notes,
      status = excluded.status, revision = excluded.revision,
      recorded_at = excluded.recorded_at, updated_at = now()
    where client_habit_logs_v26.client_id = excluded.client_id;

  elsif p_entity_type = 'private_note' then
    insert into public.coach_private_notes_v26(
      id, client_id, body, visibility, status, revision,
      created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, p_body->>'body', 'coach_only', p_status, p_revision,
      coalesce(nullif(p_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(p_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      body = excluded.body, visibility = 'coach_only', status = excluded.status,
      revision = excluded.revision, updated_at = now()
    where coach_private_notes_v26.client_id = excluded.client_id;
  end if;
end
$function$;

CREATE FUNCTION public.iberfit_prepare_command_rc30_v26 (
  p_command jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_command jsonb := p_command;
  v_payload jsonb;
  v_patch jsonb;
  v_def public.domain_command_registry_v26%rowtype;
  v_type text;
  v_entity_type text;
  v_client_id uuid;
  v_reason text;
  v_preview boolean;
  v_recorded_at timestamptz;
  v_habit_id uuid;
  v_energy numeric;
  v_sleep numeric;
  v_stress numeric;
  v_pain numeric;
  v_target numeric;
begin
  if jsonb_typeof(p_command) <> 'object' then
    raise exception 'INVALID_COMMAND' using errcode = '22023';
  end if;
  if octet_length(p_command::text) > 262144 then
    raise exception 'COMMAND_PAYLOAD_TOO_LARGE' using errcode = '22023';
  end if;

  v_type := nullif(p_command->>'type', '');
  v_entity_type := nullif(p_command->>'entityType', '');
  v_client_id := nullif(p_command->>'clientId', '')::uuid;
  v_payload := coalesce(p_command->'payload', '{}'::jsonb);
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'INVALID_COMMAND_PAYLOAD' using errcode = '22023';
  end if;

  select * into v_def
  from public.domain_command_registry_v26
  where command_type = v_type and enabled;

  if found then
    v_command := jsonb_set(
      v_command,
      '{conflictSensitive}',
      to_jsonb(v_def.conflict_sensitive),
      true
    );
  end if;

  v_reason := nullif(btrim(coalesce(p_command->>'reason', v_payload->>'reason')), '');
  if v_reason is not null then
    v_payload := jsonb_set(v_payload, '{reason}', to_jsonb(left(v_reason, 1000)), true);
  end if;

  v_preview := coalesce(
    nullif(p_command->>'previewAccepted', '')::boolean,
    nullif(v_payload->>'previewConfirmed', '')::boolean,
    false
  );
  if v_preview then
    v_payload := jsonb_set(v_payload, '{previewConfirmed}', 'true'::jsonb, true);
    v_payload := jsonb_set(v_payload, '{targetClientId}', to_jsonb(v_client_id::text), true);
  end if;

  v_patch := coalesce(v_payload->'patch', '{}'::jsonb);
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'INVALID_COMMAND_PATCH' using errcode = '22023';
  end if;

  if v_type = 'CHECKIN_REGISTRAR' then
    v_energy := nullif(v_patch->>'energy', '')::numeric;
    v_sleep := nullif(v_patch->>'sleep', '')::numeric;
    v_stress := nullif(v_patch->>'stress', '')::numeric;
    v_pain := nullif(v_patch->>'pain', '')::numeric;
    v_recorded_at := nullif(v_patch->>'recordedAt', '')::timestamptz;

    if v_entity_type <> 'checkin'
       or v_energy is null or v_energy not between 0 and 10
       or v_sleep is null or v_sleep not between 0 and 10
       or v_stress is null or v_stress not between 0 and 10
       or v_pain is null or v_pain not between 0 and 10
       or v_recorded_at is null or v_recorded_at > now() + interval '5 minutes' then
      raise exception 'INVALID_CHECKIN_PAYLOAD' using errcode = '22023';
    end if;

    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'energy', v_energy, 'sleep', v_sleep, 'stress', v_stress, 'pain', v_pain,
      'notes', left(coalesce(v_patch->>'notes', ''), 1000),
      'recordedAt', v_recorded_at
    ), true);

  elsif v_type = 'CHECKIN_ANULAR' then
    v_payload := jsonb_set(v_payload, '{patch}', '{}'::jsonb, true);

  elsif v_type = 'HABITO_DEFINIR' then
    v_target := nullif(v_patch->>'target', '')::numeric;
    if v_entity_type <> 'habit'
       or length(btrim(coalesce(v_patch->>'title', ''))) not between 2 and 120
       or v_target is null or v_target <= 0 or v_target > 1000000
       or length(btrim(coalesce(v_patch->>'unit', ''))) not between 1 and 40
       or length(btrim(coalesce(v_patch->>'frequency', ''))) not between 1 and 40 then
      raise exception 'INVALID_HABIT_PAYLOAD' using errcode = '22023';
    end if;

    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'title', left(btrim(v_patch->>'title'), 120),
      'description', left(coalesce(v_patch->>'description', ''), 500),
      'target', v_target,
      'unit', left(btrim(v_patch->>'unit'), 40),
      'frequency', left(btrim(v_patch->>'frequency'), 40)
    ), true);

  elsif v_type = 'HABITO_REGISTRAR' then
    v_habit_id := nullif(v_patch->>'habitId', '')::uuid;
    v_recorded_at := nullif(v_patch->>'recordedAt', '')::timestamptz;
    if v_entity_type <> 'habit_log'
       or v_habit_id is null
       or v_recorded_at is null or v_recorded_at > now() + interval '5 minutes'
       or not exists (
         select 1 from public.client_habits_v26
         where id = v_habit_id and client_id = v_client_id and status = 'activo'
       ) then
      raise exception 'INVALID_HABIT_LOG_PAYLOAD' using errcode = '22023';
    end if;
    if octet_length(coalesce((v_patch->'value')::text, 'null')) > 16384 then
      raise exception 'HABIT_LOG_VALUE_TOO_LARGE' using errcode = '22023';
    end if;

    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'habitId', v_habit_id,
      'completed', coalesce(nullif(v_patch->>'completed', '')::boolean, false),
      'value', v_patch->'value',
      'notes', left(coalesce(v_patch->>'notes', ''), 500),
      'recordedAt', v_recorded_at
    ), true);

  elsif v_type = 'HABITO_ARCHIVAR' then
    v_payload := jsonb_set(v_payload, '{patch}', '{}'::jsonb, true);

  elsif v_type in ('NOTA_PRIVADA_CREAR', 'NOTA_PRIVADA_ACTUALIZAR') then
    if v_entity_type <> 'private_note'
       or length(btrim(coalesce(v_patch->>'body', ''))) not between 3 and 4000 then
      raise exception 'INVALID_PRIVATE_NOTE_PAYLOAD' using errcode = '22023';
    end if;
    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'body', left(btrim(v_patch->>'body'), 4000),
      'visibility', 'coach_only'
    ), true);

  elsif v_type = 'NOTA_PRIVADA_ARCHIVAR' then
    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'visibility', 'coach_only'
    ), true);
  end if;

  return jsonb_set(v_command, '{payload}', v_payload, true);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS_OR_VALUES' using errcode = '22023';
end
$function$;

REVOKE ALL ON FUNCTION public.iberfit_prepare_command_rc30_v26(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_prepare_command_rc30_v26(jsonb) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_process_operation(jsonb) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_reconcile_operations(jsonb) TO service_role;

CREATE FUNCTION public.iberfit_register_iri_external_report_v12 (
  p_client_id     uuid,
  p_assessment_id uuid,
  p_file_name     text,
  p_mime_type     text,
  p_size_bytes    bigint,
  p_object_path   text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid:=auth.uid();
  v_expected_path text;
  v_record public.iri_external_reports_v26%rowtype;
begin
  if v_actor is null then raise exception using errcode='28000',message='V124_AUTH_REQUIRED'; end if;
  if not public.iberfit_can_manage_iri_external_report_v12(p_client_id) then raise exception using errcode='42501',message='V124_COACH_ASSIGNMENT_REQUIRED'; end if;
  if p_client_id is null or p_assessment_id is null then raise exception using errcode='22023',message='V124_SCOPE_REQUIRED'; end if;
  if not exists(select 1 from public.iri_assessments i where i.id=p_assessment_id and i.client_id=p_client_id) then raise exception using errcode='22023',message='V124_IRI_NOT_FOUND'; end if;
  if coalesce(p_file_name,'')='' or length(p_file_name)>240 then raise exception using errcode='22023',message='V124_FILE_NAME_INVALID'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception using errcode='22023',message='V124_MIME_TYPE_INVALID'; end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>50000000 then raise exception using errcode='22023',message='V124_FILE_SIZE_INVALID'; end if;
  v_expected_path:=p_client_id::text||'/'||p_assessment_id::text||'/bioimpedancia';
  if p_object_path is distinct from v_expected_path then raise exception using errcode='22023',message='V124_OBJECT_PATH_INVALID'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='iberfit-iri-external-reports' and o.name=v_expected_path) then raise exception using errcode='P0001',message='V124_STORAGE_OBJECT_NOT_FOUND'; end if;

  insert into public.iri_external_reports_v26(
    client_id,assessment_id,bucket_id,object_path,file_name,mime_type,size_bytes,
    visible_to_client,version,uploaded_by,uploaded_at,updated_at
  ) values(
    p_client_id,p_assessment_id,'iberfit-iri-external-reports',v_expected_path,
    btrim(p_file_name),p_mime_type,p_size_bytes,true,1,v_actor,clock_timestamp(),clock_timestamp()
  )
  on conflict(assessment_id) do update set
    client_id=excluded.client_id,
    object_path=excluded.object_path,
    file_name=excluded.file_name,
    mime_type=excluded.mime_type,
    size_bytes=excluded.size_bytes,
    visible_to_client=true,
    version=public.iri_external_reports_v26.version+1,
    uploaded_by=v_actor,
    uploaded_at=clock_timestamp(),
    updated_at=clock_timestamp()
  returning * into v_record;

  return jsonb_build_object(
    'ok',true,
    'id',v_record.id,
    'clientId',v_record.client_id,
    'assessmentId',v_record.assessment_id,
    'bucketId',v_record.bucket_id,
    'objectPath',v_record.object_path,
    'fileName',v_record.file_name,
    'mimeType',v_record.mime_type,
    'sizeBytes',v_record.size_bytes,
    'visibleToClient',v_record.visible_to_client,
    'version',v_record.version,
    'uploadedAt',v_record.uploaded_at,
    'updatedAt',v_record.updated_at
  );
end
$function$;

REVOKE ALL ON FUNCTION public.iberfit_register_iri_external_report_v12(uuid, uuid, text, text, bigint, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_register_iri_external_report_v12(uuid, uuid, text, text, bigint, text) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_register_iri_external_report_v12(uuid, uuid, text, text, bigint, text) TO service_role;

CREATE FUNCTION public.iberfit_request_appointment_change_v13 (
  p_appointment_id text,
  p_client_id      text,
  p_reason         text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_own_client text;
  v_item jsonb;
  v_start timestamptz;
  v_found boolean:=false;
  v_request public.appointment_change_requests;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;
  if nullif(btrim(p_appointment_id),'') is null
     or nullif(btrim(p_client_id),'') is null
     or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception using errcode='22023',message='V13_CHANGE_REQUEST_INVALID';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  v_own_client:=coalesce(
    v_snapshot#>>'{user,clientId}',
    v_snapshot#>>'{user,client_id}',
    ''
  );

  if v_role not in ('client','cliente') or v_own_client<>btrim(p_client_id) then
    raise exception using errcode='42501',message='V13_CLIENT_SCOPE_FORBIDDEN';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb))
  loop
    if coalesce(v_item->>'id',v_item->>'entityId',v_item->>'entity_id','')=btrim(p_appointment_id)
       and coalesce(v_item->>'clientId',v_item->>'client_id','')=btrim(p_client_id) then
      v_found:=true;
      begin
        v_start:=coalesce(
          nullif(v_item->>'startAt','')::timestamptz,
          nullif(v_item->>'start_at','')::timestamptz,
          nullif(v_item->>'scheduledAt','')::timestamptz,
          nullif(v_item->>'scheduled_at','')::timestamptz
        );
      exception when others then
        v_start:=null;
      end;
      exit;
    end if;
  end loop;

  if not v_found then
    raise exception using errcode='42501',message='V13_APPOINTMENT_NOT_VISIBLE';
  end if;
  if v_start is null
     or now()<v_start-interval '48 hours'
     or now()>=v_start-interval '2 hours' then
    raise exception using errcode='22023',message='V13_CONFIRMATION_WINDOW_CLOSED';
  end if;

  insert into public.appointment_change_requests(
    appointment_id,client_id,requester_user_id,reason,status
  )
  values(
    btrim(p_appointment_id),
    btrim(p_client_id),
    v_user,
    btrim(p_reason),
    'pending'
  )
  on conflict(appointment_id,requester_user_id) where status='pending'
  do update set
    reason=excluded.reason,
    created_at=now()
  returning * into v_request;

  return jsonb_build_object(
    'ok',true,
    'requestId',v_request.id,
    'appointmentId',v_request.appointment_id,
    'status',v_request.status,
    'createdAt',v_request.created_at
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.iberfit_request_appointment_change_v13(text, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_request_appointment_change_v13(text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_request_appointment_change_v13(text, text, text) TO service_role;

CREATE FUNCTION public.iberfit_resolve_appointment_change_v13 (
  p_request_id text,
  p_resolution text,
  p_note       text DEFAULT ''::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_request public.appointment_change_requests;
  v_resolution text:=lower(btrim(coalesce(p_resolution,'')));
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;
  if v_resolution not in ('accepted','rejected','resolved') then
    raise exception using errcode='22023',message='V13_RESOLUTION_INVALID';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  if v_role not in ('coach','entrenador','admin','administrador') then
    raise exception using errcode='42501',message='V13_ROLE_FORBIDDEN';
  end if;

  select * into v_request
  from public.appointment_change_requests
  where id::text=btrim(p_request_id)
    and status='pending'
  for update;

  if not found then
    raise exception using errcode='P0002',message='V13_CHANGE_REQUEST_NOT_FOUND';
  end if;

  if not exists(
    select 1
    from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb)) a
    where coalesce(a->>'id',a->>'entityId',a->>'entity_id','')=v_request.appointment_id
      and coalesce(a->>'clientId',a->>'client_id','')=v_request.client_id
  ) then
    raise exception using errcode='42501',message='V13_APPOINTMENT_NOT_VISIBLE';
  end if;

  update public.appointment_change_requests
     set status=v_resolution,
         resolved_at=now(),
         resolved_by=v_user,
         resolution_note=nullif(btrim(coalesce(p_note,'')),'')
   where id=v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'ok',true,
    'requestId',v_request.id,
    'status',v_request.status,
    'resolvedAt',v_request.resolved_at
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.iberfit_resolve_appointment_change_v13(text, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.iberfit_resolve_appointment_change_v13(text, text, text) TO authenticated;

GRANT ALL ON FUNCTION public.iberfit_resolve_appointment_change_v13(text, text, text) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_role() TO service_role;

GRANT ALL ON FUNCTION public.iberfit_search_exercises(text, text, text, text, text, integer, integer) TO service_role;

GRANT ALL ON FUNCTION public.is_assigned_coach(uuid) TO service_role;

CREATE FUNCTION public.m26_audit_row_v43()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_row jsonb;
  v_client_id uuid;
  v_entity_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  v_client_id := nullif(
    v_row ->> 'client_id',
    ''
  )::uuid;

  v_entity_id := nullif(
    v_row ->> 'id',
    ''
  )::uuid;

  insert into public.m26_audit_events_v43 (
    actor_user_id,
    client_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    auth.uid(),
    v_client_id,
    'ROW_' || tg_op,
    tg_table_name,
    v_entity_id,
    jsonb_build_object(
      'operation',
      tg_op
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$;

REVOKE ALL ON FUNCTION public.m26_audit_row_v43() FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_audit_row_v43() TO service_role;

CREATE FUNCTION public.m26_backend_bootstrap_v43()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    true,
    'version',
    'RC43',
    'userId',
    auth.uid(),
    'clientId',
    public.iberfit_client_id(),
    'counts',
    jsonb_build_object(
      'measurements',
      (
        select count(*)
        from public.m26_client_measurements_v43
      ),
      'plans',
      (
        select count(*)
        from public.m26_training_plans_v43
      ),
      'sessions',
      (
        select count(*)
        from public.m26_training_sessions_v43
      ),
      'messages',
      (
        select count(*)
        from public.m26_messages_v43
      )
    )
  )
  where auth.uid() is not null;
$function$;

REVOKE ALL ON FUNCTION public.m26_backend_bootstrap_v43() FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_backend_bootstrap_v43() TO authenticated;

GRANT ALL ON FUNCTION public.m26_backend_bootstrap_v43() TO service_role;

CREATE FUNCTION public.m26_backend_health_v43()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with backend_tables as (
    select unnest(
      array[
        'public.m26_schema_releases_v43',
        'public.m26_client_measurements_v43',
        'public.m26_training_plans_v43',
        'public.m26_training_sessions_v43',
        'public.m26_messages_v43',
        'public.m26_audit_events_v43'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,
      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from backend_tables
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 6 and rls_count = 6,
    'version',
    'RC43',
    'environment',
    'production',
    'tables',
    table_count,
    'rlsTables',
    rls_count,
    'productionModified',
    true,
    'productionDeployed',
    true
  )
  from table_state;
$function$;

REVOKE ALL ON FUNCTION public.m26_backend_health_v43() FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_backend_health_v43() TO anon;

GRANT ALL ON FUNCTION public.m26_backend_health_v43() TO authenticated;

GRANT ALL ON FUNCTION public.m26_backend_health_v43() TO service_role;

CREATE FUNCTION public.m26_backend_health_v431()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with backend_tables as (
    select unnest(
      array[
        'public.m26_schema_releases_v43',
        'public.m26_client_measurements_v43',
        'public.m26_training_plans_v43',
        'public.m26_training_sessions_v43',
        'public.m26_messages_v43',
        'public.m26_audit_events_v43',
        'public.m26_session_drafts_v431'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,

      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from backend_tables
  ),
  policy_state as (
    select count(*) as policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'm26_session_drafts_v431'
  ),
  rpc_state as (
    select count(*) as rpc_count
    from unnest(
      array[
        'public.m26_draft_upsert_v431(jsonb)',
        'public.m26_draft_get_v431(uuid,text)',
        'public.m26_draft_delete_v431(uuid,text)'
      ]
    ) as rpc_name
    where to_regprocedure(rpc_name) is not null
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 7
      and rls_count = 7
      and policy_count >= 4
      and rpc_count = 3,
    'version',
    'RC43.1',
    'environment',
    'production',
    'tables',
    table_count,
    'rlsTables',
    rls_count,
    'draftPolicies',
    policy_count,
    'draftRpcs',
    rpc_count,
    'productionModified',
    true,
    'productionDeployed',
    true
  )
  from table_state
  cross join policy_state
  cross join rpc_state;
$function$;

REVOKE ALL ON FUNCTION public.m26_backend_health_v431() FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_backend_health_v431() TO anon;

GRANT ALL ON FUNCTION public.m26_backend_health_v431() TO authenticated;

GRANT ALL ON FUNCTION public.m26_backend_health_v431() TO service_role;

CREATE FUNCTION public.m26_draft_delete_v431 (
  p_client_id uuid,
  p_scope     text DEFAULT 'session-builder'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope <> 'session-builder'
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
    'ok',
    true,
    'deleted',
    v_id is not null,
    'clientId',
    p_client_id,
    'scope',
    p_scope
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_draft_delete_v431(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_draft_delete_v431(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.m26_draft_delete_v431(uuid, text) TO service_role;

CREATE FUNCTION public.m26_draft_get_v431 (
  p_client_id uuid,
  p_scope     text DEFAULT 'session-builder'::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_id uuid;
  v_draft jsonb;
  v_revision bigint;
  v_client_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope <> 'session-builder'
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
      'ok',
      true,
      'found',
      false,
      'clientId',
      p_client_id,
      'scope',
      p_scope
    );
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'found',
    true,
    'id',
    v_id,
    'clientId',
    p_client_id,
    'scope',
    p_scope,
    'draft',
    v_draft,
    'revision',
    v_revision,
    'clientRevision',
    v_client_revision,
    'updatedAt',
    v_updated_at
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_draft_get_v431(uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_draft_get_v431(uuid, text) TO authenticated;

GRANT ALL ON FUNCTION public.m26_draft_get_v431(uuid, text) TO service_role;

CREATE FUNCTION public.m26_draft_upsert_v431 (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_id uuid;
  v_client_id uuid;
  v_scope text;
  v_draft jsonb;
  v_client_revision bigint;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 125000
  then
    raise exception 'M26_RC431_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_scope := coalesce(
    nullif(
      trim(p_payload ->> 'scope'),
      ''
    ),
    'session-builder'
  );

  v_draft := p_payload -> 'draft';

  v_client_revision := greatest(
    coalesce(
      nullif(
        p_payload ->> 'revision',
        ''
      )::bigint,
      0
    ),
    0
  );

  if
    v_client_id is null
    or v_scope <> 'session-builder'
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
  on conflict (
    owner_user_id,
    client_id,
    scope
  )
  do update set
    draft_payload = excluded.draft_payload,
    client_revision = excluded.client_revision,
    updated_at = now()
  returning
    id,
    revision,
    updated_at
  into
    v_id,
    v_revision,
    v_updated_at;

  return jsonb_build_object(
    'ok',
    true,
    'saved',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id,
    'scope',
    v_scope,
    'revision',
    v_revision,
    'clientRevision',
    v_client_revision,
    'updatedAt',
    v_updated_at
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_draft_upsert_v431(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_draft_upsert_v431(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.m26_draft_upsert_v431(jsonb) TO service_role;

CREATE FUNCTION public.m26_json_has_forbidden_key_v44 (
  p_value jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  v_key text;
  v_child jsonb;
begin
  if p_value is null then
    return false;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select key, value
      from jsonb_each(p_value)
    loop
      if lower(v_key) = any (
        array[
          'password',
          'token',
          'access_token',
          'refresh_token',
          'service_role',
          'secret',
          'authorization',
          'client_secret',
          'email',
          'phone',
          'telefono',
          'name',
          'nombre'
        ]
      ) then
        return true;
      end if;

      if public.m26_json_has_forbidden_key_v44(
        v_child
      ) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in
      select value
      from jsonb_array_elements(p_value)
    loop
      if public.m26_json_has_forbidden_key_v44(
        v_child
      ) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end
$function$;

REVOKE ALL ON FUNCTION public.m26_json_has_forbidden_key_v44(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_json_has_forbidden_key_v44(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.m26_json_has_forbidden_key_v44(jsonb) TO service_role;

CREATE FUNCTION public.m26_json_safe_v43 (
  p_value jsonb
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case
    when jsonb_typeof(
      coalesce(p_value, '{}'::jsonb)
    ) <> 'object' then false
    when octet_length(
      coalesce(p_value, '{}'::jsonb)::text
    ) > 120000 then false
    else not exists (
      select 1
      from jsonb_object_keys(
        coalesce(p_value, '{}'::jsonb)
      ) as key_name
      where lower(key_name) = any (
        array[
          'password',
          'token',
          'access_token',
          'refresh_token',
          'service_role',
          'secret',
          'authorization',
          'email',
          'phone',
          'telefono'
        ]
      )
    )
  end;
$function$;

REVOKE ALL ON FUNCTION public.m26_json_safe_v43(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_json_safe_v43(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.m26_json_safe_v43(jsonb) TO service_role;

CREATE FUNCTION public.m26_record_measurement_v43 (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_id uuid;
  v_client_id uuid;
  v_metric text;
  v_value numeric;
  v_unit text;
  v_source text;
  v_measured_at timestamptz;
  v_notes text;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_metric := lower(
    trim(p_payload ->> 'metric')
  );

  v_value := (
    p_payload ->> 'value'
  )::numeric;

  v_unit := trim(
    p_payload ->> 'unit'
  );

  v_source := coalesce(
    nullif(
      lower(trim(p_payload ->> 'source')),
      ''
    ),
    'manual'
  );

  v_measured_at := coalesce(
    nullif(
      p_payload ->> 'measuredAt',
      ''
    )::timestamptz,
    now()
  );

  v_notes := nullif(
    trim(p_payload ->> 'notes'),
    ''
  );

  v_metadata := coalesce(
    p_payload -> 'metadata',
    '{}'::jsonb
  );

  insert into public.m26_client_measurements_v43 (
    client_id,
    metric,
    value,
    unit,
    measured_at,
    source,
    notes,
    metadata
  )
  values (
    v_client_id,
    v_metric,
    v_value,
    v_unit,
    v_measured_at,
    v_source,
    v_notes,
    v_metadata
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_record_measurement_v43(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_record_measurement_v43(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.m26_record_measurement_v43(jsonb) TO service_role;

CREATE FUNCTION public.m26_save_training_session_v43 (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_id uuid;
  v_client_id uuid;
  v_plan_id uuid;
  v_title text;
  v_status text;
  v_scheduled_at timestamptz;
  v_session_payload jsonb;
  v_result_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_id := nullif(
    p_payload ->> 'id',
    ''
  )::uuid;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_plan_id := nullif(
    p_payload ->> 'planId',
    ''
  )::uuid;

  v_title := trim(
    p_payload ->> 'title'
  );

  v_status := coalesce(
    nullif(
      lower(trim(p_payload ->> 'status')),
      ''
    ),
    'planned'
  );

  v_scheduled_at := nullif(
    p_payload ->> 'scheduledAt',
    ''
  )::timestamptz;

  v_session_payload := coalesce(
    p_payload -> 'session',
    '{}'::jsonb
  );

  v_result_payload := coalesce(
    p_payload -> 'result',
    '{}'::jsonb
  );

  if v_id is null then
    insert into public.m26_training_sessions_v43 (
      client_id,
      plan_id,
      title,
      status,
      scheduled_at,
      session_payload,
      result_payload
    )
    values (
      v_client_id,
      v_plan_id,
      v_title,
      v_status,
      v_scheduled_at,
      v_session_payload,
      v_result_payload
    )
    returning id into v_id;
  else
    update public.m26_training_sessions_v43
    set
      plan_id = v_plan_id,
      title = v_title,
      status = v_status,
      scheduled_at = v_scheduled_at,
      session_payload = v_session_payload,
      result_payload = v_result_payload
    where id = v_id
      and client_id = v_client_id
    returning id into v_id;

    if not found then
      raise exception 'M26_RC43_SESSION_NOT_FOUND';
    end if;
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_save_training_session_v43(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_save_training_session_v43(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.m26_save_training_session_v43(jsonb) TO service_role;

CREATE FUNCTION public.m26_send_message_v43 (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_id uuid;
  v_client_id uuid;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_body := trim(
    p_payload ->> 'body'
  );

  insert into public.m26_messages_v43 (
    client_id,
    body
  )
  values (
    v_client_id,
    v_body
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_send_message_v43(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_send_message_v43(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.m26_send_message_v43(jsonb) TO service_role;

CREATE FUNCTION public.m26_telemetry_can_access_client_v59 (
  target_client uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select
    target_client is not null
    and (
      target_client = public.iberfit_client_id()
      or exists (
        select 1
        from public.iberfit_coach_client_assignments a
        join public.iberfit_organization_memberships m
          on m.organization_id = a.organization_id
         and m.user_id = a.coach_user_id
         and m.status = 'active'
        where a.coach_user_id = auth.uid()
          and a.client_id = target_client::text
          and a.status = 'active'
          and a.starts_at <= current_date
          and (
            a.ends_at is null
            or a.ends_at >= current_date
          )
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.m26_telemetry_can_access_client_v59(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_telemetry_can_access_client_v59(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.m26_telemetry_can_access_client_v59(uuid) TO service_role;

CREATE FUNCTION public.m26_telemetry_delete_own_v59 (
  p_before timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_deleted_events integer := 0;
  v_deleted_batches integer := 0;
begin
  if v_actor is null then
    raise exception using
      errcode = '28000',
      message = 'M26_RC59_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();

  if v_client_id is null then
    raise exception using
      errcode = '42501',
      message = 'M26_RC59_CLIENT_SELF_REQUIRED';
  end if;

  delete from public.m26_telemetry_events_v59
  where client_id = v_client_id
    and (
      p_before is null
      or recorded_at < p_before
    );

  get diagnostics v_deleted_events = row_count;

  delete from public.m26_telemetry_import_batches_v59
  where client_id = v_client_id
    and (
      p_before is null
      or created_at < p_before
    );

  get diagnostics v_deleted_batches = row_count;

  return jsonb_build_object(
    'ok', true,
    'clientId', v_client_id,
    'deletedEvents', v_deleted_events,
    'deletedBatchMetadata', v_deleted_batches
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_telemetry_delete_own_v59(timestamp WITH time zone) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_telemetry_delete_own_v59(timestamp WITH time zone) TO authenticated;

GRANT ALL ON FUNCTION public.m26_telemetry_delete_own_v59(timestamp WITH time zone) TO service_role;

CREATE FUNCTION public.m26_telemetry_event_valid_v59 (
  p_event        jsonb,
  p_client_id    uuid,
  p_session_id   text,
  p_execution_id text
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  v_rr jsonb;
  v_recorded_at timestamptz;
  v_received_at timestamptz;
  v_hr numeric;
  v_set_number integer;
begin
  if
    p_event is null
    or jsonb_typeof(p_event) <> 'object'
    or octet_length(p_event::text) > 12000
    or not public.m26_telemetry_json_safe_v59(p_event)
    or p_event ? 'derived'
  then
    return false;
  end if;

  if
    p_event ->> 'schemaVersion' <> 'iberfit.telemetry.v1'
    or p_event ->> 'eventType' <> 'heart_rate_sample'
    or coalesce(p_event ->> 'eventId','')
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or p_event ->> 'clientId' <> p_client_id::text
    or p_event ->> 'sessionId' <> p_session_id
    or p_event ->> 'executionId' <> p_execution_id
  then
    return false;
  end if;

  if
    p_session_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or p_execution_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
  then
    return false;
  end if;

  begin
    v_recorded_at := (p_event ->> 'recordedAt')::timestamptz;
    v_received_at := (p_event ->> 'receivedAt')::timestamptz;
  exception
    when others then
      return false;
  end;

  if v_recorded_at is null or v_received_at is null then
    return false;
  end if;

  if
    jsonb_typeof(p_event -> 'context') <> 'object'
    or jsonb_typeof(p_event -> 'source') <> 'object'
    or jsonb_typeof(p_event -> 'quality') <> 'object'
    or jsonb_typeof(p_event -> 'raw') <> 'object'
    or jsonb_typeof(p_event -> 'provenance') <> 'object'
  then
    return false;
  end if;

  if
    coalesce(p_event #>> '{context,phase}','')
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,39}$'
    or (
      p_event #>> '{context,blockId}' is not null
      and p_event #>> '{context,blockId}'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    )
    or (
      p_event #>> '{context,exerciseId}' is not null
      and p_event #>> '{context,exerciseId}'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    )
  then
    return false;
  end if;

  begin
    if p_event #>> '{context,setNumber}' is not null then
      v_set_number := (p_event #>> '{context,setNumber}')::integer;
      if v_set_number < 1 or v_set_number > 10000 then
        return false;
      end if;
    end if;
  exception
    when others then
      return false;
  end;

  if
    p_event #>> '{source,provider}' not in (
      'apple_health',
      'wear_os_health_services',
      'ble_direct'
    )
    or coalesce(p_event #>> '{source,deviceType}','unknown') not in (
      'watch',
      'chest_strap',
      'arm_band',
      'sensor',
      'phone',
      'unknown'
    )
    or (
      p_event #>> '{source,providerId}' is not null
      and p_event #>> '{source,providerId}'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    )
    or (
      p_event #>> '{source,transport}' is not null
      and p_event #>> '{source,transport}'
        !~ '^[a-z0-9][a-z0-9._:-]{0,79}$'
    )
  then
    return false;
  end if;

  if
    coalesce(p_event #>> '{quality,grade}','limitada') not in (
      'alta',
      'media',
      'limitada'
    )
    or (
      p_event #>> '{quality,code}' is not null
      and p_event #>> '{quality,code}' not in (
        'valid',
        'acquiring',
        'poor_contact',
        'stale',
        'out_of_range',
        'disconnected',
        'unsupported'
      )
    )
    or coalesce(
      p_event #>> '{quality,contactStatus}',
      'unknown'
    ) not in (
      'detected',
      'not_detected',
      'unsupported',
      'unknown'
    )
  then
    return false;
  end if;

  if jsonb_typeof(p_event #> '{raw,heartRateBpm}') <> 'number' then
    return false;
  end if;

  begin
    v_hr := (p_event #>> '{raw,heartRateBpm}')::numeric;
  exception
    when others then
      return false;
  end;

  if v_hr is null then
    return false;
  end if;

  if jsonb_typeof(p_event #> '{raw,rrIntervalsMs}') <> 'array' then
    return false;
  end if;

  if jsonb_array_length(p_event #> '{raw,rrIntervalsMs}') > 128 then
    return false;
  end if;

  for v_rr in
    select value
    from jsonb_array_elements(
      p_event #> '{raw,rrIntervalsMs}'
    )
  loop
    if jsonb_typeof(v_rr) <> 'number' then
      return false;
    end if;

    begin
      if (v_rr #>> '{}')::numeric <= 0 then
        return false;
      end if;
    exception
      when others then
        return false;
    end;
  end loop;

  if
    p_event #>> '{provenance,origin}' <> 'live_sensor'
    or p_event #>> '{provenance,capturedBy}' <> 'm26-web'
    or coalesce(
      p_event #>> '{provenance,timestampOrigin}',
      ''
    ) not in (
      'sensor',
      'receive_time',
      'source_or_receive_unverified'
    )
    or coalesce(
      (p_event #>> '{provenance,rawPreserved}')::boolean,
      false
    ) is not true
  then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end
$function$;

REVOKE ALL ON FUNCTION public.m26_telemetry_event_valid_v59(jsonb, uuid, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_telemetry_event_valid_v59(jsonb, uuid, text, text) TO service_role;

CREATE FUNCTION public.m26_telemetry_import_v59 (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_session_id text;
  v_execution_id text;
  v_events jsonb;
  v_event jsonb;
  v_event_id text;
  v_existing jsonb;
  v_rows integer;
  v_payload_bytes integer;

  v_accepted jsonb := '[]'::jsonb;
  v_duplicate jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_rejected_reasons jsonb := '{}'::jsonb;

  v_accepted_count integer := 0;
  v_duplicate_count integer := 0;
  v_rejected_count integer := 0;
begin
  if v_actor is null then
    raise exception using
      errcode = '28000',
      message = 'M26_RC59_AUTH_REQUIRED';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_IMPORT_PAYLOAD_INVALID';
  end if;

  v_payload_bytes := octet_length(p_payload::text);

  if
    v_payload_bytes < 20
    or v_payload_bytes > 192000
    or not public.m26_telemetry_json_safe_v59(p_payload)
  then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_IMPORT_PAYLOAD_INVALID';
  end if;

  if p_payload ->> 'schemaVersion'
    <> 'iberfit.telemetry.remote.v1'
  then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_REMOTE_SCHEMA_INVALID';
  end if;

  begin
    v_client_id := (p_payload ->> 'clientId')::uuid;
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'M26_RC59_CLIENT_ID_INVALID';
  end;

  v_session_id := trim(coalesce(p_payload ->> 'sessionId',''));
  v_execution_id := trim(coalesce(p_payload ->> 'executionId',''));
  v_events := p_payload -> 'events';

  if
    v_session_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or v_execution_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or jsonb_typeof(v_events) <> 'array'
    or jsonb_array_length(v_events) < 1
    or jsonb_array_length(v_events) > 100
  then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_IMPORT_BATCH_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_events) item
    group by item ->> 'eventId'
    having count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_BATCH_EVENT_ID_DUPLICATE';
  end if;
  if not (
    v_client_id = public.iberfit_client_id()
    or public.m26_telemetry_can_access_client_v59(v_client_id)
  ) then
    raise exception using
      errcode = '42501',
      message = 'M26_RC59_CLIENT_SCOPE_FORBIDDEN';
  end if;

  for v_event in
    select value
    from jsonb_array_elements(v_events)
  loop
    v_event_id := trim(coalesce(v_event ->> 'eventId',''));

    if v_event_id
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    then
      raise exception using
        errcode = '22023',
        message = 'M26_RC59_EVENT_ID_INVALID';
    end if;

    if not public.m26_telemetry_event_valid_v59(
      v_event,
      v_client_id,
      v_session_id,
      v_execution_id
    ) then
      v_rejected := v_rejected || jsonb_build_array(v_event_id);
      v_rejected_reasons :=
        v_rejected_reasons
        || jsonb_build_object(
          v_event_id,
          'M26_RC59_EVENT_INVALID'
        );
      v_rejected_count := v_rejected_count + 1;
      continue;
    end if;

    insert into public.m26_telemetry_events_v59 (
      client_id,
      event_id,
      session_id,
      execution_id,
      event_type,
      source_provider,
      recorded_at,
      received_at,
      canonical_event,
      imported_by,
      expires_at
    )
    values (
      v_client_id,
      v_event_id,
      v_session_id,
      v_execution_id,
      v_event ->> 'eventType',
      v_event #>> '{source,provider}',
      (v_event ->> 'recordedAt')::timestamptz,
      (v_event ->> 'receivedAt')::timestamptz,
      v_event,
      v_actor,
      now() + interval '180 days'
    )
    on conflict (
      client_id,
      event_id
    )
    do nothing;

    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      v_accepted := v_accepted || jsonb_build_array(v_event_id);
      v_accepted_count := v_accepted_count + 1;
      continue;
    end if;

    select canonical_event
    into v_existing
    from public.m26_telemetry_events_v59
    where client_id = v_client_id
      and event_id = v_event_id;

    if v_existing = v_event then
      v_duplicate := v_duplicate || jsonb_build_array(v_event_id);
      v_duplicate_count := v_duplicate_count + 1;
    else
      v_rejected := v_rejected || jsonb_build_array(v_event_id);
      v_rejected_reasons :=
        v_rejected_reasons
        || jsonb_build_object(
          v_event_id,
          'M26_RC59_EVENT_ID_COLLISION'
        );
      v_rejected_count := v_rejected_count + 1;
    end if;
  end loop;

  insert into public.m26_telemetry_import_batches_v59 (
    actor_user_id,
    client_id,
    session_id,
    execution_id,
    received_count,
    accepted_count,
    duplicate_count,
    rejected_count,
    payload_bytes
  )
  values (
    v_actor,
    v_client_id,
    v_session_id,
    v_execution_id,
    jsonb_array_length(v_events),
    v_accepted_count,
    v_duplicate_count,
    v_rejected_count,
    v_payload_bytes
  );

  return jsonb_build_object(
    'ok', true,
    'schemaVersion', 'iberfit.telemetry.remote.v1',
    'clientId', v_client_id,
    'sessionId', v_session_id,
    'executionId', v_execution_id,
    'acceptedEventIds', v_accepted,
    'duplicateEventIds', v_duplicate,
    'rejectedEventIds', v_rejected,
    'rejectedReasons', v_rejected_reasons,
    'received', jsonb_array_length(v_events),
    'accepted', v_accepted_count,
    'duplicate', v_duplicate_count,
    'rejected', v_rejected_count
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_telemetry_import_v59(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_telemetry_import_v59(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.m26_telemetry_import_v59(jsonb) TO service_role;

CREATE FUNCTION public.m26_telemetry_json_safe_v59 (
  p_value jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  v_key text;
  v_normalized_key text;
  v_child jsonb;
begin
  if p_value is null then
    return false;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select key, value
      from jsonb_each(p_value)
    loop
      v_normalized_key := lower(
        regexp_replace(v_key,'[^a-z0-9]','','g')
      );

      if v_normalized_key = any (
        array[
          'password',
          'token',
          'accesstoken',
          'refreshtoken',
          'servicerole',
          'secret',
          'authorization',
          'clientsecret',
          'email',
          'phone',
          'telefono',
          'name',
          'nombre',
          'deviceid',
          'mac',
          'macaddress',
          'gatt',
          'gattid',
          'serial',
          'serialnumber'
        ]
      ) then
        return false;
      end if;

      if not public.m26_telemetry_json_safe_v59(v_child) then
        return false;
      end if;
    end loop;

    return true;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    for v_child in
      select value
      from jsonb_array_elements(p_value)
    loop
      if not public.m26_telemetry_json_safe_v59(v_child) then
        return false;
      end if;
    end loop;

    return true;
  end if;

  return true;
end
$function$;

REVOKE ALL ON FUNCTION public.m26_telemetry_json_safe_v59(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_telemetry_json_safe_v59(jsonb) TO service_role;

CREATE FUNCTION public.m26_telemetry_purge_expired_v59()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_deleted integer := 0;
begin
  delete from public.m26_telemetry_events_v59
  where expires_at <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$function$;

REVOKE ALL ON FUNCTION public.m26_telemetry_purge_expired_v59() FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_telemetry_purge_expired_v59() TO service_role;

CREATE FUNCTION public.m26_telemetry_read_page_v59 (
  p_client_id uuid,
  p_before    timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_limit     integer                  DEFAULT 500
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_limit integer;
  v_events jsonb;
  v_next_before timestamptz;
begin
  if v_actor is null then
    raise exception using
      errcode = '28000',
      message = 'M26_RC59_AUTH_REQUIRED';
  end if;

  if not (
    p_client_id = public.iberfit_client_id()
    or public.m26_telemetry_can_access_client_v59(p_client_id)
  ) then
    raise exception using
      errcode = '42501',
      message = 'M26_RC59_CLIENT_SCOPE_FORBIDDEN';
  end if;

  v_limit := greatest(
    1,
    least(
      1000,
      coalesce(p_limit,500)
    )
  );

  with page as (
    select
      canonical_event,
      recorded_at,
      event_id
    from public.m26_telemetry_events_v59
    where client_id = p_client_id
      and (
        p_before is null
        or recorded_at < p_before
      )
    order by
      recorded_at desc,
      event_id desc
    limit v_limit
  )
  select
    coalesce(
      jsonb_agg(
        canonical_event
        order by recorded_at desc, event_id desc
      ),
      '[]'::jsonb
    ),
    min(recorded_at)
  into
    v_events,
    v_next_before
  from page;

  return jsonb_build_object(
    'ok', true,
    'clientId', p_client_id,
    'events', v_events,
    'nextBefore', v_next_before,
    'limit', v_limit
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_telemetry_read_page_v59(uuid, timestamp WITH time zone, integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_telemetry_read_page_v59(uuid, timestamp WITH time zone, integer) TO authenticated;

GRANT ALL ON FUNCTION public.m26_telemetry_read_page_v59(uuid, timestamp WITH time zone, integer) TO service_role;

CREATE FUNCTION public.m26_touch_updated_at_v43()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := now();

  if to_jsonb(new) ? 'revision' then
    new.revision := coalesce(old.revision, 0) + 1;
  end if;

  return new;
end
$function$;

REVOKE ALL ON FUNCTION public.m26_touch_updated_at_v43() FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_touch_updated_at_v43() TO service_role;

CREATE FUNCTION public.m26_wearable_bootstrap_v44()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    true,
    'version',
    'RC44',
    'connections',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'status',
            status,
            'syncEnabled',
            sync_enabled,
            'scopes',
            granted_scopes,
            'lastSyncedAt',
            last_synced_at,
            'revision',
            revision
          )
          order by provider
        )
        from public.m26_wearable_connections_v44
      ),
      '[]'::jsonb
    ),
    'dailySummaries',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'date',
            record_date,
            'metrics',
            jsonb_build_object(
              'steps',
              steps,
              'activeMinutes',
              active_minutes,
              'sleepMinutes',
              sleep_minutes,
              'restingHeartRate',
              resting_heart_rate,
              'hrvMs',
              hrv_ms,
              'activeEnergyKcal',
              active_energy_kcal,
              'workoutMinutes',
              workout_minutes
            ),
            'quality',
            quality,
            'sourceUpdatedAt',
            source_updated_at,
            'sourceRecordCount',
            source_record_count,
            'revision',
            revision
          )
          order by record_date desc, provider
        )
        from public.m26_wearable_daily_summaries_v44
      ),
      '[]'::jsonb
    ),
    'consents',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'action',
            action,
            'scopes',
            scopes,
            'createdAt',
            created_at
          )
          order by created_at desc
        )
        from public.m26_wearable_consents_v44
      ),
      '[]'::jsonb
    )
  )
  where auth.uid() is not null;
$function$;

REVOKE ALL ON FUNCTION public.m26_wearable_bootstrap_v44() FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_wearable_bootstrap_v44() TO authenticated;

GRANT ALL ON FUNCTION public.m26_wearable_bootstrap_v44() TO service_role;

CREATE FUNCTION public.m26_wearable_connection_upsert_v44 (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_id uuid;
  v_client_id uuid;
  v_provider text;
  v_status text;
  v_sync_enabled boolean;
  v_scopes text[];
  v_metadata jsonb;
  v_action text;
  v_last_synced_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or public.m26_json_has_forbidden_key_v44(
      p_payload
    )
    or octet_length(p_payload::text) > 20000
  then
    raise exception 'M26_RC44_CONNECTION_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_provider := lower(
    trim(p_payload ->> 'provider')
  );

  v_status := coalesce(
    nullif(
      lower(trim(p_payload ->> 'status')),
      ''
    ),
    'active'
  );

  v_sync_enabled := coalesce(
    (p_payload ->> 'syncEnabled')::boolean,
    v_status = 'active'
  );

  v_scopes := array(
    select distinct value
    from jsonb_array_elements_text(
      coalesce(
        p_payload -> 'scopes',
        '[]'::jsonb
      )
    )
    where value = any (
      array[
        'steps',
        'activeMinutes',
        'sleepMinutes',
        'restingHeartRate',
        'hrvMs',
        'activeEnergyKcal',
        'workoutMinutes'
      ]
    )
    order by value
  );

  v_metadata := coalesce(
    p_payload -> 'metadata',
    '{}'::jsonb
  );

  v_last_synced_at := nullif(
    p_payload ->> 'lastSyncedAt',
    ''
  )::timestamptz;

  if
    v_client_id is null
    or v_client_id <> public.iberfit_client_id()
    or v_provider not in (
      'normalized_file',
      'health_connect',
      'samsung_health',
      'apple_health',
      'strava',
      'garmin_connect',
      'fitbit',
      'oura'
    )
    or v_status not in (
      'active',
      'paused',
      'revoked'
    )
  then
    raise exception 'M26_RC44_CONNECTION_INVALID';
  end if;

  insert into public.m26_wearable_connections_v44 (
    owner_user_id,
    client_id,
    provider,
    status,
    sync_enabled,
    granted_scopes,
    consent_version,
    last_synced_at,
    metadata
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    v_status,
    v_sync_enabled,
    v_scopes,
    'v44-zero-cost',
    v_last_synced_at,
    v_metadata
  )
  on conflict (
    owner_user_id,
    client_id,
    provider
  )
  do update set
    status = excluded.status,
    sync_enabled = excluded.sync_enabled,
    granted_scopes = excluded.granted_scopes,
    last_synced_at = excluded.last_synced_at,
    metadata = excluded.metadata
  returning id into v_id;

  v_action := case
    when v_status = 'paused' then 'pause'
    when v_status = 'revoked' then 'revoke'
    when v_sync_enabled then 'grant'
    else 'pause'
  end;

  insert into public.m26_wearable_consents_v44 (
    actor_user_id,
    client_id,
    provider,
    action,
    scopes,
    policy_version
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    v_action,
    v_scopes,
    'v44-zero-cost'
  );

  return jsonb_build_object(
    'ok',
    true,
    'saved',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id,
    'provider',
    v_provider,
    'status',
    v_status,
    'syncEnabled',
    v_sync_enabled
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_wearable_connection_upsert_v44(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_wearable_connection_upsert_v44(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.m26_wearable_connection_upsert_v44(jsonb) TO service_role;

CREATE FUNCTION public.m26_wearable_delete_all_v44()
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();

  if v_client_id is null then
    raise exception 'M26_RC44_CLIENT_REQUIRED';
  end if;

  for v_provider in
    select distinct provider
    from (
      select provider
      from public.m26_wearable_connections_v44
      where client_id = v_client_id

      union

      select provider
      from public.m26_wearable_daily_summaries_v44
      where client_id = v_client_id
    ) providers
  loop
    insert into public.m26_wearable_consents_v44 (
      actor_user_id,
      client_id,
      provider,
      action,
      scopes,
      policy_version
    )
    values (
      auth.uid(),
      v_client_id,
      v_provider,
      'delete',
      '{}'::text[],
      'v44-zero-cost'
    );
  end loop;

  delete from public.m26_wearable_daily_summaries_v44
  where client_id = v_client_id;

  get diagnostics
    v_deleted = row_count;

  delete from public.m26_wearable_connections_v44
  where owner_user_id = auth.uid()
    and client_id = v_client_id;

  return jsonb_build_object(
    'ok',
    true,
    'deleted',
    true,
    'recordsDeleted',
    v_deleted,
    'clientId',
    v_client_id
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_wearable_delete_all_v44() FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_wearable_delete_all_v44() TO authenticated;

GRANT ALL ON FUNCTION public.m26_wearable_delete_all_v44() TO service_role;

CREATE FUNCTION public.m26_wearable_health_v44()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with wearable_tables as (
    select unnest(
      array[
        'public.m26_wearable_connections_v44',
        'public.m26_wearable_daily_summaries_v44',
        'public.m26_wearable_consents_v44'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,

      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from wearable_tables
  ),
  policy_state as (
    select count(*) as policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'm26_wearable_connections_v44',
        'm26_wearable_daily_summaries_v44',
        'm26_wearable_consents_v44'
      )
  ),
  rpc_state as (
    select count(*) as rpc_count
    from unnest(
      array[
        'public.m26_wearable_bootstrap_v44()',
        'public.m26_wearable_import_v44(jsonb)',
        'public.m26_wearable_connection_upsert_v44(jsonb)',
        'public.m26_wearable_revoke_v44(text,boolean)',
        'public.m26_wearable_delete_all_v44()'
      ]
    ) as rpc_name
    where to_regprocedure(rpc_name) is not null
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 3
      and rls_count = 3
      and policy_count >= 10
      and rpc_count = 5,
    'version',
    'RC44',
    'environment',
    'production',
    'wearableTables',
    table_count,
    'wearableRls',
    rls_count,
    'wearablePolicies',
    policy_count,
    'wearableRpcs',
    rpc_count,
    'productionModified',
    true,
    'productionDeployed',
    true
  )
  from table_state
  cross join policy_state
  cross join rpc_state;
$function$;

REVOKE ALL ON FUNCTION public.m26_wearable_health_v44() FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_wearable_health_v44() TO anon;

GRANT ALL ON FUNCTION public.m26_wearable_health_v44() TO authenticated;

GRANT ALL ON FUNCTION public.m26_wearable_health_v44() TO service_role;

CREATE FUNCTION public.m26_wearable_import_v44 (
  p_payload jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_records jsonb;
  v_record jsonb;
  v_metrics jsonb;
  v_client_id uuid;
  v_provider text;
  v_date date;
  v_source_updated_at timestamptz;
  v_source_count integer;
  v_quality text;
  v_steps integer;
  v_active_minutes integer;
  v_sleep_minutes integer;
  v_resting_hr numeric;
  v_hrv numeric;
  v_energy numeric;
  v_workout_minutes integer;
  v_row_count integer;
  v_accepted integer := 0;
  v_stale integer := 0;
  v_rejected integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or public.m26_json_has_forbidden_key_v44(
      p_payload
    )
    or octet_length(p_payload::text) > 900000
  then
    raise exception 'M26_RC44_IMPORT_PAYLOAD_INVALID';
  end if;

  v_records := p_payload -> 'records';

  if
    jsonb_typeof(v_records) <> 'array'
    or jsonb_array_length(v_records) < 1
    or jsonb_array_length(v_records) > 250
  then
    raise exception 'M26_RC44_IMPORT_BATCH_INVALID';
  end if;

  for v_record in
    select value
    from jsonb_array_elements(v_records)
  loop
    begin
      v_client_id := nullif(
        v_record ->> 'clientId',
        ''
      )::uuid;

      v_provider := lower(
        trim(v_record ->> 'provider')
      );

      v_date := nullif(
        v_record ->> 'date',
        ''
      )::date;

      v_metrics := v_record -> 'metrics';

      if
        v_client_id is null
        or v_client_id <> public.iberfit_client_id()
        or v_provider not in (
          'normalized_file',
          'health_connect',
          'samsung_health',
          'apple_health',
          'strava',
          'garmin_connect',
          'fitbit',
          'oura'
        )
        or v_date is null
        or jsonb_typeof(v_metrics) <> 'object'
      then
        raise exception 'M26_RC44_IMPORT_RECORD_INVALID';
      end if;

      v_steps := round(
        nullif(
          v_metrics ->> 'steps',
          ''
        )::numeric
      )::integer;

      v_active_minutes := round(
        nullif(
          v_metrics ->> 'activeMinutes',
          ''
        )::numeric
      )::integer;

      v_sleep_minutes := round(
        nullif(
          v_metrics ->> 'sleepMinutes',
          ''
        )::numeric
      )::integer;

      v_resting_hr := nullif(
        v_metrics ->> 'restingHeartRate',
        ''
      )::numeric;

      v_hrv := nullif(
        v_metrics ->> 'hrvMs',
        ''
      )::numeric;

      v_energy := nullif(
        v_metrics ->> 'activeEnergyKcal',
        ''
      )::numeric;

      v_workout_minutes := round(
        nullif(
          v_metrics ->> 'workoutMinutes',
          ''
        )::numeric
      )::integer;

      v_quality := coalesce(
        nullif(
          lower(trim(v_record ->> 'quality')),
          ''
        ),
        'limitada'
      );

      v_source_updated_at := coalesce(
        nullif(
          v_record ->> 'sourceUpdatedAt',
          ''
        )::timestamptz,
        (v_date::text || 'T12:00:00Z')::timestamptz
      );

      v_source_count := greatest(
        1,
        least(
          100000,
          coalesce(
            nullif(
              v_record ->> 'sourceRecordCount',
              ''
            )::integer,
            1
          )
        )
      );

      insert into
      public.m26_wearable_daily_summaries_v44 (
        client_id,
        provider,
        record_date,
        steps,
        active_minutes,
        sleep_minutes,
        resting_heart_rate,
        hrv_ms,
        active_energy_kcal,
        workout_minutes,
        quality,
        source_updated_at,
        source_record_count,
        imported_by
      )
      values (
        v_client_id,
        v_provider,
        v_date,
        v_steps,
        v_active_minutes,
        v_sleep_minutes,
        v_resting_hr,
        v_hrv,
        v_energy,
        v_workout_minutes,
        v_quality,
        v_source_updated_at,
        v_source_count,
        auth.uid()
      )
      on conflict (
        client_id,
        provider,
        record_date
      )
      do update set
        steps = excluded.steps,
        active_minutes = excluded.active_minutes,
        sleep_minutes = excluded.sleep_minutes,
        resting_heart_rate = excluded.resting_heart_rate,
        hrv_ms = excluded.hrv_ms,
        active_energy_kcal = excluded.active_energy_kcal,
        workout_minutes = excluded.workout_minutes,
        quality = excluded.quality,
        source_updated_at = excluded.source_updated_at,
        source_record_count = excluded.source_record_count,
        imported_by = auth.uid()
      where
        public.m26_wearable_daily_summaries_v44
          .source_updated_at
        <= excluded.source_updated_at;

      get diagnostics
        v_row_count = row_count;

      if v_row_count = 1 then
        v_accepted := v_accepted + 1;
      else
        v_stale := v_stale + 1;
      end if;
    exception
      when others then
        v_rejected := v_rejected + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok',
    true,
    'accepted',
    v_accepted,
    'stale',
    v_stale,
    'rejected',
    v_rejected,
    'total',
    jsonb_array_length(v_records)
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_wearable_import_v44(jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_wearable_import_v44(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.m26_wearable_import_v44(jsonb) TO service_role;

CREATE FUNCTION public.m26_wearable_revoke_v44 (
  p_provider    text,
  p_delete_data boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();
  v_provider := lower(trim(p_provider));

  if
    v_client_id is null
    or v_provider not in (
      'normalized_file',
      'health_connect',
      'samsung_health',
      'apple_health',
      'strava',
      'garmin_connect',
      'fitbit',
      'oura'
    )
  then
    raise exception 'M26_RC44_REVOKE_INVALID';
  end if;

  update public.m26_wearable_connections_v44
  set
    status = 'revoked',
    sync_enabled = false
  where owner_user_id = auth.uid()
    and client_id = v_client_id
    and provider = v_provider;

  if coalesce(p_delete_data, false) then
    delete from public.m26_wearable_daily_summaries_v44
    where client_id = v_client_id
      and provider = v_provider;

    get diagnostics
      v_deleted = row_count;
  end if;

  insert into public.m26_wearable_consents_v44 (
    actor_user_id,
    client_id,
    provider,
    action,
    scopes,
    policy_version
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    case
      when coalesce(p_delete_data, false)
        then 'delete'
      else 'revoke'
    end,
    '{}'::text[],
    'v44-zero-cost'
  );

  return jsonb_build_object(
    'ok',
    true,
    'revoked',
    true,
    'provider',
    v_provider,
    'deleted',
    v_deleted
  );
end
$function$;

REVOKE ALL ON FUNCTION public.m26_wearable_revoke_v44(text, boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION public.m26_wearable_revoke_v44(text, boolean) TO authenticated;

GRANT ALL ON FUNCTION public.m26_wearable_revoke_v44(text, boolean) TO service_role;

GRANT SELECT ON public.active_execution_locks_v26 TO anon;

GRANT SELECT ON public.active_execution_locks_v26 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.active_execution_locks_v26 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.ai_proposals TO anon;

GRANT DELETE ON public.ai_proposals TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.ai_proposals TO service_role;

CREATE TABLE public.appointment_change_requests (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  appointment_id    text                     NOT NULL,
  client_id         text                     NOT NULL,
  requester_user_id uuid                     NOT NULL,
  reason            text                     NOT NULL,
  status            text                     DEFAULT 'pending'::text NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at       timestamp with time zone,
  resolved_by       uuid,
  resolution_note   text
);

ALTER TABLE public.appointment_change_requests
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.appointment_change_requests
  ADD CONSTRAINT appointment_change_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.appointment_change_requests
  ADD CONSTRAINT appointment_change_requests_reason_check CHECK (char_length(reason) >= 3 AND char_length(reason) <= 500);

ALTER TABLE public.appointment_change_requests
  ADD CONSTRAINT appointment_change_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.appointment_change_requests
  ADD CONSTRAINT appointment_change_requests_resolution_note_check CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500);

ALTER TABLE public.appointment_change_requests
  ADD CONSTRAINT appointment_change_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);

ALTER TABLE public.appointment_change_requests
  ADD CONSTRAINT appointment_change_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'resolved'::text]));

GRANT ALL ON public.appointment_change_requests TO service_role;

CREATE INDEX appointment_change_requests_client_created ON public.appointment_change_requests (client_id, created_at DESC);

CREATE UNIQUE INDEX appointment_change_requests_one_pending ON public.appointment_change_requests (appointment_id, requester_user_id)
  WHERE status = 'pending'::text;

GRANT SELECT ON public.appointments TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.appointments TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.audit_events TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.audit_events TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.audit_events TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.backup_manifests TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.backup_manifests TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.backup_manifests TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_consent_records_v16 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_consent_records_v16 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_consent_records_v16 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_feedback_v16 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_feedback_v16 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_feedback_v16 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_incidents_v16 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_incidents_v16 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_incidents_v16 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_participants_v16 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_participants_v16 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_participants_v16 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_runs TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_runs TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_runs TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_session_observations_v16 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_session_observations_v16 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.beta_session_observations_v16 TO service_role;

GRANT SELECT ON public.client_access_v26 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_access_v26 TO service_role;

ALTER TABLE public.client_app_profiles
  ADD COLUMN profile jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN public.client_app_profiles.profile IS 'IBERFIT V12.3: perfil can├│nico compartido por Expediente y paso 1 del IRI.';

ALTER TABLE public.client_app_profiles
  ADD CONSTRAINT client_app_profiles_profile_object_v123 CHECK (jsonb_typeof(profile) = 'object'::text);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_app_profiles TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_app_profiles TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_app_profiles TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_assignments TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_assignments TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_assignments TO service_role;

CREATE TABLE public.client_checkins_v26 (
  id          uuid                     NOT NULL,
  client_id   uuid                     NOT NULL,
  energy      numeric(4,1)             NOT NULL,
  sleep       numeric(4,1)             NOT NULL,
  stress      numeric(4,1)             NOT NULL,
  pain        numeric(4,1)             NOT NULL,
  notes       text                     DEFAULT ''::text NOT NULL,
  status      text                     NOT NULL,
  revision    bigint                   NOT NULL,
  recorded_at timestamp with time zone NOT NULL,
  created_by  uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.client_checkins_v26
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_checkins_v26
  ADD CONSTRAINT client_checkins_v26_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.client_checkins_v26
  ADD CONSTRAINT client_checkins_v26_energy_check CHECK (energy >= 0::numeric AND energy <= 10::numeric);

ALTER TABLE public.client_checkins_v26
  ADD CONSTRAINT client_checkins_v26_notes_check CHECK (length(notes) <= 1000);

ALTER TABLE public.client_checkins_v26
  ADD CONSTRAINT client_checkins_v26_pain_check CHECK (pain >= 0::numeric AND pain <= 10::numeric);

ALTER TABLE public.client_checkins_v26
  ADD CONSTRAINT client_checkins_v26_pkey PRIMARY KEY (id);

ALTER TABLE public.client_checkins_v26
  ADD CONSTRAINT client_checkins_v26_revision_check CHECK (revision > 0);

ALTER TABLE public.client_checkins_v26
  ADD CONSTRAINT client_checkins_v26_sleep_check CHECK (sleep >= 0::numeric AND sleep <= 10::numeric);

ALTER TABLE public.client_checkins_v26
  ADD CONSTRAINT client_checkins_v26_status_check CHECK (status = ANY (ARRAY['confirmado'::text, 'anulado'::text]));

ALTER TABLE public.client_checkins_v26
  ADD CONSTRAINT client_checkins_v26_stress_check CHECK (stress >= 0::numeric AND stress <= 10::numeric);

GRANT SELECT ON public.client_checkins_v26 TO authenticated;

GRANT ALL ON public.client_checkins_v26 TO service_role;

CREATE INDEX client_checkins_v26_client_recorded_idx ON public.client_checkins_v26 (client_id, recorded_at DESC);

CREATE POLICY client_checkins_v26_select ON public.client_checkins_v26
  FOR SELECT
  TO authenticated
  USING ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id)));

CREATE TABLE public.client_habit_logs_v26 (
  id          uuid                     NOT NULL,
  client_id   uuid                     NOT NULL,
  habit_id    uuid                     NOT NULL,
  completed   boolean                  DEFAULT false NOT NULL,
  value       jsonb,
  notes       text                     DEFAULT ''::text NOT NULL,
  status      text                     NOT NULL,
  revision    bigint                   NOT NULL,
  recorded_at timestamp with time zone NOT NULL,
  created_by  uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.client_habit_logs_v26
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_habit_logs_v26
  ADD CONSTRAINT client_habit_logs_v26_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.client_habit_logs_v26
  ADD CONSTRAINT client_habit_logs_v26_notes_check CHECK (length(notes) <= 500);

ALTER TABLE public.client_habit_logs_v26
  ADD CONSTRAINT client_habit_logs_v26_pkey PRIMARY KEY (id);

ALTER TABLE public.client_habit_logs_v26
  ADD CONSTRAINT client_habit_logs_v26_revision_check CHECK (revision > 0);

ALTER TABLE public.client_habit_logs_v26
  ADD CONSTRAINT client_habit_logs_v26_status_check CHECK (status = 'confirmado'::text);

GRANT SELECT ON public.client_habit_logs_v26 TO authenticated;

GRANT ALL ON public.client_habit_logs_v26 TO service_role;

CREATE INDEX client_habit_logs_v26_habit_recorded_idx ON public.client_habit_logs_v26 (habit_id, recorded_at DESC);

CREATE INDEX client_habit_logs_v26_client_recorded_idx ON public.client_habit_logs_v26 (client_id, recorded_at DESC);

CREATE POLICY client_habit_logs_v26_select ON public.client_habit_logs_v26
  FOR SELECT
  TO authenticated
  USING ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id)));

CREATE TABLE public.client_habits_v26 (
  id          uuid                     NOT NULL,
  client_id   uuid                     NOT NULL,
  title       text                     NOT NULL,
  description text                     DEFAULT ''::text NOT NULL,
  target      numeric                  NOT NULL,
  unit        text                     NOT NULL,
  frequency   text                     NOT NULL,
  status      text                     NOT NULL,
  revision    bigint                   NOT NULL,
  created_by  uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.client_habits_v26
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.client_habits_v26
  ADD CONSTRAINT client_habits_v26_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.client_habits_v26
  ADD CONSTRAINT client_habits_v26_description_check CHECK (length(description) <= 500);

ALTER TABLE public.client_habits_v26
  ADD CONSTRAINT client_habits_v26_frequency_check CHECK (length(btrim(frequency)) >= 1 AND length(btrim(frequency)) <= 40);

ALTER TABLE public.client_habits_v26
  ADD CONSTRAINT client_habits_v26_pkey PRIMARY KEY (id);

ALTER TABLE public.client_habit_logs_v26
  ADD CONSTRAINT client_habit_logs_v26_habit_id_fkey FOREIGN KEY (habit_id) REFERENCES public.client_habits_v26(id) ON DELETE RESTRICT;

ALTER TABLE public.client_habits_v26
  ADD CONSTRAINT client_habits_v26_revision_check CHECK (revision > 0);

ALTER TABLE public.client_habits_v26
  ADD CONSTRAINT client_habits_v26_status_check CHECK (status = ANY (ARRAY['activo'::text, 'archivado'::text]));

ALTER TABLE public.client_habits_v26
  ADD CONSTRAINT client_habits_v26_target_check CHECK (target > 0::numeric AND target <= 1000000::numeric);

ALTER TABLE public.client_habits_v26
  ADD CONSTRAINT client_habits_v26_title_check CHECK (length(btrim(title)) >= 2 AND length(btrim(title)) <= 120);

ALTER TABLE public.client_habits_v26
  ADD CONSTRAINT client_habits_v26_unit_check CHECK (length(btrim(unit)) >= 1 AND length(btrim(unit)) <= 40);

GRANT SELECT ON public.client_habits_v26 TO authenticated;

GRANT ALL ON public.client_habits_v26 TO service_role;

CREATE INDEX client_habits_v26_client_status_idx ON public.client_habits_v26 (client_id, status, updated_at DESC);

CREATE POLICY client_habits_v26_select ON public.client_habits_v26
  FOR SELECT
  TO authenticated
  USING ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id)));

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_intake_profiles TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_intake_profiles TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_intake_profiles TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_timeline_events TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_timeline_events TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.client_timeline_events TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.clients TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.clients TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.clients TO service_role;

GRANT SELECT ON public.coach_availability_v26 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.coach_availability_v26 TO service_role;

CREATE TABLE public.coach_private_notes_v26 (
  id         uuid                     NOT NULL,
  client_id  uuid                     NOT NULL,
  body       text                     NOT NULL,
  visibility text                     DEFAULT 'coach_only'::text NOT NULL,
  status     text                     NOT NULL,
  revision   bigint                   NOT NULL,
  created_by uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.coach_private_notes_v26
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.coach_private_notes_v26
  ADD CONSTRAINT coach_private_notes_v26_body_check CHECK (length(btrim(body)) >= 3 AND length(btrim(body)) <= 4000);

ALTER TABLE public.coach_private_notes_v26
  ADD CONSTRAINT coach_private_notes_v26_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.coach_private_notes_v26
  ADD CONSTRAINT coach_private_notes_v26_pkey PRIMARY KEY (id);

ALTER TABLE public.coach_private_notes_v26
  ADD CONSTRAINT coach_private_notes_v26_revision_check CHECK (revision > 0);

ALTER TABLE public.coach_private_notes_v26
  ADD CONSTRAINT coach_private_notes_v26_status_check CHECK (status = ANY (ARRAY['activo'::text, 'archivado'::text]));

ALTER TABLE public.coach_private_notes_v26
  ADD CONSTRAINT coach_private_notes_v26_visibility_check CHECK (visibility = 'coach_only'::text);

GRANT SELECT ON public.coach_private_notes_v26 TO authenticated;

GRANT ALL ON public.coach_private_notes_v26 TO service_role;

CREATE INDEX coach_private_notes_v26_client_updated_idx ON public.coach_private_notes_v26 (client_id, updated_at DESC);

CREATE POLICY coach_private_notes_v26_select ON public.coach_private_notes_v26
  FOR SELECT
  TO authenticated
  USING
    (((public.iberfit_current_role_v26() = ANY (ARRAY['admin'::text, 'coach'::text])) AND public.iberfit_canary_enabled_v26(client_id) AND
    public.iberfit_can_access_client_v26(client_id)));

GRANT SELECT ON public.command_events_v26 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.command_events_v26 TO service_role;

CREATE POLICY command_events_v26_select_rc29 ON public.command_events_v26
  FOR SELECT
  TO service_role
  USING ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id)));

CREATE POLICY command_events_v26_select ON public.command_events_v26
  FOR SELECT
  TO authenticated
  USING
    ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id) AND ((public.iberfit_current_role_v26() <> 'cliente'::text) OR (entity_type
    <> ALL (ARRAY['private_note'::text, 'intelligence'::text])))));

GRANT SELECT ON public.command_receipts_v26 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.command_receipts_v26 TO service_role;

CREATE POLICY command_receipts_v26_select_rc29 ON public.command_receipts_v26
  FOR SELECT
  TO service_role
  USING ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id)));

CREATE POLICY command_receipts_v26_select ON public.command_receipts_v26
  FOR SELECT
  TO authenticated
  USING
    ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id) AND ((public.iberfit_current_role_v26() <> 'cliente'::text) OR (entity_type
    <> ALL (ARRAY['private_note'::text, 'intelligence'::text])))));

GRANT DELETE, INSERT, SELECT, UPDATE ON public.consent_acceptances_v17 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.consent_acceptances_v17 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.consent_acceptances_v17 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.data_subject_requests_v17 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.data_subject_requests_v17 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.data_subject_requests_v17 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.device_conflict_trials TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.device_conflict_trials TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.device_conflict_trials TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.documents TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.documents TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.documents TO service_role;

GRANT SELECT ON public.domain_command_registry_v26 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.domain_command_registry_v26 TO service_role;

GRANT SELECT ON public.domain_entities_v26 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.domain_entities_v26 TO service_role;

CREATE POLICY domain_entities_v26_select_rc29 ON public.domain_entities_v26
  FOR SELECT
  TO service_role
  USING ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id)));

CREATE POLICY domain_entities_v26_select ON public.domain_entities_v26
  FOR SELECT
  TO authenticated
  USING
    ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id) AND ((public.iberfit_current_role_v26() <> 'cliente'::text) OR (entity_type
    <> ALL (ARRAY['private_note'::text, 'intelligence'::text])))));

GRANT SELECT ON public.domain_events_v26 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.domain_events_v26 TO service_role;

CREATE POLICY domain_events_v26_select_rc29 ON public.domain_events_v26
  FOR SELECT
  TO service_role
  USING ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id)));

CREATE POLICY domain_events_v26_select ON public.domain_events_v26
  FOR SELECT
  TO authenticated
  USING
    ((public.iberfit_canary_enabled_v26(client_id) AND public.iberfit_can_access_client_v26(client_id) AND ((public.iberfit_current_role_v26() <> 'cliente'::text) OR (entity_type
    <> ALL (ARRAY['private_note'::text, 'intelligence'::text])))));

GRANT SELECT ON public.domain_transitions_v26 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.domain_transitions_v26 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.exercise_catalog TO anon;

GRANT DELETE ON public.exercise_catalog TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.exercise_catalog TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.exercise_catalog_sync_runs TO anon;

GRANT DELETE ON public.exercise_catalog_sync_runs TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.exercise_catalog_sync_runs TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.feature_flags_v18 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.feature_flags_v18 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.feature_flags_v18 TO service_role;

CREATE TABLE public.iberfit_admin_audit_events (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id   uuid                     NOT NULL,
  event_type        text                     NOT NULL,
  actor_user_id     uuid                     NOT NULL,
  actor_application text                     DEFAULT 'admin'::text NOT NULL,
  entity_type       text                     NOT NULL,
  entity_id         text                     NOT NULL,
  summary           text                     NOT NULL,
  trace_id          text                     NOT NULL,
  revision          integer                  DEFAULT 1 NOT NULL,
  occurred_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_admin_audit_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_admin_audit_events
  ADD CONSTRAINT iberfit_admin_audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_admin_audit_events
  ADD CONSTRAINT iberfit_admin_audit_events_pkey PRIMARY KEY (id);

GRANT ALL ON public.iberfit_admin_audit_events TO service_role;

CREATE TABLE public.iberfit_admin_mutation_receipts (
  operation_id    text                     NOT NULL,
  organization_id uuid                     NOT NULL,
  actor_user_id   uuid                     NOT NULL,
  command_type    text                     NOT NULL,
  result          jsonb                    NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_admin_mutation_receipts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_admin_mutation_receipts
  ADD CONSTRAINT iberfit_admin_mutation_receipts_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_admin_mutation_receipts
  ADD CONSTRAINT iberfit_admin_mutation_receipts_pkey PRIMARY KEY (operation_id);

GRANT ALL ON public.iberfit_admin_mutation_receipts TO service_role;

CREATE TABLE public.iberfit_automation_rules (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  key             text                     NOT NULL,
  name            text                     NOT NULL,
  trigger_type    text                     NOT NULL,
  action_type     text                     NOT NULL,
  status          text                     DEFAULT 'draft'::text NOT NULL,
  configuration   jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  revision        integer                  DEFAULT 1 NOT NULL,
  created_by      uuid                     NOT NULL,
  updated_by      uuid                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_automation_rules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_automation_rules
  ADD CONSTRAINT iberfit_automation_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_automation_rules
  ADD CONSTRAINT iberfit_automation_rules_key_check CHECK (key ~ '^[a-z0-9_.:-]{3,80}$'::text);

ALTER TABLE public.iberfit_automation_rules
  ADD CONSTRAINT iberfit_automation_rules_organization_id_key_key UNIQUE (organization_id, key);

ALTER TABLE public.iberfit_automation_rules
  ADD CONSTRAINT iberfit_automation_rules_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_automation_rules
  ADD CONSTRAINT iberfit_automation_rules_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text]));

ALTER TABLE public.iberfit_automation_rules
  ADD CONSTRAINT iberfit_automation_rules_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

GRANT ALL ON public.iberfit_automation_rules TO service_role;

CREATE TABLE public.iberfit_client_lifecycle_events (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  client_id       text                     NOT NULL,
  status          text                     NOT NULL,
  reason          text                     NOT NULL,
  effective_at    timestamp with time zone DEFAULT now() NOT NULL,
  changed_by      uuid                     NOT NULL,
  revision        integer                  DEFAULT 1 NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_client_lifecycle_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_client_lifecycle_events
  ADD CONSTRAINT iberfit_client_lifecycle_events_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_client_lifecycle_events
  ADD CONSTRAINT iberfit_client_lifecycle_events_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_client_lifecycle_events
  ADD CONSTRAINT iberfit_client_lifecycle_events_reason_check CHECK (char_length(reason) >= 3 AND char_length(reason) <= 500);

ALTER TABLE public.iberfit_client_lifecycle_events
  ADD CONSTRAINT iberfit_client_lifecycle_events_status_check
    CHECK (status = ANY (ARRAY['lead'::text, 'onboarding'::text, 'active'::text, 'paused'::text, 'inactive'::text, 'reactivation'::text]));

GRANT ALL ON public.iberfit_client_lifecycle_events TO service_role;

CREATE TABLE public.iberfit_coach_client_assignments (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  coach_user_id   uuid                     NOT NULL,
  client_id       text                     NOT NULL,
  status          text                     DEFAULT 'active'::text NOT NULL,
  starts_at       date                     NOT NULL,
  ends_at         date,
  reason          text                     NOT NULL,
  created_by      uuid                     NOT NULL,
  ended_by        uuid,
  revision        integer                  DEFAULT 1 NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_coach_client_assignments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_check CHECK (ends_at IS NULL OR ends_at >= starts_at);

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_client_id_check CHECK (char_length(client_id) >= 1 AND char_length(client_id) <= 200);

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_coach_user_id_fkey FOREIGN KEY (coach_user_id) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_ended_by_fkey FOREIGN KEY (ended_by) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_reason_check CHECK (char_length(reason) >= 3 AND char_length(reason) <= 500);

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_revision_check CHECK (revision >= 1);

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_status_check CHECK (status = ANY (ARRAY['active'::text, 'ended'::text, 'cancelled'::text]));

GRANT ALL ON public.iberfit_coach_client_assignments TO service_role;

CREATE UNIQUE INDEX iberfit_assignment_active_unique ON public.iberfit_coach_client_assignments (organization_id, coach_user_id, client_id)
  WHERE status = 'active'::text;

CREATE TABLE public.iberfit_communication_receipts (
  operation_id    text                     NOT NULL,
  organization_id uuid                     NOT NULL,
  actor_user_id   uuid                     NOT NULL,
  command_type    text                     NOT NULL,
  result          jsonb                    NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_communication_receipts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_communication_receipts
  ADD CONSTRAINT iberfit_communication_receipts_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_communication_receipts
  ADD CONSTRAINT iberfit_communication_receipts_pkey PRIMARY KEY (operation_id);

GRANT ALL ON public.iberfit_communication_receipts TO service_role;

CREATE TABLE public.iberfit_conversation_threads (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  client_id       text                     NOT NULL,
  coach_user_id   uuid                     NOT NULL,
  subject         text                     DEFAULT 'Seguimiento IBERFIT'::text NOT NULL,
  status          text                     DEFAULT 'active'::text NOT NULL,
  revision        integer                  DEFAULT 1 NOT NULL,
  created_by      uuid                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_conversation_threads
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_conversation_threads
  ADD CONSTRAINT iberfit_conversation_threads_coach_user_id_fkey FOREIGN KEY (coach_user_id) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_conversation_threads
  ADD CONSTRAINT iberfit_conversation_threads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_conversation_threads
  ADD CONSTRAINT iberfit_conversation_threads_organization_id_coach_user_id__key UNIQUE (organization_id, coach_user_id, client_id);

ALTER TABLE public.iberfit_conversation_threads
  ADD CONSTRAINT iberfit_conversation_threads_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_conversation_threads
  ADD CONSTRAINT iberfit_conversation_threads_status_check CHECK (status = ANY (ARRAY['active'::text, 'closed'::text]));

GRANT ALL ON public.iberfit_conversation_threads TO service_role;

CREATE TABLE public.iberfit_in_app_notifications (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id     uuid                     NOT NULL,
  recipient_user_id   uuid,
  recipient_client_id text,
  title               text                     NOT NULL,
  body                text                     NOT NULL,
  action_area         text,
  action_entity_id    text,
  status              text                     DEFAULT 'unread'::text NOT NULL,
  read_at             timestamp with time zone,
  revision            integer                  DEFAULT 1 NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_in_app_notifications
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_in_app_notifications
  ADD CONSTRAINT iberfit_in_app_notifications_check CHECK (recipient_user_id IS NOT NULL AND recipient_client_id IS NULL OR recipient_user_id IS NULL AND recipient_client_id IS
    NOT NULL);

ALTER TABLE public.iberfit_in_app_notifications
  ADD CONSTRAINT iberfit_in_app_notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_in_app_notifications
  ADD CONSTRAINT iberfit_in_app_notifications_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_in_app_notifications
  ADD CONSTRAINT iberfit_in_app_notifications_status_check CHECK (status = ANY (ARRAY['unread'::text, 'read'::text, 'archived'::text]));

GRANT ALL ON public.iberfit_in_app_notifications TO service_role;

CREATE TABLE public.iberfit_leads (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  name            text                     NOT NULL,
  email           text,
  phone           text,
  source          text,
  objective       text,
  status          text                     DEFAULT 'new'::text NOT NULL,
  owner_user_id   uuid,
  next_action_at  timestamp with time zone,
  revision        integer                  DEFAULT 1 NOT NULL,
  created_by      uuid                     NOT NULL,
  updated_by      uuid                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_leads
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_leads
  ADD CONSTRAINT iberfit_leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_leads
  ADD CONSTRAINT iberfit_leads_name_check CHECK (char_length(name) >= 2 AND char_length(name) <= 200);

ALTER TABLE public.iberfit_leads
  ADD CONSTRAINT iberfit_leads_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_leads
  ADD CONSTRAINT iberfit_leads_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_leads
  ADD CONSTRAINT iberfit_leads_status_check CHECK (status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'evaluation'::text, 'won'::text, 'lost'::text]));

ALTER TABLE public.iberfit_leads
  ADD CONSTRAINT iberfit_leads_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

GRANT ALL ON public.iberfit_leads TO service_role;

CREATE TABLE public.iberfit_messages (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id   uuid                     NOT NULL,
  thread_id         uuid                     NOT NULL,
  sender_user_id    uuid                     NOT NULL,
  sender_role       text                     NOT NULL,
  body              text                     NOT NULL,
  read_by_client_at timestamp with time zone,
  read_by_coach_at  timestamp with time zone,
  revision          integer                  DEFAULT 1 NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_messages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_messages
  ADD CONSTRAINT iberfit_messages_body_check CHECK (char_length(body) >= 1 AND char_length(body) <= 4000);

ALTER TABLE public.iberfit_messages
  ADD CONSTRAINT iberfit_messages_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_messages
  ADD CONSTRAINT iberfit_messages_sender_role_check CHECK (sender_role = ANY (ARRAY['client'::text, 'coach'::text]));

ALTER TABLE public.iberfit_messages
  ADD CONSTRAINT iberfit_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_messages
  ADD CONSTRAINT iberfit_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.iberfit_conversation_threads(id) ON DELETE CASCADE;

GRANT ALL ON public.iberfit_messages TO service_role;

CREATE TABLE public.iberfit_notification_deliveries (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  template_key    text                     NOT NULL,
  recipient_type  text                     NOT NULL,
  recipient_id    text                     NOT NULL,
  channel         text                     NOT NULL,
  status          text                     DEFAULT 'scheduled'::text NOT NULL,
  scheduled_at    timestamp with time zone,
  sent_at         timestamp with time zone,
  error_code      text,
  revision        integer                  DEFAULT 1 NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_notification_deliveries
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_notification_deliveries
  ADD CONSTRAINT iberfit_notification_deliveries_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_notification_deliveries
  ADD CONSTRAINT iberfit_notification_deliveries_status_check CHECK (status = ANY (ARRAY['scheduled'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text]));

GRANT ALL ON public.iberfit_notification_deliveries TO service_role;

CREATE TABLE public.iberfit_notification_templates (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  key             text                     NOT NULL,
  name            text                     NOT NULL,
  channel         text                     NOT NULL,
  subject         text,
  body            text                     NOT NULL,
  status          text                     DEFAULT 'active'::text NOT NULL,
  revision        integer                  DEFAULT 1 NOT NULL,
  created_by      uuid                     NOT NULL,
  updated_by      uuid                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_notification_templates
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_notification_templates
  ADD CONSTRAINT iberfit_notification_templates_body_check CHECK (char_length(body) >= 1 AND char_length(body) <= 4000);

ALTER TABLE public.iberfit_notification_templates
  ADD CONSTRAINT iberfit_notification_templates_channel_check CHECK (channel = ANY (ARRAY['in_app'::text, 'email'::text, 'push'::text]));

ALTER TABLE public.iberfit_notification_templates
  ADD CONSTRAINT iberfit_notification_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_notification_templates
  ADD CONSTRAINT iberfit_notification_templates_key_check CHECK (key ~ '^[a-z0-9_.:-]{3,80}$'::text);

ALTER TABLE public.iberfit_notification_templates
  ADD CONSTRAINT iberfit_notification_templates_organization_id_key_key UNIQUE (organization_id, key);

ALTER TABLE public.iberfit_notification_templates
  ADD CONSTRAINT iberfit_notification_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_notification_templates
  ADD CONSTRAINT iberfit_notification_templates_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));

ALTER TABLE public.iberfit_notification_templates
  ADD CONSTRAINT iberfit_notification_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

GRANT ALL ON public.iberfit_notification_templates TO service_role;

CREATE TABLE public.iberfit_operational_tasks (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id  uuid                     NOT NULL,
  type             text                     NOT NULL,
  entity_type      text,
  entity_id        text,
  client_id        text,
  assignee_user_id uuid,
  status           text                     DEFAULT 'open'::text NOT NULL,
  priority         text                     DEFAULT 'normal'::text NOT NULL,
  title            text                     NOT NULL,
  detail           text,
  due_at           timestamp with time zone,
  created_by       uuid                     NOT NULL,
  resolved_by      uuid,
  resolved_at      timestamp with time zone,
  resolution_note  text,
  revision         integer                  DEFAULT 1 NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_operational_tasks
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_operational_tasks
  ADD CONSTRAINT iberfit_operational_tasks_assignee_user_id_fkey FOREIGN KEY (assignee_user_id) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_operational_tasks
  ADD CONSTRAINT iberfit_operational_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_operational_tasks
  ADD CONSTRAINT iberfit_operational_tasks_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_operational_tasks
  ADD CONSTRAINT iberfit_operational_tasks_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text]));

ALTER TABLE public.iberfit_operational_tasks
  ADD CONSTRAINT iberfit_operational_tasks_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id);

ALTER TABLE public.iberfit_operational_tasks
  ADD CONSTRAINT iberfit_operational_tasks_status_check CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'cancelled'::text]));

ALTER TABLE public.iberfit_operational_tasks
  ADD CONSTRAINT iberfit_operational_tasks_title_check CHECK (char_length(title) >= 3 AND char_length(title) <= 200);

GRANT ALL ON public.iberfit_operational_tasks TO service_role;

CREATE TABLE public.iberfit_organization_memberships (
  organization_id uuid                     NOT NULL,
  user_id         uuid                     NOT NULL,
  status          text                     DEFAULT 'active'::text NOT NULL,
  revision        integer                  DEFAULT 1 NOT NULL,
  joined_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_organization_memberships
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_organization_memberships
  ADD CONSTRAINT iberfit_organization_memberships_pkey PRIMARY KEY (organization_id, user_id);

ALTER TABLE public.iberfit_organization_memberships
  ADD CONSTRAINT iberfit_organization_memberships_revision_check CHECK (revision >= 1);

ALTER TABLE public.iberfit_organization_memberships
  ADD CONSTRAINT iberfit_organization_memberships_status_check CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'inactive'::text]));

ALTER TABLE public.iberfit_organization_memberships
  ADD CONSTRAINT iberfit_organization_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.iberfit_organization_memberships TO service_role;

CREATE TABLE public.iberfit_organizations (
  id         uuid                     NOT NULL,
  slug       text                     NOT NULL,
  name       text                     NOT NULL,
  status     text                     DEFAULT 'active'::text NOT NULL,
  timezone   text                     DEFAULT 'America/Santiago'::text NOT NULL,
  locale     text                     DEFAULT 'es-CL'::text NOT NULL,
  settings   jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  revision   integer                  DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.iberfit_organizations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iberfit_organizations
  ADD CONSTRAINT iberfit_organizations_name_check CHECK (char_length(name) >= 2 AND char_length(name) <= 200);

ALTER TABLE public.iberfit_organizations
  ADD CONSTRAINT iberfit_organizations_pkey PRIMARY KEY (id);

ALTER TABLE public.iberfit_admin_audit_events
  ADD CONSTRAINT iberfit_admin_audit_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_admin_mutation_receipts
  ADD CONSTRAINT iberfit_admin_mutation_receipts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_automation_rules
  ADD CONSTRAINT iberfit_automation_rules_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_client_lifecycle_events
  ADD CONSTRAINT iberfit_client_lifecycle_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_coach_client_assignments
  ADD CONSTRAINT iberfit_coach_client_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_communication_receipts
  ADD CONSTRAINT iberfit_communication_receipts_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_conversation_threads
  ADD CONSTRAINT iberfit_conversation_threads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_in_app_notifications
  ADD CONSTRAINT iberfit_in_app_notifications_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_leads
  ADD CONSTRAINT iberfit_leads_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_messages
  ADD CONSTRAINT iberfit_messages_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_notification_deliveries
  ADD CONSTRAINT iberfit_notification_deliveries_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_notification_templates
  ADD CONSTRAINT iberfit_notification_templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_operational_tasks
  ADD CONSTRAINT iberfit_operational_tasks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_organization_memberships
  ADD CONSTRAINT iberfit_organization_memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.iberfit_organizations(id) ON DELETE CASCADE;

ALTER TABLE public.iberfit_organizations
  ADD CONSTRAINT iberfit_organizations_revision_check CHECK (revision >= 1);

ALTER TABLE public.iberfit_organizations
  ADD CONSTRAINT iberfit_organizations_slug_check CHECK (slug ~ '^[a-z0-9-]{3,80}$'::text);

ALTER TABLE public.iberfit_organizations
  ADD CONSTRAINT iberfit_organizations_slug_key UNIQUE (slug);

ALTER TABLE public.iberfit_organizations
  ADD CONSTRAINT iberfit_organizations_status_check CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text]));

GRANT ALL ON public.iberfit_organizations TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.iberfit_system_settings TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.iberfit_system_settings TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.iberfit_system_settings TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.incident_register_v17 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.incident_register_v17 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.incident_register_v17 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.intelligence_runs TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.intelligence_runs TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.intelligence_runs TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.iri_assessments TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.iri_assessments TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.iri_assessments TO service_role;

CREATE TABLE public.iri_external_reports_v26 (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  client_id         uuid                     NOT NULL,
  assessment_id     uuid                     NOT NULL,
  bucket_id         text                     DEFAULT 'iberfit-iri-external-reports'::text NOT NULL,
  object_path       text                     NOT NULL,
  file_name         text                     NOT NULL,
  mime_type         text                     NOT NULL,
  size_bytes        bigint                   NOT NULL,
  visible_to_client boolean                  DEFAULT true NOT NULL,
  version           bigint                   DEFAULT 1 NOT NULL,
  uploaded_by       uuid                     DEFAULT auth.uid() NOT NULL,
  uploaded_at       timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  updated_at        timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

ALTER TABLE public.iri_external_reports_v26
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.iri_assessments(id) ON DELETE CASCADE;

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_assessment_id_key UNIQUE (assessment_id);

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_bucket_id_check CHECK (bucket_id = 'iberfit-iri-external-reports'::text);

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_check CHECK (object_path = (((client_id::text || '/'::text) || assessment_id::text) || '/bioimpedancia'::text));

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_file_name_check CHECK (length(btrim(file_name)) >= 1 AND length(btrim(file_name)) <= 240);

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_file_name_check1 CHECK (file_name !~ '[[:cntrl:]]'::text);

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_mime_type_check CHECK (mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text]));

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_object_path_key UNIQUE (object_path);

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_pkey PRIMARY KEY (id);

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_size_bytes_check CHECK (size_bytes >= 1 AND size_bytes <= 50000000);

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);

ALTER TABLE public.iri_external_reports_v26
  ADD CONSTRAINT iri_external_reports_v26_version_check CHECK (version > 0);

GRANT ALL ON public.iri_external_reports_v26 TO authenticated;

GRANT ALL ON public.iri_external_reports_v26 TO service_role;

CREATE INDEX iri_external_reports_client_idx ON public.iri_external_reports_v26 (client_id, updated_at DESC);

CREATE INDEX iri_external_reports_assessment_idx ON public.iri_external_reports_v26 (assessment_id);

CREATE POLICY iri_external_reports_read_v26 ON public.iri_external_reports_v26
  FOR SELECT
  TO authenticated
  USING ((public.iberfit_can_read_iri_external_report_v12(client_id) AND (visible_to_client OR public.iberfit_can_manage_iri_external_report_v12(client_id))));

CREATE TABLE public.m26_audit_events_v43 (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id uuid,
  client_id     uuid,
  event_type    text                     NOT NULL,
  entity_type   text                     NOT NULL,
  entity_id     uuid,
  metadata      jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_audit_events_v43
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_audit_events_v43
  ADD CONSTRAINT m26_audit_events_v43_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

ALTER TABLE public.m26_audit_events_v43
  ADD CONSTRAINT m26_audit_events_v43_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.m26_audit_events_v43
  ADD CONSTRAINT m26_audit_events_v43_entity_type_check CHECK (entity_type ~ '^[a-z0-9_]{2,80}$'::text);

ALTER TABLE public.m26_audit_events_v43
  ADD CONSTRAINT m26_audit_events_v43_event_type_check CHECK (event_type ~ '^[A-Z0-9_]{3,80}$'::text);

ALTER TABLE public.m26_audit_events_v43
  ADD CONSTRAINT m26_audit_events_v43_metadata_check CHECK (public.m26_json_safe_v43(metadata));

ALTER TABLE public.m26_audit_events_v43
  ADD CONSTRAINT m26_audit_events_v43_pkey PRIMARY KEY (id);

GRANT SELECT ON public.m26_audit_events_v43 TO authenticated;

GRANT ALL ON public.m26_audit_events_v43 TO service_role;

CREATE INDEX m26_audit_client_date_v43 ON public.m26_audit_events_v43 (client_id, created_at DESC);

CREATE POLICY m26_audit_read_v43 ON public.m26_audit_events_v43
  FOR SELECT
  TO authenticated
  USING (((actor_user_id = auth.uid()) OR ((client_id IS NOT NULL) AND ((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)))));

GRANT DELETE, INSERT, SELECT, UPDATE ON public.m26_canary_clients_v26 TO service_role;

CREATE TABLE public.m26_client_measurements_v43 (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  client_id   uuid                     NOT NULL,
  metric      text                     NOT NULL,
  value       numeric(14,4)            NOT NULL,
  unit        text                     NOT NULL,
  measured_at timestamp with time zone DEFAULT now() NOT NULL,
  source      text                     DEFAULT 'manual'::text NOT NULL,
  notes       text,
  metadata    jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  revision    bigint                   DEFAULT 1 NOT NULL,
  created_by  uuid                     DEFAULT auth.uid() NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_client_measurements_v43
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_client_measurements_v43
  ADD CONSTRAINT m26_client_measurements_v43_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_client_measurements_v43
  ADD CONSTRAINT m26_client_measurements_v43_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.m26_client_measurements_v43
  ADD CONSTRAINT m26_client_measurements_v43_metadata_check CHECK (public.m26_json_safe_v43(metadata));

ALTER TABLE public.m26_client_measurements_v43
  ADD CONSTRAINT m26_client_measurements_v43_metric_check CHECK (metric ~ '^[a-z0-9_]{2,40}$'::text);

ALTER TABLE public.m26_client_measurements_v43
  ADD CONSTRAINT m26_client_measurements_v43_notes_check CHECK (notes IS NULL OR char_length(notes) <= 1000);

ALTER TABLE public.m26_client_measurements_v43
  ADD CONSTRAINT m26_client_measurements_v43_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_client_measurements_v43
  ADD CONSTRAINT m26_client_measurements_v43_revision_check CHECK (revision > 0);

ALTER TABLE public.m26_client_measurements_v43
  ADD CONSTRAINT m26_client_measurements_v43_source_check CHECK (source = ANY (ARRAY['manual'::text, 'wearable'::text, 'import'::text, 'computed'::text]));

ALTER TABLE public.m26_client_measurements_v43
  ADD CONSTRAINT m26_client_measurements_v43_unit_check CHECK (char_length(unit) >= 1 AND char_length(unit) <= 24);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.m26_client_measurements_v43 TO authenticated;

GRANT ALL ON public.m26_client_measurements_v43 TO service_role;

CREATE INDEX m26_measurements_client_date_v43 ON public.m26_client_measurements_v43 (client_id, measured_at DESC);

CREATE TRIGGER m26_measurements_audit_v43
  AFTER INSERT OR DELETE OR UPDATE ON public.m26_client_measurements_v43
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_audit_row_v43();

CREATE TRIGGER m26_measurements_touch_v43
  BEFORE UPDATE ON public.m26_client_measurements_v43
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_touch_updated_at_v43();

CREATE POLICY m26_measurements_read_v43 ON public.m26_client_measurements_v43
  FOR SELECT
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)));

CREATE POLICY m26_measurements_write_v43 ON public.m26_client_measurements_v43
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)))
  WITH CHECK ((((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)) AND (created_by = auth.uid())));

CREATE TABLE public.m26_messages_v43 (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  client_id      uuid                     NOT NULL,
  sender_user_id uuid                     DEFAULT auth.uid() NOT NULL,
  body           text                     NOT NULL,
  read_at        timestamp with time zone,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  updated_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_messages_v43
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_messages_v43
  ADD CONSTRAINT m26_messages_v43_body_check CHECK (char_length(body) >= 1 AND char_length(body) <= 4000);

ALTER TABLE public.m26_messages_v43
  ADD CONSTRAINT m26_messages_v43_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_messages_v43
  ADD CONSTRAINT m26_messages_v43_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_messages_v43
  ADD CONSTRAINT m26_messages_v43_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES auth.users(id);

GRANT INSERT, SELECT ON public.m26_messages_v43 TO authenticated;

GRANT UPDATE (read_at) ON public.m26_messages_v43 TO authenticated;

GRANT ALL ON public.m26_messages_v43 TO service_role;

CREATE INDEX m26_messages_client_date_v43 ON public.m26_messages_v43 (client_id, created_at DESC);

CREATE TRIGGER m26_messages_audit_v43
  AFTER INSERT OR DELETE OR UPDATE ON public.m26_messages_v43
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_audit_row_v43();

CREATE TRIGGER m26_messages_touch_v43
  BEFORE UPDATE ON public.m26_messages_v43
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_touch_updated_at_v43();

CREATE POLICY m26_messages_insert_v43 ON public.m26_messages_v43
  FOR INSERT
  TO authenticated
  WITH CHECK ((((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)) AND (sender_user_id = auth.uid())));

CREATE POLICY m26_messages_read_v43 ON public.m26_messages_v43
  FOR SELECT
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)));

CREATE POLICY m26_messages_update_v43 ON public.m26_messages_v43
  FOR UPDATE
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)))
  WITH CHECK (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)));

CREATE TABLE public.m26_schema_releases_v43 (
  version             text                     NOT NULL,
  environment         text                     NOT NULL,
  applied_at          timestamp with time zone DEFAULT now() NOT NULL,
  production_modified boolean                  DEFAULT true NOT NULL,
  production_deployed boolean                  DEFAULT true NOT NULL
);

ALTER TABLE public.m26_schema_releases_v43
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_schema_releases_v43
  ADD CONSTRAINT m26_schema_releases_v43_environment_check CHECK (environment = 'production'::text);

ALTER TABLE public.m26_schema_releases_v43
  ADD CONSTRAINT m26_schema_releases_v43_pkey PRIMARY KEY (VERSION);

ALTER TABLE public.m26_schema_releases_v43
  ADD CONSTRAINT m26_schema_releases_v43_production_deployed_check CHECK (production_deployed = true);

ALTER TABLE public.m26_schema_releases_v43
  ADD CONSTRAINT m26_schema_releases_v43_production_modified_check CHECK (production_modified = true);

GRANT ALL ON public.m26_schema_releases_v43 TO service_role;

CREATE TABLE public.m26_session_drafts_v431 (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  owner_user_id   uuid                     DEFAULT auth.uid() NOT NULL,
  client_id       uuid                     NOT NULL,
  scope           text                     DEFAULT 'session-builder'::text NOT NULL,
  draft_payload   jsonb                    NOT NULL,
  client_revision bigint                   DEFAULT 0 NOT NULL,
  revision        bigint                   DEFAULT 1 NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_session_drafts_v431
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_session_drafts_v431
  ADD CONSTRAINT m26_session_drafts_v431_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_session_drafts_v431
  ADD CONSTRAINT m26_session_drafts_v431_client_revision_check CHECK (client_revision >= 0);

ALTER TABLE public.m26_session_drafts_v431
  ADD CONSTRAINT m26_session_drafts_v431_draft_payload_check CHECK (public.m26_json_safe_v43(draft_payload));

ALTER TABLE public.m26_session_drafts_v431
  ADD CONSTRAINT m26_session_drafts_v431_owner_user_id_client_id_scope_key UNIQUE (owner_user_id, client_id, scope);

ALTER TABLE public.m26_session_drafts_v431
  ADD CONSTRAINT m26_session_drafts_v431_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.m26_session_drafts_v431
  ADD CONSTRAINT m26_session_drafts_v431_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_session_drafts_v431
  ADD CONSTRAINT m26_session_drafts_v431_revision_check CHECK (revision > 0);

ALTER TABLE public.m26_session_drafts_v431
  ADD CONSTRAINT m26_session_drafts_v431_scope_check CHECK (scope = 'session-builder'::text);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.m26_session_drafts_v431 TO authenticated;

GRANT ALL ON public.m26_session_drafts_v431 TO service_role;

CREATE INDEX m26_session_drafts_owner_client_v431 ON public.m26_session_drafts_v431 (owner_user_id, client_id, updated_at DESC);

CREATE TRIGGER m26_session_drafts_audit_v431
  AFTER INSERT OR DELETE OR UPDATE ON public.m26_session_drafts_v431
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_audit_row_v43();

CREATE TRIGGER m26_session_drafts_touch_v431
  BEFORE UPDATE ON public.m26_session_drafts_v431
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_touch_updated_at_v43();

CREATE POLICY m26_session_drafts_delete_v431 ON public.m26_session_drafts_v431
  FOR DELETE
  TO authenticated
  USING (((owner_user_id = auth.uid()) AND ((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id))));

CREATE POLICY m26_session_drafts_insert_v431 ON public.m26_session_drafts_v431
  FOR INSERT
  TO authenticated
  WITH CHECK (((owner_user_id = auth.uid()) AND ((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id))));

CREATE POLICY m26_session_drafts_read_v431 ON public.m26_session_drafts_v431
  FOR SELECT
  TO authenticated
  USING (((owner_user_id = auth.uid()) AND ((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id))));

CREATE POLICY m26_session_drafts_update_v431 ON public.m26_session_drafts_v431
  FOR UPDATE
  TO authenticated
  USING (((owner_user_id = auth.uid()) AND ((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id))))
  WITH CHECK (((owner_user_id = auth.uid()) AND ((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id))));

CREATE TABLE public.m26_telemetry_events_v59 (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  client_id       uuid                     NOT NULL,
  event_id        text                     NOT NULL,
  session_id      text                     NOT NULL,
  execution_id    text                     NOT NULL,
  event_type      text                     NOT NULL,
  source_provider text                     NOT NULL,
  recorded_at     timestamp with time zone NOT NULL,
  received_at     timestamp with time zone NOT NULL,
  canonical_event jsonb                    NOT NULL,
  imported_by     uuid                     NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  expires_at      timestamp with time zone NOT NULL
);

ALTER TABLE public.m26_telemetry_events_v59
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_telemetry_events_v59
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_canonical_event_check CHECK (octet_length(canonical_event::text) <= 12000 AND public.m26_telemetry_json_safe_v59(canonical_event));

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_check
    CHECK
    ((canonical_event ->> 'eventId'::text) = event_id AND (canonical_event ->> 'clientId'::text) = client_id::text AND (canonical_event ->> 'sessionId'::text) = session_id AND
    (canonical_event ->> 'executionId'::text) = execution_id AND (canonical_event ->> 'eventType'::text) = event_type AND (canonical_event #>> '{source,provider}'::text[]) =
    source_provider AND ((canonical_event ->> 'recordedAt'::text)::timestamp with time zone) = recorded_at AND ((canonical_event ->> 'receivedAt'::text)::timestamp
    with time zone) = received_at);

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_client_id_event_id_key UNIQUE (client_id, event_id);

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_event_id_check CHECK (event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'::text);

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_event_type_check CHECK (event_type = 'heart_rate_sample'::text);

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_execution_id_check CHECK (execution_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'::text);

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_imported_by_fkey FOREIGN KEY (imported_by) REFERENCES auth.users(id);

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_session_id_check CHECK (session_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'::text);

ALTER TABLE public.m26_telemetry_events_v59
  ADD CONSTRAINT m26_telemetry_events_v59_source_provider_check CHECK (source_provider = ANY (ARRAY['apple_health'::text, 'wear_os_health_services'::text, 'ble_direct'::text]));

GRANT ALL ON public.m26_telemetry_events_v59 TO service_role;

CREATE INDEX m26_telemetry_execution_recorded_v59 ON public.m26_telemetry_events_v59 (client_id, execution_id, recorded_at, event_id);

CREATE INDEX m26_telemetry_expiry_v59 ON public.m26_telemetry_events_v59 (expires_at);

CREATE INDEX m26_telemetry_client_recorded_v59 ON public.m26_telemetry_events_v59 (client_id, recorded_at DESC, event_id);

CREATE POLICY m26_telemetry_events_insert_v59 ON public.m26_telemetry_events_v59
  FOR INSERT
  TO authenticated
  WITH CHECK (((imported_by = auth.uid()) AND ((client_id = public.iberfit_client_id()) OR public.m26_telemetry_can_access_client_v59(client_id))));

CREATE POLICY m26_telemetry_events_read_v59 ON public.m26_telemetry_events_v59
  FOR SELECT
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.m26_telemetry_can_access_client_v59(client_id)));

CREATE TABLE public.m26_telemetry_import_batches_v59 (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id   uuid                     NOT NULL,
  client_id       uuid                     NOT NULL,
  session_id      text                     NOT NULL,
  execution_id    text                     NOT NULL,
  received_count  integer                  NOT NULL,
  accepted_count  integer                  NOT NULL,
  duplicate_count integer                  NOT NULL,
  rejected_count  integer                  NOT NULL,
  payload_bytes   integer                  NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_telemetry_import_batches_v59
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_telemetry_import_batches_v59
  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.m26_telemetry_import_batches_v59
  ADD CONSTRAINT m26_telemetry_import_batches_v59_accepted_count_check CHECK (accepted_count >= 0 AND accepted_count <= 100);

ALTER TABLE public.m26_telemetry_import_batches_v59
  ADD CONSTRAINT m26_telemetry_import_batches_v59_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

ALTER TABLE public.m26_telemetry_import_batches_v59
  ADD CONSTRAINT m26_telemetry_import_batches_v59_check CHECK ((accepted_count + duplicate_count + rejected_count) = received_count);

ALTER TABLE public.m26_telemetry_import_batches_v59
  ADD CONSTRAINT m26_telemetry_import_batches_v59_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_telemetry_import_batches_v59
  ADD CONSTRAINT m26_telemetry_import_batches_v59_duplicate_count_check CHECK (duplicate_count >= 0 AND duplicate_count <= 100);

ALTER TABLE public.m26_telemetry_import_batches_v59
  ADD CONSTRAINT m26_telemetry_import_batches_v59_payload_bytes_check CHECK (payload_bytes >= 1 AND payload_bytes <= 192000);

ALTER TABLE public.m26_telemetry_import_batches_v59
  ADD CONSTRAINT m26_telemetry_import_batches_v59_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_telemetry_import_batches_v59
  ADD CONSTRAINT m26_telemetry_import_batches_v59_received_count_check CHECK (received_count >= 1 AND received_count <= 100);

ALTER TABLE public.m26_telemetry_import_batches_v59
  ADD CONSTRAINT m26_telemetry_import_batches_v59_rejected_count_check CHECK (rejected_count >= 0 AND rejected_count <= 100);

GRANT ALL ON public.m26_telemetry_import_batches_v59 TO service_role;

CREATE INDEX m26_telemetry_batches_client_created_v59 ON public.m26_telemetry_import_batches_v59 (client_id, created_at DESC);

CREATE TABLE public.m26_training_plans_v43 (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  client_id    uuid                     NOT NULL,
  title        text                     NOT NULL,
  status       text                     DEFAULT 'draft'::text NOT NULL,
  starts_on    date,
  ends_on      date,
  plan_payload jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  revision     bigint                   DEFAULT 1 NOT NULL,
  created_by   uuid                     DEFAULT auth.uid() NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_training_plans_v43
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_training_plans_v43
  ADD CONSTRAINT m26_training_plans_v43_check CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on);

ALTER TABLE public.m26_training_plans_v43
  ADD CONSTRAINT m26_training_plans_v43_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_training_plans_v43
  ADD CONSTRAINT m26_training_plans_v43_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.m26_training_plans_v43
  ADD CONSTRAINT m26_training_plans_v43_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_training_plans_v43
  ADD CONSTRAINT m26_training_plans_v43_plan_payload_check CHECK (public.m26_json_safe_v43(plan_payload));

ALTER TABLE public.m26_training_plans_v43
  ADD CONSTRAINT m26_training_plans_v43_revision_check CHECK (revision > 0);

ALTER TABLE public.m26_training_plans_v43
  ADD CONSTRAINT m26_training_plans_v43_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'completed'::text, 'archived'::text]));

ALTER TABLE public.m26_training_plans_v43
  ADD CONSTRAINT m26_training_plans_v43_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 160);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.m26_training_plans_v43 TO authenticated;

GRANT ALL ON public.m26_training_plans_v43 TO service_role;

CREATE INDEX m26_plans_client_status_v43 ON public.m26_training_plans_v43 (client_id, status);

CREATE TRIGGER m26_plans_audit_v43
  AFTER INSERT OR DELETE OR UPDATE ON public.m26_training_plans_v43
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_audit_row_v43();

CREATE TRIGGER m26_plans_touch_v43
  BEFORE UPDATE ON public.m26_training_plans_v43
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_touch_updated_at_v43();

CREATE POLICY m26_plans_read_v43 ON public.m26_training_plans_v43
  FOR SELECT
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)));

CREATE POLICY m26_plans_write_v43 ON public.m26_training_plans_v43
  TO authenticated
  USING (public.is_assigned_coach(client_id))
  WITH CHECK ((public.is_assigned_coach(client_id) AND (created_by = auth.uid())));

CREATE TABLE public.m26_training_sessions_v43 (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  client_id       uuid                     NOT NULL,
  plan_id         uuid,
  title           text                     NOT NULL,
  status          text                     DEFAULT 'planned'::text NOT NULL,
  scheduled_at    timestamp with time zone,
  started_at      timestamp with time zone,
  completed_at    timestamp with time zone,
  session_payload jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  result_payload  jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  revision        bigint                   DEFAULT 1 NOT NULL,
  created_by      uuid                     DEFAULT auth.uid() NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_training_sessions_v43
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_check CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at);

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.m26_training_plans_v43(id) ON DELETE SET NULL;

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_result_payload_check CHECK (public.m26_json_safe_v43(result_payload));

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_revision_check CHECK (revision > 0);

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_session_payload_check CHECK (public.m26_json_safe_v43(session_payload));

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_status_check CHECK (status = ANY (ARRAY['planned'::text, 'confirmed'::text, 'started'::text, 'completed'::text, 'cancelled'::text]));

ALTER TABLE public.m26_training_sessions_v43
  ADD CONSTRAINT m26_training_sessions_v43_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 160);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.m26_training_sessions_v43 TO authenticated;

GRANT ALL ON public.m26_training_sessions_v43 TO service_role;

CREATE INDEX m26_sessions_client_date_v43 ON public.m26_training_sessions_v43 (client_id, scheduled_at DESC);

CREATE TRIGGER m26_sessions_audit_v43
  AFTER INSERT OR DELETE OR UPDATE ON public.m26_training_sessions_v43
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_audit_row_v43();

CREATE TRIGGER m26_sessions_touch_v43
  BEFORE UPDATE ON public.m26_training_sessions_v43
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_touch_updated_at_v43();

CREATE POLICY m26_sessions_read_v43 ON public.m26_training_sessions_v43
  FOR SELECT
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)));

CREATE POLICY m26_sessions_write_v43 ON public.m26_training_sessions_v43
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)))
  WITH CHECK ((((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)) AND (created_by = auth.uid())));

CREATE TABLE public.m26_wearable_connections_v44 (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  owner_user_id   uuid                     DEFAULT auth.uid() NOT NULL,
  client_id       uuid                     NOT NULL,
  provider        text                     NOT NULL,
  status          text                     DEFAULT 'active'::text NOT NULL,
  sync_enabled    boolean                  DEFAULT true NOT NULL,
  granted_scopes  text[]                   DEFAULT '{}'::text[] NOT NULL,
  consent_version text                     DEFAULT 'v44-zero-cost'::text NOT NULL,
  last_synced_at  timestamp with time zone,
  metadata        jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  revision        bigint                   DEFAULT 1 NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_wearable_connections_v44
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_consent_version_check CHECK (consent_version = 'v44-zero-cost'::text);

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_granted_scopes_check
    CHECK
    (granted_scopes <@ ARRAY['steps'::text, 'activeMinutes'::text, 'sleepMinutes'::text, 'restingHeartRate'::text, 'hrvMs'::text, 'activeEnergyKcal'::text, 'workoutMinutes'::text]);

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_metadata_check CHECK (octet_length(metadata::text) <= 10000 AND NOT public.m26_json_has_forbidden_key_v44(metadata));

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_owner_user_id_client_id_provid_key UNIQUE (owner_user_id, client_id, PROVIDER);

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_provider_check
    CHECK
    (provider = ANY (ARRAY['normalized_file'::text, 'health_connect'::text, 'samsung_health'::text, 'apple_health'::text, 'strava'::text, 'garmin_connect'::text, 'fitbit'::text,
    'oura'::text]));

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_revision_check CHECK (revision > 0);

ALTER TABLE public.m26_wearable_connections_v44
  ADD CONSTRAINT m26_wearable_connections_v44_status_check CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'revoked'::text]));

GRANT DELETE, INSERT, SELECT, UPDATE ON public.m26_wearable_connections_v44 TO authenticated;

GRANT ALL ON public.m26_wearable_connections_v44 TO service_role;

CREATE INDEX m26_wearable_connections_client_v44 ON public.m26_wearable_connections_v44 (client_id, PROVIDER);

CREATE TRIGGER m26_wearable_connections_audit_v44
  AFTER INSERT OR DELETE OR UPDATE ON public.m26_wearable_connections_v44
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_audit_row_v43();

CREATE TRIGGER m26_wearable_connections_touch_v44
  BEFORE UPDATE ON public.m26_wearable_connections_v44
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_touch_updated_at_v43();

CREATE POLICY m26_wearable_connections_delete_v44 ON public.m26_wearable_connections_v44
  FOR DELETE
  TO authenticated
  USING (((owner_user_id = auth.uid()) AND (client_id = public.iberfit_client_id())));

CREATE POLICY m26_wearable_connections_insert_v44 ON public.m26_wearable_connections_v44
  FOR INSERT
  TO authenticated
  WITH CHECK (((owner_user_id = auth.uid()) AND (client_id = public.iberfit_client_id())));

CREATE POLICY m26_wearable_connections_read_v44 ON public.m26_wearable_connections_v44
  FOR SELECT
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)));

CREATE POLICY m26_wearable_connections_update_v44 ON public.m26_wearable_connections_v44
  FOR UPDATE
  TO authenticated
  USING (((owner_user_id = auth.uid()) AND (client_id = public.iberfit_client_id())))
  WITH CHECK (((owner_user_id = auth.uid()) AND (client_id = public.iberfit_client_id())));

CREATE TABLE public.m26_wearable_consents_v44 (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id  uuid                     DEFAULT auth.uid() NOT NULL,
  client_id      uuid                     NOT NULL,
  provider       text                     NOT NULL,
  action         text                     NOT NULL,
  scopes         text[]                   DEFAULT '{}'::text[] NOT NULL,
  policy_version text                     DEFAULT 'v44-zero-cost'::text NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_wearable_consents_v44
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_wearable_consents_v44
  ADD CONSTRAINT m26_wearable_consents_v44_action_check CHECK (action = ANY (ARRAY['grant'::text, 'pause'::text, 'resume'::text, 'revoke'::text, 'delete'::text]));

ALTER TABLE public.m26_wearable_consents_v44
  ADD CONSTRAINT m26_wearable_consents_v44_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.m26_wearable_consents_v44
  ADD CONSTRAINT m26_wearable_consents_v44_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_wearable_consents_v44
  ADD CONSTRAINT m26_wearable_consents_v44_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_wearable_consents_v44
  ADD CONSTRAINT m26_wearable_consents_v44_policy_version_check CHECK (policy_version = 'v44-zero-cost'::text);

ALTER TABLE public.m26_wearable_consents_v44
  ADD CONSTRAINT m26_wearable_consents_v44_provider_check
    CHECK
    (provider = ANY (ARRAY['normalized_file'::text, 'health_connect'::text, 'samsung_health'::text, 'apple_health'::text, 'strava'::text, 'garmin_connect'::text, 'fitbit'::text,
    'oura'::text]));

ALTER TABLE public.m26_wearable_consents_v44
  ADD CONSTRAINT m26_wearable_consents_v44_scopes_check
    CHECK (scopes <@ ARRAY['steps'::text, 'activeMinutes'::text, 'sleepMinutes'::text, 'restingHeartRate'::text, 'hrvMs'::text, 'activeEnergyKcal'::text, 'workoutMinutes'::text]);

GRANT INSERT, SELECT ON public.m26_wearable_consents_v44 TO authenticated;

GRANT ALL ON public.m26_wearable_consents_v44 TO service_role;

CREATE INDEX m26_wearable_consents_client_date_v44 ON public.m26_wearable_consents_v44 (client_id, created_at DESC);

CREATE POLICY m26_wearable_consents_insert_v44 ON public.m26_wearable_consents_v44
  FOR INSERT
  TO authenticated
  WITH CHECK (((actor_user_id = auth.uid()) AND (client_id = public.iberfit_client_id())));

CREATE POLICY m26_wearable_consents_read_v44 ON public.m26_wearable_consents_v44
  FOR SELECT
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)));

CREATE TABLE public.m26_wearable_daily_summaries_v44 (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  client_id           uuid                     NOT NULL,
  provider            text                     NOT NULL,
  record_date         date                     NOT NULL,
  steps               integer,
  active_minutes      integer,
  sleep_minutes       integer,
  resting_heart_rate  numeric(7,2),
  hrv_ms              numeric(8,2),
  active_energy_kcal  numeric(10,2),
  workout_minutes     integer,
  quality             text                     DEFAULT 'limitada'::text NOT NULL,
  source_updated_at   timestamp with time zone NOT NULL,
  source_record_count integer                  DEFAULT 1 NOT NULL,
  imported_by         uuid                     DEFAULT auth.uid() NOT NULL,
  revision            bigint                   DEFAULT 1 NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries__client_id_provider_record_dat_key UNIQUE (client_id, PROVIDER, record_date);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_active_energy_kcal_check
    CHECK (active_energy_kcal IS NULL OR active_energy_kcal >= 0::numeric AND active_energy_kcal <= 20000::numeric);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_active_minutes_check CHECK (active_minutes IS NULL OR active_minutes >= 0 AND active_minutes <= 1440);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_check CHECK (steps IS NOT NULL OR active_minutes IS NOT NULL OR sleep_minutes IS NOT NULL OR resting_heart_rate IS
    NOT NULL OR hrv_ms IS NOT NULL OR active_energy_kcal IS NOT NULL OR workout_minutes IS NOT NULL);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_hrv_ms_check CHECK (hrv_ms IS NULL OR hrv_ms >= 0::numeric AND hrv_ms <= 1000::numeric);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_imported_by_fkey FOREIGN KEY (imported_by) REFERENCES auth.users(id);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_pkey PRIMARY KEY (id);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_provider_check
    CHECK
    (provider = ANY (ARRAY['normalized_file'::text, 'health_connect'::text, 'samsung_health'::text, 'apple_health'::text, 'strava'::text, 'garmin_connect'::text, 'fitbit'::text,
    'oura'::text]));

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_quality_check CHECK (quality = ANY (ARRAY['alta'::text, 'media'::text, 'limitada'::text]));

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_resting_heart_rate_check
    CHECK (resting_heart_rate IS NULL OR resting_heart_rate >= 25::numeric AND resting_heart_rate <= 240::numeric);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_revision_check CHECK (revision > 0);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_sleep_minutes_check CHECK (sleep_minutes IS NULL OR sleep_minutes >= 0 AND sleep_minutes <= 1440);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_source_record_count_check CHECK (source_record_count >= 1 AND source_record_count <= 100000);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_steps_check CHECK (steps IS NULL OR steps >= 0 AND steps <= 200000);

ALTER TABLE public.m26_wearable_daily_summaries_v44
  ADD CONSTRAINT m26_wearable_daily_summaries_v44_workout_minutes_check CHECK (workout_minutes IS NULL OR workout_minutes >= 0 AND workout_minutes <= 1440);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.m26_wearable_daily_summaries_v44 TO authenticated;

GRANT ALL ON public.m26_wearable_daily_summaries_v44 TO service_role;

CREATE INDEX m26_wearable_summaries_client_date_v44 ON public.m26_wearable_daily_summaries_v44 (client_id, record_date DESC);

CREATE TRIGGER m26_wearable_summaries_audit_v44
  AFTER INSERT OR DELETE OR UPDATE ON public.m26_wearable_daily_summaries_v44
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_audit_row_v43();

CREATE TRIGGER m26_wearable_summaries_touch_v44
  BEFORE UPDATE ON public.m26_wearable_daily_summaries_v44
  FOR EACH ROW
  EXECUTE FUNCTION public.m26_touch_updated_at_v43();

CREATE POLICY m26_wearable_summaries_delete_v44 ON public.m26_wearable_daily_summaries_v44
  FOR DELETE
  TO authenticated
  USING ((client_id = public.iberfit_client_id()));

CREATE POLICY m26_wearable_summaries_insert_v44 ON public.m26_wearable_daily_summaries_v44
  FOR INSERT
  TO authenticated
  WITH CHECK (((client_id = public.iberfit_client_id()) AND (imported_by = auth.uid())));

CREATE POLICY m26_wearable_summaries_read_v44 ON public.m26_wearable_daily_summaries_v44
  FOR SELECT
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) OR public.is_assigned_coach(client_id)));

CREATE POLICY m26_wearable_summaries_update_v44 ON public.m26_wearable_daily_summaries_v44
  FOR UPDATE
  TO authenticated
  USING (((client_id = public.iberfit_client_id()) AND (imported_by = auth.uid())))
  WITH CHECK (((client_id = public.iberfit_client_id()) AND (imported_by = auth.uid())));

GRANT DELETE, INSERT, SELECT, UPDATE ON public.operational_events TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.operational_events TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.operational_events TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.outbox_receipts TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.outbox_receipts TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.outbox_receipts TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.plan_change_proposals TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.plan_change_proposals TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.plan_change_proposals TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.preview_access TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.preview_access TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.preview_access TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.preview_sessions TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.preview_sessions TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.preview_sessions TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.privacy_notices_v17 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.privacy_notices_v17 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.privacy_notices_v17 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.release_approvals_v17 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.release_approvals_v17 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.release_approvals_v17 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.release_candidates TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.release_candidates TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.release_candidates TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.reports TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.reports TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.reports TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.retention_policies_v17 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.retention_policies_v17 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.retention_policies_v17 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rls_probe_results TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rls_probe_results TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rls_probe_results TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollback_checkpoints TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollback_checkpoints TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollback_checkpoints TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollback_events_v18 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollback_events_v18 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollback_events_v18 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollout_metrics_v18 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollout_metrics_v18 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollout_metrics_v18 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollout_plans_v18 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollout_plans_v18 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollout_plans_v18 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollout_waves_v18 TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollout_waves_v18 TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.rollout_waves_v18 TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.session_events TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.session_events TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.session_events TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.session_executions TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.session_executions TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.session_executions TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sessions TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sessions TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sessions TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sync_entities TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sync_entities TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sync_entities TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sync_events TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sync_events TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.sync_events TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.training_cycles TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.training_cycles TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.training_cycles TO service_role;

CREATE TABLE public.user_application_roles (
  user_id    uuid                     NOT NULL,
  role       text                     NOT NULL,
  active     boolean                  DEFAULT true NOT NULL,
  granted_at timestamp with time zone DEFAULT now() NOT NULL,
  granted_by uuid
);

ALTER TABLE public.user_application_roles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_application_roles
  ADD CONSTRAINT user_application_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id);

ALTER TABLE public.user_application_roles
  ADD CONSTRAINT user_application_roles_pkey PRIMARY KEY (user_id, ROLE);

ALTER TABLE public.user_application_roles
  ADD CONSTRAINT user_application_roles_role_check CHECK (role = ANY (ARRAY['coach'::text, 'admin'::text, 'client'::text]));

ALTER TABLE public.user_application_roles
  ADD CONSTRAINT user_application_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.user_application_roles TO service_role;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.user_profiles TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.user_profiles TO authenticated;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.user_profiles TO service_role;

-- === EXACT CURRENT REMOTE FUNCTION DEFINITIONS ===
CREATE OR REPLACE FUNCTION "public"."iberfit_admin_bootstrap_v14"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_org uuid:=public.iberfit_admin_require_v14();v_users jsonb;v_roles jsonb;v_coaches jsonb;v_assign jsonb;v_leads jsonb;v_life jsonb;v_tasks jsonb;v_templates jsonb;v_rules jsonb;v_deliveries jsonb;v_audit jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'userId',u.id,'email',u.email,'name',coalesce(u.raw_user_meta_data->>'name',u.email),'status',m.status,'primaryRole',lower(coalesce(p.role::text,'')),'roles',coalesce((select jsonb_agg(role) from public.user_application_roles ar where ar.user_id=u.id and ar.active=true),'[]'::jsonb),'lastAccessAt',u.last_sign_in_at,'createdAt',u.created_at,'updatedAt',m.updated_at,'revision',m.revision)),'[]'::jsonb) into v_users from public.iberfit_organization_memberships m join auth.users u on u.id=m.user_id left join public.user_profiles p on p.user_id=u.id where m.organization_id=v_org;
  select coalesce(jsonb_agg(jsonb_build_object('id',concat(user_id,':',role),'userId',user_id,'role',role,'active',active,'grantedAt',granted_at,'grantedBy',granted_by,'revision',1)),'[]'::jsonb) into v_roles from public.user_application_roles;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'userId',u.id,'email',u.email,'name',coalesce(u.raw_user_meta_data->>'name',u.email),'status',m.status,'clientCount',(select count(*) from public.iberfit_coach_client_assignments a where a.coach_user_id=u.id and a.status='active'),'revision',m.revision)),'[]'::jsonb) into v_coaches from public.iberfit_organization_memberships m join auth.users u on u.id=m.user_id where m.organization_id=v_org and exists(select 1 from public.user_application_roles ar where ar.user_id=u.id and ar.role in('coach','admin') and ar.active=true);
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) into v_assign from public.iberfit_coach_client_assignments a where a.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc),'[]'::jsonb) into v_leads from public.iberfit_leads l where l.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.effective_at desc),'[]'::jsonb) into v_life from(select distinct on(client_id)* from public.iberfit_client_lifecycle_events where organization_id=v_org order by client_id,effective_at desc)x;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into v_tasks from(select * from public.iberfit_operational_tasks where organization_id=v_org order by created_at desc limit 1000)t;
  select coalesce(jsonb_agg(to_jsonb(t) order by key),'[]'::jsonb) into v_templates from public.iberfit_notification_templates t where t.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(r) order by key),'[]'::jsonb) into v_rules from public.iberfit_automation_rules r where r.organization_id=v_org;
  select coalesce(jsonb_agg(to_jsonb(d) order by created_at desc),'[]'::jsonb) into v_deliveries from(select * from public.iberfit_notification_deliveries where organization_id=v_org order by created_at desc limit 250)d;
  select coalesce(jsonb_agg(to_jsonb(a) order by occurred_at desc),'[]'::jsonb) into v_audit from(select * from public.iberfit_admin_audit_events where organization_id=v_org order by occurred_at desc limit 500)a;
  return jsonb_build_object('ok',true,'organization',(select jsonb_build_object('id',id,'slug',slug,'name',name,'status',status,'timezone',timezone,'locale',locale,'settings',settings,'revision',revision) from public.iberfit_organizations where id=v_org),'permissions',jsonb_build_array('organization.read','organization.settings.manage','user.read_summary','user.manage_status','role.read','role.manage','assignment.read','assignment.manage','client.lifecycle.read','client.lifecycle.manage','appointment.manage_global','operation.read_global','operation.manage_global','message.read','message.manage_templates','automation.read','automation.manage','analytics.read','audit.read'),'permissionRevision',1,'data',jsonb_build_object('organizationUsers',v_users,'applicationRoles',v_roles,'coachProfiles',v_coaches,'coachClientAssignments',v_assign,'leads',v_leads,'clientLifecycle',v_life,'operationalTasks',v_tasks,'notificationTemplates',v_templates,'notificationDeliveries',v_deliveries,'automationRules',v_rules,'auditEvents',v_audit),'analytics',jsonb_build_object('activeClients',(select count(*) from(select distinct on(client_id)client_id,status from public.iberfit_client_lifecycle_events where organization_id=v_org order by client_id,effective_at desc)x where status='active'),'averageAdherence',null,'churn30d',null,'conversionRate',null),'revision',1,'serverTime',now());
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_admin_execute_v14"("p_command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_org uuid:=public.iberfit_admin_require_v14();v_actor uuid:=auth.uid();v_op text:=btrim(coalesce(p_command->>'operationId',''));v_type text:=upper(btrim(coalesce(p_command->>'type','')));v_entity text:=btrim(coalesce(p_command->>'entityId',''));v_reason text:=btrim(coalesce(p_command->>'reason',''));v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);v_base integer:=coalesce((p_command->>'baseRevision')::integer,0);v_result jsonb;v_existing jsonb;v_id uuid;v_revision integer:=1;v_user uuid;v_role text;v_status text;
begin
  if v_op='' then raise exception using errcode='22023',message='V14_OPERATION_ID_INVALID'; end if;
  select result into v_existing from public.iberfit_admin_mutation_receipts where operation_id=v_op and actor_user_id=v_actor and command_type=v_type;if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate');end if;
  if exists(select 1 from public.iberfit_admin_mutation_receipts where operation_id=v_op)then raise exception using errcode='23505',message='V14_OPERATION_COLLISION';end if;
  if v_type in('ADMIN_USUARIO_CAMBIAR_ESTADO','ADMIN_ROL_OTORGAR','ADMIN_ROL_REVOCAR','ADMIN_ASIGNACION_CREAR','ADMIN_ASIGNACION_FINALIZAR','ADMIN_LEAD_ACTUALIZAR','ADMIN_CLIENTE_CAMBIAR_CICLO','ADMIN_TAREA_RESOLVER','ADMIN_ORGANIZACION_ACTUALIZAR')and char_length(v_reason)<3 then raise exception using errcode='22023',message='V14_REASON_REQUIRED';end if;
  case v_type
    when 'ADMIN_USUARIO_CAMBIAR_ESTADO' then v_user:=(v_payload->>'userId')::uuid;v_status:=lower(v_payload->>'status');if v_user=v_actor and v_status<>'active' then raise exception using errcode='42501',message='V14_SELF_SUSPENSION_FORBIDDEN';end if;update public.iberfit_organization_memberships set status=v_status,revision=revision+1,updated_at=now()where organization_id=v_org and user_id=v_user and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_user::text;
    when 'ADMIN_ROL_OTORGAR' then v_user:=(v_payload->>'userId')::uuid;v_role:=lower(v_payload->>'role');if v_role not in('client','coach','admin')then raise exception using errcode='22023',message='V14_ROLE_INVALID';end if;insert into public.user_application_roles(user_id,role,active,granted_by)values(v_user,v_role,true,v_actor)on conflict(user_id,role)do update set active=true,granted_at=now(),granted_by=v_actor;v_entity:=concat(v_user,':',v_role);
    when 'ADMIN_ROL_REVOCAR' then v_user:=(v_payload->>'userId')::uuid;v_role:=lower(v_payload->>'role');if v_user=v_actor and v_role='admin' then raise exception using errcode='42501',message='V14_SELF_ADMIN_REVOCATION_FORBIDDEN';end if;if v_role='admin' and(select count(*)from public.user_application_roles where role='admin'and active=true)<=1 then raise exception using errcode='42501',message='V14_LAST_ADMIN_PROTECTED';end if;update public.user_application_roles set active=false,granted_at=now(),granted_by=v_actor where user_id=v_user and role=v_role and active=true;if not found then raise exception using errcode='P0002',message='V14_ROLE_NOT_FOUND';end if;v_entity:=concat(v_user,':',v_role);
    when 'ADMIN_ASIGNACION_CREAR' then insert into public.iberfit_coach_client_assignments(organization_id,coach_user_id,client_id,starts_at,reason,created_by)values(v_org,(v_payload->>'coachUserId')::uuid,btrim(v_payload->>'clientId'),(v_payload->>'startsAt')::date,v_reason,v_actor)returning id into v_id;insert into public.iberfit_conversation_threads(organization_id,client_id,coach_user_id,created_by)values(v_org,btrim(v_payload->>'clientId'),(v_payload->>'coachUserId')::uuid,v_actor)on conflict(organization_id,coach_user_id,client_id)do update set status='active',updated_at=now(),revision=public.iberfit_conversation_threads.revision+1;v_entity:=v_id::text;
    when 'ADMIN_ASIGNACION_FINALIZAR' then v_id:=(v_payload->>'assignmentId')::uuid;update public.iberfit_coach_client_assignments set status='ended',ends_at=current_date,ended_by=v_actor,reason=v_reason,revision=revision+1,updated_at=now()where id=v_id and organization_id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_id::text;
    when 'ADMIN_LEAD_CREAR' then insert into public.iberfit_leads(organization_id,name,email,phone,source,objective,created_by,updated_by)values(v_org,btrim(v_payload->>'name'),nullif(lower(btrim(v_payload->>'email')),''),nullif(btrim(v_payload->>'phone'),''),nullif(btrim(v_payload->>'source'),''),nullif(btrim(v_payload->>'objective'),''),v_actor,v_actor)returning id into v_id;v_entity:=v_id::text;
    when 'ADMIN_LEAD_ACTUALIZAR' then v_id:=(v_payload->>'leadId')::uuid;update public.iberfit_leads set status=lower(v_payload->>'status'),next_action_at=nullif(v_payload->>'nextActionAt','')::timestamptz,updated_by=v_actor,revision=revision+1,updated_at=now()where id=v_id and organization_id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_id::text;
    when 'ADMIN_CLIENTE_CAMBIAR_CICLO' then insert into public.iberfit_client_lifecycle_events(organization_id,client_id,status,reason,changed_by)values(v_org,btrim(v_payload->>'clientId'),lower(v_payload->>'status'),v_reason,v_actor)returning id into v_id;v_entity:=btrim(v_payload->>'clientId');
    when 'ADMIN_TAREA_CREAR' then insert into public.iberfit_operational_tasks(organization_id,type,priority,title,detail,created_by)values(v_org,btrim(coalesce(v_payload->>'taskType','manual_review')),lower(coalesce(v_payload->>'priority','normal')),btrim(v_payload->>'title'),nullif(btrim(v_payload->>'detail'),''),v_actor)returning id into v_id;v_entity:=v_id::text;
    when 'ADMIN_TAREA_RESOLVER' then v_id:=(v_payload->>'taskId')::uuid;update public.iberfit_operational_tasks set status='resolved',resolved_by=v_actor,resolved_at=now(),resolution_note=v_reason,revision=revision+1,updated_at=now()where id=v_id and organization_id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_id::text;
    when 'ADMIN_PLANTILLA_GUARDAR' then insert into public.iberfit_notification_templates(organization_id,key,name,channel,subject,body,created_by,updated_by)values(v_org,lower(v_payload->>'key'),btrim(v_payload->>'name'),lower(v_payload->>'channel'),nullif(btrim(v_payload->>'subject'),''),btrim(v_payload->>'body'),v_actor,v_actor)on conflict(organization_id,key)do update set name=excluded.name,channel=excluded.channel,subject=excluded.subject,body=excluded.body,revision=public.iberfit_notification_templates.revision+1,updated_at=now(),updated_by=v_actor;v_entity:=lower(v_payload->>'key');
    when 'ADMIN_AUTOMATIZACION_GUARDAR' then insert into public.iberfit_automation_rules(organization_id,key,name,trigger_type,action_type,status,configuration,created_by,updated_by)values(v_org,lower(v_payload->>'key'),btrim(v_payload->>'name'),lower(v_payload->>'triggerType'),lower(v_payload->>'actionType'),lower(v_payload->>'status'),coalesce(v_payload->'configuration','{}'::jsonb),v_actor,v_actor)on conflict(organization_id,key)do update set name=excluded.name,trigger_type=excluded.trigger_type,action_type=excluded.action_type,status=excluded.status,configuration=excluded.configuration,revision=public.iberfit_automation_rules.revision+1,updated_at=now(),updated_by=v_actor;v_entity:=lower(v_payload->>'key');
    when 'ADMIN_ORGANIZACION_ACTUALIZAR' then update public.iberfit_organizations set name=btrim(v_payload->>'name'),timezone=btrim(v_payload->>'timezone'),locale=btrim(v_payload->>'locale'),revision=revision+1,updated_at=now()where id=v_org and revision=v_base returning revision into v_revision;if not found then raise exception using errcode='40001',message='V14_REVISION_CONFLICT';end if;v_entity:=v_org::text;
    else raise exception using errcode='22023',message='V14_COMMAND_INVALID';
  end case;
  insert into public.iberfit_admin_audit_events(organization_id,event_type,actor_user_id,actor_application,entity_type,entity_id,summary,trace_id,revision)values(v_org,v_type,v_actor,'admin','admin_mutation',v_entity,concat(v_type,' confirmado por backend.'),v_op,v_revision)returning id into v_id;
  v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'commandType',v_type,'entityId',v_entity,'revision',v_revision,'auditId',v_id,'serverTime',now());
  insert into public.iberfit_admin_mutation_receipts(operation_id,organization_id,actor_user_id,command_type,result)values(v_op,v_org,v_actor,v_type,v_result);return v_result;
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_admin_require_v14"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_context jsonb;v_user uuid:=auth.uid();begin
  select public.iberfit_application_context_v14() into v_context;
  if coalesce(v_context->>'membershipStatus','')<>'active' then raise exception using errcode='42501',message='V14_ORGANIZATION_ACCESS_SUSPENDED'; end if;
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then raise exception using errcode='42501',message='V14_ADMIN_REQUIRED'; end if;
  return(v_context->>'organizationId')::uuid;
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_application_context_v14"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_user uuid:=auth.uid();v_primary text;v_org uuid:='00000000-0000-4000-8000-000000000140';v_status text;v_roles jsonb;v_clients jsonb;v_enforced boolean;
begin
  if v_user is null then raise exception using errcode='28000',message='V14_AUTH_REQUIRED'; end if;
  select status into v_status
  from public.iberfit_organization_memberships
  where organization_id=v_org and user_id=v_user;

  if v_status is null then
    raise exception using
      errcode='42501',
      message='V14_ORGANIZATION_MEMBERSHIP_REQUIRED';
  end if;

  if v_status<>'active' then
    raise exception using
      errcode='42501',
      message='V14_ORGANIZATION_ACCESS_SUSPENDED';
  end if;
  select lower(role::text) into v_primary from public.user_profiles where user_id=v_user;
  select coalesce(jsonb_agg(x.role order by case x.role when 'coach' then 1 when 'admin' then 2 else 3 end),'[]'::jsonb) into v_roles from(
    select case v_primary when 'entrenador' then 'coach' when 'administrador' then 'admin' when 'cliente' then 'client' else v_primary end role where v_primary is not null
    union select role from public.user_application_roles where user_id=v_user and active=true
  )x where x.role in('client','coach','admin');
  select exists(select 1 from public.iberfit_coach_client_assignments where organization_id=v_org and coach_user_id=v_user) into v_enforced;
  select coalesce(jsonb_agg(client_id order by client_id),'[]'::jsonb) into v_clients from public.iberfit_coach_client_assignments where organization_id=v_org and coach_user_id=v_user and status='active' and starts_at<=current_date and(ends_at is null or ends_at>=current_date);
  return jsonb_build_object('ok',true,'organizationId',v_org,'membershipStatus',v_status,'roles',v_roles,'assignmentScopeEnforced',coalesce(v_enforced,false),'assignedClientIds',v_clients,'revision',1,'serverTime',now());
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_appointment_change_requests_v13"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_own_client text;
  v_requests jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  v_own_client:=coalesce(
    v_snapshot#>>'{user,clientId}',
    v_snapshot#>>'{user,client_id}',
    ''
  );

  if v_role in ('client','cliente') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'appointmentId',r.appointment_id,
      'clientId',r.client_id,
      'reason',r.reason,
      'status',r.status,
      'createdAt',r.created_at,
      'resolvedAt',r.resolved_at,
      'resolutionNote',r.resolution_note
    ) order by r.created_at desc),'[]'::jsonb)
    into v_requests
    from public.appointment_change_requests r
    where r.requester_user_id=v_user
      and r.client_id=v_own_client;
  elsif v_role in ('coach','entrenador','admin','administrador') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'appointmentId',r.appointment_id,
      'clientId',r.client_id,
      'reason',r.reason,
      'status',r.status,
      'createdAt',r.created_at,
      'resolvedAt',r.resolved_at,
      'resolutionNote',r.resolution_note
    ) order by r.created_at desc),'[]'::jsonb)
    into v_requests
    from public.appointment_change_requests r
    where exists(
      select 1
      from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb)) a
      where coalesce(a->>'id',a->>'entityId',a->>'entity_id','')=r.appointment_id
        and coalesce(a->>'clientId',a->>'client_id','')=r.client_id
    );
  else
    raise exception using errcode='42501',message='V13_ROLE_FORBIDDEN';
  end if;

  return jsonb_build_object('ok',true,'requests',v_requests);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_authorized_application_roles_v13"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user uuid:=auth.uid();
  v_primary text;
  v_roles jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;

  select lower(up.role::text)
    into v_primary
    from public.user_profiles up
   where up.user_id=v_user;

  select coalesce(
    jsonb_agg(r.role order by case r.role when 'coach' then 1 when 'admin' then 2 else 3 end),
    '[]'::jsonb
  )
  into v_roles
  from (
    select v_primary as role
    where v_primary in ('coach','admin','client')
    union
    select uar.role
    from public.user_application_roles uar
    where uar.user_id=v_user and uar.active=true
  ) r;

  return jsonb_build_object(
    'ok',true,
    'roles',v_roles,
    'primaryRole',v_primary
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_base_entity_v26"("p_entity_type" "text", "p_entity_id" "uuid", "p_client_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_result jsonb;
begin
  if p_entity_type = 'checkin' then
    select to_jsonb(c) || jsonb_build_object(
      'id', c.id, 'clientId', c.client_id, 'recordedAt', c.recorded_at,
      'createdBy', c.created_by, 'createdAt', c.created_at, 'updatedAt', c.updated_at
    ) into v_result
    from public.client_checkins_v26 c
    where c.id = p_entity_id and c.client_id = p_client_id;
  elsif p_entity_type = 'habit' then
    select to_jsonb(h) || jsonb_build_object(
      'id', h.id, 'clientId', h.client_id, 'createdBy', h.created_by,
      'createdAt', h.created_at, 'updatedAt', h.updated_at
    ) into v_result
    from public.client_habits_v26 h
    where h.id = p_entity_id and h.client_id = p_client_id;
  elsif p_entity_type = 'habit_log' then
    select to_jsonb(l) || jsonb_build_object(
      'id', l.id, 'clientId', l.client_id, 'habitId', l.habit_id,
      'recordedAt', l.recorded_at, 'createdBy', l.created_by,
      'createdAt', l.created_at, 'updatedAt', l.updated_at
    ) into v_result
    from public.client_habit_logs_v26 l
    where l.id = p_entity_id and l.client_id = p_client_id;
  elsif p_entity_type = 'private_note' then
    select to_jsonb(n) || jsonb_build_object(
      'id', n.id, 'clientId', n.client_id, 'createdBy', n.created_by,
      'createdAt', n.created_at, 'updatedAt', n.updated_at,
      'visibility', 'coach_only'
    ) into v_result
    from public.coach_private_notes_v26 n
    where n.id = p_entity_id and n.client_id = p_client_id;
  else
    return public.iberfit_base_entity_v26_rc29(p_entity_type, p_entity_id, p_client_id);
  end if;

  if v_result is null then
    v_result := jsonb_build_object(
      'id', p_entity_id,
      'clientId', p_client_id,
      'status', 'borrador',
      'revision', 0,
      'createdAt', now(),
      'updatedAt', now()
    );
  end if;

  return v_result;
end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_base_entity_v26_rc29"("p_entity_type" "text", "p_entity_id" "uuid", "p_client_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_result jsonb;
begin
  if p_entity_type='report' then
    select to_jsonb(r) || jsonb_build_object(
      'id',r.id,'clientId',r.client_id,'status',r.status::text,'revision',r.revision,
      'publishedAt',r.published_at,'approvedAt',r.approved_at
    ) into v_result from public.reports r where r.id=p_entity_id and r.client_id=p_client_id;
  elsif p_entity_type='iri' then
    select to_jsonb(i) || jsonb_build_object(
      'id',i.id,'clientId',i.client_id,
      'status',case i.status::text when 'revisión' then 'completo' when 'retirado' then 'sustituido' else i.status::text end,
      'revision',i.revision,'approvedAt',i.approved_at,'publishedAt',i.published_at
    ) into v_result from public.iri_assessments i where i.id=p_entity_id and i.client_id=p_client_id;
  elsif p_entity_type='planning' then
    select to_jsonb(t) || jsonb_build_object(
      'id',t.id,'clientId',t.client_id,'title',t.title,'objective',t.goal,
      'durationWeeks',t.weeks,
      'status',case t.status::text when 'revisión' then 'validado' when 'retirado' then 'archivado' else t.status::text end,
      'revision',t.revision,'publishedAt',t.published_at,
      'sessions',coalesce((
        select jsonb_agg(to_jsonb(s) || jsonb_build_object(
          'id',s.id,'clientId',s.client_id,'cycleId',s.cycle_id,'type',s.execution_type,
          'status',case s.status::text when 'aprobado' then 'aprobada' when 'publicado' then 'publicada' when 'retirado' then 'cancelada' else s.status::text end,
          'revision',s.revision,'blocks',coalesce(s.prescription->'blocks','[]'::jsonb)
        ) order by s.created_at)
        from public.sessions s where s.cycle_id=t.id and s.client_id=t.client_id
      ),'[]'::jsonb)
    ) into v_result from public.training_cycles t where t.id=p_entity_id and t.client_id=p_client_id;
  elsif p_entity_type='session' then
    select to_jsonb(s) || jsonb_build_object(
      'id',s.id,'clientId',s.client_id,'cycleId',s.cycle_id,'type',s.execution_type,
      'status',case s.status::text when 'aprobado' then 'aprobada' when 'publicado' then 'publicada' when 'retirado' then 'cancelada' else s.status::text end,
      'revision',s.revision,'publishedAt',s.published_at,
      'blocks',coalesce(s.prescription->'blocks','[]'::jsonb)
    ) into v_result from public.sessions s where s.id=p_entity_id and s.client_id=p_client_id;
  elsif p_entity_type='session_execution' then
    select coalesce(e.summary,'{}'::jsonb) || jsonb_build_object(
      'id',e.id,'clientId',e.client_id,'sessionId',e.session_id,
      'status',case e.execution_status
        when 'activa' then 'en_curso' when 'pausada' then 'pausada'
        when 'cerrada_confirmada' then 'completada' else 'cancelada' end,
      'revision',e.revision,'updatedAt',e.updated_at
    ) into v_result from public.session_executions e where e.id=p_entity_id and e.client_id=p_client_id;
  elsif p_entity_type='intelligence' then
    select to_jsonb(i) || jsonb_build_object(
      'id',i.id,'clientId',i.client_id,
      'status',case i.status when 'aprobada' then 'aprobada' when 'descartada' then 'descartada' else 'propuesta' end,
      'revision',i.revision,'proposal',i.recommendation
    ) into v_result from public.intelligence_runs i where i.id=p_entity_id and i.client_id=p_client_id;
  elsif p_entity_type='appointment' then
    select to_jsonb(a) || jsonb_build_object(
      'id',a.id,'clientId',a.client_id,'sessionId',a.session_id,'type',a.appointment_type,
      'startAt',a.start_at,'endAt',a.end_at,'timeZone',a.time_zone,'revision',a.revision
    ) into v_result from public.appointments a where a.id=p_entity_id and a.client_id=p_client_id;
  elsif p_entity_type='client_access' then
    select to_jsonb(a) || jsonb_build_object(
      'id',a.id,'clientId',a.client_id,'authUserId',a.auth_user_id,
      'invitationAttemptCount',a.invitation_attempt_count,'invitationSentAt',a.invitation_sent_at,
      'activatedAt',a.activated_at,'closedAt',a.closed_at,'closeReason',a.close_reason
    ) into v_result
    from public.client_access_v26 a
    where a.client_id=p_client_id and (a.id=p_entity_id or p_entity_id=p_client_id);
  end if;
  return v_result;
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_bootstrap_v26"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_result jsonb;
  v_data jsonb;
  v_role text;
  v_revisions jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_role:=public.iberfit_current_role_v26();
  v_result:=public.iberfit_bootstrap_v26_rc29();
  v_data:=coalesce(v_result->'data','{}'::jsonb);

  -- Perfil único: conserva profile anidado y lo proyecta también en primer nivel.
  v_data:=jsonb_set(v_data,'{clientProfiles}',coalesce((
    select jsonb_agg(
      item || coalesce(item->'profile','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'profile',coalesce(item->'profile','{}'::jsonb)
      )
    )
    from jsonb_array_elements(coalesce(v_data->'clientProfiles','[]'::jsonb)) item
  ),'[]'::jsonb),true);

  -- IRI tipado: sections es el cuerpo clínico-operativo; se proyecta sin duplicar la fuente.
  v_data:=jsonb_set(v_data,'{iriAssessments}',coalesce((
    select jsonb_agg(
      item || coalesce(item->'sections','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'assessmentDate',coalesce(item->>'evaluated_at',item#>>'{sections,assessmentDate}'),
        'body',coalesce(item->'sections','{}'::jsonb)||jsonb_build_object(
          'id',item->'id',
          'clientId',coalesce(item->>'client_id',item->>'clientId'),
          'status',case item->>'status' when 'revisión' then 'completo' when 'retirado' then 'sustituido' else item->>'status' end,
          'revision',coalesce((item->>'revision')::bigint,0)
        )
      )
    )
    from jsonb_array_elements(coalesce(v_data->'iriAssessments','[]'::jsonb)) item
  ),'[]'::jsonb),true);

  v_data:=jsonb_set(v_data,'{checkins}',coalesce((
    select jsonb_agg(to_jsonb(c) order by c.recorded_at desc)
    from public.client_checkins_v26 c
    join public.m26_canary_clients_v26 q on q.client_id=c.client_id and q.active
    where public.iberfit_can_access_client_v26(c.client_id)
  ),'[]'::jsonb),true);
  v_data:=jsonb_set(v_data,'{habits}',coalesce((
    select jsonb_agg(to_jsonb(h) order by h.updated_at desc)
    from public.client_habits_v26 h
    join public.m26_canary_clients_v26 q on q.client_id=h.client_id and q.active
    where public.iberfit_can_access_client_v26(h.client_id)
  ),'[]'::jsonb),true);
  v_data:=jsonb_set(v_data,'{habitLogs}',coalesce((
    select jsonb_agg(to_jsonb(l) order by l.recorded_at desc)
    from public.client_habit_logs_v26 l
    join public.m26_canary_clients_v26 q on q.client_id=l.client_id and q.active
    where public.iberfit_can_access_client_v26(l.client_id)
  ),'[]'::jsonb),true);

  if v_role=any(array['admin','coach']) then
    v_data:=jsonb_set(v_data,'{privateNotes}',coalesce((
      select jsonb_agg(to_jsonb(n) order by n.updated_at desc)
      from public.coach_private_notes_v26 n
      join public.m26_canary_clients_v26 q on q.client_id=n.client_id and q.active
      where public.iberfit_can_access_client_v26(n.client_id)
    ),'[]'::jsonb),true);
  else
    v_data:=jsonb_set(v_data,'{privateNotes}','[]'::jsonb,true);
    v_data:=jsonb_set(v_data,'{intelligenceRuns}','[]'::jsonb,true);
    v_data:=jsonb_set(v_data,'{m26Entities}',coalesce((
      select jsonb_agg(item) from jsonb_array_elements(coalesce(v_data->'m26Entities','[]'::jsonb)) item
      where item->>'entityType' not in ('private_note','intelligence')
    ),'[]'::jsonb),true);
    v_data:=jsonb_set(v_data,'{domainEvents}',coalesce((
      select jsonb_agg(item) from jsonb_array_elements(coalesce(v_data->'domainEvents','[]'::jsonb)) item
      where item->>'entity_type' not in ('private_note','intelligence')
    ),'[]'::jsonb),true);
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_revisions
    from jsonb_each(coalesce(v_result->'remoteRevisions','{}'::jsonb))
    where key not like 'private_note:%' and key not like 'intelligence:%';
    v_result:=jsonb_set(v_result,'{remoteRevisions}',v_revisions,true);
  end if;

  v_result:=jsonb_set(v_result,'{data}',v_data,true);
  v_result:=jsonb_set(v_result,'{canary,version}','"M26-RC36-V12.3"'::jsonb,true);
  return v_result;
end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_bootstrap_v26_rc29"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_role text; v_has_canary boolean; v_data jsonb; v_revisions jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  v_role:=public.iberfit_current_role_v26();
  select exists(
    select 1 from public.m26_canary_clients_v26 c
    where c.active=true and public.iberfit_can_access_client_v26(c.client_id)
  ) into v_has_canary;
  if not v_has_canary then raise exception 'M26_CANARY_NOT_ENABLED' using errcode='42501'; end if;

  select jsonb_build_object(
    'clients',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.clients c
      join public.m26_canary_clients_v26 q on q.client_id=c.id and q.active=true
      where public.iberfit_can_access_client_v26(c.id)),'[]'::jsonb),
    'userProfiles',coalesce((select jsonb_agg(to_jsonb(u)) from public.user_profiles u
      where u.client_id in (select q.client_id from public.m26_canary_clients_v26 q where q.active=true and public.iberfit_can_access_client_v26(q.client_id))
         or u.user_id=auth.uid()),'[]'::jsonb),
    'clientProfiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.client_app_profiles p
      join public.m26_canary_clients_v26 q on q.client_id=p.client_id and q.active=true
      where public.iberfit_can_access_client_v26(p.client_id)),'[]'::jsonb),
    'clientAccess',coalesce((select jsonb_agg(to_jsonb(a)) from public.client_access_v26 a
      join public.m26_canary_clients_v26 q on q.client_id=a.client_id and q.active=true
      where public.iberfit_can_access_client_v26(a.client_id)),'[]'::jsonb),
    'iriAssessments',coalesce((select jsonb_agg(to_jsonb(i)) from public.iri_assessments i
      join public.m26_canary_clients_v26 q on q.client_id=i.client_id and q.active=true
      where public.iberfit_can_access_client_v26(i.client_id)),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r
      join public.m26_canary_clients_v26 q on q.client_id=r.client_id and q.active=true
      where public.iberfit_can_access_client_v26(r.client_id)),'[]'::jsonb),
    'trainingCycles',coalesce((select jsonb_agg(to_jsonb(t)) from public.training_cycles t
      join public.m26_canary_clients_v26 q on q.client_id=t.client_id and q.active=true
      where public.iberfit_can_access_client_v26(t.client_id)),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from public.sessions s
      join public.m26_canary_clients_v26 q on q.client_id=s.client_id and q.active=true
      where public.iberfit_can_access_client_v26(s.client_id)),'[]'::jsonb),
    'appointments',coalesce((select jsonb_agg(to_jsonb(a)) from public.appointments a
      join public.m26_canary_clients_v26 q on q.client_id=a.client_id and q.active=true
      where public.iberfit_can_access_client_v26(a.client_id)),'[]'::jsonb),
    'sessionExecutions',coalesce((select jsonb_agg(to_jsonb(e)) from public.session_executions e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'intelligenceRuns',coalesce((select jsonb_agg(to_jsonb(i)) from public.intelligence_runs i
      join public.m26_canary_clients_v26 q on q.client_id=i.client_id and q.active=true
      where public.iberfit_can_access_client_v26(i.client_id)),'[]'::jsonb),
    'timelineEvents',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc) from public.client_timeline_events e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'domainEvents',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.domain_events_v26 e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'coachAvailability',coalesce((select jsonb_agg(to_jsonb(a)) from public.coach_availability_v26 a
      where a.active=true and (a.coach_user_id=auth.uid() or v_role='admin')),'[]'::jsonb),
    'm26Entities',coalesce((select jsonb_agg(jsonb_build_object(
      'entityType',e.entity_type,'entityId',e.entity_id,'clientId',e.client_id,'status',e.status,
      'revision',e.revision,'body',e.body,'updatedAt',e.updated_at
    )) from public.domain_entities_v26 e
      join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
      where public.iberfit_can_access_client_v26(e.client_id)),'[]'::jsonb),
    'metrics',jsonb_build_object('checkin',null,'progress',null,'iri',null)
  ) into v_data;

  select coalesce(jsonb_object_agg(entity_type||':'||entity_id::text,revision),'{}'::jsonb)
  into v_revisions from public.domain_entities_v26 e
  join public.m26_canary_clients_v26 q on q.client_id=e.client_id and q.active=true
  where public.iberfit_can_access_client_v26(e.client_id);

  return jsonb_build_object(
    'environment',coalesce((select value #>> '{}' from public.iberfit_system_settings where key='environment'),'UNSET'),
    'serverTime',now(),
    'canary',jsonb_build_object('version','M26-GATE15-FREE-RC1','active',true,'scope','allowlist'),
    'user',jsonb_build_object('id',auth.uid(),'role',v_role,'clientId',public.iberfit_client_id(),
      'name',(select display_name from public.user_profiles where user_id=auth.uid())),
    'remoteRevisions',v_revisions,
    'data',v_data
  );
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_can_access_client_v26"("p_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case
    when auth.uid() is null then false
    when public.iberfit_current_role_v26()='admin' then true
    when public.iberfit_current_role_v26()='coach' then public.is_assigned_coach(p_client_id)
    when public.iberfit_current_role_v26()='cliente' then public.iberfit_client_id()=p_client_id
    else false
  end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_can_manage_iri_external_report_v12"("p_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case
    when auth.uid() is null or p_client_id is null then false
    when exists(select 1 from public.user_profiles u where u.user_id=auth.uid() and lower(u.role::text)='admin') then true
    when exists(select 1 from public.user_profiles u where u.user_id=auth.uid() and lower(u.role::text)='coach')
      and public.is_assigned_coach(p_client_id) then true
    else false
  end;
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_can_read_iri_external_report_v12"("p_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(p_client_id=public.iberfit_client_id(),false)
      or public.iberfit_can_manage_iri_external_report_v12(p_client_id);
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_canary_enabled_v26"("p_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists(
    select 1 from public.m26_canary_clients_v26 c
    where c.client_id=p_client_id and c.active=true
  )
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_client_onboarding_preflight_v12"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid:=auth.uid();
  v_role text;
  v_environment text;
  v_real_data_allowed boolean;
  v_production_blocked boolean;
  v_ready boolean;
begin
  if v_actor is null then
    raise exception using errcode='28000',message='V12_AUTH_REQUIRED';
  end if;
  select lower(up.role::text) into v_role
  from public.user_profiles up where up.user_id=v_actor;
  if v_role not in ('admin','coach') then
    raise exception using errcode='42501',message='V12_COACH_ROLE_REQUIRED';
  end if;
  select s.value #>> '{}' into v_environment
  from public.iberfit_system_settings s where s.key='environment';
  select coalesce((s.value #>> '{}')::boolean,false) into v_real_data_allowed
  from public.iberfit_system_settings s where s.key='real_data_allowed';
  select coalesce((s.value #>> '{}')::boolean,true) into v_production_blocked
  from public.iberfit_system_settings s where s.key='production_blocked';

  v_ready:=
    exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='client_app_profiles' and column_name='profile' and udt_name='jsonb')
    and to_regclass('public.iri_assessments') is not null
    and to_regclass('public.domain_entities_v26') is not null
    and to_regprocedure('public.iberfit_bootstrap_v26()') is not null
    and to_regprocedure('public.iberfit_create_client_draft(jsonb)') is not null
    and coalesce(v_environment,'')='PRODUCTION'
    and coalesce(v_real_data_allowed,false)=true
    and coalesce(v_production_blocked,true)=false;

  return jsonb_build_object(
    'ok',true,'ready',v_ready,'version','v12.3',
    'role',v_role,'profileSource','client_app_profiles.profile',
    'iriSource','iri_assessments + domain_entities_v26',
    'environment',coalesce(v_environment,''),
    'realDataAllowed',coalesce(v_real_data_allowed,false),
    'productionBlocked',coalesce(v_production_blocked,true)
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_command_preflight_v26"("p_command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_command jsonb;
  v_result jsonb;
  v_def public.domain_command_registry_v26%rowtype;
  v_type text;
  v_entity_type text;
  v_entity_id uuid;
  v_client_id uuid;
  v_role text;
  v_reason text;
  v_body jsonb;
  v_status text;
  v_to_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_command) <> 'object' then
    raise exception 'INVALID_COMMAND' using errcode = '22023';
  end if;

  v_type := nullif(p_command->>'type','');
  v_entity_type := nullif(p_command->>'entityType','');
  v_entity_id := nullif(p_command->>'entityId','')::uuid;
  v_client_id := nullif(p_command->>'clientId','')::uuid;

  if not public.iberfit_can_access_client_v26(v_client_id) then
    raise exception 'CLIENT_ACCESS_DENIED' using errcode = '42501';
  end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','M26_CANARY_NOT_ENABLED','serverAt',now());
  end if;
  if exists (
    select 1 from public.domain_entities_v26
    where entity_type = v_entity_type and entity_id = v_entity_id and client_id <> v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ENTITY_CLIENT_MISMATCH','serverAt',now());
  end if;

  select * into v_def
  from public.domain_command_registry_v26
  where command_type = v_type and enabled;
  if not found or v_def.entity_type <> v_entity_type then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','COMMAND_NOT_ALLOWED','serverAt',now());
  end if;

  v_role := public.iberfit_current_role_v26();
  if not (v_role = any(v_def.allowed_roles)) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ROLE_NOT_ALLOWED','serverAt',now());
  end if;

  v_command := public.iberfit_prepare_command_rc30_v26(p_command);
  v_reason := nullif(btrim(v_command->'payload'->>'reason'), '');
  if v_def.requires_reason and v_reason is null then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','REASON_REQUIRED','serverAt',now());
  end if;
  if v_def.requires_preview and (
    coalesce((v_command->'payload'->>'previewConfirmed')::boolean,false) = false
    or nullif(v_command->'payload'->>'targetClientId','')::uuid is distinct from v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','PREVIEW_CONFIRMATION_REQUIRED','serverAt',now());
  end if;

  v_result := public.iberfit_command_preflight_v26_rc29(v_command);
  if v_result->>'kind' <> 'ack'
     or coalesce((v_result->>'duplicate')::boolean,false) then
    return v_result;
  end if;

  select body, status into v_body, v_status
  from public.domain_entities_v26
  where entity_type = v_entity_type and entity_id = v_entity_id and client_id = v_client_id;
  if v_body is null then
    v_body := public.iberfit_base_entity_v26(v_entity_type, v_entity_id, v_client_id);
    v_status := v_body->>'status';
  end if;
  if v_body is null then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',null,'reason','ENTITY_NOT_FOUND','serverAt',now());
  end if;

  select to_status into v_to_status
  from public.domain_transitions_v26
  where entity_type = v_entity_type
    and from_status = coalesce(v_status, v_body->>'status')
    and event_name = v_def.event_name;
  if v_to_status is null then
    return jsonb_build_object('kind','rejected','operationId',p_command->>'operationId',
      'remoteRevision',v_result->'remoteRevision','reason','INVALID_TRANSITION','serverAt',now());
  end if;

  return v_result || jsonb_build_object(
    'commandPolicy','server_registry',
    'eventName',v_def.event_name,
    'toStatus',v_to_status
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode = '22023';
end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_command_preflight_v26_rc29"("p_command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_operation_id uuid; v_entity_type text; v_entity_id uuid; v_client_id uuid;
  v_base_revision bigint; v_receipt public.command_receipts_v26%rowtype;
  v_body jsonb; v_revision bigint;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  v_operation_id:=(p_command->>'operationId')::uuid;
  v_entity_type:=nullif(p_command->>'entityType','');
  v_entity_id:=(p_command->>'entityId')::uuid;
  v_client_id:=(p_command->>'clientId')::uuid;
  v_base_revision:=(p_command->>'baseRevision')::bigint;
  if not public.iberfit_can_access_client_v26(v_client_id) then raise exception 'CLIENT_ACCESS_DENIED' using errcode='42501'; end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason','M26_CANARY_NOT_ENABLED','serverAt',now());
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_entity_type||':'||v_entity_id::text,0));
  select * into v_receipt from public.command_receipts_v26 where operation_id=v_operation_id;
  if found then
    return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_receipt.remote_revision,
      'serverAt',v_receipt.processed_at,'duplicate',true,'receipt',to_jsonb(v_receipt));
  end if;
  select body,revision into v_body,v_revision from public.domain_entities_v26
    where entity_type=v_entity_type and entity_id=v_entity_id and client_id=v_client_id;
  if v_body is null then v_body:=public.iberfit_base_entity_v26(v_entity_type,v_entity_id,v_client_id); end if;
  v_revision:=coalesce((v_body->>'revision')::bigint,v_revision,0);
  if coalesce((p_command->>'conflictSensitive')::boolean,true) and v_base_revision<>v_revision then
    return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,
      'reason','REVISION_MISMATCH','serverAt',now());
  end if;
  return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_revision,
    'serverAt',now(),'duplicate',false,'decision','apply');
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_communication_bootstrap_v14"("p_application" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_context jsonb;v_org uuid;v_user uuid:=auth.uid();v_app text:=lower(btrim(p_application));v_snapshot jsonb;v_client text;v_threads jsonb;v_messages jsonb;v_notifications jsonb;
begin
  select public.iberfit_application_context_v14() into v_context;if coalesce(v_context->>'membershipStatus','')<>'active' then raise exception using errcode='42501',message='V14_ORGANIZATION_ACCESS_SUSPENDED';end if;if not coalesce(v_context->'roles','[]'::jsonb)?v_app or v_app not in('client','coach')then raise exception using errcode='42501',message='V14_COMMUNICATION_ROLE_FORBIDDEN';end if;v_org:=(v_context->>'organizationId')::uuid;select public.iberfit_bootstrap_v26()into v_snapshot;v_client:=coalesce(v_snapshot#>>'{user,clientId}',v_snapshot#>>'{user,client_id}','');
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'clientId',t.client_id,'coachUserId',t.coach_user_id,'status',t.status,'subject',t.subject,'clientName',coalesce((select c->>'name' from jsonb_array_elements(coalesce(v_snapshot#>'{data,clients}','[]'::jsonb))c where c->>'id'=t.client_id limit 1),'Cliente'),'coachName',coalesce((select raw_user_meta_data->>'name' from auth.users where id=t.coach_user_id),(select email from auth.users where id=t.coach_user_id),'Coach IBERFIT'),'createdAt',t.created_at,'updatedAt',t.updated_at,'unreadCount',(select count(*)from public.iberfit_messages m where m.thread_id=t.id and((v_app='client'and m.read_by_client_at is null and m.sender_role<>'client')or(v_app='coach'and m.read_by_coach_at is null and m.sender_role<>'coach'))),'revision',t.revision)order by t.updated_at desc),'[]'::jsonb)into v_threads from public.iberfit_conversation_threads t where t.organization_id=v_org and t.status='active'and((v_app='client'and t.client_id=v_client)or(v_app='coach'and t.coach_user_id=v_user));
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'threadId',m.thread_id,'senderUserId',m.sender_user_id,'senderRole',m.sender_role,'body',m.body,'createdAt',m.created_at,'readByClientAt',m.read_by_client_at,'readByCoachAt',m.read_by_coach_at,'revision',m.revision)order by m.created_at),'[]'::jsonb)into v_messages from public.iberfit_messages m join public.iberfit_conversation_threads t on t.id=m.thread_id where t.organization_id=v_org and((v_app='client'and t.client_id=v_client)or(v_app='coach'and t.coach_user_id=v_user));
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'status',n.status,'createdAt',n.created_at,'readAt',n.read_at,'actionArea',n.action_area,'actionEntityId',n.action_entity_id,'revision',n.revision)order by n.created_at desc),'[]'::jsonb)into v_notifications from public.iberfit_in_app_notifications n where n.organization_id=v_org and((v_app='client'and n.recipient_client_id=v_client)or(v_app='coach'and n.recipient_user_id=v_user));
  return jsonb_build_object('ok',true,'threads',v_threads,'messages',v_messages,'notifications',v_notifications,'revision',1,'serverTime',now());
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_communication_execute_v14"("p_application" "text", "p_command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_context jsonb;v_org uuid;v_user uuid:=auth.uid();v_app text:=lower(btrim(p_application));v_snapshot jsonb;v_client text;v_op text:=btrim(p_command->>'operationId');v_type text:=upper(btrim(p_command->>'type'));v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);v_existing jsonb;v_result jsonb;v_thread public.iberfit_conversation_threads;v_id uuid;v_body text;
begin
  select public.iberfit_application_context_v14()into v_context;if not coalesce(v_context->'roles','[]'::jsonb)?v_app or v_app not in('client','coach')then raise exception using errcode='42501',message='V14_COMMUNICATION_ROLE_FORBIDDEN';end if;v_org:=(v_context->>'organizationId')::uuid;select result into v_existing from public.iberfit_communication_receipts where operation_id=v_op and actor_user_id=v_user and command_type=v_type;if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate');end if;select public.iberfit_bootstrap_v26()into v_snapshot;v_client:=coalesce(v_snapshot#>>'{user,clientId}',v_snapshot#>>'{user,client_id}','');
  if v_type='MESSAGE_THREAD_OPEN' then if v_app<>'coach' then raise exception using errcode='42501',message='V14_THREAD_OPEN_FORBIDDEN';end if;if coalesce((v_context->>'assignmentScopeEnforced')::boolean,false)and not coalesce(v_context->'assignedClientIds','[]'::jsonb)?btrim(v_payload->>'clientId')then raise exception using errcode='42501',message='V14_CLIENT_NOT_ASSIGNED';end if;insert into public.iberfit_conversation_threads(organization_id,client_id,coach_user_id,subject,created_by)values(v_org,btrim(v_payload->>'clientId'),v_user,left(coalesce(nullif(btrim(v_payload->>'subject'),''),'Seguimiento IBERFIT'),160),v_user)on conflict(organization_id,coach_user_id,client_id)do update set status='active',subject=excluded.subject,revision=public.iberfit_conversation_threads.revision+1,updated_at=now()returning * into v_thread;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'revision',v_thread.revision,'serverTime',now());
  elsif v_type='MESSAGE_SEND' then select * into v_thread from public.iberfit_conversation_threads where id=(v_payload->>'threadId')::uuid and organization_id=v_org and status='active'and((v_app='coach'and coach_user_id=v_user)or(v_app='client'and client_id=v_client))for update;if not found then raise exception using errcode='42501',message='V14_THREAD_NOT_VISIBLE';end if;v_body:=btrim(v_payload->>'body');if char_length(v_body)not between 1 and 4000 then raise exception using errcode='22023',message='V14_MESSAGE_BODY_INVALID';end if;insert into public.iberfit_messages(organization_id,thread_id,sender_user_id,sender_role,body,read_by_client_at,read_by_coach_at)values(v_org,v_thread.id,v_user,v_app,v_body,case when v_app='client'then now()end,case when v_app='coach'then now()end)returning id into v_id;update public.iberfit_conversation_threads set updated_at=now(),revision=revision+1 where id=v_thread.id returning * into v_thread;if v_app='coach'then insert into public.iberfit_in_app_notifications(organization_id,recipient_client_id,title,body,action_area,action_entity_id)values(v_org,v_thread.client_id,'Nuevo mensaje de tu Coach',left(v_body,300),'mensajes',v_thread.id::text);else insert into public.iberfit_in_app_notifications(organization_id,recipient_user_id,title,body,action_area,action_entity_id)values(v_org,v_thread.coach_user_id,'Nuevo mensaje de un cliente',left(v_body,300),'mensajes',v_thread.id::text);end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'messageId',v_id,'revision',v_thread.revision,'serverTime',now());
  elsif v_type='MESSAGE_MARK_READ' then select * into v_thread from public.iberfit_conversation_threads where id=(v_payload->>'threadId')::uuid and organization_id=v_org and((v_app='coach'and coach_user_id=v_user)or(v_app='client'and client_id=v_client));if not found then raise exception using errcode='42501',message='V14_THREAD_NOT_VISIBLE';end if;if v_app='coach'then update public.iberfit_messages set read_by_coach_at=coalesce(read_by_coach_at,now()),revision=revision+1 where thread_id=v_thread.id and sender_role<>'coach';else update public.iberfit_messages set read_by_client_at=coalesce(read_by_client_at,now()),revision=revision+1 where thread_id=v_thread.id and sender_role<>'client';end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'serverTime',now());
  elsif v_type='NOTIFICATION_MARK_READ' then if v_app='coach'then update public.iberfit_in_app_notifications set status='read',read_at=now(),revision=revision+1 where id=(v_payload->>'notificationId')::uuid and recipient_user_id=v_user;else update public.iberfit_in_app_notifications set status='read',read_at=now(),revision=revision+1 where id=(v_payload->>'notificationId')::uuid and recipient_client_id=v_client;end if;if not found then raise exception using errcode='P0002',message='V14_NOTIFICATION_NOT_FOUND';end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'serverTime',now());
  else raise exception using errcode='22023',message='V14_COMMUNICATION_COMMAND_INVALID';end if;
  insert into public.iberfit_communication_receipts(operation_id,organization_id,actor_user_id,command_type,result)values(v_op,v_org,v_user,v_type,v_result);return v_result;
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_create_client_draft_v12"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
  if coalesce(v_environment,'')<>'PRODUCTION'
     or coalesce(v_real_data_allowed,false)=false
     or coalesce(v_production_blocked,true)=true then
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
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_current_role_v26"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select case coalesce(public.iberfit_role()::text,'sin_rol')
    when 'client' then 'cliente'
    else coalesce(public.iberfit_role()::text,'sin_rol')
  end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_execute_command_v26"("p_command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_command jsonb;
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

    v_profile:=case when jsonb_typeof(v_body->'personProfile')='object' then v_body->'personProfile' else '{}'::jsonb end;
    if v_profile<>'{}'::jsonb then
      v_email:=lower(nullif(btrim(v_profile->>'email'),''));
      if v_email is not null and exists(
        select 1 from public.client_intake_profiles i
        where lower(btrim(i.email))=v_email and i.client_id<>v_client_id
      ) then
        raise exception using errcode='23505',message='V123_PROFILE_EMAIL_ALREADY_EXISTS';
      end if;

      update public.client_app_profiles ap
      set profile=coalesce(ap.profile,'{}'::jsonb)||v_profile
      where ap.id=(select p.id from public.client_app_profiles p
        where p.client_id=v_client_id order by p.version desc,p.created_at desc limit 1);

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

      update public.clients set
        objective=coalesce(nullif(btrim(v_profile->>'primaryObjective'),''),objective),
        modality=coalesce(v_modality,modality)
      where id=v_client_id;

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
    end if;
  end if;

  return v_result;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end
$_$;

CREATE OR REPLACE FUNCTION "public"."iberfit_execute_command_v26_rc29"("p_command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_operation_id uuid; v_command_type text; v_entity_type text; v_entity_id uuid; v_client_id uuid;
  v_base_revision bigint; v_conflict_sensitive boolean; v_payload jsonb; v_role text; v_now timestamptz:=now();
  v_def public.domain_command_registry_v26%rowtype; v_receipt public.command_receipts_v26%rowtype;
  v_body jsonb; v_next_body jsonb; v_status text; v_to_status text; v_revision bigint; v_next_revision bigint;
  v_reason text; v_response jsonb:='{}'::jsonb; v_related jsonb; v_related_revision bigint;
  v_appointment jsonb; v_execution_id uuid; v_appointment_id uuid; v_plan_id uuid; v_plan jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_command)<>'object' then raise exception 'INVALID_COMMAND' using errcode='22023'; end if;

  v_operation_id:=(p_command->>'operationId')::uuid;
  v_command_type:=nullif(p_command->>'type','');
  v_entity_type:=nullif(p_command->>'entityType','');
  v_entity_id:=(p_command->>'entityId')::uuid;
  v_client_id:=(p_command->>'clientId')::uuid;
  v_base_revision:=(p_command->>'baseRevision')::bigint;
  v_conflict_sensitive:=coalesce((p_command->>'conflictSensitive')::boolean,true);
  v_payload:=coalesce(p_command->'payload','{}'::jsonb);
  v_role:=public.iberfit_current_role_v26();
  v_reason:=nullif(btrim(v_payload->>'reason'),'');

  if v_command_type is null or v_entity_type is null or v_base_revision<0 then
    raise exception 'INVALID_COMMAND' using errcode='22023';
  end if;
  if not public.iberfit_can_access_client_v26(v_client_id) then raise exception 'CLIENT_ACCESS_DENIED' using errcode='42501'; end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','M26_CANARY_NOT_ENABLED','serverAt',v_now);
  end if;

  select * into v_def from public.domain_command_registry_v26 where command_type=v_command_type and enabled=true;
  if not found or v_def.entity_type<>v_entity_type then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','COMMAND_NOT_ALLOWED','serverAt',v_now);
  end if;
  if not (v_role=any(v_def.allowed_roles)) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','ROLE_NOT_ALLOWED','serverAt',v_now);
  end if;
  if v_def.requires_reason and v_reason is null then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','REASON_REQUIRED','serverAt',v_now);
  end if;
  if v_def.requires_preview and (
    coalesce((v_payload->>'previewConfirmed')::boolean,false)=false
    or nullif(v_payload->>'targetClientId','')::uuid is distinct from v_client_id
  ) then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,
      'reason','PREVIEW_CONFIRMATION_REQUIRED','serverAt',v_now);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_entity_type||':'||v_entity_id::text,0));
  select * into v_receipt from public.command_receipts_v26 where operation_id=v_operation_id;
  if found then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'duplicate',v_base_revision,v_receipt.remote_revision,'Recibo existente');
    return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_receipt.remote_revision,
      'serverAt',v_receipt.processed_at,'duplicate',true,'receipt',to_jsonb(v_receipt));
  end if;

  select body,status,revision into v_body,v_status,v_revision
  from public.domain_entities_v26
  where entity_type=v_entity_type and entity_id=v_entity_id and client_id=v_client_id;
  if v_body is null then
    v_body:=public.iberfit_base_entity_v26(v_entity_type,v_entity_id,v_client_id);
    v_status:=v_body->>'status'; v_revision:=coalesce((v_body->>'revision')::bigint,0);
  end if;
  if v_body is null and v_def.bootstrap_allowed then
    v_status:=case v_entity_type
      when 'client_access' then 'sin_acceso' when 'planning' then 'borrador'
      when 'appointment' then 'propuesta' when 'intelligence' then 'borrador' else null end;
    v_revision:=0;
    v_body:=jsonb_build_object('id',v_entity_id,'clientId',v_client_id,'status',v_status,'revision',0,
      'createdAt',v_now,'updatedAt',v_now);
  end if;
  if v_body is null then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'rejected',v_base_revision,'ENTITY_NOT_FOUND');
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason','ENTITY_NOT_FOUND','serverAt',v_now);
  end if;

  v_status:=coalesce(v_status,v_body->>'status');
  v_revision:=coalesce(v_revision,(v_body->>'revision')::bigint,0);
  if v_conflict_sensitive and v_base_revision<>v_revision then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'conflict',v_base_revision,v_revision,'REVISION_MISMATCH');
    insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_role,'conflict',v_status,v_status,v_base_revision,v_revision,'REVISION_MISMATCH');
    return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,'reason','REVISION_MISMATCH','serverAt',v_now);
  end if;

  select to_status into v_to_status from public.domain_transitions_v26
  where entity_type=v_entity_type and from_status=v_status and event_name=v_def.event_name;
  if v_to_status is null then
    insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,reason)
    values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'rejected',v_base_revision,v_revision,'INVALID_TRANSITION');
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','INVALID_TRANSITION','serverAt',v_now);
  end if;

  v_next_revision:=v_revision+1;
  v_next_body:=v_body || case when jsonb_typeof(v_payload->'patch')='object' then v_payload->'patch' else '{}'::jsonb end;

  if v_command_type='PLAN_VALIDAR' and jsonb_typeof(v_payload->'draft')='object' then
    v_next_body:=v_next_body || (v_payload->'draft');
  elsif v_command_type in ('CITA_CREAR','CITA_REPROGRAMAR') and jsonb_typeof(v_payload->'appointment')='object' then
    v_next_body:=v_next_body || (v_payload->'appointment');
    if nullif(v_next_body->>'startAt','') is null or nullif(v_next_body->>'endAt','') is null
       or (v_next_body->>'endAt')::timestamptz <= (v_next_body->>'startAt')::timestamptz then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','INVALID_APPOINTMENT_RANGE','serverAt',v_now);
    end if;
    if exists(
      select 1 from public.appointments a
      where a.client_id=v_client_id and a.id<>v_entity_id and a.status in ('propuesta','confirmada')
        and tstzrange(a.start_at,a.end_at,'[)') && tstzrange((v_next_body->>'startAt')::timestamptz,(v_next_body->>'endAt')::timestamptz,'[)')
    ) then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','APPOINTMENT_OVERLAP','serverAt',v_now);
    end if;
  elsif v_command_type='INTELIGENCIA_GENERAR' then
    if jsonb_typeof(v_payload->'proposal')<>'object' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','STRUCTURED_PROPOSAL_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object(
      'proposal',v_payload->'proposal','provider',v_payload->>'provider','providerMode',v_payload->>'providerMode',
      'providerModel',v_payload->>'model','providerRequestId',v_payload->>'requestId',
      'fallbackReason',v_payload->>'fallbackReason','generatedAt',v_now,'generatedBy',auth.uid()
    );
  elsif v_command_type='INTELIGENCIA_REVISAR' then
    if nullif(btrim(v_payload->>'reviewSummary'),'') is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','REVIEW_SUMMARY_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object('reviewSummary',v_payload->>'reviewSummary','reviewedAt',v_now,'reviewedBy',auth.uid());
  elsif v_command_type in ('CLIENTE_INVITAR','CLIENTE_REINVITAR','CLIENTE_REENVIAR_INVITACION') then
    if nullif(v_payload->>'email','') is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EMAIL_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object('email',v_payload->>'email','invitationSentAt',v_now,
      'invitationSentBy',auth.uid(),'invitationAttemptCount',coalesce((v_body->>'invitationAttemptCount')::integer,0)+1);
  elsif v_command_type='CLIENTE_ACTIVAR' then
    v_next_body:=v_next_body || jsonb_build_object('authUserId',v_payload->>'authUserId','activatedAt',v_now);
  elsif v_command_type='EJECUCION_GUARDAR_PROGRESO' then
    if jsonb_typeof(v_payload->'progressSnapshot')<>'object' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PROGRESS_SNAPSHOT_REQUIRED','serverAt',v_now);
    end if;
    v_next_body:=v_next_body || jsonb_build_object(
      'progressSnapshot',v_payload->'progressSnapshot','items',coalesce(v_payload->'progressSnapshot'->'items','[]'::jsonb),
      'cursor',coalesce(v_payload->'progressSnapshot'->'cursor','{}'::jsonb),
      'incidents',coalesce(v_payload->'progressSnapshot'->'incidents','[]'::jsonb),
      'progressSavedAt',v_now,'progressSavedBy',auth.uid()
    );
  end if;

  if v_command_type='SESION_INICIAR' then
    v_execution_id:=nullif(v_payload->>'executionId','')::uuid;
    v_appointment_id:=nullif(v_payload->>'appointmentId','')::uuid;
    if v_execution_id is null or v_appointment_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EXECUTION_AND_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    if exists(select 1 from public.active_execution_locks_v26 where client_id=v_client_id) then
      return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_revision,'reason','ACTIVE_EXECUTION_EXISTS','serverAt',v_now);
    end if;
    v_appointment:=public.iberfit_base_entity_v26('appointment',v_appointment_id,v_client_id);
    if v_appointment is null or v_appointment->>'status'<>'confirmada'
       or nullif(v_appointment->>'sessionId','')::uuid is distinct from v_entity_id then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','CONFIRMED_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    v_related:=jsonb_build_object(
      'id',v_execution_id,'clientId',v_client_id,'sessionId',v_entity_id,'appointmentId',v_appointment_id,
      'status','en_curso','revision',1,'startedAt',v_now,'startedBy',auth.uid(),
      'mode',coalesce(v_next_body->>'type',v_next_body->>'execution_type'),
      'sourceRevision',v_revision,'sourceSnapshot',coalesce(v_next_body->'publishedSnapshot',v_next_body->'prescription',v_next_body),
      'items',coalesce(v_next_body->'publishedSnapshot'->'items',v_next_body->'prescription'->'items',v_next_body->'blocks','[]'::jsonb),
      'cursor',jsonb_build_object('itemIndex',0,'setIndex',0),'incidents','[]'::jsonb
    );
    perform public.iberfit_persist_entity_v26('session_execution',v_execution_id,v_client_id,'en_curso',1,v_related);
    insert into public.active_execution_locks_v26(client_id,session_id,execution_id,acquired_by)
    values(v_client_id,v_entity_id,v_execution_id,auth.uid());
    v_next_body:=v_next_body || jsonb_build_object('activeExecutionId',v_execution_id,'appointmentId',v_appointment_id,'startedAt',v_now,'startedBy',auth.uid());
    v_response:=jsonb_build_object('executionId',v_execution_id,'executionRevision',1,'appointmentId',v_appointment_id);
    insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,details)
    values(v_operation_id,v_command_type,'session_execution',v_execution_id,v_client_id,auth.uid(),v_role,'related_applied','creada','en_curso',0,1,jsonb_build_object('sessionId',v_entity_id));
  elsif v_command_type='EJECUCION_COMPLETAR' then
    delete from public.active_execution_locks_v26 where client_id=v_client_id and execution_id=v_entity_id;
    if nullif(v_body->>'sessionId','') is not null then
      v_related:=public.iberfit_base_entity_v26('session',(v_body->>'sessionId')::uuid,v_client_id);
      select body,revision into v_plan,v_related_revision from public.domain_entities_v26
        where entity_type='session' and entity_id=(v_body->>'sessionId')::uuid and client_id=v_client_id;
      v_related:=coalesce(v_plan,v_related);
      if v_related is not null then
        v_related_revision:=coalesce(v_related_revision,(v_related->>'revision')::bigint,0)+1;
        v_related:=v_related || jsonb_build_object('status','completada','revision',v_related_revision,'completedAt',v_now,'updatedAt',v_now);
        perform public.iberfit_persist_entity_v26('session',(v_body->>'sessionId')::uuid,v_client_id,'completada',v_related_revision,v_related);
      end if;
    end if;
    if nullif(v_body->>'appointmentId','') is not null then
      v_related:=public.iberfit_base_entity_v26('appointment',(v_body->>'appointmentId')::uuid,v_client_id);
      if v_related is not null then
        v_related_revision:=coalesce((v_related->>'revision')::bigint,0)+1;
        v_related:=v_related || jsonb_build_object('status','completada','revision',v_related_revision,'completedAt',v_now,'completedBy',auth.uid(),'updatedAt',v_now);
        perform public.iberfit_persist_entity_v26('appointment',(v_body->>'appointmentId')::uuid,v_client_id,'completada',v_related_revision,v_related);
      end if;
    end if;
    v_next_body:=v_next_body || jsonb_build_object('completedAt',v_now,'completedBy',auth.uid(),'feedback',coalesce(v_payload->'feedback','{}'::jsonb));
  elsif v_command_type='INTELIGENCIA_APLICAR_A_BORRADOR' then
    v_plan_id:=nullif(v_payload->>'planDraftId','')::uuid;
    if v_plan_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PLAN_DRAFT_REQUIRED','serverAt',v_now);
    end if;
    select body,revision into v_plan,v_related_revision from public.domain_entities_v26
      where entity_type='planning' and entity_id=v_plan_id and client_id=v_client_id;
    if v_plan is null then v_plan:=public.iberfit_base_entity_v26('planning',v_plan_id,v_client_id); end if;
    v_related_revision:=coalesce(v_related_revision,(v_plan->>'revision')::bigint,0);
    if v_plan is null or v_plan->>'status'<>'borrador' then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','PLAN_NOT_DRAFT','serverAt',v_now);
    end if;
    if v_related_revision<>coalesce((v_payload->>'planBaseRevision')::bigint,-1) then
      return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',v_related_revision,'reason','PLAN_REVISION_MISMATCH','serverAt',v_now);
    end if;
    v_related_revision:=v_related_revision+1;
    v_plan:=v_plan || jsonb_build_object('revision',v_related_revision,'updatedAt',v_now,
      'aiSuggestions',coalesce(v_plan->'aiSuggestions','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id',v_operation_id,'intelligenceRunId',v_entity_id,'proposal',v_body->'proposal','addedAt',v_now,
        'addedBy',auth.uid(),'status','pendiente_revision_editor')));
    perform public.iberfit_persist_entity_v26('planning',v_plan_id,v_client_id,'borrador',v_related_revision,v_plan);
    v_next_body:=v_next_body || jsonb_build_object('appliedAt',v_now,'appliedBy',auth.uid(),'appliedPlanId',v_plan_id);
    v_response:=jsonb_build_object('planId',v_plan_id,'planRevision',v_related_revision,'suggestionId',v_operation_id);
  end if;

  if v_to_status in ('aprobado','aprobada') then
    v_next_body:=v_next_body || jsonb_build_object('approvedAt',v_now,'approvedBy',auth.uid());
  elsif v_to_status in ('publicado','publicada') then
    v_next_body:=v_next_body || jsonb_build_object('publishedAt',v_now,'publishedBy',auth.uid());
  elsif v_to_status='retirado' then
    v_next_body:=v_next_body || jsonb_build_object('retiredAt',v_now,'retiredBy',auth.uid(),'retireReason',v_reason);
  elsif v_to_status in ('cancelada','anulado','archivado','descartada','revocado','suspendido') then
    v_next_body:=v_next_body || jsonb_build_object('closedAt',v_now,'closedBy',auth.uid(),'closeReason',v_reason);
  end if;
  if v_def.snapshot_on_apply then
    v_next_body:=v_next_body || jsonb_build_object('publishedSnapshot',coalesce(v_next_body->'content',v_next_body->'sessions',v_next_body->'blocks',v_next_body),
      'publishedRevision',v_next_revision);
  end if;

  v_next_body:=v_next_body || jsonb_build_object('id',v_entity_id,'clientId',v_client_id,'status',v_to_status,
    'revision',v_next_revision,'updatedAt',v_now);
  perform public.iberfit_persist_entity_v26(v_entity_type,v_entity_id,v_client_id,v_to_status,v_next_revision,v_next_body);

  insert into public.command_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,phase,base_revision,remote_revision,payload_hash)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),'applied',v_base_revision,v_next_revision,md5(v_payload::text));
  insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,reason,details)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_role,'applied',v_status,v_to_status,v_base_revision,v_next_revision,v_reason,v_response);

  insert into public.command_receipts_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,base_revision,remote_revision,response,processed_at)
  values(v_operation_id,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_base_revision,v_next_revision,v_response,v_now)
  returning * into v_receipt;

  return jsonb_build_object('kind','ack','operationId',v_operation_id,'remoteRevision',v_next_revision,
    'serverAt',v_now,'duplicate',false,'receipt',to_jsonb(v_receipt));
exception
  when invalid_text_representation or numeric_value_out_of_range or null_value_not_allowed then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_external_report_path_assessment_v12"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
declare v_part text;
begin
  v_part:=split_part(coalesce(p_name,''),'/',2);
  if v_part is null or v_part !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return v_part::uuid;
exception when others then return null;
end
$_$;

CREATE OR REPLACE FUNCTION "public"."iberfit_external_report_path_client_v12"("p_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
declare v_part text;
begin
  v_part:=split_part(coalesce(p_name,''),'/',1);
  if v_part is null or v_part !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return v_part::uuid;
exception when others then return null;
end
$_$;

CREATE OR REPLACE FUNCTION "public"."iberfit_iri_external_report_preflight_v12"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid:=auth.uid();
  v_role text;
  v_bucket_public boolean;
begin
  if v_actor is null then raise exception using errcode='28000',message='V124_AUTH_REQUIRED'; end if;
  select lower(u.role::text) into v_role from public.user_profiles u where u.user_id=v_actor;
  if v_role not in ('admin','coach','client','cliente') then raise exception using errcode='42501',message='V124_ROLE_REQUIRED'; end if;
  select b.public into v_bucket_public from storage.buckets b where b.id='iberfit-iri-external-reports';
  return jsonb_build_object(
    'ok',true,'ready',
      to_regclass('public.iri_external_reports_v26') is not null
      and coalesce(v_bucket_public,true)=false,
    'version','v12.4','role',v_role,
    'bucket','iberfit-iri-external-reports','private',coalesce(v_bucket_public,true)=false,
    'maxBytes',50000000,
    'mimeTypes',jsonb_build_array('application/pdf','image/jpeg','image/png')
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_persist_entity_v26"("p_entity_type" "text", "p_entity_id" "uuid", "p_client_id" "uuid", "p_status" "text", "p_revision" bigint, "p_body" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
begin
  if p_entity_type = any(array['checkin','habit','habit_log','private_note']) and exists (
    select 1 from public.domain_entities_v26
    where entity_type = p_entity_type
      and entity_id = p_entity_id
      and client_id <> p_client_id
  ) then
    raise exception 'ENTITY_CLIENT_MISMATCH' using errcode = '42501';
  end if;

  perform public.iberfit_persist_entity_v26_rc29(
    p_entity_type, p_entity_id, p_client_id, p_status, p_revision, p_body
  );

  if p_entity_type = 'checkin' then
    insert into public.client_checkins_v26(
      id, client_id, energy, sleep, stress, pain, notes, status, revision,
      recorded_at, created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, (p_body->>'energy')::numeric,
      (p_body->>'sleep')::numeric, (p_body->>'stress')::numeric,
      (p_body->>'pain')::numeric, coalesce(p_body->>'notes',''), p_status,
      p_revision, (p_body->>'recordedAt')::timestamptz,
      coalesce(nullif(p_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(p_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      energy = excluded.energy, sleep = excluded.sleep, stress = excluded.stress,
      pain = excluded.pain, notes = excluded.notes, status = excluded.status,
      revision = excluded.revision, recorded_at = excluded.recorded_at, updated_at = now()
    where client_checkins_v26.client_id = excluded.client_id;

  elsif p_entity_type = 'habit' then
    insert into public.client_habits_v26(
      id, client_id, title, description, target, unit, frequency, status,
      revision, created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, p_body->>'title', coalesce(p_body->>'description',''),
      (p_body->>'target')::numeric, p_body->>'unit', p_body->>'frequency',
      p_status, p_revision, coalesce(nullif(p_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(p_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      title = excluded.title, description = excluded.description, target = excluded.target,
      unit = excluded.unit, frequency = excluded.frequency, status = excluded.status,
      revision = excluded.revision, updated_at = now()
    where client_habits_v26.client_id = excluded.client_id;

  elsif p_entity_type = 'habit_log' then
    insert into public.client_habit_logs_v26(
      id, client_id, habit_id, completed, value, notes, status, revision,
      recorded_at, created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, (p_body->>'habitId')::uuid,
      coalesce((p_body->>'completed')::boolean, false), p_body->'value',
      coalesce(p_body->>'notes',''), p_status, p_revision,
      (p_body->>'recordedAt')::timestamptz,
      coalesce(nullif(p_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(p_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      completed = excluded.completed, value = excluded.value, notes = excluded.notes,
      status = excluded.status, revision = excluded.revision,
      recorded_at = excluded.recorded_at, updated_at = now()
    where client_habit_logs_v26.client_id = excluded.client_id;

  elsif p_entity_type = 'private_note' then
    insert into public.coach_private_notes_v26(
      id, client_id, body, visibility, status, revision,
      created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, p_body->>'body', 'coach_only', p_status, p_revision,
      coalesce(nullif(p_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(p_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      body = excluded.body, visibility = 'coach_only', status = excluded.status,
      revision = excluded.revision, updated_at = now()
    where coach_private_notes_v26.client_id = excluded.client_id;
  end if;
end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_persist_entity_v26_rc29"("p_entity_type" "text", "p_entity_id" "uuid", "p_client_id" "uuid", "p_status" "text", "p_revision" bigint, "p_body" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_existing_status public.publication_status;
begin
  insert into public.domain_entities_v26(entity_type,entity_id,client_id,status,revision,body,updated_at)
  values(p_entity_type,p_entity_id,p_client_id,p_status,p_revision,p_body,now())
  on conflict(entity_type,entity_id) do update set
    client_id=excluded.client_id,status=excluded.status,revision=excluded.revision,
    body=excluded.body,updated_at=excluded.updated_at;

  if p_entity_type='appointment' then
    insert into public.appointments(
      id,client_id,session_id,appointment_type,title,mode,location,start_at,end_at,time_zone,
      status,revision,created_by,confirmed_at,confirmed_by,cancelled_at,cancelled_by,
      cancellation_reason,completed_at,completed_by,payload,updated_at
    ) values(
      p_entity_id,p_client_id,nullif(p_body->>'sessionId','')::uuid,
      coalesce(nullif(p_body->>'type',''),'session'),coalesce(nullif(p_body->>'title',''),'Cita IBERFIT'),
      coalesce(nullif(p_body->>'mode',''),'presencial'),nullif(p_body->>'location',''),
      (p_body->>'startAt')::timestamptz,(p_body->>'endAt')::timestamptz,
      coalesce(nullif(p_body->>'timeZone',''),'America/Santiago'),p_status,p_revision,
      nullif(p_body->>'createdBy','')::uuid,
      nullif(p_body->>'confirmedAt','')::timestamptz,nullif(p_body->>'confirmedBy','')::uuid,
      nullif(p_body->>'cancelledAt','')::timestamptz,nullif(p_body->>'cancelledBy','')::uuid,
      nullif(p_body->>'closeReason',''),nullif(p_body->>'completedAt','')::timestamptz,
      nullif(p_body->>'completedBy','')::uuid,p_body,now()
    ) on conflict(id) do update set
      session_id=excluded.session_id,appointment_type=excluded.appointment_type,title=excluded.title,
      mode=excluded.mode,location=excluded.location,start_at=excluded.start_at,end_at=excluded.end_at,
      time_zone=excluded.time_zone,status=excluded.status,revision=excluded.revision,
      confirmed_at=excluded.confirmed_at,confirmed_by=excluded.confirmed_by,
      cancelled_at=excluded.cancelled_at,cancelled_by=excluded.cancelled_by,
      cancellation_reason=excluded.cancellation_reason,completed_at=excluded.completed_at,
      completed_by=excluded.completed_by,payload=excluded.payload,updated_at=now();
  elsif p_entity_type='client_access' then
    insert into public.client_access_v26(
      id,client_id,auth_user_id,email,status,revision,invitation_attempt_count,
      invitation_sent_at,activated_at,closed_at,close_reason,updated_at
    ) values(
      p_entity_id,p_client_id,nullif(p_body->>'authUserId','')::uuid,p_body->>'email',p_status,p_revision,
      coalesce((p_body->>'invitationAttemptCount')::integer,0),
      nullif(p_body->>'invitationSentAt','')::timestamptz,
      nullif(p_body->>'activatedAt','')::timestamptz,
      nullif(p_body->>'closedAt','')::timestamptz,p_body->>'closeReason',now()
    ) on conflict(client_id) do update set
      auth_user_id=excluded.auth_user_id,email=excluded.email,status=excluded.status,
      revision=excluded.revision,invitation_attempt_count=excluded.invitation_attempt_count,
      invitation_sent_at=excluded.invitation_sent_at,activated_at=excluded.activated_at,
      closed_at=excluded.closed_at,close_reason=excluded.close_reason,updated_at=now();
  elsif p_entity_type='session_execution' then
    insert into public.session_executions(
      id,session_id,client_id,execution_status,summary,started_by,updated_at,revision
    ) values(
      p_entity_id,(p_body->>'sessionId')::uuid,p_client_id,
      case p_status when 'pausada' then 'pausada' when 'completada' then 'cerrada_confirmada'
        when 'cancelada' then 'cierre_rechazado' else 'activa' end,
      p_body,nullif(p_body->>'startedBy','')::uuid,now(),p_revision
    ) on conflict(id) do update set
      execution_status=excluded.execution_status,summary=excluded.summary,
      updated_at=now(),revision=excluded.revision;
  elsif p_entity_type='report' then
    update public.reports set
      status=(case p_status when 'anulado' then 'retirado' else p_status end)::public.publication_status,
      revision=p_revision,
      approved_at=case when p_status='aprobado' then coalesce(approved_at,now()) else approved_at end,
      published_at=case when p_status='publicado' then coalesce(published_at,now()) else published_at end
    where id=p_entity_id and client_id=p_client_id;
  elsif p_entity_type='iri' then
    update public.iri_assessments set
      status=(case p_status when 'completo' then 'revisión' when 'sustituido' then 'retirado'
        when 'anulado' then 'retirado' else p_status end)::public.publication_status,
      revision=p_revision,
      approved_at=case when p_status='aprobado' then coalesce(approved_at,now()) else approved_at end,
      updated_at=now()
    where id=p_entity_id and client_id=p_client_id;
  elsif p_entity_type='planning' then
    update public.training_cycles set
      status=(case p_status when 'validado' then 'revisión' when 'archivado' then 'retirado' else p_status end)::public.publication_status,
      revision=p_revision,
      published_at=case when p_status='publicado' then coalesce(published_at,now()) else published_at end
    where id=p_entity_id and client_id=p_client_id;
  elsif p_entity_type='session' then
    select status into v_existing_status from public.sessions where id=p_entity_id and client_id=p_client_id;
    update public.sessions set
      status=(case
        when p_status='aprobada' then 'aprobado'
        when p_status in ('publicada','disponible','en_curso','completada') then 'publicado'
        when p_status='cancelada' then 'retirado'
        else coalesce(v_existing_status::text,'borrador') end)::public.publication_status,
      revision=greatest(revision,p_revision),
      published_at=case when p_status in ('publicada','disponible','en_curso','completada') then coalesce(published_at,now()) else published_at end
    where id=p_entity_id and client_id=p_client_id;
  end if;
end $$;

CREATE OR REPLACE FUNCTION "public"."iberfit_prepare_command_rc30_v26"("p_command" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_command jsonb := p_command;
  v_payload jsonb;
  v_patch jsonb;
  v_def public.domain_command_registry_v26%rowtype;
  v_type text;
  v_entity_type text;
  v_client_id uuid;
  v_reason text;
  v_preview boolean;
  v_recorded_at timestamptz;
  v_habit_id uuid;
  v_energy numeric;
  v_sleep numeric;
  v_stress numeric;
  v_pain numeric;
  v_target numeric;
begin
  if jsonb_typeof(p_command) <> 'object' then
    raise exception 'INVALID_COMMAND' using errcode = '22023';
  end if;
  if octet_length(p_command::text) > 262144 then
    raise exception 'COMMAND_PAYLOAD_TOO_LARGE' using errcode = '22023';
  end if;

  v_type := nullif(p_command->>'type', '');
  v_entity_type := nullif(p_command->>'entityType', '');
  v_client_id := nullif(p_command->>'clientId', '')::uuid;
  v_payload := coalesce(p_command->'payload', '{}'::jsonb);
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'INVALID_COMMAND_PAYLOAD' using errcode = '22023';
  end if;

  select * into v_def
  from public.domain_command_registry_v26
  where command_type = v_type and enabled;

  if found then
    v_command := jsonb_set(
      v_command,
      '{conflictSensitive}',
      to_jsonb(v_def.conflict_sensitive),
      true
    );
  end if;

  v_reason := nullif(btrim(coalesce(p_command->>'reason', v_payload->>'reason')), '');
  if v_reason is not null then
    v_payload := jsonb_set(v_payload, '{reason}', to_jsonb(left(v_reason, 1000)), true);
  end if;

  v_preview := coalesce(
    nullif(p_command->>'previewAccepted', '')::boolean,
    nullif(v_payload->>'previewConfirmed', '')::boolean,
    false
  );
  if v_preview then
    v_payload := jsonb_set(v_payload, '{previewConfirmed}', 'true'::jsonb, true);
    v_payload := jsonb_set(v_payload, '{targetClientId}', to_jsonb(v_client_id::text), true);
  end if;

  v_patch := coalesce(v_payload->'patch', '{}'::jsonb);
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'INVALID_COMMAND_PATCH' using errcode = '22023';
  end if;

  if v_type = 'CHECKIN_REGISTRAR' then
    v_energy := nullif(v_patch->>'energy', '')::numeric;
    v_sleep := nullif(v_patch->>'sleep', '')::numeric;
    v_stress := nullif(v_patch->>'stress', '')::numeric;
    v_pain := nullif(v_patch->>'pain', '')::numeric;
    v_recorded_at := nullif(v_patch->>'recordedAt', '')::timestamptz;

    if v_entity_type <> 'checkin'
       or v_energy is null or v_energy not between 0 and 10
       or v_sleep is null or v_sleep not between 0 and 10
       or v_stress is null or v_stress not between 0 and 10
       or v_pain is null or v_pain not between 0 and 10
       or v_recorded_at is null or v_recorded_at > now() + interval '5 minutes' then
      raise exception 'INVALID_CHECKIN_PAYLOAD' using errcode = '22023';
    end if;

    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'energy', v_energy, 'sleep', v_sleep, 'stress', v_stress, 'pain', v_pain,
      'notes', left(coalesce(v_patch->>'notes', ''), 1000),
      'recordedAt', v_recorded_at
    ), true);

  elsif v_type = 'CHECKIN_ANULAR' then
    v_payload := jsonb_set(v_payload, '{patch}', '{}'::jsonb, true);

  elsif v_type = 'HABITO_DEFINIR' then
    v_target := nullif(v_patch->>'target', '')::numeric;
    if v_entity_type <> 'habit'
       or length(btrim(coalesce(v_patch->>'title', ''))) not between 2 and 120
       or v_target is null or v_target <= 0 or v_target > 1000000
       or length(btrim(coalesce(v_patch->>'unit', ''))) not between 1 and 40
       or length(btrim(coalesce(v_patch->>'frequency', ''))) not between 1 and 40 then
      raise exception 'INVALID_HABIT_PAYLOAD' using errcode = '22023';
    end if;

    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'title', left(btrim(v_patch->>'title'), 120),
      'description', left(coalesce(v_patch->>'description', ''), 500),
      'target', v_target,
      'unit', left(btrim(v_patch->>'unit'), 40),
      'frequency', left(btrim(v_patch->>'frequency'), 40)
    ), true);

  elsif v_type = 'HABITO_REGISTRAR' then
    v_habit_id := nullif(v_patch->>'habitId', '')::uuid;
    v_recorded_at := nullif(v_patch->>'recordedAt', '')::timestamptz;
    if v_entity_type <> 'habit_log'
       or v_habit_id is null
       or v_recorded_at is null or v_recorded_at > now() + interval '5 minutes'
       or not exists (
         select 1 from public.client_habits_v26
         where id = v_habit_id and client_id = v_client_id and status = 'activo'
       ) then
      raise exception 'INVALID_HABIT_LOG_PAYLOAD' using errcode = '22023';
    end if;
    if octet_length(coalesce((v_patch->'value')::text, 'null')) > 16384 then
      raise exception 'HABIT_LOG_VALUE_TOO_LARGE' using errcode = '22023';
    end if;

    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'habitId', v_habit_id,
      'completed', coalesce(nullif(v_patch->>'completed', '')::boolean, false),
      'value', v_patch->'value',
      'notes', left(coalesce(v_patch->>'notes', ''), 500),
      'recordedAt', v_recorded_at
    ), true);

  elsif v_type = 'HABITO_ARCHIVAR' then
    v_payload := jsonb_set(v_payload, '{patch}', '{}'::jsonb, true);

  elsif v_type in ('NOTA_PRIVADA_CREAR', 'NOTA_PRIVADA_ACTUALIZAR') then
    if v_entity_type <> 'private_note'
       or length(btrim(coalesce(v_patch->>'body', ''))) not between 3 and 4000 then
      raise exception 'INVALID_PRIVATE_NOTE_PAYLOAD' using errcode = '22023';
    end if;
    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'body', left(btrim(v_patch->>'body'), 4000),
      'visibility', 'coach_only'
    ), true);

  elsif v_type = 'NOTA_PRIVADA_ARCHIVAR' then
    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'visibility', 'coach_only'
    ), true);
  end if;

  return jsonb_set(v_command, '{payload}', v_payload, true);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS_OR_VALUES' using errcode = '22023';
end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_register_iri_external_report_v12"("p_client_id" "uuid", "p_assessment_id" "uuid", "p_file_name" "text", "p_mime_type" "text", "p_size_bytes" bigint, "p_object_path" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid:=auth.uid();
  v_expected_path text;
  v_record public.iri_external_reports_v26%rowtype;
begin
  if v_actor is null then raise exception using errcode='28000',message='V124_AUTH_REQUIRED'; end if;
  if not public.iberfit_can_manage_iri_external_report_v12(p_client_id) then raise exception using errcode='42501',message='V124_COACH_ASSIGNMENT_REQUIRED'; end if;
  if p_client_id is null or p_assessment_id is null then raise exception using errcode='22023',message='V124_SCOPE_REQUIRED'; end if;
  if not exists(select 1 from public.iri_assessments i where i.id=p_assessment_id and i.client_id=p_client_id) then raise exception using errcode='22023',message='V124_IRI_NOT_FOUND'; end if;
  if coalesce(p_file_name,'')='' or length(p_file_name)>240 then raise exception using errcode='22023',message='V124_FILE_NAME_INVALID'; end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception using errcode='22023',message='V124_MIME_TYPE_INVALID'; end if;
  if p_size_bytes is null or p_size_bytes<1 or p_size_bytes>50000000 then raise exception using errcode='22023',message='V124_FILE_SIZE_INVALID'; end if;
  v_expected_path:=p_client_id::text||'/'||p_assessment_id::text||'/bioimpedancia';
  if p_object_path is distinct from v_expected_path then raise exception using errcode='22023',message='V124_OBJECT_PATH_INVALID'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='iberfit-iri-external-reports' and o.name=v_expected_path) then raise exception using errcode='P0001',message='V124_STORAGE_OBJECT_NOT_FOUND'; end if;

  insert into public.iri_external_reports_v26(
    client_id,assessment_id,bucket_id,object_path,file_name,mime_type,size_bytes,
    visible_to_client,version,uploaded_by,uploaded_at,updated_at
  ) values(
    p_client_id,p_assessment_id,'iberfit-iri-external-reports',v_expected_path,
    btrim(p_file_name),p_mime_type,p_size_bytes,true,1,v_actor,clock_timestamp(),clock_timestamp()
  )
  on conflict(assessment_id) do update set
    client_id=excluded.client_id,
    object_path=excluded.object_path,
    file_name=excluded.file_name,
    mime_type=excluded.mime_type,
    size_bytes=excluded.size_bytes,
    visible_to_client=true,
    version=public.iri_external_reports_v26.version+1,
    uploaded_by=v_actor,
    uploaded_at=clock_timestamp(),
    updated_at=clock_timestamp()
  returning * into v_record;

  return jsonb_build_object(
    'ok',true,
    'id',v_record.id,
    'clientId',v_record.client_id,
    'assessmentId',v_record.assessment_id,
    'bucketId',v_record.bucket_id,
    'objectPath',v_record.object_path,
    'fileName',v_record.file_name,
    'mimeType',v_record.mime_type,
    'sizeBytes',v_record.size_bytes,
    'visibleToClient',v_record.visible_to_client,
    'version',v_record.version,
    'uploadedAt',v_record.uploaded_at,
    'updatedAt',v_record.updated_at
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_request_appointment_change_v13"("p_appointment_id" "text", "p_client_id" "text", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_own_client text;
  v_item jsonb;
  v_start timestamptz;
  v_found boolean:=false;
  v_request public.appointment_change_requests;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;
  if nullif(btrim(p_appointment_id),'') is null
     or nullif(btrim(p_client_id),'') is null
     or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception using errcode='22023',message='V13_CHANGE_REQUEST_INVALID';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  v_own_client:=coalesce(
    v_snapshot#>>'{user,clientId}',
    v_snapshot#>>'{user,client_id}',
    ''
  );

  if v_role not in ('client','cliente') or v_own_client<>btrim(p_client_id) then
    raise exception using errcode='42501',message='V13_CLIENT_SCOPE_FORBIDDEN';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb))
  loop
    if coalesce(v_item->>'id',v_item->>'entityId',v_item->>'entity_id','')=btrim(p_appointment_id)
       and coalesce(v_item->>'clientId',v_item->>'client_id','')=btrim(p_client_id) then
      v_found:=true;
      begin
        v_start:=coalesce(
          nullif(v_item->>'startAt','')::timestamptz,
          nullif(v_item->>'start_at','')::timestamptz,
          nullif(v_item->>'scheduledAt','')::timestamptz,
          nullif(v_item->>'scheduled_at','')::timestamptz
        );
      exception when others then
        v_start:=null;
      end;
      exit;
    end if;
  end loop;

  if not v_found then
    raise exception using errcode='42501',message='V13_APPOINTMENT_NOT_VISIBLE';
  end if;
  if v_start is null
     or now()<v_start-interval '48 hours'
     or now()>=v_start-interval '2 hours' then
    raise exception using errcode='22023',message='V13_CONFIRMATION_WINDOW_CLOSED';
  end if;

  insert into public.appointment_change_requests(
    appointment_id,client_id,requester_user_id,reason,status
  )
  values(
    btrim(p_appointment_id),
    btrim(p_client_id),
    v_user,
    btrim(p_reason),
    'pending'
  )
  on conflict(appointment_id,requester_user_id) where status='pending'
  do update set
    reason=excluded.reason,
    created_at=now()
  returning * into v_request;

  return jsonb_build_object(
    'ok',true,
    'requestId',v_request.id,
    'appointmentId',v_request.appointment_id,
    'status',v_request.status,
    'createdAt',v_request.created_at
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."iberfit_resolve_appointment_change_v13"("p_request_id" "text", "p_resolution" "text", "p_note" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_request public.appointment_change_requests;
  v_resolution text:=lower(btrim(coalesce(p_resolution,'')));
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;
  if v_resolution not in ('accepted','rejected','resolved') then
    raise exception using errcode='22023',message='V13_RESOLUTION_INVALID';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  if v_role not in ('coach','entrenador','admin','administrador') then
    raise exception using errcode='42501',message='V13_ROLE_FORBIDDEN';
  end if;

  select * into v_request
  from public.appointment_change_requests
  where id::text=btrim(p_request_id)
    and status='pending'
  for update;

  if not found then
    raise exception using errcode='P0002',message='V13_CHANGE_REQUEST_NOT_FOUND';
  end if;

  if not exists(
    select 1
    from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb)) a
    where coalesce(a->>'id',a->>'entityId',a->>'entity_id','')=v_request.appointment_id
      and coalesce(a->>'clientId',a->>'client_id','')=v_request.client_id
  ) then
    raise exception using errcode='42501',message='V13_APPOINTMENT_NOT_VISIBLE';
  end if;

  update public.appointment_change_requests
     set status=v_resolution,
         resolved_at=now(),
         resolved_by=v_user,
         resolution_note=nullif(btrim(coalesce(p_note,'')),'')
   where id=v_request.id
  returning * into v_request;

  return jsonb_build_object(
    'ok',true,
    'requestId',v_request.id,
    'status',v_request.status,
    'resolvedAt',v_request.resolved_at
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."m26_audit_row_v43"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_row jsonb;
  v_client_id uuid;
  v_entity_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  v_client_id := nullif(
    v_row ->> 'client_id',
    ''
  )::uuid;

  v_entity_id := nullif(
    v_row ->> 'id',
    ''
  )::uuid;

  insert into public.m26_audit_events_v43 (
    actor_user_id,
    client_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    auth.uid(),
    v_client_id,
    'ROW_' || tg_op,
    tg_table_name,
    v_entity_id,
    jsonb_build_object(
      'operation',
      tg_op
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_backend_bootstrap_v43"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    true,
    'version',
    'RC43',
    'userId',
    auth.uid(),
    'clientId',
    public.iberfit_client_id(),
    'counts',
    jsonb_build_object(
      'measurements',
      (
        select count(*)
        from public.m26_client_measurements_v43
      ),
      'plans',
      (
        select count(*)
        from public.m26_training_plans_v43
      ),
      'sessions',
      (
        select count(*)
        from public.m26_training_sessions_v43
      ),
      'messages',
      (
        select count(*)
        from public.m26_messages_v43
      )
    )
  )
  where auth.uid() is not null;
$$;

CREATE OR REPLACE FUNCTION "public"."m26_backend_health_v43"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with backend_tables as (
    select unnest(
      array[
        'public.m26_schema_releases_v43',
        'public.m26_client_measurements_v43',
        'public.m26_training_plans_v43',
        'public.m26_training_sessions_v43',
        'public.m26_messages_v43',
        'public.m26_audit_events_v43'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,
      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from backend_tables
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 6 and rls_count = 6,
    'version',
    'RC43',
    'environment',
    'production',
    'tables',
    table_count,
    'rlsTables',
    rls_count,
    'productionModified',
    true,
    'productionDeployed',
    true
  )
  from table_state;
$$;

CREATE OR REPLACE FUNCTION "public"."m26_backend_health_v431"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with backend_tables as (
    select unnest(
      array[
        'public.m26_schema_releases_v43',
        'public.m26_client_measurements_v43',
        'public.m26_training_plans_v43',
        'public.m26_training_sessions_v43',
        'public.m26_messages_v43',
        'public.m26_audit_events_v43',
        'public.m26_session_drafts_v431'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,

      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from backend_tables
  ),
  policy_state as (
    select count(*) as policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'm26_session_drafts_v431'
  ),
  rpc_state as (
    select count(*) as rpc_count
    from unnest(
      array[
        'public.m26_draft_upsert_v431(jsonb)',
        'public.m26_draft_get_v431(uuid,text)',
        'public.m26_draft_delete_v431(uuid,text)'
      ]
    ) as rpc_name
    where to_regprocedure(rpc_name) is not null
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 7
      and rls_count = 7
      and policy_count >= 4
      and rpc_count = 3,
    'version',
    'RC43.1',
    'environment',
    'production',
    'tables',
    table_count,
    'rlsTables',
    rls_count,
    'draftPolicies',
    policy_count,
    'draftRpcs',
    rpc_count,
    'productionModified',
    true,
    'productionDeployed',
    true
  )
  from table_state
  cross join policy_state
  cross join rpc_state;
$$;

CREATE OR REPLACE FUNCTION "public"."m26_draft_delete_v431"("p_client_id" "uuid", "p_scope" "text" DEFAULT 'session-builder'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope <> 'session-builder'
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
    'ok',
    true,
    'deleted',
    v_id is not null,
    'clientId',
    p_client_id,
    'scope',
    p_scope
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_draft_get_v431"("p_client_id" "uuid", "p_scope" "text" DEFAULT 'session-builder'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
  v_draft jsonb;
  v_revision bigint;
  v_client_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    p_client_id is null
    or p_scope <> 'session-builder'
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
      'ok',
      true,
      'found',
      false,
      'clientId',
      p_client_id,
      'scope',
      p_scope
    );
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'found',
    true,
    'id',
    v_id,
    'clientId',
    p_client_id,
    'scope',
    p_scope,
    'draft',
    v_draft,
    'revision',
    v_revision,
    'clientRevision',
    v_client_revision,
    'updatedAt',
    v_updated_at
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_draft_upsert_v431"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
  v_client_id uuid;
  v_scope text;
  v_draft jsonb;
  v_client_revision bigint;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC431_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 125000
  then
    raise exception 'M26_RC431_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_scope := coalesce(
    nullif(
      trim(p_payload ->> 'scope'),
      ''
    ),
    'session-builder'
  );

  v_draft := p_payload -> 'draft';

  v_client_revision := greatest(
    coalesce(
      nullif(
        p_payload ->> 'revision',
        ''
      )::bigint,
      0
    ),
    0
  );

  if
    v_client_id is null
    or v_scope <> 'session-builder'
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
  on conflict (
    owner_user_id,
    client_id,
    scope
  )
  do update set
    draft_payload = excluded.draft_payload,
    client_revision = excluded.client_revision,
    updated_at = now()
  returning
    id,
    revision,
    updated_at
  into
    v_id,
    v_revision,
    v_updated_at;

  return jsonb_build_object(
    'ok',
    true,
    'saved',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id,
    'scope',
    v_scope,
    'revision',
    v_revision,
    'clientRevision',
    v_client_revision,
    'updatedAt',
    v_updated_at
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_json_has_forbidden_key_v44"("p_value" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  v_key text;
  v_child jsonb;
begin
  if p_value is null then
    return false;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select key, value
      from jsonb_each(p_value)
    loop
      if lower(v_key) = any (
        array[
          'password',
          'token',
          'access_token',
          'refresh_token',
          'service_role',
          'secret',
          'authorization',
          'client_secret',
          'email',
          'phone',
          'telefono',
          'name',
          'nombre'
        ]
      ) then
        return true;
      end if;

      if public.m26_json_has_forbidden_key_v44(
        v_child
      ) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in
      select value
      from jsonb_array_elements(p_value)
    loop
      if public.m26_json_has_forbidden_key_v44(
        v_child
      ) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_json_safe_v43"("p_value" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when jsonb_typeof(
      coalesce(p_value, '{}'::jsonb)
    ) <> 'object' then false
    when octet_length(
      coalesce(p_value, '{}'::jsonb)::text
    ) > 120000 then false
    else not exists (
      select 1
      from jsonb_object_keys(
        coalesce(p_value, '{}'::jsonb)
      ) as key_name
      where lower(key_name) = any (
        array[
          'password',
          'token',
          'access_token',
          'refresh_token',
          'service_role',
          'secret',
          'authorization',
          'email',
          'phone',
          'telefono'
        ]
      )
    )
  end;
$$;

CREATE OR REPLACE FUNCTION "public"."m26_record_measurement_v43"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
  v_client_id uuid;
  v_metric text;
  v_value numeric;
  v_unit text;
  v_source text;
  v_measured_at timestamptz;
  v_notes text;
  v_metadata jsonb;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_metric := lower(
    trim(p_payload ->> 'metric')
  );

  v_value := (
    p_payload ->> 'value'
  )::numeric;

  v_unit := trim(
    p_payload ->> 'unit'
  );

  v_source := coalesce(
    nullif(
      lower(trim(p_payload ->> 'source')),
      ''
    ),
    'manual'
  );

  v_measured_at := coalesce(
    nullif(
      p_payload ->> 'measuredAt',
      ''
    )::timestamptz,
    now()
  );

  v_notes := nullif(
    trim(p_payload ->> 'notes'),
    ''
  );

  v_metadata := coalesce(
    p_payload -> 'metadata',
    '{}'::jsonb
  );

  insert into public.m26_client_measurements_v43 (
    client_id,
    metric,
    value,
    unit,
    measured_at,
    source,
    notes,
    metadata
  )
  values (
    v_client_id,
    v_metric,
    v_value,
    v_unit,
    v_measured_at,
    v_source,
    v_notes,
    v_metadata
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_save_training_session_v43"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
  v_client_id uuid;
  v_plan_id uuid;
  v_title text;
  v_status text;
  v_scheduled_at timestamptz;
  v_session_payload jsonb;
  v_result_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_id := nullif(
    p_payload ->> 'id',
    ''
  )::uuid;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_plan_id := nullif(
    p_payload ->> 'planId',
    ''
  )::uuid;

  v_title := trim(
    p_payload ->> 'title'
  );

  v_status := coalesce(
    nullif(
      lower(trim(p_payload ->> 'status')),
      ''
    ),
    'planned'
  );

  v_scheduled_at := nullif(
    p_payload ->> 'scheduledAt',
    ''
  )::timestamptz;

  v_session_payload := coalesce(
    p_payload -> 'session',
    '{}'::jsonb
  );

  v_result_payload := coalesce(
    p_payload -> 'result',
    '{}'::jsonb
  );

  if v_id is null then
    insert into public.m26_training_sessions_v43 (
      client_id,
      plan_id,
      title,
      status,
      scheduled_at,
      session_payload,
      result_payload
    )
    values (
      v_client_id,
      v_plan_id,
      v_title,
      v_status,
      v_scheduled_at,
      v_session_payload,
      v_result_payload
    )
    returning id into v_id;
  else
    update public.m26_training_sessions_v43
    set
      plan_id = v_plan_id,
      title = v_title,
      status = v_status,
      scheduled_at = v_scheduled_at,
      session_payload = v_session_payload,
      result_payload = v_result_payload
    where id = v_id
      and client_id = v_client_id
    returning id into v_id;

    if not found then
      raise exception 'M26_RC43_SESSION_NOT_FOUND';
    end if;
  end if;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_send_message_v43"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
  v_client_id uuid;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'M26_RC43_AUTH_REQUIRED';
  end if;

  if not public.m26_json_safe_v43(p_payload) then
    raise exception 'M26_RC43_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_body := trim(
    p_payload ->> 'body'
  );

  insert into public.m26_messages_v43 (
    client_id,
    body
  )
  values (
    v_client_id,
    v_body
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_telemetry_can_access_client_v59"("target_client" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    target_client is not null
    and (
      target_client = public.iberfit_client_id()
      or exists (
        select 1
        from public.iberfit_coach_client_assignments a
        join public.iberfit_organization_memberships m
          on m.organization_id = a.organization_id
         and m.user_id = a.coach_user_id
         and m.status = 'active'
        where a.coach_user_id = auth.uid()
          and a.client_id = target_client::text
          and a.status = 'active'
          and a.starts_at <= current_date
          and (
            a.ends_at is null
            or a.ends_at >= current_date
          )
      )
    );
$$;

CREATE OR REPLACE FUNCTION "public"."m26_telemetry_delete_own_v59"("p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_deleted_events integer := 0;
  v_deleted_batches integer := 0;
begin
  if v_actor is null then
    raise exception using
      errcode = '28000',
      message = 'M26_RC59_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();

  if v_client_id is null then
    raise exception using
      errcode = '42501',
      message = 'M26_RC59_CLIENT_SELF_REQUIRED';
  end if;

  delete from public.m26_telemetry_events_v59
  where client_id = v_client_id
    and (
      p_before is null
      or recorded_at < p_before
    );

  get diagnostics v_deleted_events = row_count;

  delete from public.m26_telemetry_import_batches_v59
  where client_id = v_client_id
    and (
      p_before is null
      or created_at < p_before
    );

  get diagnostics v_deleted_batches = row_count;

  return jsonb_build_object(
    'ok', true,
    'clientId', v_client_id,
    'deletedEvents', v_deleted_events,
    'deletedBatchMetadata', v_deleted_batches
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_telemetry_event_valid_v59"("p_event" "jsonb", "p_client_id" "uuid", "p_session_id" "text", "p_execution_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
declare
  v_rr jsonb;
  v_recorded_at timestamptz;
  v_received_at timestamptz;
  v_hr numeric;
  v_set_number integer;
begin
  if
    p_event is null
    or jsonb_typeof(p_event) <> 'object'
    or octet_length(p_event::text) > 12000
    or not public.m26_telemetry_json_safe_v59(p_event)
    or p_event ? 'derived'
  then
    return false;
  end if;

  if
    p_event ->> 'schemaVersion' <> 'iberfit.telemetry.v1'
    or p_event ->> 'eventType' <> 'heart_rate_sample'
    or coalesce(p_event ->> 'eventId','')
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or p_event ->> 'clientId' <> p_client_id::text
    or p_event ->> 'sessionId' <> p_session_id
    or p_event ->> 'executionId' <> p_execution_id
  then
    return false;
  end if;

  if
    p_session_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or p_execution_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
  then
    return false;
  end if;

  begin
    v_recorded_at := (p_event ->> 'recordedAt')::timestamptz;
    v_received_at := (p_event ->> 'receivedAt')::timestamptz;
  exception
    when others then
      return false;
  end;

  if v_recorded_at is null or v_received_at is null then
    return false;
  end if;

  if
    jsonb_typeof(p_event -> 'context') <> 'object'
    or jsonb_typeof(p_event -> 'source') <> 'object'
    or jsonb_typeof(p_event -> 'quality') <> 'object'
    or jsonb_typeof(p_event -> 'raw') <> 'object'
    or jsonb_typeof(p_event -> 'provenance') <> 'object'
  then
    return false;
  end if;

  if
    coalesce(p_event #>> '{context,phase}','')
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,39}$'
    or (
      p_event #>> '{context,blockId}' is not null
      and p_event #>> '{context,blockId}'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    )
    or (
      p_event #>> '{context,exerciseId}' is not null
      and p_event #>> '{context,exerciseId}'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    )
  then
    return false;
  end if;

  begin
    if p_event #>> '{context,setNumber}' is not null then
      v_set_number := (p_event #>> '{context,setNumber}')::integer;
      if v_set_number < 1 or v_set_number > 10000 then
        return false;
      end if;
    end if;
  exception
    when others then
      return false;
  end;

  if
    p_event #>> '{source,provider}' not in (
      'apple_health',
      'wear_os_health_services',
      'ble_direct'
    )
    or coalesce(p_event #>> '{source,deviceType}','unknown') not in (
      'watch',
      'chest_strap',
      'arm_band',
      'sensor',
      'phone',
      'unknown'
    )
    or (
      p_event #>> '{source,providerId}' is not null
      and p_event #>> '{source,providerId}'
        !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    )
    or (
      p_event #>> '{source,transport}' is not null
      and p_event #>> '{source,transport}'
        !~ '^[a-z0-9][a-z0-9._:-]{0,79}$'
    )
  then
    return false;
  end if;

  if
    coalesce(p_event #>> '{quality,grade}','limitada') not in (
      'alta',
      'media',
      'limitada'
    )
    or (
      p_event #>> '{quality,code}' is not null
      and p_event #>> '{quality,code}' not in (
        'valid',
        'acquiring',
        'poor_contact',
        'stale',
        'out_of_range',
        'disconnected',
        'unsupported'
      )
    )
    or coalesce(
      p_event #>> '{quality,contactStatus}',
      'unknown'
    ) not in (
      'detected',
      'not_detected',
      'unsupported',
      'unknown'
    )
  then
    return false;
  end if;

  if jsonb_typeof(p_event #> '{raw,heartRateBpm}') <> 'number' then
    return false;
  end if;

  begin
    v_hr := (p_event #>> '{raw,heartRateBpm}')::numeric;
  exception
    when others then
      return false;
  end;

  if v_hr is null then
    return false;
  end if;

  if jsonb_typeof(p_event #> '{raw,rrIntervalsMs}') <> 'array' then
    return false;
  end if;

  if jsonb_array_length(p_event #> '{raw,rrIntervalsMs}') > 128 then
    return false;
  end if;

  for v_rr in
    select value
    from jsonb_array_elements(
      p_event #> '{raw,rrIntervalsMs}'
    )
  loop
    if jsonb_typeof(v_rr) <> 'number' then
      return false;
    end if;

    begin
      if (v_rr #>> '{}')::numeric <= 0 then
        return false;
      end if;
    exception
      when others then
        return false;
    end;
  end loop;

  if
    p_event #>> '{provenance,origin}' <> 'live_sensor'
    or p_event #>> '{provenance,capturedBy}' <> 'm26-web'
    or coalesce(
      p_event #>> '{provenance,timestampOrigin}',
      ''
    ) not in (
      'sensor',
      'receive_time',
      'source_or_receive_unverified'
    )
    or coalesce(
      (p_event #>> '{provenance,rawPreserved}')::boolean,
      false
    ) is not true
  then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end
$_$;

CREATE OR REPLACE FUNCTION "public"."m26_telemetry_import_v59"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_session_id text;
  v_execution_id text;
  v_events jsonb;
  v_event jsonb;
  v_event_id text;
  v_existing jsonb;
  v_rows integer;
  v_payload_bytes integer;

  v_accepted jsonb := '[]'::jsonb;
  v_duplicate jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
  v_rejected_reasons jsonb := '{}'::jsonb;

  v_accepted_count integer := 0;
  v_duplicate_count integer := 0;
  v_rejected_count integer := 0;
begin
  if v_actor is null then
    raise exception using
      errcode = '28000',
      message = 'M26_RC59_AUTH_REQUIRED';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_IMPORT_PAYLOAD_INVALID';
  end if;

  v_payload_bytes := octet_length(p_payload::text);

  if
    v_payload_bytes < 20
    or v_payload_bytes > 192000
    or not public.m26_telemetry_json_safe_v59(p_payload)
  then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_IMPORT_PAYLOAD_INVALID';
  end if;

  if p_payload ->> 'schemaVersion'
    <> 'iberfit.telemetry.remote.v1'
  then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_REMOTE_SCHEMA_INVALID';
  end if;

  begin
    v_client_id := (p_payload ->> 'clientId')::uuid;
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'M26_RC59_CLIENT_ID_INVALID';
  end;

  v_session_id := trim(coalesce(p_payload ->> 'sessionId',''));
  v_execution_id := trim(coalesce(p_payload ->> 'executionId',''));
  v_events := p_payload -> 'events';

  if
    v_session_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or v_execution_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    or jsonb_typeof(v_events) <> 'array'
    or jsonb_array_length(v_events) < 1
    or jsonb_array_length(v_events) > 100
  then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_IMPORT_BATCH_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_events) item
    group by item ->> 'eventId'
    having count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'M26_RC59_BATCH_EVENT_ID_DUPLICATE';
  end if;
  if not (
    v_client_id = public.iberfit_client_id()
    or public.m26_telemetry_can_access_client_v59(v_client_id)
  ) then
    raise exception using
      errcode = '42501',
      message = 'M26_RC59_CLIENT_SCOPE_FORBIDDEN';
  end if;

  for v_event in
    select value
    from jsonb_array_elements(v_events)
  loop
    v_event_id := trim(coalesce(v_event ->> 'eventId',''));

    if v_event_id
      !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
    then
      raise exception using
        errcode = '22023',
        message = 'M26_RC59_EVENT_ID_INVALID';
    end if;

    if not public.m26_telemetry_event_valid_v59(
      v_event,
      v_client_id,
      v_session_id,
      v_execution_id
    ) then
      v_rejected := v_rejected || jsonb_build_array(v_event_id);
      v_rejected_reasons :=
        v_rejected_reasons
        || jsonb_build_object(
          v_event_id,
          'M26_RC59_EVENT_INVALID'
        );
      v_rejected_count := v_rejected_count + 1;
      continue;
    end if;

    insert into public.m26_telemetry_events_v59 (
      client_id,
      event_id,
      session_id,
      execution_id,
      event_type,
      source_provider,
      recorded_at,
      received_at,
      canonical_event,
      imported_by,
      expires_at
    )
    values (
      v_client_id,
      v_event_id,
      v_session_id,
      v_execution_id,
      v_event ->> 'eventType',
      v_event #>> '{source,provider}',
      (v_event ->> 'recordedAt')::timestamptz,
      (v_event ->> 'receivedAt')::timestamptz,
      v_event,
      v_actor,
      now() + interval '180 days'
    )
    on conflict (
      client_id,
      event_id
    )
    do nothing;

    get diagnostics v_rows = row_count;

    if v_rows = 1 then
      v_accepted := v_accepted || jsonb_build_array(v_event_id);
      v_accepted_count := v_accepted_count + 1;
      continue;
    end if;

    select canonical_event
    into v_existing
    from public.m26_telemetry_events_v59
    where client_id = v_client_id
      and event_id = v_event_id;

    if v_existing = v_event then
      v_duplicate := v_duplicate || jsonb_build_array(v_event_id);
      v_duplicate_count := v_duplicate_count + 1;
    else
      v_rejected := v_rejected || jsonb_build_array(v_event_id);
      v_rejected_reasons :=
        v_rejected_reasons
        || jsonb_build_object(
          v_event_id,
          'M26_RC59_EVENT_ID_COLLISION'
        );
      v_rejected_count := v_rejected_count + 1;
    end if;
  end loop;

  insert into public.m26_telemetry_import_batches_v59 (
    actor_user_id,
    client_id,
    session_id,
    execution_id,
    received_count,
    accepted_count,
    duplicate_count,
    rejected_count,
    payload_bytes
  )
  values (
    v_actor,
    v_client_id,
    v_session_id,
    v_execution_id,
    jsonb_array_length(v_events),
    v_accepted_count,
    v_duplicate_count,
    v_rejected_count,
    v_payload_bytes
  );

  return jsonb_build_object(
    'ok', true,
    'schemaVersion', 'iberfit.telemetry.remote.v1',
    'clientId', v_client_id,
    'sessionId', v_session_id,
    'executionId', v_execution_id,
    'acceptedEventIds', v_accepted,
    'duplicateEventIds', v_duplicate,
    'rejectedEventIds', v_rejected,
    'rejectedReasons', v_rejected_reasons,
    'received', jsonb_array_length(v_events),
    'accepted', v_accepted_count,
    'duplicate', v_duplicate_count,
    'rejected', v_rejected_count
  );
end
$_$;

CREATE OR REPLACE FUNCTION "public"."m26_telemetry_json_safe_v59"("p_value" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  v_key text;
  v_normalized_key text;
  v_child jsonb;
begin
  if p_value is null then
    return false;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select key, value
      from jsonb_each(p_value)
    loop
      v_normalized_key := lower(
        regexp_replace(v_key,'[^a-z0-9]','','g')
      );

      if v_normalized_key = any (
        array[
          'password',
          'token',
          'accesstoken',
          'refreshtoken',
          'servicerole',
          'secret',
          'authorization',
          'clientsecret',
          'email',
          'phone',
          'telefono',
          'name',
          'nombre',
          'deviceid',
          'mac',
          'macaddress',
          'gatt',
          'gattid',
          'serial',
          'serialnumber'
        ]
      ) then
        return false;
      end if;

      if not public.m26_telemetry_json_safe_v59(v_child) then
        return false;
      end if;
    end loop;

    return true;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    for v_child in
      select value
      from jsonb_array_elements(p_value)
    loop
      if not public.m26_telemetry_json_safe_v59(v_child) then
        return false;
      end if;
    end loop;

    return true;
  end if;

  return true;
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_telemetry_purge_expired_v59"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_deleted integer := 0;
begin
  delete from public.m26_telemetry_events_v59
  where expires_at <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_telemetry_read_page_v59"("p_client_id" "uuid", "p_before" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_limit" integer DEFAULT 500) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor uuid := auth.uid();
  v_limit integer;
  v_events jsonb;
  v_next_before timestamptz;
begin
  if v_actor is null then
    raise exception using
      errcode = '28000',
      message = 'M26_RC59_AUTH_REQUIRED';
  end if;

  if not (
    p_client_id = public.iberfit_client_id()
    or public.m26_telemetry_can_access_client_v59(p_client_id)
  ) then
    raise exception using
      errcode = '42501',
      message = 'M26_RC59_CLIENT_SCOPE_FORBIDDEN';
  end if;

  v_limit := greatest(
    1,
    least(
      1000,
      coalesce(p_limit,500)
    )
  );

  with page as (
    select
      canonical_event,
      recorded_at,
      event_id
    from public.m26_telemetry_events_v59
    where client_id = p_client_id
      and (
        p_before is null
        or recorded_at < p_before
      )
    order by
      recorded_at desc,
      event_id desc
    limit v_limit
  )
  select
    coalesce(
      jsonb_agg(
        canonical_event
        order by recorded_at desc, event_id desc
      ),
      '[]'::jsonb
    ),
    min(recorded_at)
  into
    v_events,
    v_next_before
  from page;

  return jsonb_build_object(
    'ok', true,
    'clientId', p_client_id,
    'events', v_events,
    'nextBefore', v_next_before,
    'limit', v_limit
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_touch_updated_at_v43"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();

  if to_jsonb(new) ? 'revision' then
    new.revision := coalesce(old.revision, 0) + 1;
  end if;

  return new;
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_wearable_bootstrap_v44"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    true,
    'version',
    'RC44',
    'connections',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'status',
            status,
            'syncEnabled',
            sync_enabled,
            'scopes',
            granted_scopes,
            'lastSyncedAt',
            last_synced_at,
            'revision',
            revision
          )
          order by provider
        )
        from public.m26_wearable_connections_v44
      ),
      '[]'::jsonb
    ),
    'dailySummaries',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'date',
            record_date,
            'metrics',
            jsonb_build_object(
              'steps',
              steps,
              'activeMinutes',
              active_minutes,
              'sleepMinutes',
              sleep_minutes,
              'restingHeartRate',
              resting_heart_rate,
              'hrvMs',
              hrv_ms,
              'activeEnergyKcal',
              active_energy_kcal,
              'workoutMinutes',
              workout_minutes
            ),
            'quality',
            quality,
            'sourceUpdatedAt',
            source_updated_at,
            'sourceRecordCount',
            source_record_count,
            'revision',
            revision
          )
          order by record_date desc, provider
        )
        from public.m26_wearable_daily_summaries_v44
      ),
      '[]'::jsonb
    ),
    'consents',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            id,
            'clientId',
            client_id,
            'provider',
            provider,
            'action',
            action,
            'scopes',
            scopes,
            'createdAt',
            created_at
          )
          order by created_at desc
        )
        from public.m26_wearable_consents_v44
      ),
      '[]'::jsonb
    )
  )
  where auth.uid() is not null;
$$;

CREATE OR REPLACE FUNCTION "public"."m26_wearable_connection_upsert_v44"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
  v_client_id uuid;
  v_provider text;
  v_status text;
  v_sync_enabled boolean;
  v_scopes text[];
  v_metadata jsonb;
  v_action text;
  v_last_synced_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or public.m26_json_has_forbidden_key_v44(
      p_payload
    )
    or octet_length(p_payload::text) > 20000
  then
    raise exception 'M26_RC44_CONNECTION_PAYLOAD_INVALID';
  end if;

  v_client_id := nullif(
    p_payload ->> 'clientId',
    ''
  )::uuid;

  v_provider := lower(
    trim(p_payload ->> 'provider')
  );

  v_status := coalesce(
    nullif(
      lower(trim(p_payload ->> 'status')),
      ''
    ),
    'active'
  );

  v_sync_enabled := coalesce(
    (p_payload ->> 'syncEnabled')::boolean,
    v_status = 'active'
  );

  v_scopes := array(
    select distinct value
    from jsonb_array_elements_text(
      coalesce(
        p_payload -> 'scopes',
        '[]'::jsonb
      )
    )
    where value = any (
      array[
        'steps',
        'activeMinutes',
        'sleepMinutes',
        'restingHeartRate',
        'hrvMs',
        'activeEnergyKcal',
        'workoutMinutes'
      ]
    )
    order by value
  );

  v_metadata := coalesce(
    p_payload -> 'metadata',
    '{}'::jsonb
  );

  v_last_synced_at := nullif(
    p_payload ->> 'lastSyncedAt',
    ''
  )::timestamptz;

  if
    v_client_id is null
    or v_client_id <> public.iberfit_client_id()
    or v_provider not in (
      'normalized_file',
      'health_connect',
      'samsung_health',
      'apple_health',
      'strava',
      'garmin_connect',
      'fitbit',
      'oura'
    )
    or v_status not in (
      'active',
      'paused',
      'revoked'
    )
  then
    raise exception 'M26_RC44_CONNECTION_INVALID';
  end if;

  insert into public.m26_wearable_connections_v44 (
    owner_user_id,
    client_id,
    provider,
    status,
    sync_enabled,
    granted_scopes,
    consent_version,
    last_synced_at,
    metadata
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    v_status,
    v_sync_enabled,
    v_scopes,
    'v44-zero-cost',
    v_last_synced_at,
    v_metadata
  )
  on conflict (
    owner_user_id,
    client_id,
    provider
  )
  do update set
    status = excluded.status,
    sync_enabled = excluded.sync_enabled,
    granted_scopes = excluded.granted_scopes,
    last_synced_at = excluded.last_synced_at,
    metadata = excluded.metadata
  returning id into v_id;

  v_action := case
    when v_status = 'paused' then 'pause'
    when v_status = 'revoked' then 'revoke'
    when v_sync_enabled then 'grant'
    else 'pause'
  end;

  insert into public.m26_wearable_consents_v44 (
    actor_user_id,
    client_id,
    provider,
    action,
    scopes,
    policy_version
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    v_action,
    v_scopes,
    'v44-zero-cost'
  );

  return jsonb_build_object(
    'ok',
    true,
    'saved',
    true,
    'id',
    v_id,
    'clientId',
    v_client_id,
    'provider',
    v_provider,
    'status',
    v_status,
    'syncEnabled',
    v_sync_enabled
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_wearable_delete_all_v44"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();

  if v_client_id is null then
    raise exception 'M26_RC44_CLIENT_REQUIRED';
  end if;

  for v_provider in
    select distinct provider
    from (
      select provider
      from public.m26_wearable_connections_v44
      where client_id = v_client_id

      union

      select provider
      from public.m26_wearable_daily_summaries_v44
      where client_id = v_client_id
    ) providers
  loop
    insert into public.m26_wearable_consents_v44 (
      actor_user_id,
      client_id,
      provider,
      action,
      scopes,
      policy_version
    )
    values (
      auth.uid(),
      v_client_id,
      v_provider,
      'delete',
      '{}'::text[],
      'v44-zero-cost'
    );
  end loop;

  delete from public.m26_wearable_daily_summaries_v44
  where client_id = v_client_id;

  get diagnostics
    v_deleted = row_count;

  delete from public.m26_wearable_connections_v44
  where owner_user_id = auth.uid()
    and client_id = v_client_id;

  return jsonb_build_object(
    'ok',
    true,
    'deleted',
    true,
    'recordsDeleted',
    v_deleted,
    'clientId',
    v_client_id
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_wearable_health_v44"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with wearable_tables as (
    select unnest(
      array[
        'public.m26_wearable_connections_v44',
        'public.m26_wearable_daily_summaries_v44',
        'public.m26_wearable_consents_v44'
      ]
    ) as relation_name
  ),
  table_state as (
    select
      count(*) filter (
        where to_regclass(relation_name) is not null
      ) as table_count,

      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from wearable_tables
  ),
  policy_state as (
    select count(*) as policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'm26_wearable_connections_v44',
        'm26_wearable_daily_summaries_v44',
        'm26_wearable_consents_v44'
      )
  ),
  rpc_state as (
    select count(*) as rpc_count
    from unnest(
      array[
        'public.m26_wearable_bootstrap_v44()',
        'public.m26_wearable_import_v44(jsonb)',
        'public.m26_wearable_connection_upsert_v44(jsonb)',
        'public.m26_wearable_revoke_v44(text,boolean)',
        'public.m26_wearable_delete_all_v44()'
      ]
    ) as rpc_name
    where to_regprocedure(rpc_name) is not null
  )
  select jsonb_build_object(
    'ok',
    true,
    'ready',
    table_count = 3
      and rls_count = 3
      and policy_count >= 10
      and rpc_count = 5,
    'version',
    'RC44',
    'environment',
    'production',
    'wearableTables',
    table_count,
    'wearableRls',
    rls_count,
    'wearablePolicies',
    policy_count,
    'wearableRpcs',
    rpc_count,
    'productionModified',
    true,
    'productionDeployed',
    true
  )
  from table_state
  cross join policy_state
  cross join rpc_state;
$$;

CREATE OR REPLACE FUNCTION "public"."m26_wearable_import_v44"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_records jsonb;
  v_record jsonb;
  v_metrics jsonb;
  v_client_id uuid;
  v_provider text;
  v_date date;
  v_source_updated_at timestamptz;
  v_source_count integer;
  v_quality text;
  v_steps integer;
  v_active_minutes integer;
  v_sleep_minutes integer;
  v_resting_hr numeric;
  v_hrv numeric;
  v_energy numeric;
  v_workout_minutes integer;
  v_row_count integer;
  v_accepted integer := 0;
  v_stale integer := 0;
  v_rejected integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  if
    jsonb_typeof(p_payload) <> 'object'
    or public.m26_json_has_forbidden_key_v44(
      p_payload
    )
    or octet_length(p_payload::text) > 900000
  then
    raise exception 'M26_RC44_IMPORT_PAYLOAD_INVALID';
  end if;

  v_records := p_payload -> 'records';

  if
    jsonb_typeof(v_records) <> 'array'
    or jsonb_array_length(v_records) < 1
    or jsonb_array_length(v_records) > 250
  then
    raise exception 'M26_RC44_IMPORT_BATCH_INVALID';
  end if;

  for v_record in
    select value
    from jsonb_array_elements(v_records)
  loop
    begin
      v_client_id := nullif(
        v_record ->> 'clientId',
        ''
      )::uuid;

      v_provider := lower(
        trim(v_record ->> 'provider')
      );

      v_date := nullif(
        v_record ->> 'date',
        ''
      )::date;

      v_metrics := v_record -> 'metrics';

      if
        v_client_id is null
        or v_client_id <> public.iberfit_client_id()
        or v_provider not in (
          'normalized_file',
          'health_connect',
          'samsung_health',
          'apple_health',
          'strava',
          'garmin_connect',
          'fitbit',
          'oura'
        )
        or v_date is null
        or jsonb_typeof(v_metrics) <> 'object'
      then
        raise exception 'M26_RC44_IMPORT_RECORD_INVALID';
      end if;

      v_steps := round(
        nullif(
          v_metrics ->> 'steps',
          ''
        )::numeric
      )::integer;

      v_active_minutes := round(
        nullif(
          v_metrics ->> 'activeMinutes',
          ''
        )::numeric
      )::integer;

      v_sleep_minutes := round(
        nullif(
          v_metrics ->> 'sleepMinutes',
          ''
        )::numeric
      )::integer;

      v_resting_hr := nullif(
        v_metrics ->> 'restingHeartRate',
        ''
      )::numeric;

      v_hrv := nullif(
        v_metrics ->> 'hrvMs',
        ''
      )::numeric;

      v_energy := nullif(
        v_metrics ->> 'activeEnergyKcal',
        ''
      )::numeric;

      v_workout_minutes := round(
        nullif(
          v_metrics ->> 'workoutMinutes',
          ''
        )::numeric
      )::integer;

      v_quality := coalesce(
        nullif(
          lower(trim(v_record ->> 'quality')),
          ''
        ),
        'limitada'
      );

      v_source_updated_at := coalesce(
        nullif(
          v_record ->> 'sourceUpdatedAt',
          ''
        )::timestamptz,
        (v_date::text || 'T12:00:00Z')::timestamptz
      );

      v_source_count := greatest(
        1,
        least(
          100000,
          coalesce(
            nullif(
              v_record ->> 'sourceRecordCount',
              ''
            )::integer,
            1
          )
        )
      );

      insert into
      public.m26_wearable_daily_summaries_v44 (
        client_id,
        provider,
        record_date,
        steps,
        active_minutes,
        sleep_minutes,
        resting_heart_rate,
        hrv_ms,
        active_energy_kcal,
        workout_minutes,
        quality,
        source_updated_at,
        source_record_count,
        imported_by
      )
      values (
        v_client_id,
        v_provider,
        v_date,
        v_steps,
        v_active_minutes,
        v_sleep_minutes,
        v_resting_hr,
        v_hrv,
        v_energy,
        v_workout_minutes,
        v_quality,
        v_source_updated_at,
        v_source_count,
        auth.uid()
      )
      on conflict (
        client_id,
        provider,
        record_date
      )
      do update set
        steps = excluded.steps,
        active_minutes = excluded.active_minutes,
        sleep_minutes = excluded.sleep_minutes,
        resting_heart_rate = excluded.resting_heart_rate,
        hrv_ms = excluded.hrv_ms,
        active_energy_kcal = excluded.active_energy_kcal,
        workout_minutes = excluded.workout_minutes,
        quality = excluded.quality,
        source_updated_at = excluded.source_updated_at,
        source_record_count = excluded.source_record_count,
        imported_by = auth.uid()
      where
        public.m26_wearable_daily_summaries_v44
          .source_updated_at
        <= excluded.source_updated_at;

      get diagnostics
        v_row_count = row_count;

      if v_row_count = 1 then
        v_accepted := v_accepted + 1;
      else
        v_stale := v_stale + 1;
      end if;
    exception
      when others then
        v_rejected := v_rejected + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok',
    true,
    'accepted',
    v_accepted,
    'stale',
    v_stale,
    'rejected',
    v_rejected,
    'total',
    jsonb_array_length(v_records)
  );
end
$$;

CREATE OR REPLACE FUNCTION "public"."m26_wearable_revoke_v44"("p_provider" "text", "p_delete_data" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();
  v_provider := lower(trim(p_provider));

  if
    v_client_id is null
    or v_provider not in (
      'normalized_file',
      'health_connect',
      'samsung_health',
      'apple_health',
      'strava',
      'garmin_connect',
      'fitbit',
      'oura'
    )
  then
    raise exception 'M26_RC44_REVOKE_INVALID';
  end if;

  update public.m26_wearable_connections_v44
  set
    status = 'revoked',
    sync_enabled = false
  where owner_user_id = auth.uid()
    and client_id = v_client_id
    and provider = v_provider;

  if coalesce(p_delete_data, false) then
    delete from public.m26_wearable_daily_summaries_v44
    where client_id = v_client_id
      and provider = v_provider;

    get diagnostics
      v_deleted = row_count;
  end if;

  insert into public.m26_wearable_consents_v44 (
    actor_user_id,
    client_id,
    provider,
    action,
    scopes,
    policy_version
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    case
      when coalesce(p_delete_data, false)
        then 'delete'
      else 'revoke'
    end,
    '{}'::text[],
    'v44-zero-cost'
  );

  return jsonb_build_object(
    'ok',
    true,
    'revoked',
    true,
    'provider',
    v_provider,
    'deleted',
    v_deleted
  );
end
$$;

-- === V12.4 CURRENT STORAGE STATE ===
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'iberfit-iri-external-reports',
  'iberfit-iri-external-reports',
  false,
  50000000,
  array['application/pdf','image/jpeg','image/png']::text[]
)
on conflict(id) do update set
  name=excluded.name,
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists iri_external_object_read_v12 on storage.objects;
create policy iri_external_object_read_v12
on storage.objects for select to authenticated
using(
  bucket_id='iberfit-iri-external-reports'
  and name=(public.iberfit_external_report_path_client_v12(name))::text||'/'||(public.iberfit_external_report_path_assessment_v12(name))::text||'/bioimpedancia'
  and public.iberfit_can_read_iri_external_report_v12(public.iberfit_external_report_path_client_v12(name))
  and exists(
    select 1 from public.iri_external_reports_v26 r
    where r.client_id=public.iberfit_external_report_path_client_v12(name)
      and r.assessment_id=public.iberfit_external_report_path_assessment_v12(name)
      and r.object_path=name
      and (r.visible_to_client or public.iberfit_can_manage_iri_external_report_v12(r.client_id))
  )
);

drop policy if exists iri_external_object_insert_v12 on storage.objects;
create policy iri_external_object_insert_v12
on storage.objects for insert to authenticated
with check(
  bucket_id='iberfit-iri-external-reports'
  and name=(public.iberfit_external_report_path_client_v12(name))::text||'/'||(public.iberfit_external_report_path_assessment_v12(name))::text||'/bioimpedancia'
  and public.iberfit_can_manage_iri_external_report_v12(public.iberfit_external_report_path_client_v12(name))
);

drop policy if exists iri_external_object_update_v12 on storage.objects;
create policy iri_external_object_update_v12
on storage.objects for update to authenticated
using(
  bucket_id='iberfit-iri-external-reports'
  and public.iberfit_can_manage_iri_external_report_v12(public.iberfit_external_report_path_client_v12(name))
)
with check(
  bucket_id='iberfit-iri-external-reports'
  and name=(public.iberfit_external_report_path_client_v12(name))::text||'/'||(public.iberfit_external_report_path_assessment_v12(name))::text||'/bioimpedancia'
  and public.iberfit_can_manage_iri_external_report_v12(public.iberfit_external_report_path_client_v12(name))
);

drop policy if exists iri_external_object_delete_v12 on storage.objects;
create policy iri_external_object_delete_v12
on storage.objects for delete to authenticated
using(
  bucket_id='iberfit-iri-external-reports'
  and public.iberfit_can_manage_iri_external_report_v12(public.iberfit_external_report_path_client_v12(name))
);

-- === EXACT FINAL ACL RESIDUAL FROM VERIFIED V2 SHADOW DIFF ===
-- Source diff SHA256: a26c0a189e39f7ea2fc6e6c4bc786933218fdcb23f80c3039a464db52c3b162e
-- Contains exactly 8 GRANT + 123 REVOKE; no structural DDL/default privileges.
-- This is current-state reconciliation only; no historical provenance claim.

GRANT ALL ON FUNCTION public.iberfit_base_entity_v26(text, uuid, uuid) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_bootstrap_v26() TO service_role;

GRANT ALL ON FUNCTION public.iberfit_can_access_client_v26(uuid) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_canary_enabled_v26(uuid) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_command_preflight_v26(jsonb) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_current_role_v26() TO service_role;

GRANT ALL ON FUNCTION public.iberfit_execute_command_v26(jsonb) TO service_role;

GRANT ALL ON FUNCTION public.iberfit_persist_entity_v26(text, uuid, uuid, text, bigint, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.iberfit_admin_bootstrap_v14() FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_admin_execute_v14(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_admin_require_v14() FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_application_context_v14() FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_appointment_change_requests_v13() FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_authorized_application_roles_v13() FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_base_entity_v26_rc29(text, uuid, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_base_entity_v26_rc29(text, uuid, uuid) FROM authenticated;

REVOKE ALL ON FUNCTION public.iberfit_bootstrap_v26_rc29() FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_bootstrap_v26_rc29() FROM authenticated;

REVOKE ALL ON FUNCTION public.iberfit_can_manage_iri_external_report_v12(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_can_read_iri_external_report_v12(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_client_onboarding_preflight_v12() FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_command_preflight_v26_rc29(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_command_preflight_v26_rc29(jsonb) FROM authenticated;

REVOKE ALL ON FUNCTION public.iberfit_communication_bootstrap_v14(text) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_communication_execute_v14(text, jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_create_client_draft_v12(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_execute_command_v26_rc29(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_execute_command_v26_rc29(jsonb) FROM authenticated;

REVOKE ALL ON FUNCTION public.iberfit_iri_external_report_preflight_v12() FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_persist_entity_v26_rc29(text, uuid, uuid, text, bigint, jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_persist_entity_v26_rc29(text, uuid, uuid, text, bigint, jsonb) FROM authenticated;

REVOKE ALL ON FUNCTION public.iberfit_prepare_command_rc30_v26(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_prepare_command_rc30_v26(jsonb) FROM authenticated;

REVOKE ALL ON FUNCTION public.iberfit_register_iri_external_report_v12(uuid, uuid, text, text, bigint, text) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_request_appointment_change_v13(text, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.iberfit_resolve_appointment_change_v13(text, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.m26_audit_row_v43() FROM anon;

REVOKE ALL ON FUNCTION public.m26_audit_row_v43() FROM authenticated;

REVOKE ALL ON FUNCTION public.m26_backend_bootstrap_v43() FROM anon;

REVOKE ALL ON FUNCTION public.m26_draft_delete_v431(uuid, text) FROM anon;

REVOKE ALL ON FUNCTION public.m26_draft_get_v431(uuid, text) FROM anon;

REVOKE ALL ON FUNCTION public.m26_draft_upsert_v431(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_json_has_forbidden_key_v44(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_json_safe_v43(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_record_measurement_v43(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_save_training_session_v43(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_send_message_v43(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_telemetry_can_access_client_v59(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.m26_telemetry_delete_own_v59(timestamp WITH time zone) FROM anon;

REVOKE ALL ON FUNCTION public.m26_telemetry_event_valid_v59(jsonb, uuid, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.m26_telemetry_event_valid_v59(jsonb, uuid, text, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.m26_telemetry_import_v59(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_telemetry_json_safe_v59(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_telemetry_json_safe_v59(jsonb) FROM authenticated;

REVOKE ALL ON FUNCTION public.m26_telemetry_purge_expired_v59() FROM anon;

REVOKE ALL ON FUNCTION public.m26_telemetry_purge_expired_v59() FROM authenticated;

REVOKE ALL ON FUNCTION public.m26_telemetry_read_page_v59(uuid, timestamp WITH time zone, integer) FROM anon;

REVOKE ALL ON FUNCTION public.m26_touch_updated_at_v43() FROM anon;

REVOKE ALL ON FUNCTION public.m26_touch_updated_at_v43() FROM authenticated;

REVOKE ALL ON FUNCTION public.m26_wearable_bootstrap_v44() FROM anon;

REVOKE ALL ON FUNCTION public.m26_wearable_connection_upsert_v44(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_wearable_delete_all_v44() FROM anon;

REVOKE ALL ON FUNCTION public.m26_wearable_import_v44(jsonb) FROM anon;

REVOKE ALL ON FUNCTION public.m26_wearable_revoke_v44(text, boolean) FROM anon;

REVOKE ALL ON public.appointment_change_requests FROM anon;

REVOKE ALL ON public.appointment_change_requests FROM authenticated;

REVOKE ALL ON public.client_checkins_v26 FROM anon;

REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.client_checkins_v26 FROM authenticated;

REVOKE ALL ON public.client_habit_logs_v26 FROM anon;

REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.client_habit_logs_v26 FROM authenticated;

REVOKE ALL ON public.client_habits_v26 FROM anon;

REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.client_habits_v26 FROM authenticated;

REVOKE ALL ON public.coach_private_notes_v26 FROM anon;

REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.coach_private_notes_v26 FROM authenticated;

REVOKE ALL ON public.iberfit_admin_audit_events FROM anon;

REVOKE ALL ON public.iberfit_admin_audit_events FROM authenticated;

REVOKE ALL ON public.iberfit_admin_mutation_receipts FROM anon;

REVOKE ALL ON public.iberfit_admin_mutation_receipts FROM authenticated;

REVOKE ALL ON public.iberfit_automation_rules FROM anon;

REVOKE ALL ON public.iberfit_automation_rules FROM authenticated;

REVOKE ALL ON public.iberfit_client_lifecycle_events FROM anon;

REVOKE ALL ON public.iberfit_client_lifecycle_events FROM authenticated;

REVOKE ALL ON public.iberfit_coach_client_assignments FROM anon;

REVOKE ALL ON public.iberfit_coach_client_assignments FROM authenticated;

REVOKE ALL ON public.iberfit_communication_receipts FROM anon;

REVOKE ALL ON public.iberfit_communication_receipts FROM authenticated;

REVOKE ALL ON public.iberfit_conversation_threads FROM anon;

REVOKE ALL ON public.iberfit_conversation_threads FROM authenticated;

REVOKE ALL ON public.iberfit_in_app_notifications FROM anon;

REVOKE ALL ON public.iberfit_in_app_notifications FROM authenticated;

REVOKE ALL ON public.iberfit_leads FROM anon;

REVOKE ALL ON public.iberfit_leads FROM authenticated;

REVOKE ALL ON public.iberfit_messages FROM anon;

REVOKE ALL ON public.iberfit_messages FROM authenticated;

REVOKE ALL ON public.iberfit_notification_deliveries FROM anon;

REVOKE ALL ON public.iberfit_notification_deliveries FROM authenticated;

REVOKE ALL ON public.iberfit_notification_templates FROM anon;

REVOKE ALL ON public.iberfit_notification_templates FROM authenticated;

REVOKE ALL ON public.iberfit_operational_tasks FROM anon;

REVOKE ALL ON public.iberfit_operational_tasks FROM authenticated;

REVOKE ALL ON public.iberfit_organization_memberships FROM anon;

REVOKE ALL ON public.iberfit_organization_memberships FROM authenticated;

REVOKE ALL ON public.iberfit_organizations FROM anon;

REVOKE ALL ON public.iberfit_organizations FROM authenticated;

REVOKE ALL ON public.iri_external_reports_v26 FROM anon;

REVOKE ALL ON public.m26_audit_events_v43 FROM anon;

REVOKE DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.m26_audit_events_v43 FROM authenticated;

REVOKE ALL ON public.m26_client_measurements_v43 FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.m26_client_measurements_v43 FROM authenticated;

REVOKE ALL ON public.m26_messages_v43 FROM anon;

REVOKE DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.m26_messages_v43 FROM authenticated;

REVOKE ALL ON public.m26_schema_releases_v43 FROM anon;

REVOKE ALL ON public.m26_schema_releases_v43 FROM authenticated;

REVOKE ALL ON public.m26_session_drafts_v431 FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.m26_session_drafts_v431 FROM authenticated;

REVOKE ALL ON public.m26_telemetry_events_v59 FROM anon;

REVOKE ALL ON public.m26_telemetry_events_v59 FROM authenticated;

REVOKE ALL ON public.m26_telemetry_import_batches_v59 FROM anon;

REVOKE ALL ON public.m26_telemetry_import_batches_v59 FROM authenticated;

REVOKE ALL ON public.m26_training_plans_v43 FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.m26_training_plans_v43 FROM authenticated;

REVOKE ALL ON public.m26_training_sessions_v43 FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.m26_training_sessions_v43 FROM authenticated;

REVOKE ALL ON public.m26_wearable_connections_v44 FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.m26_wearable_connections_v44 FROM authenticated;

REVOKE ALL ON public.m26_wearable_consents_v44 FROM anon;

REVOKE DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.m26_wearable_consents_v44 FROM authenticated;

REVOKE ALL ON public.m26_wearable_daily_summaries_v44 FROM anon;

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.m26_wearable_daily_summaries_v44 FROM authenticated;

REVOKE ALL ON public.user_application_roles FROM anon;

REVOKE ALL ON public.user_application_roles FROM authenticated;
