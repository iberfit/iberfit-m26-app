-- IBERFIT M26 RC46 · strict Coach assignment scope.
-- Compatibilidad:
--   * Si la organización nunca ha usado asignaciones
--   * y existe exactamente un Coach activo,
--   * los clientes históricos se asignan a ese Coach.
--
-- Después de RC46:
--   Coach sin asignaciones activas = cartera vacía.
--   Admin conserva su aplicación organizacional independiente.

begin;

do $rc46_guard$
begin
  if to_regclass('public.clients') is null then
    raise exception 'M26_RC46_CLIENTS_TABLE_REQUIRED';
  end if;

  if to_regclass('public.iberfit_coach_client_assignments') is null then
    raise exception 'M26_RC46_ASSIGNMENTS_TABLE_REQUIRED';
  end if;

  if to_regclass('public.iberfit_organization_memberships') is null then
    raise exception 'M26_RC46_MEMBERSHIPS_TABLE_REQUIRED';
  end if;

  if to_regprocedure('public.is_assigned_coach(uuid)') is null then
    raise exception 'M26_RC46_ASSIGNMENT_HELPER_REQUIRED';
  end if;

  if to_regprocedure('public.iberfit_application_context_v14()') is null then
    raise exception 'M26_RC46_APPLICATION_CONTEXT_REQUIRED';
  end if;
end
$rc46_guard$;

-- ----------------------------------------------------------
-- Compatibilidad con la etapa histórica de un solo entrenador.
--
-- No se ejecuta si ya existe CUALQUIER registro de asignación:
-- eso significa que Admin ya comenzó a administrar la cartera
-- explícitamente y la migración no debe reinterpretar decisiones.
-- ----------------------------------------------------------

do $rc46_backfill$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000140';
  v_coaches uuid[];
  v_coach uuid;
  v_assignment_rows integer := 0;
begin
  select count(*)
  into v_assignment_rows
  from public.iberfit_coach_client_assignments
  where organization_id = v_org;

  if v_assignment_rows = 0 then

    select coalesce(
      array_agg(candidate.user_id),
      array[]::uuid[]
    )
    into v_coaches
    from (
      select distinct m.user_id
      from public.iberfit_organization_memberships m
      where m.organization_id = v_org
        and m.status = 'active'
        and (
          exists (
            select 1
            from public.user_profiles up
            where up.user_id = m.user_id
              and case lower(up.role::text)
                    when 'entrenador' then 'coach'
                    when 'administrador' then 'admin'
                    when 'cliente' then 'client'
                    else lower(up.role::text)
                  end = 'coach'
          )
          or exists (
            select 1
            from public.user_application_roles ar
            where ar.user_id = m.user_id
              and lower(ar.role::text) = 'coach'
              and ar.active = true
          )
        )
    ) candidate;

    if cardinality(v_coaches) = 1 then
      v_coach := v_coaches[1];

      insert into public.iberfit_coach_client_assignments(
        organization_id,
        coach_user_id,
        client_id,
        status,
        starts_at,
        reason,
        created_by
      )
      select
        v_org,
        v_coach,
        c.id::text,
        'active',
        current_date,
        'Migración RC46: cartera histórica asignada al único entrenador activo.',
        v_coach
      from public.clients c
      where not exists (
        select 1
        from public.iberfit_coach_client_assignments a
        where a.organization_id = v_org
          and a.coach_user_id = v_coach
          and a.client_id = c.id::text
          and a.status = 'active'
      );
    end if;
  end if;
end
$rc46_backfill$;

-- ----------------------------------------------------------
-- Frontera backend canónica.
--
-- Un Coach solamente es Coach asignado cuando existe una
-- asignación activa, vigente y la membresía sigue activa.
-- ----------------------------------------------------------

create or replace function public.is_assigned_coach(
  target_client uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $rc46$
  select
    target_client is not null
    and exists (
      select 1
      from public.iberfit_coach_client_assignments a
      join public.iberfit_organization_memberships m
        on m.organization_id = a.organization_id
       and m.user_id = a.coach_user_id
       and m.status = 'active'
      where a.coach_user_id = auth.uid()
        and a.client_id = target_client::text
        and a.status = 'active'
        and a.starts_at <= current_date
        and (
          a.ends_at is null
          or a.ends_at >= current_date
        )
    );
$rc46$;

revoke all
on function public.is_assigned_coach(uuid)
from public, anon;

grant execute
on function public.is_assigned_coach(uuid)
to authenticated;

-- ----------------------------------------------------------
-- Contexto RC46.
--
-- Si el usuario puede actuar como Coach, assignmentScopeEnforced
-- es SIEMPRE true. Una lista vacía significa literalmente
-- "no tienes clientes asignados".
-- ----------------------------------------------------------

create or replace function public.iberfit_application_context_v14()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $rc46$
declare
  v_user uuid := auth.uid();
  v_primary text;
  v_org uuid := '00000000-0000-4000-8000-000000000140';
  v_status text;
  v_roles jsonb;
  v_clients jsonb;
  v_enforced boolean := false;
begin
  if v_user is null then
    raise exception using
      errcode = '28000',
      message = 'V14_AUTH_REQUIRED';
  end if;

  select status
  into v_status
  from public.iberfit_organization_memberships
  where organization_id = v_org
    and user_id = v_user;

  if v_status is null then
    raise exception using
      errcode = '42501',
      message = 'V14_ORGANIZATION_MEMBERSHIP_REQUIRED';
  end if;

  if v_status <> 'active' then
    raise exception using
      errcode = '42501',
      message = 'V14_ORGANIZATION_ACCESS_SUSPENDED';
  end if;

  select lower(role::text)
  into v_primary
  from public.user_profiles
  where user_id = v_user;

  select coalesce(
    jsonb_agg(
      x.role
      order by case x.role
        when 'coach' then 1
        when 'admin' then 2
        else 3
      end
    ),
    '[]'::jsonb
  )
  into v_roles
  from (
    select
      case v_primary
        when 'entrenador' then 'coach'
        when 'administrador' then 'admin'
        when 'cliente' then 'client'
        else v_primary
      end as role
    where v_primary is not null

    union

    select role::text
    from public.user_application_roles
    where user_id = v_user
      and active = true
  ) x
  where x.role in ('client','coach','admin');

  select exists (
    select 1
    from jsonb_array_elements_text(v_roles) as role_item(role)
    where role_item.role = 'coach'
  )
  into v_enforced;

  select coalesce(
    jsonb_agg(client_id order by client_id),
    '[]'::jsonb
  )
  into v_clients
  from public.iberfit_coach_client_assignments
  where organization_id = v_org
    and coach_user_id = v_user
    and status = 'active'
    and starts_at <= current_date
    and (
      ends_at is null
      or ends_at >= current_date
    );

  return jsonb_build_object(
    'ok', true,
    'organizationId', v_org,
    'membershipStatus', v_status,
    'roles', v_roles,
    'assignmentScopeEnforced', coalesce(v_enforced,false),
    'assignedClientIds', v_clients,
    'revision', 2,
    'serverTime', now()
  );
end
$rc46$;

revoke all
on function public.iberfit_application_context_v14()
from public, anon;

grant execute
on function public.iberfit_application_context_v14()
to authenticated;

commit;
