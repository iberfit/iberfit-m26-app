-- IBERFIT M26 RC46.1 - compatibility closure.
--
-- Proven locally by Gate C V18 (67/67):
--   * Coach without assignments authenticates and receives an empty portfolio.
--   * Assigned Coach sees only active assigned clients.
--   * Admin retains historical organization-wide semantics across every
--     policy/function that depends on is_assigned_coach().
--   * Client self-scope remains unchanged.
--
-- Safety design:
--   * historical iberfit_bootstrap_v26_rc29() is never replaced or dropped;
--   * dependent policies/functions are not rewritten;
--   * current bootstrap is rewired only when exactly one canonical RC29 call
--     is present;
--   * is_assigned_coach(target_client uuid) preserves its historical input
--     parameter name and restores only the Admin compatibility branch while
--     keeping Coach scope strict to active organization assignments.

begin;

do $rc461_guard$
declare
  v_bootstrap text;
  v_call_count integer;
  v_helper_args text;
begin
  if to_regprocedure('public.iberfit_bootstrap_v26()') is null then
    raise exception 'M26_RC461_BOOTSTRAP_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_bootstrap_v26_rc29()') is null then
    raise exception 'M26_RC461_RC29_REQUIRED';
  end if;
  if to_regprocedure('public.is_assigned_coach(uuid)') is null then
    raise exception 'M26_RC461_ASSIGNMENT_HELPER_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_can_access_client_v26(uuid)') is null then
    raise exception 'M26_RC461_ACCESS_HELPER_REQUIRED';
  end if;
  if to_regclass('public.iberfit_coach_client_assignments') is null then
    raise exception 'M26_RC461_ASSIGNMENTS_TABLE_REQUIRED';
  end if;
  if to_regclass('public.iberfit_organization_memberships') is null then
    raise exception 'M26_RC461_MEMBERSHIPS_TABLE_REQUIRED';
  end if;

  select pg_get_function_identity_arguments('public.is_assigned_coach(uuid)'::regprocedure)
  into v_helper_args;
  if v_helper_args <> 'target_client uuid' then
    raise exception 'M26_RC461_HISTORICAL_PARAMETER_REQUIRED:%',v_helper_args;
  end if;

  select pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)
  into v_bootstrap;
  v_call_count :=
    (length(v_bootstrap)-length(replace(v_bootstrap,'public.iberfit_bootstrap_v26_rc29()',''))) /
    length('public.iberfit_bootstrap_v26_rc29()');
  if v_call_count <> 1 then
    raise exception 'M26_RC461_BOOTSTRAP_RC29_CALL_COUNT:%',v_call_count;
  end if;
end
$rc461_guard$;

create temporary table rc461_before(
  key text primary key,
  value text not null
) on commit drop;

insert into rc461_before(key,value)
select 'rc29_md5',md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure));

insert into rc461_before(key,value)
select 'policy_fp',md5(coalesce(string_agg(
  schemaname||'|'||tablename||'|'||policyname||'|'||cmd||'|'||
  coalesce(qual,'')||'|'||coalesce(with_check,''),
  E'\n' order by schemaname,tablename,policyname,cmd
),''))
from pg_policies
where schemaname='public'
  and (
    coalesce(qual,'') ilike '%is_assigned_coach%'
    or coalesce(with_check,'') ilike '%is_assigned_coach%'
  );

insert into rc461_before(key,value)
select 'function_fp',md5(coalesce(string_agg(
  p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||
  md5(pg_get_functiondef(p.oid)),
  E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid)
),''))
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.prokind='f'
  and p.proname<>'is_assigned_coach'
  and pg_get_functiondef(p.oid) ilike '%is_assigned_coach%';

-- Exact RC29 bootstrap body with ONE compatibility change:
-- Coaches with no accessible canary are allowed through. All collections
-- remain filtered by iberfit_can_access_client_v26(), so their portfolio is
-- naturally empty rather than unauthorized.
create or replace function public.iberfit_bootstrap_v26_rc46_base()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $rc46base$
declare v_role text; v_has_canary boolean; v_data jsonb; v_revisions jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  v_role:=public.iberfit_current_role_v26();

  select exists(
    select 1 from public.m26_canary_clients_v26 c
    where c.active=true and public.iberfit_can_access_client_v26(c.client_id)
  ) into v_has_canary;

  if not v_has_canary and v_role <> 'coach' then
    raise exception 'M26_CANARY_NOT_ENABLED' using errcode='42501';
  end if;

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
end
$rc46base$;

revoke all on function public.iberfit_bootstrap_v26_rc46_base()
from public, anon, authenticated;

-- Rewire exactly one internal base call in the current canonical bootstrap.
do $rc461_rewire$
declare
  v_current text;
  v_new text;
  v_old_call constant text := 'public.iberfit_bootstrap_v26_rc29()';
  v_new_call constant text := 'public.iberfit_bootstrap_v26_rc46_base()';
  v_count integer;
