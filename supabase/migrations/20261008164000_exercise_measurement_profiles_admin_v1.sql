-- IBERFIT · perfiles explícitos por ejercicio · V1 (aditivo, sin alterar sesiones ni catálogo).
-- Perfil automático = ausencia de fila o profile NULL. Los overrides no dependen de
-- revisiones del catálogo, para sobrevivir las sincronizaciones del catálogo canónico.
-- IBERFIT-TABLE-ACCESS: public.exercise_measurement_profiles :: Direct table access reserved for service_role. Public reads scoped through versioned RPC; authenticated writes checked inside Admin-only security-definer RPC.
-- IBERFIT-POLICY: public.exercise_measurement_profiles = service-role-only
create table if not exists public.exercise_measurement_profiles (
  exercise_id text primary key references public.exercise_catalog(id) on delete restrict,
  profile text null check (profile is null or profile in
    ('strength','isometric','endurance','intervals','carry','mobility','power')),
  revision bigint not null default 1 check (revision between 1 and 1000000000),
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

-- IBERFIT-TABLE-ACCESS: public.exercise_measurement_profile_audit :: Audit trail is internal only; no public/client access. Security-definer RPC records each CAS update; service_role handles diagnosis.
-- IBERFIT-POLICY: public.exercise_measurement_profile_audit = service-role-only
create table if not exists public.exercise_measurement_profile_audit (
  id bigint generated always as identity primary key,
  exercise_id text not null,
  prior_profile text null,
  new_profile text null,
  prior_revision bigint not null,
  new_revision bigint not null,
  actor_id uuid not null,
  changed_at timestamptz not null default now()
);

create index if not exists exercise_measurement_profile_audit_exercise_time_idx
  on public.exercise_measurement_profile_audit(exercise_id,changed_at desc);

alter table public.exercise_measurement_profiles enable row level security;
alter table public.exercise_measurement_profile_audit enable row level security;
revoke all on table public.exercise_measurement_profiles from public,anon,authenticated;
revoke all on table public.exercise_measurement_profile_audit from public,anon,authenticated;
revoke all on sequence public.exercise_measurement_profile_audit_id_seq from public,anon,authenticated;
grant select,insert,update,delete on table public.exercise_measurement_profiles to service_role;
grant select,insert,update,delete on table public.exercise_measurement_profile_audit to service_role;
grant usage,select on sequence public.exercise_measurement_profile_audit_id_seq to service_role;

-- Public: solo registros de ejercicios que ya son públicos, sin datos personales.
create or replace function public.iberfit_exercise_measurement_profiles_public_v1()
returns table(exercise_id text, profile text, revision bigint)
language sql stable security definer set search_path=''
as $fn$
  select mp.exercise_id,mp.profile,mp.revision
  from public.exercise_measurement_profiles mp
  join public.exercise_catalog e on e.id=mp.exercise_id
  where e.active=true and e.review_status<>'retirado'
  order by mp.exercise_id
  limit 5000;
$fn$;
revoke all on function public.iberfit_exercise_measurement_profiles_public_v1() from public;
grant execute on function public.iberfit_exercise_measurement_profiles_public_v1() to anon,authenticated;

-- CAS + lock en ejercicio padre: dos cambios simultáneos no pueden crear dos revisiones 1.
-- Solo Admin real del backend, nunca una alegación de rol enviada por el frontend.
create or replace function public.iberfit_admin_set_exercise_measurement_profile_v1(
  p_exercise_id text,
  p_profile text,
  p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_context jsonb := (select public.iberfit_application_context_v14());
  v_exercise text;
  v_prior text;
  v_rev bigint := 0;
  v_next bigint;
  v_value text := nullif(trim(coalesce(p_profile,'')),'');
begin
  if v_actor is null or v_context->>'ok' is distinct from 'true' or
     v_context->>'membershipStatus' is distinct from 'active' or
     not (coalesce(v_context->'roles','[]'::jsonb) ? 'admin') then
    raise exception using message='IBERFIT_EXERCISE_PROFILE_ADMIN_REQUIRED',errcode='42501';
  end if;
  if p_exercise_id is null or p_exercise_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'
     or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>1000000000
     or (v_value is not null and v_value not in
       ('strength','isometric','endurance','intervals','carry','mobility','power'))
  then
    raise exception using message='IBERFIT_EXERCISE_PROFILE_INVALID',errcode='22023';
  end if;
  select e.id into v_exercise from public.exercise_catalog e
    where e.id=p_exercise_id and e.active=true and e.review_status<>'retirado'
    for update;
  if not found then
    raise exception using message='IBERFIT_EXERCISE_PROFILE_NOT_FOUND',errcode='P0002';
  end if;
  select mp.profile,mp.revision into v_prior,v_rev
    from public.exercise_measurement_profiles mp where mp.exercise_id=v_exercise;
  if not found then v_prior:=null;v_rev:=0;end if;
  if v_rev <> p_expected_revision then
    raise exception using message='IBERFIT_EXERCISE_PROFILE_REVISION_CONFLICT',errcode='40001';
  end if;
  v_next:=v_rev+1;
  insert into public.exercise_measurement_profiles(exercise_id,profile,revision,updated_at,updated_by)
  values(v_exercise,v_value,v_next,now(),v_actor)
  on conflict (exercise_id) do update
     set profile=excluded.profile,revision=excluded.revision,
         updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  insert into public.exercise_measurement_profile_audit(
    exercise_id,prior_profile,new_profile,prior_revision,new_revision,actor_id)
  values(v_exercise,v_prior,v_value,v_rev,v_next,v_actor);
  return jsonb_build_object('ok',true,'exerciseId',v_exercise,
    'measurementProfile',v_value,'measurementProfileRevision',v_next);
end;
$fn$;
revoke all on function public.iberfit_admin_set_exercise_measurement_profile_v1(text,text,bigint) from public,anon;
grant execute on function public.iberfit_admin_set_exercise_measurement_profile_v1(text,text,bigint) to authenticated;

comment on table public.exercise_measurement_profiles is
  'Exercise-specific explicit metric profile overrides. NULL = auto; no change to historical training results.';
comment on function public.iberfit_admin_set_exercise_measurement_profile_v1(text,text,bigint) is
  'Admin-only optimistic write; row-locked, audited, revisioned. Caller cannot write arbitrary exercise metadata.';
