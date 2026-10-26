-- SIGNATURE U40 · guarded PROD rollback restoring prior rc29 SQL only.
-- No tables, grants, sessions, RLS, or user data affected.
-- Supply the certified U40 result checksum before attempting rollback.
-- QA canonical parity checksum 7fb270cb0f55f0f1f9918ac9b5d69178.
-- NEVER run when the current definition changed since U40.
BEGIN;
SELECT 1/(CASE WHEN
 (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment')='PRODUCTION'
 AND md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))
 ='7fb270cb0f55f0f1f9918ac9b5d69178'
 THEN 1 ELSE 0 END) AS u40_exact_rollback_signature_required;
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
    'sessionExecutions',coalesce((
      select jsonb_agg(case when v_role='cliente' then public.iberfit_m43_client_safe_execution_v1(to_jsonb(e)) else to_jsonb(e) end)
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
      with candidates as materialized (
        select distinct client_id from public.domain_events_v26
      ), visible as materialized (
        select client_id from candidates
        where public.iberfit_can_access_client_v26(client_id)
      )
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from public.domain_events_v26 e
      where exists (select 1 from visible v where v.client_id is not distinct from e.client_id)
    ),'[]'::jsonb),
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
        where public.iberfit_can_access_client_v26(client_id)
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
        and (v_role not in ('client','cliente') or e.entity_type <> 'checkin')
    ),'[]'::jsonb),
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
SELECT 1/(CASE WHEN md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))
 ='6ca1d901bb26ceedccfb7dc15945451d'
 THEN 1 ELSE 0 END) AS u40_prior_definition_restored;
COMMIT;
