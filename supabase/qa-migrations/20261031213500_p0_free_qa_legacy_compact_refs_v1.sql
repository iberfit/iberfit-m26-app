-- P0 #1209 · INACTIVE BY DEFAULT · QA-only pilot, Client A synthetic.
-- Only replaces legacy duplicate payload by {id} where matching canonical
-- type/owner/id/revision/body exists. Leaves historical row order and all
-- m26Entities/results/feedback untouched. A missing/mismatched canonical
-- row falls back to the original safe projection. No changes to PROD.
-- Rollout separately: free_client_compact_legacy_refs_qa = true (QA ONLY).
DO $preflight$
BEGIN
 IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')
      IS DISTINCT FROM 'QA' THEN
   RAISE EXCEPTION 'P0_FREE_COMPACT_QA_ONLY' USING ERRCODE='42501';
 END IF;
 IF md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))
      <> '2a18f2469160b962d85b159746cb3a1d' THEN
   RAISE EXCEPTION 'P0_FREE_COMPACT_SOURCE_DRIFT' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.iberfit_system_settings
           WHERE key='free_client_compact_legacy_refs_qa' AND value#>>'{}'='true') THEN
   RAISE EXCEPTION 'P0_FREE_COMPACT_FLAG_MUST_BE_OFF' USING ERRCODE='42501';
 END IF;
END $preflight$;

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
  v_defer_completed_blocks boolean := false;
  v_compact_legacy_refs boolean := false; -- P0_FREE_QA_COMPACT_REF_V1
  v_keep_completed_sessions uuid[] := '{}'::uuid[];
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

  -- FREE_HISTORY_DEFER_COMPLETED_BLOCKS_V1: disabled unless BOTH the
  -- authenticated QA Client A and the server-side rollout key are verified.
  -- Preserves all rows, revisions and public scalar metadata; only old blocks
  -- become [] until the on-demand owner-only history API is accessed.
  v_defer_completed_blocks := v_role='cliente'
    AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id=auth.uid()
      AND lower(u.email)='qa.rc74.client-a@iberfit.cl')
    AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
      WHERE s.key='free_client_completed_history_demand_qa'
        AND s.value#>>'{}'='true');
  -- Independent QA-only kill switch; installation alone changes no response.
  v_compact_legacy_refs := v_defer_completed_blocks
    AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
                WHERE s.key='environment' AND s.value#>>'{}'='QA')
    AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
                WHERE s.key='free_client_compact_legacy_refs_qa'
                  AND s.value#>>'{}'='true');
  IF v_defer_completed_blocks THEN
    SELECT coalesce(array_agg(d.entity_id),'{}'::uuid[])
      INTO v_keep_completed_sessions
    FROM (
      SELECT e.entity_id FROM public.domain_entities_v26 e
      WHERE e.client_id=ANY(v_allowed_client_ids) AND e.entity_type='session'
        AND lower(coalesce(e.status,e.body->>'status',''))
           IN ('completado','completada','completed')
        AND lower(coalesce(e.body->>'visibleToClient','true')) NOT IN ('false','0','no')
      ORDER BY e.updated_at DESC,e.entity_id DESC LIMIT 12
    ) d;
  END IF;

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
      select jsonb_agg(case
        WHEN v_role='cliente' AND v_compact_legacy_refs
         AND EXISTS (SELECT 1 FROM public.domain_entities_v26 d
          WHERE d.entity_type='session'
            AND d.entity_id=s.id AND d.client_id=s.client_id
            AND d.revision=s.revision
            AND jsonb_typeof(d.body)='object'
            AND coalesce(d.body->>'id',s.id::text)=s.id::text
            AND coalesce(d.body->>'clientId',d.body->>'client_id',s.client_id::text)=s.client_id::text
            AND lower(coalesce(d.status,d.body->>'status','')) IN ('publicado','publicada','published','disponible','en_curso','activo','active','habilitado','enabled','completado','completada','completed')
            AND lower(coalesce(d.body->>'visibleToClient','true')) NOT IN ('false','0','no'))
         THEN jsonb_build_object('id',s.id)
        when v_role='cliente' then public.iberfit_m43_client_safe_session_v2(to_jsonb(s))
        else to_jsonb(s) end)
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
      select jsonb_agg(case
        WHEN v_role='cliente' AND v_compact_legacy_refs
         AND EXISTS (SELECT 1 FROM public.domain_entities_v26 d
          WHERE d.entity_type='session_execution'
            AND d.entity_id=e.id AND d.client_id=e.client_id
            AND d.revision=e.revision
            AND jsonb_typeof(d.body)='object'
            AND coalesce(d.body->>'id',e.id::text)=e.id::text
            AND coalesce(d.body->>'clientId',d.body->>'client_id',e.client_id::text)=e.client_id::text
            )
         THEN jsonb_build_object('id',e.id)
        when v_role='cliente' then public.iberfit_m43_client_safe_execution_v1(jsonb_build_object('id',e.id,'revision',e.revision))
        else to_jsonb(e) end)
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
                     when v_role='cliente' and e.entity_type='session' then
                       case when v_defer_completed_blocks
                         and lower(coalesce(e.status,e.body->>'status',''))
                           in ('completado','completada','completed')
                         and NOT (e.entity_id=ANY(v_keep_completed_sessions))
                         then jsonb_set(public.iberfit_m43_client_safe_session_v2(e.body),
                           '{blocks}','[]'::jsonb,true)
                         else public.iberfit_m43_client_safe_session_v2(e.body) end
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
$function$

