-- IBERFIT SIGNATURE U43 · exact data-preserving bootstrap latency fix
-- Source is the audited original v26_rc29 body; only 15 repeated role checks
-- are replaced by an equivalent authenticated role/client scope computed once.
-- Preserves SECURITY DEFINER, search_path, all publication/IRI/report filters,
-- null and orphan scope, legacy APIs and response shape. No data writes.
-- U43: fail closed. This SQL is authorized for PRODUCTION only.
DO $environment_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.iberfit_system_settings
    WHERE key='environment' AND value #>> '{}'='PRODUCTION'
  ) THEN
    RAISE EXCEPTION 'U43_WRONG_ENVIRONMENT_PRODUCTION' USING ERRCODE='42501';
  END IF;
END
$environment_guard$;

CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26_rc29()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_data jsonb;
  v_revisions jsonb;
  v_allowed_client_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_role:=public.iberfit_current_role_v26();
  -- Exact authorization parity with the original function. Compute once,
  -- never trust frontend role labels, client inputs or user_metadata.
  if v_role='coach' then
    select coalesce(array_agg(distinct a.client_id),'{}'::uuid[])
      into v_allowed_client_ids
    from public.client_assignments a
    where a.coach_user_id=auth.uid() and a.active;
  elsif v_role='cliente' then
    v_allowed_client_ids:=array[public.iberfit_client_id()];
  end if;

  select jsonb_build_object(
    'clients',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.name)
      from public.clients c
      where (v_role='admin' or c.id=any(v_allowed_client_ids))
    ),'[]'::jsonb),
    'userProfiles',coalesce((
      select jsonb_agg(to_jsonb(u))
      from public.user_profiles u
      where u.user_id=auth.uid()
         or (u.client_id is not null and (v_role='admin' or u.client_id=any(v_allowed_client_ids)))
    ),'[]'::jsonb),
    'clientProfiles',coalesce((
      select jsonb_agg(to_jsonb(p))
      from public.client_app_profiles p
      where (v_role='admin' or p.client_id=any(v_allowed_client_ids))
    ),'[]'::jsonb),
    'clientAccess',coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.client_access_v26 a
      where (v_role='admin' or a.client_id=any(v_allowed_client_ids))
    ),'[]'::jsonb),
    'iriAssessments',coalesce((
      select jsonb_agg(to_jsonb(i))
      from public.iri_assessments i
      where (v_role='admin' or i.client_id=any(v_allowed_client_ids))
    ),'[]'::jsonb),
    'reports',coalesce((
      select jsonb_agg(to_jsonb(r))
      from public.reports r
      where (v_role='admin' or r.client_id=any(v_allowed_client_ids))
        and (v_role not in ('client','cliente') or (r.status::text='publicado' and r.published_at is not null))
    ),'[]'::jsonb),
    'trainingCycles',coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.training_cycles t
      where (v_role='admin' or t.client_id=any(v_allowed_client_ids))
    ),'[]'::jsonb),
    'sessions',coalesce((
      select jsonb_agg(case when v_role='cliente' then public.iberfit_m43_client_safe_session_v2(to_jsonb(s)) else to_jsonb(s) end)
      from public.sessions s
      where (v_role='admin' or s.client_id=any(v_allowed_client_ids))
        and (v_role not in ('client','cliente') or (s.status::text='publicado' and s.published_at is not null))
    ),'[]'::jsonb),
    'appointments',coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.appointments a
      where (v_role='admin' or a.client_id=any(v_allowed_client_ids))
    ),'[]'::jsonb),
    'sessionExecutions',coalesce((
      select jsonb_agg(case when v_role='cliente' then public.iberfit_m43_client_safe_execution_v1(to_jsonb(e)) else to_jsonb(e) end)
      from public.session_executions e
      where (v_role='admin' or e.client_id=any(v_allowed_client_ids))
    ),'[]'::jsonb),
    'intelligenceRuns',coalesce((
      select jsonb_agg(to_jsonb(i))
      from public.intelligence_runs i
      where (v_role='admin' or i.client_id=any(v_allowed_client_ids))
    ),'[]'::jsonb),
    'timelineEvents',coalesce((
      select jsonb_agg(to_jsonb(e) order by e.occurred_at desc)
      from public.client_timeline_events e
      where (v_role='admin' or e.client_id=any(v_allowed_client_ids))
    ),'[]'::jsonb),
    'domainEvents',case when v_role in ('client','cliente') then '[]'::jsonb else coalesce((
      with candidates as materialized (
        select distinct client_id from public.domain_events_v26
      ), visible as materialized (
        select client_id from candidates
        where (v_role='admin' or client_id=any(v_allowed_client_ids))
      )
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from public.domain_events_v26 e
      where exists (select 1 from visible v where v.client_id is not distinct from e.client_id)
    ),'[]'::jsonb) end,
    'coachAvailability',coalesce((
      select jsonb_agg(to_jsonb(a))
      from public.coach_availability_v26 a
      where a.active=true and (a.coach_user_id=auth.uid() or v_role='admin')
    ),'[]'::jsonb),
    'm26Entities',coalesce((
      with candidates as materialized (
        select distinct client_id from public.domain_entities_v26
      ), visible as materialized (
        select client_id from candidates
        where (v_role='admin' or client_id=any(v_allowed_client_ids))
      )
      select jsonb_agg(jsonb_build_object(
        'entityType',e.entity_type,
        'entityId',e.entity_id,
        'clientId',e.client_id,
        'status',e.status,
        'revision',e.revision,
        'body',case when v_role='cliente' and e.entity_type='planning' then public.iberfit_m43_client_safe_plan_v2(e.body)
                     when v_role='cliente' and e.entity_type='session' then public.iberfit_m43_client_safe_session_v2(e.body)
                     when v_role='cliente' and e.entity_type='session_execution' then public.iberfit_m43_client_safe_execution_v1(e.body)
                     else e.body end,
        'updatedAt',e.updated_at
      ))
      from public.domain_entities_v26 e
      where exists (select 1 from visible v where v.client_id is not distinct from e.client_id)
        -- Dedicated data.checkins is the canonical Client check-in collection.
        -- Avoid serializing the same check-in a second time in m26Entities.
        and (v_role not in ('client','cliente') or (
          e.entity_type <> 'checkin'
          and e.entity_type not in ('private_note','intelligence','report')
          and (e.entity_type not in ('planning','session')
            or (
              lower(coalesce(e.status,e.body->>'status','')) in
                ('publicado','publicada','published','disponible','en_curso',
                 'activo','active','habilitado','enabled','completado','completada','completed')
              and lower(coalesce(e.body->>'visibleToClient','true')) not in ('false','0','no')
            )
          )
        ))
    ),'[]'::jsonb),
    'metrics',jsonb_build_object('checkin',null,'progress',null,'iri',null)
  ) into v_data;

  with candidates as materialized (
    select distinct client_id from public.domain_entities_v26
  ), visible as materialized (
    select client_id from candidates
    where (v_role='admin' or client_id=any(v_allowed_client_ids))
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
$function$;
