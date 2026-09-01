-- IBERFIT M26 · FINAL LAUNCH P0 · PRODUCTION BOOTSTRAP SCOPE
--
-- Production must be usable when there are zero clients and must expose each
-- client only through the canonical per-client authorization boundary.
-- Privileged assurance remains enforced by public.iberfit_bootstrap_v26().

create or replace function public.iberfit_bootstrap_v26_rc29()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
      select jsonb_agg(to_jsonb(s))
      from public.sessions s
      where public.iberfit_can_access_client_v26(s.client_id)
    ),'[]'::jsonb),
    'appointments',coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.appointments a
      where public.iberfit_can_access_client_v26(a.client_id)
    ),'[]'::jsonb),
    'sessionExecutions',coalesce((
      select jsonb_agg(to_jsonb(e))
      from public.session_executions e
      where public.iberfit_can_access_client_v26(e.client_id)
    ),'[]'::jsonb),
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
    'domainEvents',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from public.domain_events_v26 e
      where public.iberfit_can_access_client_v26(e.client_id)
    ),'[]'::jsonb),
    'coachAvailability',coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.coach_availability_v26 a
      where a.active=true and (a.coach_user_id=auth.uid() or v_role='admin')
    ),'[]'::jsonb),
    'm26Entities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'entityType',e.entity_type,
        'entityId',e.entity_id,
        'clientId',e.client_id,
        'status',e.status,
        'revision',e.revision,
        'body',e.body,
        'updatedAt',e.updated_at
      ))
      from public.domain_entities_v26 e
      where public.iberfit_can_access_client_v26(e.client_id)
    ),'[]'::jsonb),
    'metrics',jsonb_build_object('checkin',null,'progress',null,'iri',null)
  ) into v_data;

  select coalesce(
    jsonb_object_agg(entity_type||':'||entity_id::text,revision),
    '{}'::jsonb
  )
  into v_revisions
  from public.domain_entities_v26 e
  where public.iberfit_can_access_client_v26(e.client_id);

  return jsonb_build_object(
    'environment',coalesce((
      select value #>> '{}'
      from public.iberfit_system_settings
      where key='environment'
    ),'UNSET'),
    'serverTime',now(),
    -- Keep the historical response shape for frontend compatibility. This is
    -- metadata only; it no longer controls database visibility.
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
$function$;

create or replace function public.iberfit_bootstrap_v26_pre_v65e()
returns jsonb
language plpgsql
stable
security definer
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
  ),'[]'::jsonb),true);

  v_data:=jsonb_set(v_data,'{checkins}',coalesce((
    select jsonb_agg(to_jsonb(c) order by c.recorded_at desc)
    from public.client_checkins_v26 c
    where public.iberfit_can_access_client_v26(c.client_id)
  ),'[]'::jsonb),true);

  v_data:=jsonb_set(v_data,'{habits}',coalesce((
    select jsonb_agg(to_jsonb(h) order by h.updated_at desc)
    from public.client_habits_v26 h
    where public.iberfit_can_access_client_v26(h.client_id)
  ),'[]'::jsonb),true);

  v_data:=jsonb_set(v_data,'{habitLogs}',coalesce((
    select jsonb_agg(to_jsonb(l) order by l.recorded_at desc)
    from public.client_habit_logs_v26 l
    where public.iberfit_can_access_client_v26(l.client_id)
  ),'[]'::jsonb),true);

  if v_role=any(array['admin','coach']) then
    v_data:=jsonb_set(v_data,'{privateNotes}',coalesce((
      select jsonb_agg(to_jsonb(n) order by n.updated_at desc)
      from public.coach_private_notes_v26 n
      where public.iberfit_can_access_client_v26(n.client_id)
    ),'[]'::jsonb),true);
  else
    v_data:=jsonb_set(v_data,'{privateNotes}','[]'::jsonb,true);
    v_data:=jsonb_set(v_data,'{intelligenceRuns}','[]'::jsonb,true);
    v_data:=jsonb_set(v_data,'{m26Entities}',coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_data->'m26Entities','[]'::jsonb)) item
      where item->>'entityType' not in ('private_note','intelligence')
    ),'[]'::jsonb),true);
    v_data:=jsonb_set(v_data,'{domainEvents}',coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_data->'domainEvents','[]'::jsonb)) item
      where item->>'entity_type' not in ('private_note','intelligence')
    ),'[]'::jsonb),true);
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
    into v_revisions
    from jsonb_each(coalesce(v_result->'remoteRevisions','{}'::jsonb))
    where key not like 'private_note:%'
      and key not like 'intelligence:%';
    v_result:=jsonb_set(v_result,'{remoteRevisions}',v_revisions,true);
  end if;

  v_result:=jsonb_set(v_result,'{data}',v_data,true);
  v_result:=jsonb_set(v_result,'{canary,version}','"M26-RC36-V12.3"'::jsonb,true);
  return v_result;
end
$function$;

-- Do not redefine public.iberfit_bootstrap_v26(): the current wrapper is the
-- security boundary and must continue requiring privileged assurance before
-- delegating to public.iberfit_bootstrap_v26_pre_v65e().
