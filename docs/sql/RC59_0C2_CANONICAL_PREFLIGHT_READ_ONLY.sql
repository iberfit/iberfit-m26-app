-- IBERFIT M26 RC59.0C2A
-- CANONICAL BACKEND PREFLIGHT — STRICTLY READ ONLY
--
-- Run only after confirming the canonical Supabase project.
-- This script contains no DDL/DML and changes no data.

select
  current_database() as database_name,
  current_user as database_user,
  now() as observed_at;

with required_objects(label,object_name,present) as (
  values
    (
      'clients',
      'public.clients',
      to_regclass('public.clients') is not null
    ),
    (
      'client_helper',
      'public.iberfit_client_id()',
      to_regprocedure('public.iberfit_client_id()') is not null
    ),
    (
      'assignment_helper',
      'public.is_assigned_coach(uuid)',
      to_regprocedure('public.is_assigned_coach(uuid)') is not null
    ),
    (
      'assignments',
      'public.iberfit_coach_client_assignments',
      to_regclass(
        'public.iberfit_coach_client_assignments'
      ) is not null
    ),
    (
      'memberships',
      'public.iberfit_organization_memberships',
      to_regclass(
        'public.iberfit_organization_memberships'
      ) is not null
    ),
    (
      'rc43_sessions',
      'public.m26_training_sessions_v43',
      to_regclass(
        'public.m26_training_sessions_v43'
      ) is not null
    ),
    (
      'rc44_wearables',
      'public.m26_wearable_daily_summaries_v44',
      to_regclass(
        'public.m26_wearable_daily_summaries_v44'
      ) is not null
    )
)
select
  label,
  object_name,
  present
from required_objects
order by label;

select
  to_regclass(
    'public.m26_telemetry_events_v59'
  ) as telemetry_events_before_apply,
  to_regclass(
    'public.m26_telemetry_import_batches_v59'
  ) as telemetry_batches_before_apply,
  to_regprocedure(
    'public.m26_telemetry_import_v59(jsonb)'
  ) as telemetry_import_before_apply,
  to_regprocedure(
    'public.m26_telemetry_json_safe_v59(jsonb)'
  ) as telemetry_privacy_guard_before_apply;

select
  p.oid::regprocedure::text as function_name,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as function_definition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'iberfit_client_id',
    'is_assigned_coach'
  )
order by p.proname;

select
  c.oid::regclass::text as relation_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_catalog.pg_class c
where c.oid = any (
  array[
    'public.clients'::regclass,
    'public.iberfit_coach_client_assignments'::regclass,
    'public.iberfit_organization_memberships'::regclass
  ]
)
order by relation_name;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'clients',
    'iberfit_coach_client_assignments',
    'iberfit_organization_memberships',
    'm26_wearable_daily_summaries_v44',
    'm26_training_sessions_v43'
  )
order by tablename, policyname;