-- SIGNATURE U37: experimental QA-only RPCs with retained WebAuthn assurance.
-- NEVER deploy this artifact to PROD, or with automatic migration runners.
-- Full integration still needs session-scoped pagination, backpressure,
-- transactional recovery and real authenticated browser verification.
-- QA SQL baselines are intentionally *different* from production.
SELECT 1/(CASE WHEN
  md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))
  = 'ce0cbff2a99e28bff593132a350de595'
  AND md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_v65e()'::regprocedure))
  = '7416e0d52d6fa069cf467e95420d4034'
  AND md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_person_service_v1()'::regprocedure))
  = 'f7f30204f8e84e1d5c9fe43331b7f0c8'
  AND md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure))
  = 'aedea9df3d4986496626e10318628c41'
  THEN 1 ELSE 0 END) AS u37_preflight_qa_source_changed;

CREATE OR REPLACE FUNCTION private.iberfit_bootstrap_v26_rc29_core_u37_qa()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_data jsonb;
  v_revisions jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_role:=public.iberfit_current_role_v26();

  select jsonb_build_object(
    'clients',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.name)
      from public.clients c
      where public.iberfit_can_access_client_v26(c.id)
    ),'[]'::jsonb),
    'userProfiles',coalesce((
      select jsonb_agg(to_jsonb(u))
      from public.user_profiles u
      where u.user_id=auth.uid()
         or (u.client_id is not null and public.iberfit_can_access_client_v26(u.client_id))
    ),'[]'::jsonb),
    'clientProfiles',coalesce((
      select jsonb_agg(to_jsonb(p))
      from public.client_app_profiles p
      where public.iberfit_can_access_client_v26(p.client_id)
    ),'[]'::jsonb),
    'clientAccess',coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.client_access_v26 a
      where public.iberfit_can_access_client_v26(a.client_id)
    ),'[]'::jsonb),
    'iriAssessments',coalesce((
      select jsonb_agg(to_jsonb(i))
      from public.iri_assessments i
      where public.iberfit_can_access_client_v26(i.client_id)
    ),'[]'::jsonb),
    'reports',coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.reports r
      where public.iberfit_can_access_client_v26(r.client_id)
    ),'[]'::jsonb),
    'trainingCycles',coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.training_cycles t
      where public.iberfit_can_access_client_v26(t.client_id)
    ),'[]'::jsonb),
    'sessions',coalesce((
      select jsonb_agg(case when v_role='cliente' then public.iberfit_m43_client_safe_session_v2(to_jsonb(s)) else to_jsonb(s) end)
      from public.sessions s
      where public.iberfit_can_access_client_v26(s.client_id)
    ),'[]'::jsonb),
    'appointments',coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.appointments a
      where public.iberfit_can_access_client_v26(a.client_id)
    ),'[]'::jsonb),
    'sessionExecutions','[]'::jsonb,
    'intelligenceRuns',coalesce((
      select jsonb_agg(to_jsonb(i))
      from public.intelligence_runs i
      where public.iberfit_can_access_client_v26(i.client_id)
    ),'[]'::jsonb),
    'timelineEvents',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
      from public.client_timeline_events e
      where public.iberfit_can_access_client_v26(e.client_id)
    ),'[]'::jsonb),
    'domainEvents','[]'::jsonb,
    'coachAvailability',coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.coach_availability_v26 a
      where a.active=true and (a.coach_user_id=auth.uid() or v_role='admin')
    ),'[]'::jsonb),
    'm26Entities','[]'::jsonb,
    'metrics',jsonb_build_object('checkin',null,'progress',null,'iri',null)
  ) into v_data;

  with candidates as materialized (
    select distinct client_id from public.domain_entities_v26
  ), visible as materialized (
    select client_id from candidates
    where public.iberfit_can_access_client_v26(client_id)
  )
  select coalesce(
    jsonb_object_agg(entity_type||':'||entity_id::text,revision),
    '{}'::jsonb
  )
  into v_revisions
  from public.domain_entities_v26 e
  where exists (select 1 from visible v where v.client_id is not distinct from e.client_id);

  return jsonb_build_object(
    'environment',coalesce((
      select value #>> '{}'
      from public.iberfit_system_settings
      where key='environment'
    ),'UNSET'),
    'serverTime',now(),
    'canary',jsonb_build_object(
      'version','M26-GATE15-FREE-RC1',
      'active',true,
      'scope','allowlist'
    ),
    'user',jsonb_build_object(
      'id',auth.uid(),
      'role',v_role,
      'clientId',public.iberfit_client_id(),
      'name',(select display_name from public.user_profiles where user_id=auth.uid())
    ),
    'remoteRevisions',v_revisions,
    'data',v_data
  );