begin
  select pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)
  into v_current;

  v_count :=
    (length(v_current)-length(replace(v_current,v_old_call,''))) /
    length(v_old_call);

  if v_count <> 1 then
    raise exception 'M26_RC461_CURRENT_BOOTSTRAP_RC29_CALL_COUNT:%',v_count;
  end if;

  v_new := replace(v_current,v_old_call,v_new_call);
  if v_new=v_current
     or position(v_old_call in v_new)>0
     or position(v_new_call in v_new)=0 then
    raise exception 'M26_RC461_BOOTSTRAP_REWIRE_VALIDATION_FAILED';
  end if;

  execute v_new;
end
$rc461_rewire$;

revoke all on function public.iberfit_bootstrap_v26()
from public, anon, authenticated;
grant execute on function public.iberfit_bootstrap_v26()
to authenticated;

-- Restore the historical Admin branch while preserving RC46 strict Coach
-- assignment semantics. Client self-access remains in can_access_client_v26().
create or replace function public.is_assigned_coach(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $rc46compat$
select case
  when auth.uid() is null or target_client is null then false
  when public.iberfit_current_role_v26()='admin' then true
  when public.iberfit_current_role_v26()<>'coach' then false
  else exists (
    select 1
    from public.iberfit_coach_client_assignments a
    join public.iberfit_organization_memberships m
      on m.organization_id=a.organization_id
     and m.user_id=a.coach_user_id
     and m.status='active'
    where a.coach_user_id=auth.uid()
      and a.client_id=target_client::text
      and a.status='active'
      and a.starts_at<=current_date
      and (a.ends_at is null or a.ends_at>=current_date)
  )
end
$rc46compat$;

revoke all on function public.is_assigned_coach(uuid)
from public, anon, authenticated;
grant execute on function public.is_assigned_coach(uuid)
to authenticated;

-- Compatibility closure: historical RC29 and all dependent definitions must
-- remain unchanged. Only the helper implementation and the single bootstrap
-- base-call target are allowed to change.
do $rc461_validate$
declare
  v_before text;
  v_after text;
  v_bootstrap text;
  v_helper_language text;
  v_helper_volatility text;
  v_helper_security_definer boolean;
  v_helper_config text;
begin
  select value into v_before from rc461_before where key='rc29_md5';
  select md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure)) into v_after;
  if v_before is distinct from v_after then
    raise exception 'M26_RC461_HISTORICAL_RC29_CHANGED';
  end if;

  select value into v_before from rc461_before where key='policy_fp';
  select md5(coalesce(string_agg(
    schemaname||'|'||tablename||'|'||policyname||'|'||cmd||'|'||
    coalesce(qual,'')||'|'||coalesce(with_check,''),
    E'\n' order by schemaname,tablename,policyname,cmd
  ),'')) into v_after
  from pg_policies
  where schemaname='public'
    and (
      coalesce(qual,'') ilike '%is_assigned_coach%'
      or coalesce(with_check,'') ilike '%is_assigned_coach%'
    );
  if v_before is distinct from v_after then
    raise exception 'M26_RC461_DEPENDENT_POLICY_DEFINITIONS_CHANGED';
  end if;

  select value into v_before from rc461_before where key='function_fp';
  select md5(coalesce(string_agg(
    p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||
    md5(pg_get_functiondef(p.oid)),
    E'\n' order by p.proname,pg_get_function_identity_arguments(p.oid)
  ),'')) into v_after
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prokind='f'
    and p.proname<>'is_assigned_coach'
    and pg_get_functiondef(p.oid) ilike '%is_assigned_coach%';
  if v_before is distinct from v_after then
    raise exception 'M26_RC461_DEPENDENT_FUNCTION_DEFINITIONS_CHANGED';
  end if;

  select pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure) into v_bootstrap;
  if position('public.iberfit_bootstrap_v26_rc29()' in v_bootstrap)>0
     or position('public.iberfit_bootstrap_v26_rc46_base()' in v_bootstrap)=0 then
    raise exception 'M26_RC461_BOOTSTRAP_REWIRE_NOT_PRESENT';
  end if;

  select
    l.lanname,
    p.provolatile,
    p.prosecdef,
    coalesce(array_to_string(p.proconfig,','),'')
  into
    v_helper_language,
    v_helper_volatility,
    v_helper_security_definer,
    v_helper_config
  from pg_proc p
  join pg_language l on l.oid=p.prolang
  where p.oid='public.is_assigned_coach(uuid)'::regprocedure;

  if v_helper_language <> 'sql'
     or v_helper_volatility <> 's'
     or v_helper_security_definer is distinct from true
     or position('search_path=' in v_helper_config)=0 then
    raise exception 'M26_RC461_ASSIGNMENT_HELPER_PROPERTIES_INVALID';
  end if;

  if not has_function_privilege('authenticated','public.is_assigned_coach(uuid)','EXECUTE')
     or has_function_privilege('anon','public.is_assigned_coach(uuid)','EXECUTE') then
    raise exception 'M26_RC461_ASSIGNMENT_HELPER_PRIVILEGES_INVALID';
  end if;
end
$rc461_validate$;

commit;
