-- IBERFIT P0 — QA-first, fail-closed Client internal-event bootstrap optimization.
-- Exact scope: rc29 only. Do not loosen MFA, RLS, privileges or the authenticated 10s SLA.
-- Final Client HTTP projection always drops domainEvents; Coach/Admin must retain them.
-- QA candidate parity: complete JSON identical for Client A/B; Coach/Admin rc29 unchanged.
-- Base definition MD5 5c565986e5946e768cd84eb0398f76cb; optimized body MD5 8419989105aacb40222a3e79fdf6ce93.
SELECT 1/(CASE WHEN
 (SELECT md5(pg_get_functiondef(oid))='5c565986e5946e768cd84eb0398f76cb'
       AND pg_get_userbyid(proowner)='postgres'
       AND prosecdef=true AND provolatile='s'
       AND proconfig @> ARRAY['search_path=""']::text[]
       AND NOT has_function_privilege('anon',oid,'EXECUTE')
       AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
       AND has_function_privilege('service_role',oid,'EXECUTE')
 FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure)
 THEN 1 ELSE 0 END) AS P0_RC29_BASELINE_SECURITY_GUARD;

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
    'domainEvents',case when v_role in ('client','cliente') then '[]'::jsonb else coalesce((
      with candidates as materialized (
        select distinct client_id from public.domain_events_v26
      ), visible as materialized (
        select client_id from candidates
        where public.iberfit_can_access_client_v26(client_id)
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
        where public.iberfit_can_access_client_v26(client_id)
      )
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
      where exists (select 1 from visible v where v.client_id is not distinct from e.client_id)
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
$function$;

SELECT 1/(CASE WHEN
 (SELECT md5(prosrc)='8419989105aacb40222a3e79fdf6ce93' AND pg_get_userbyid(proowner)='postgres'
    AND prosecdef AND provolatile='s' AND proconfig @> ARRAY['search_path=""']::text[]
    AND NOT has_function_privilege('anon',oid,'EXECUTE')
    AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
    AND has_function_privilege('service_role',oid,'EXECUTE')
 FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_rc29()'::regprocedure)
 THEN 1 ELSE 0 END) AS P0_RC29_OPTIMIZED_SECURITY_GUARD;