end
$function$
;

CREATE OR REPLACE FUNCTION private.iberfit_bootstrap_v26_pre_v65e_core_u37_qa()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_data jsonb;
  v_role text;
  v_revisions jsonb;
  v_updates jsonb:='{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_role:=public.iberfit_current_role_v26();
  v_result:=private.iberfit_bootstrap_v26_rc29_core_u37_qa();
  v_data:=coalesce(v_result->'data','{}'::jsonb);

  v_updates:=v_updates || jsonb_build_object('clientProfiles',coalesce((
    select jsonb_agg(
      item || coalesce(item->'profile','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'profile',coalesce(item->'profile','{}'::jsonb)
      )
    )
    from jsonb_array_elements(coalesce(v_data->'clientProfiles','[]'::jsonb)) item
  ),'[]'::jsonb));

  v_updates:=v_updates || jsonb_build_object('iriAssessments',coalesce((
    select jsonb_agg(
      item || coalesce(item->'sections','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'assessmentDate',coalesce(item->>'evaluated_at',item#>>'{sections,assessmentDate}'),
        'body',coalesce(item->'sections','{}'::jsonb)||jsonb_build_object(
          'id',item->'id',
          'clientId',coalesce(item->>'client_id',item->>'clientId'),
          'status',case item->>'status'
            when 'revisión' then 'completo'
            when 'retirado' then 'sustituido'
            else item->>'status'
          end,
          'revision',coalesce((item->>'revision')::bigint,0)
        )
      )
    )
    from jsonb_array_elements(coalesce(v_data->'iriAssessments','[]'::jsonb)) item
  ),'[]'::jsonb));

  v_updates:=v_updates || jsonb_build_object('checkins',coalesce((
    with candidates as materialized (
      select distinct client_id from public.client_checkins_v26
    ), visible as materialized (
      select client_id from candidates
      where public.iberfit_can_access_client_v26(client_id)
    )
    select jsonb_agg(to_jsonb(c) order by c.recorded_at desc)
    from public.client_checkins_v26 c
    where exists (select 1 from visible v where v.client_id is not distinct from c.client_id)
  ),'[]'::jsonb));

  v_updates:=v_updates || jsonb_build_object('habits',coalesce((
    select jsonb_agg(to_jsonb(h) order by h.updated_at desc)
    from public.client_habits_v26 h
    where public.iberfit_can_access_client_v26(h.client_id)
  ),'[]'::jsonb));

  v_updates:=v_updates || jsonb_build_object('habitLogs',coalesce((
    select jsonb_agg(to_jsonb(l) order by l.recorded_at desc)
    from public.client_habit_logs_v26 l
    where public.iberfit_can_access_client_v26(l.client_id)
  ),'[]'::jsonb));

  if v_role=any(array['admin','coach']) then
    v_updates:=v_updates || jsonb_build_object('privateNotes',coalesce((
      select jsonb_agg(to_jsonb(n) order by n.updated_at desc)
      from public.coach_private_notes_v26 n
      where public.iberfit_can_access_client_v26(n.client_id)
    ),'[]'::jsonb));
  else
    v_updates:=v_updates || jsonb_build_object('privateNotes','[]'::jsonb);
    v_updates:=v_updates || jsonb_build_object('intelligenceRuns','[]'::jsonb);
    v_updates:=v_updates || jsonb_build_object('m26Entities',coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_data->'m26Entities','[]'::jsonb)) item
      where item->>'entityType' not in ('private_note','intelligence')
    ),'[]'::jsonb));
    v_updates:=v_updates || jsonb_build_object('domainEvents',coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_data->'domainEvents','[]'::jsonb)) item
      where item->>'entity_type' not in ('private_note','intelligence')
    ),'[]'::jsonb));
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
    into v_revisions
    from jsonb_each(coalesce(v_result->'remoteRevisions','{}'::jsonb))
    where key not like 'private_note:%'
      and key not like 'intelligence:%';
    v_result:=jsonb_set(v_result,'{remoteRevisions}',v_revisions,true);
  end if;

  v_data:=v_data || v_updates;
  v_result:=jsonb_set(v_result,'{data}',v_data,true);
  v_result:=jsonb_set(v_result,'{canary,version}','"M26-RC36-V12.3"'::jsonb,true);
  return v_result;
