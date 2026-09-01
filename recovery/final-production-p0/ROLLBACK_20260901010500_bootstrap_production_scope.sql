-- IBERFIT M26 · ROLLBACK · bootstrap production scope
-- Captured from PROD immediately before migration final_launch_p0_bootstrap_production_scope.
-- Pre-change definition hashes:
--   public.iberfit_bootstrap_v26_rc29()      b8082b5de8e5a2dfd22d4b335a3b19af
--   public.iberfit_bootstrap_v26_pre_v65e()  2d731671fe0140d9de4d7fc57f5a3ed1
-- The top-level public.iberfit_bootstrap_v26() wrapper is intentionally untouched.

create or replace function public.iberfit_bootstrap_v26_rc29()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
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

create or replace function public.iberfit_bootstrap_v26_pre_v65e()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
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

  v_data:=jsonb_set(v_data,'{clientProfiles}',coalesce((
    select jsonb_agg(
      item || coalesce(item->'profile','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'profile',coalesce(item->'profile','{}'::jsonb)
      )
    ) from jsonb_array_elements(coalesce(v_data->'clientProfiles','[]'::jsonb)) item
  ),'[]'::jsonb),true);

  v_data:=jsonb_set(v_data,'{iriAssessments}',coalesce((
    select jsonb_agg(
      item || coalesce(item->'sections','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'assessmentDate',coalesce(item->>'evaluated_at',item#>>'{sections,assessmentDate}'),
        'body',coalesce(item->'sections','{}'::jsonb)||jsonb_build_object(
          'id',item->'id,
          'clientId',coalesce(item->>'client_id',item->>'clientId'),
          'status',case item->>'status' when 'revisión' then 'completo' when 'retirado' then 'sustituido' else item->>'status' end,
          'revision',coalesce((item->>'revision')::bigint,0)
        )
      )
    ) from jsonb_array_elements(coalesce(v_data->'iriAssessments','[]'::jsonb)) item
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
