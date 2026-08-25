do $$
declare
  v_env jsonb := public.iberfit_environment();
begin
  if coalesce(v_env->>'environment','') <> 'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'RC74_4L_QA_ENVIRONMENT_GUARD_FAILED';
  end if;
end
$$;

create or replace function public.m26_backend_health_v43()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
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
      count(*) filter (where to_regclass(relation_name) is not null) as table_count,
      count(*) filter (
        where (
          select c.relrowsecurity
          from pg_catalog.pg_class c
          where c.oid = to_regclass(relation_name)
        ) is true
      ) as rls_count
    from backend_tables
  ),
  env_state as (
    select public.iberfit_environment() as env
  )
  select jsonb_build_object(
    'ok', true,
    'ready', table_count = 6 and rls_count = 6,
    'version', 'RC43',
    'environment', lower(coalesce(env->>'environment','unset')),
    'tables', table_count,
    'rlsTables', rls_count,
    'productionModified', false,
    'productionDeployed', false
  )
  from table_state
  cross join env_state;
$function$;

create or replace function public.m26_backend_health_v431()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
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
      count(*) filter (where to_regclass(relation_name) is not null) as table_count,
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
  ),
  env_state as (
    select public.iberfit_environment() as env
  )
  select jsonb_build_object(
    'ok', true,
    'ready', table_count = 7 and rls_count = 7 and policy_count >= 4 and rpc_count = 3,
    'version', 'RC43.1',
    'environment', lower(coalesce(env->>'environment','unset')),
    'tables', table_count,
    'rlsTables', rls_count,
    'draftPolicies', policy_count,
    'draftRpcs', rpc_count,
    'productionModified', false,
    'productionDeployed', false
  )
  from table_state
  cross join policy_state
  cross join rpc_state
  cross join env_state;
$function$;

create or replace function public.m26_wearable_health_v44()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
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
      count(*) filter (where to_regclass(relation_name) is not null) as table_count,
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
  ),
  env_state as (
    select public.iberfit_environment() as env
  )
  select jsonb_build_object(
    'ok', true,
    'ready', table_count = 3 and rls_count = 3 and policy_count >= 10 and rpc_count = 5,
    'version', 'RC44',
    'environment', lower(coalesce(env->>'environment','unset')),
    'wearableTables', table_count,
    'wearableRls', rls_count,
    'wearablePolicies', policy_count,
    'wearableRpcs', rpc_count,
    'productionModified', false,
    'productionDeployed', false
  )
  from table_state
  cross join policy_state
  cross join rpc_state
  cross join env_state;
$function$;