end
$function$
;

CREATE OR REPLACE FUNCTION private.iberfit_bootstrap_v26_pre_person_service_core_u37_qa()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_payload jsonb;
  v_email text;
  v_last_access_at timestamptz;
  v_membership_status text;
  v_lifecycle_org uuid;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_payload:=private.iberfit_bootstrap_v26_pre_v65e_core_u37_qa();

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

CREATE OR REPLACE FUNCTION private.iberfit_bootstrap_v26_full_core_internal_u37_qa()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_payload jsonb;
  v_org uuid;
  v_clients jsonb;
begin
  v_payload:=private.iberfit_bootstrap_v26_pre_person_service_core_u37_qa();
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

  v_payload:=jsonb_set(v_payload,'{data,clients}',coalesce(v_clients,'[]'::jsonb),true);

  -- M43: SECURITY DEFINER bootstrap must enforce the same publication
  -- boundary as domain_entities_v26 SELECT RLS, not delegate it to UI.
  -- Coach/Admin keep unchanged full authorised access. Client only.
  if public.iberfit_current_role_v26() in ('client','cliente') then
    v_payload:=jsonb_set(v_payload,'{data,trainingCycles}',coalesce((
      select jsonb_agg(public.iberfit_m43_client_safe_plan_v2(item))
      from jsonb_array_elements(coalesce(v_payload#>'{data,trainingCycles}','[]'::jsonb)) item
      where lower(coalesce(item->>'status','')) in
        ('publicado','publicada','published','disponible','en_curso',
         'activo','active','habilitado','enabled','completado','completada','completed')
        AND lower(coalesce(item->>'visibleToClient','true')) NOT IN ('false','0','no')
    ),'[]'::jsonb),true);

    v_payload:=jsonb_set(v_payload,'{data,sessions}',coalesce((
      select jsonb_agg(public.iberfit_m43_client_safe_session_v2(item))
      from jsonb_array_elements(coalesce(v_payload#>'{data,sessions}','[]'::jsonb)) item
      where lower(coalesce(item->>'status','')) in
        ('publicado','publicada','published','disponible','en_curso',
         'activo','active','habilitado','enabled','completado','completada','completed')
        AND lower(coalesce(item->>'visibleToClient','true')) NOT IN ('false','0','no')
    ),'[]'::jsonb),true);

    v_payload:=jsonb_set(v_payload,'{data,m26Entities}',coalesce((
      select jsonb_agg(case when item->>'entityType'='session_execution'
        then public.iberfit_m43_client_scalar_fields_v1(item,
          ARRAY['entityType','entityId','clientId','status','revision','updatedAt']::text[])
          || jsonb_build_object('body',public.iberfit_m43_client_safe_execution_v1(item->'body'))
        when item->>'entityType'='planning' then
          public.iberfit_m43_client_scalar_fields_v1(item,
            ARRAY['entityType','entityId','clientId','status','revision','updatedAt']::text[])
          || jsonb_build_object('body',public.iberfit_m43_client_safe_plan_v2(item->'body'))
        when item->>'entityType'='session' then
          public.iberfit_m43_client_scalar_fields_v1(item,
            ARRAY['entityType','entityId','clientId','status','revision','updatedAt']::text[])
          || jsonb_build_object('body',public.iberfit_m43_client_safe_session_v2(item->'body'))
        else item end)
      from jsonb_array_elements(coalesce(v_payload#>'{data,m26Entities}','[]'::jsonb)) item
      where item->>'entityType' not in ('planning','session','report')
         or (
           lower(coalesce(item->>'status',item->'body'->>'status','')) in
             ('publicado','publicada','published','disponible','en_curso',
              'activo','active','habilitado','enabled','completado','completada','completed')
           and lower(coalesce(item->'body'->>'visibleToClient','true'))
             not in ('false','0','no')
         )
    ),'[]'::jsonb),true);

    -- Canonical and legacy completed executions must share the same HTTP
    -- privacy contract. Client JS filtering is defense-in-depth, not an API boundary.
    v_payload:=jsonb_set(v_payload,'{data,sessionExecutions}',coalesce((
      select jsonb_agg(public.iberfit_m43_client_safe_execution_v1(item))
      from jsonb_array_elements(coalesce(v_payload#>'{data,sessionExecutions}','[]'::jsonb)) item
    ),'[]'::jsonb),true);

    -- Internal domain event history is not Client UI data; the existing
    -- JS projection discards it. Avoid leaking unpublished entity activity.
    v_payload:=jsonb_set(v_payload,'{data,domainEvents}','[]'::jsonb,true);

    -- Never leak identifiers/revisions of unpublished planning/session/report
    -- through an otherwise filtered bootstrap response.
    v_payload:=jsonb_set(v_payload,'{remoteRevisions}',coalesce((
      select jsonb_object_agg(entry.key,entry.value)
      from jsonb_each(coalesce(v_payload->'remoteRevisions','{}'::jsonb)) entry
      where split_part(entry.key,':',1) not in ('planning','session','report')
         or exists (
           select 1
           from jsonb_array_elements(coalesce(v_payload#>'{data,m26Entities}','[]'::jsonb)) item
           where item->>'entityType'=split_part(entry.key,':',1)
             and item->>'entityId'=split_part(entry.key,':',2)
         )
    ),'{}'::jsonb),true);
  end if;

  -- M44_REPORT_BOOTSTRAP_PRIVATE_PROJECTION_V1
  -- Client-safe projections are explicit; SECURITY DEFINER bypasses table RLS.
  if public.iberfit_current_role_v26() in ('client','cliente') then
    v_payload:=jsonb_set(v_payload,'{data,reports}',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.value->'id',
        'client_id',r.value->'client_id',
        'title',r.value->'title',
        'summary',r.value->'summary',
        'report_type',r.value->'report_type',
        'status',r.value->'status',
        'audience','cliente',
        'revision',r.value->'revision',
        'published_at',r.value->'published_at',
        'content',jsonb_build_object(
          'reportType',coalesce(r.value#>>'{content,reportType}',r.value->>'report_type'),
          'summary',r.value->>'summary',
          'conclusions',r.value#>>'{content,conclusions}',
          'recommendations',r.value#>>'{content,recommendations}',
          'periodStart',r.value#>>'{content,periodStart}',
          'periodEnd',r.value#>>'{content,periodEnd}',
          'evidence',coalesce(r.value#>'{content,evidence}','[]'::jsonb),
          'activitySeries',coalesce(r.value#>'{content,activitySeries}','[]'::jsonb)
        )
      ) order by r.ordinality)
      from jsonb_array_elements(coalesce(v_payload#>'{data,reports}','[]'::jsonb))
           with ordinality r(value,ordinality)
      where r.value->>'client_id'=public.iberfit_client_id()::text
        and r.value->>'status'='publicado'
        and r.value->>'audience'='cliente'
    ),'[]'::jsonb),true);
    -- Never send internal report entity bodies, even if a previous migration
    -- incorrectly marked visibleToClient=true. The public reports projection
    -- above is the *only* supported Client report read path.
    v_payload:=jsonb_set(v_payload,'{data,m26Entities}',coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_payload#>'{data,m26Entities}','[]'::jsonb)) item
      where item->>'entityType' is distinct from 'report'
    ),'[]'::jsonb),true);
    -- Canonical revision maps can leak the existence of private reports.
    v_payload:=jsonb_set(v_payload,'{remoteRevisions}',coalesce((
      select jsonb_object_agg(k.key,k.value)
      from jsonb_each(coalesce(v_payload->'remoteRevisions','{}'::jsonb)) k
      where split_part(k.key,':',1)<>'report'
    ),'{}'::jsonb),true);
  end if;
  return v_payload;
end
$function$
;

create or replace function private.iberfit_history_page_internal_u37_qa(
  p_client_id uuid,
  p_section text,
  p_snapshot_at timestamptz default null,
  p_cursor jsonb default null,
  p_expected_count bigint default null,
  p_limit integer default 32
)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $u35$
declare
  v_role text;
  v_fence timestamptz := coalesce(p_snapshot_at,statement_timestamp());
  v_before_at timestamptz;
  v_before_id text;
  v_before_type text;
  v_total bigint;
  v_records jsonb := '[]'::jsonb;
  v_more boolean := false;
  v_next jsonb;
  v_revisions jsonb := '{}'::jsonb;
begin
  -- Security-definer must never rely on an untrusted client_id or frontend role.
  if auth.uid() is null or p_client_id is null then
    raise exception 'U35_HISTORY_FORBIDDEN' using errcode='42501';
  end if;
  v_role := public.iberfit_current_role_v26();
  if v_role not in ('coach','admin') or
     public.iberfit_can_access_client_v26(p_client_id) is not true or
     public.iberfit_canary_enabled_v26(p_client_id) is not true or
     not exists (select 1 from public.clients c where c.id=p_client_id) then
    raise exception 'U35_HISTORY_FORBIDDEN' using errcode='42501';
  end if;
  if p_section is null or p_section not in ('m26Entities','domainEvents','sessionExecutions')
     or p_limit is null or p_limit<1 or p_limit>32 then
    raise exception 'U35_HISTORY_ARGUMENT_INVALID' using errcode='22023';
  end if;
  if v_fence>statement_timestamp() or
     (p_snapshot_at is null and (p_cursor is not null or p_expected_count is not null)) then
    raise exception 'U35_HISTORY_SNAPSHOT_INVALID' using errcode='22023';
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object'
       or not (p_cursor ? 'at' and p_cursor ? 'id')
       or jsonb_typeof(p_cursor->'at')<>'string'
       or jsonb_typeof(p_cursor->'id')<>'string'
       or nullif(p_cursor->>'id','') is null
       or p_expected_count is null then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
    v_before_at := (p_cursor->>'at')::timestamptz;
    v_before_id := p_cursor->>'id';
    v_before_type := p_cursor->>'type';
    if v_before_at>v_fence then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
  end if;

  if p_section='m26Entities' then
    if p_cursor is not null and (nullif(v_before_type,'') is null or
       jsonb_typeof(p_cursor->'type')<>'string') then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
    select count(*) into v_total from public.domain_entities_v26 e
    where e.client_id=p_client_id and e.updated_at<=v_fence;
    if p_snapshot_at is not null and exists (
      select 1 from public.domain_entities_v26 e
      where e.client_id=p_client_id and e.updated_at>v_fence
    ) then
      raise exception 'U35_HISTORY_SNAPSHOT_CHANGED_RESTART' using errcode='40001';
    end if;
    with page as materialized (
      select e.* from public.domain_entities_v26 e
      where e.client_id=p_client_id and e.updated_at<=v_fence
        and (v_before_at is null or
          (e.updated_at,e.entity_type,e.entity_id)<
          (v_before_at,v_before_type,v_before_id::uuid))
      order by e.updated_at desc,e.entity_type desc,e.entity_id desc
      limit (p_limit+1)
    ), numbered as (
      select page.*,row_number() over (
        order by updated_at desc,entity_type desc,entity_id desc
      ) as rn from page
    )
    select
      (select coalesce(jsonb_agg(jsonb_build_object(
        'entityType',e.entity_type,'entityId',e.entity_id,
        'clientId',e.client_id,'status',e.status,'revision',e.revision,
        'body',e.body,'updatedAt',e.updated_at
      ) order by e.rn),'[]'::jsonb) from numbered e where e.rn<=p_limit),
      (select exists(select 1 from numbered e where e.rn>p_limit)),
      (select jsonb_build_object('at',e.updated_at,'type',e.entity_type,
        'id',e.entity_id::text) from numbered e where e.rn<=p_limit
        order by e.rn desc limit 1)
    into v_records,v_more,v_next;
    select coalesce(jsonb_object_agg(
      (e.value->>'entityType')||':'||(e.value->>'entityId'),e.value->'revision'
    ),'{}'::jsonb) into v_revisions
    from jsonb_array_elements(v_records) e(value);

  elsif p_section='domainEvents' then
    if p_cursor is not null and (v_before_id !~ '^[0-9]{1,19}$') then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
    select count(*) into v_total from public.domain_events_v26 e
    where e.client_id=p_client_id and e.created_at<=v_fence;
    -- Domain events are append-only. Newer writes are outside this fence.
    with page as materialized (
      select e.* from public.domain_events_v26 e
      where e.client_id=p_client_id and e.created_at<=v_fence
        and (v_before_at is null or
          (e.created_at,e.id)<(v_before_at,v_before_id::bigint))
      order by e.created_at desc,e.id desc limit (p_limit+1)
    ), numbered as (
      select page.*,row_number() over (
        order by created_at desc,id desc
      ) as rn from page
    )
    select
      (select coalesce(jsonb_agg(to_jsonb(e)-'rn' order by e.rn),'[]'::jsonb)
       from numbered e where e.rn<=p_limit),
      (select exists(select 1 from numbered e where e.rn>p_limit)),
      (select jsonb_build_object('at',e.created_at,'id',e.id::text)
       from numbered e where e.rn<=p_limit order by e.rn desc limit 1)
    into v_records,v_more,v_next;

  else
    if p_cursor is not null and v_before_id !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
    select count(*) into v_total from public.session_executions e
    where e.client_id=p_client_id and e.updated_at<=v_fence;
    if p_snapshot_at is not null and exists (
      select 1 from public.session_executions e
      where e.client_id=p_client_id and e.updated_at>v_fence
    ) then
      raise exception 'U35_HISTORY_SNAPSHOT_CHANGED_RESTART' using errcode='40001';
    end if;
    with page as materialized (
      select e.* from public.session_executions e
      where e.client_id=p_client_id and e.updated_at<=v_fence
        and (v_before_at is null or
          (e.updated_at,e.id)<(v_before_at,v_before_id::uuid))
      order by e.updated_at desc,e.id desc limit (p_limit+1)
    ), numbered as (
      select page.*,row_number() over (
        order by updated_at desc,id desc
      ) as rn from page
    )
    select
      (select coalesce(jsonb_agg(to_jsonb(e)-'rn' order by e.rn),'[]'::jsonb)
       from numbered e where e.rn<=p_limit),
      (select exists(select 1 from numbered e where e.rn>p_limit)),
      (select jsonb_build_object('at',e.updated_at,'id',e.id::text)
       from numbered e where e.rn<=p_limit order by e.rn desc limit 1)
    into v_records,v_more,v_next;
  end if;

  -- Detect deletes / changed cardinality between pages. Do not silently
  -- present an incomplete history after concurrent mutation.
  if p_expected_count is not null and v_total<>p_expected_count then
    raise exception 'U35_HISTORY_SNAPSHOT_CHANGED_RESTART' using errcode='40001';
  end if;
  return jsonb_build_object(
    'schema','iberfit.u35.privileged-history-page.qa.v1',
    'section',p_section,'snapshotAt',v_fence,'totalCount',v_total,
    'hasMore',v_more,'nextCursor',case when v_more then v_next else null end,
    'records',v_records,'remoteRevisions',v_revisions
  );
end
$u35$;

REVOKE ALL ON FUNCTION private.iberfit_bootstrap_v26_rc29_core_u37_qa() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.iberfit_bootstrap_v26_pre_v65e_core_u37_qa() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.iberfit_bootstrap_v26_pre_person_service_core_u37_qa() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.iberfit_bootstrap_v26_full_core_internal_u37_qa() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.iberfit_history_page_internal_u37_qa(uuid,text,timestamptz,jsonb,bigint,integer) FROM PUBLIC,anon,authenticated,service_role;

-- Both browser RPCs must preserve the existing assurance boundary.
-- The server—not role metadata, headers or client-selected roles—decides.
CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26_core_u37_qa()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $u37$
DECLARE v_role text; v_assurance jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'U37_AUTH_REQUIRED' USING errcode='42501';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role NOT IN ('coach','admin') THEN
    RAISE EXCEPTION 'U37_PRIVILEGED_ROLE_REQUIRED' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.iberfit_system_settings s WHERE s.key='environment'
      AND s.value#>>'{}'='QA'
  ) THEN
    RAISE EXCEPTION 'U37_QA_ONLY' USING errcode='42501';
  END IF;
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  -- Require an explicitly privileged and verified real session. Never infer
  -- assurance from a claimed role or from a passed QA fixture account.
  v_assurance:=public.iberfit_privileged_assurance_context_v65d();
  IF coalesce((v_assurance->>'privileged')::boolean,false) IS NOT TRUE
     OR v_assurance->>'iberfitAssurance' IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'U37_PRIVILEGED_ASSURANCE_REQUIRED' USING errcode='42501';
  END IF;
  RETURN private.iberfit_bootstrap_v26_full_core_internal_u37_qa();
END
$u37$;

CREATE OR REPLACE FUNCTION public.iberfit_privileged_history_page_u37_qa(
 p_client_id uuid,p_section text,
 p_snapshot_at timestamptz DEFAULT NULL,
 p_cursor jsonb DEFAULT NULL,
 p_expected_count bigint DEFAULT NULL,
 p_limit integer DEFAULT 32
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $u37$
DECLARE v_role text; v_assurance jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'U37_AUTH_REQUIRED' USING errcode='42501';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role NOT IN ('coach','admin') THEN
    RAISE EXCEPTION 'U37_PRIVILEGED_ROLE_REQUIRED' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.iberfit_system_settings s WHERE s.key='environment'
      AND s.value#>>'{}'='QA'
  ) THEN
    RAISE EXCEPTION 'U37_QA_ONLY' USING errcode='42501';
  END IF;
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  -- Require an explicitly privileged and verified real session. Never infer
  -- assurance from a claimed role or from a passed QA fixture account.
  v_assurance:=public.iberfit_privileged_assurance_context_v65d();
  IF coalesce((v_assurance->>'privileged')::boolean,false) IS NOT TRUE
     OR v_assurance->>'iberfitAssurance' IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'U37_PRIVILEGED_ASSURANCE_REQUIRED' USING errcode='42501';
  END IF;
  RETURN private.iberfit_history_page_internal_u37_qa(
    p_client_id,p_section,p_snapshot_at,p_cursor,p_expected_count,p_limit);
END
$u37$;

-- Fail closed: no implicit PUBLIC/anon/service_role execute. Only existing
-- authenticated application JWTs with explicit role + WebAuthn can reach RPC.
REVOKE ALL ON FUNCTION public.iberfit_bootstrap_v26_core_u37_qa()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.iberfit_privileged_history_page_u37_qa(
 uuid,text,timestamptz,jsonb,bigint,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_bootstrap_v26_core_u37_qa()
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_privileged_history_page_u37_qa(
 uuid,text,timestamptz,jsonb,bigint,integer)
 TO authenticated;
