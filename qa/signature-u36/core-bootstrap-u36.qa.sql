-- IBERFIT U36. Isolated QA-only core-bootstrap proof.
-- Derived from QA public.iberfit_bootstrap_v26_rc29() baseline
-- md5(pg_get_functiondef(...)) = ce0cbff2a99e28bff593132a350de595
-- IMPORTANT: QA and PROD rc29 baselines differ; do not apply this to PROD.
-- Execute only inside BEGIN ... ROLLBACK, preceded by the exact QA hash check.
-- This function retains all source permissions/filters and only omits three
-- history aggregates. It is not a replacement for real WebAuthn assurance.
-- It is intentionally private and ungranted to every API role.
SELECT 1/(CASE WHEN
  md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))
  = 'ce0cbff2a99e28bff593132a350de595'
  THEN 1 ELSE 0 END) AS u36_base_must_match;

CREATE OR REPLACE FUNCTION private.iberfit_bootstrap_v26_rc29_core_u36_qa()
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

REVOKE ALL ON FUNCTION private.iberfit_bootstrap_v26_rc29_core_u36_qa()
 FROM PUBLIC, anon, authenticated, service_role;
