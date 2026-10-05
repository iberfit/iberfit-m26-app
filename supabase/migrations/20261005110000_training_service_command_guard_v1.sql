-- IBERFIT · Entrenamiento Operativo 360 · training-service command guard v1
--
-- Product invariant:
--   Persona != Diagnóstico IRI != Servicio de entrenamiento.
-- New planning/session activation requires an ACTIVE training service.
-- Existing execution continuation/closure remains available so a service status
-- change cannot strand or destroy already-recorded session progress.
--
-- Offline continuity:
-- SESION_INICIAR may synchronize after the service status changed only when the
-- server can prove that the matching confirmed appointment was scheduled at a
-- time when the training service was active, and the sync is still inside the
-- canonical 30-day recovery horizon.

create or replace function private.iberfit_training_service_status_at_v1(
  p_organization_id uuid,
  p_person_id uuid,
  p_at timestamptz
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.status
    from public.iberfit_training_service_events_v1 e
    where e.organization_id = p_organization_id
      and e.person_id = p_person_id
      and e.effective_at <= coalesce(p_at, now())
    order by e.effective_at desc, e.created_at desc, e.id desc
    limit 1
  ), 'none'::text)
$$;

revoke all on function private.iberfit_training_service_status_at_v1(uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function private.iberfit_training_service_status_at_v1(uuid,uuid,timestamptz)
  to service_role;

create or replace function private.iberfit_training_command_guard_v1(p_command jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text := nullif(p_command->>'type','');
  v_client_id uuid;
  v_session_id uuid;
  v_appointment_id uuid;
  v_context jsonb;
  v_organization_id uuid;
  v_current_status text := 'none';
  v_status_at_appointment text := 'none';
  v_appointment public.appointments%rowtype;
  v_requires_active boolean := false;
begin
  if jsonb_typeof(p_command) <> 'object' then
    return jsonb_build_object('allowed', true, 'basis', 'delegate_invalid_command');
  end if;

  v_requires_active := v_type in (
    'PLAN_VALIDAR',
    'PLAN_APROBAR',
    'PLAN_PUBLICAR',
    'PLAN_REABRIR',
    'SESION_APROBAR',
    'SESION_PUBLICAR',
    'SESION_HABILITAR',
    'SESION_INICIAR',
    'EJECUCION_INICIAR',
    'INTELIGENCIA_APLICAR_A_BORRADOR'
  );

  if not v_requires_active then
    return jsonb_build_object('allowed', true, 'basis', 'not_applicable');
  end if;

  begin
    v_client_id := nullif(p_command->>'clientId','')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('allowed', true, 'basis', 'delegate_invalid_identifiers');
  end;

  if v_client_id is null then
    return jsonb_build_object('allowed', true, 'basis', 'delegate_invalid_identifiers');
  end if;

  v_context := public.iberfit_application_context_v14();
  v_organization_id := nullif(v_context->>'organizationId','')::uuid;
  v_current_status := private.iberfit_training_service_status_at_v1(
    v_organization_id,
    v_client_id,
    now()
  );

  if v_current_status = 'active' then
    return jsonb_build_object(
      'allowed', true,
      'basis', 'current_active_service',
      'serviceStatus', v_current_status
    );
  end if;

  if v_type <> 'SESION_INICIAR' then
    return jsonb_build_object(
      'allowed', false,
      'basis', 'service_not_active',
      'serviceStatus', v_current_status
    );
  end if;

  begin
    v_session_id := nullif(p_command->>'entityId','')::uuid;
    v_appointment_id := nullif(p_command->'payload'->>'appointmentId','')::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object(
      'allowed', false,
      'basis', 'offline_authorization_invalid',
      'serviceStatus', v_current_status
    );
  end;

  if v_session_id is null or v_appointment_id is null then
    return jsonb_build_object(
      'allowed', false,
      'basis', 'offline_authorization_missing',
      'serviceStatus', v_current_status
    );
  end if;

  select a.*
  into v_appointment
  from public.appointments a
  where a.id = v_appointment_id
    and a.client_id = v_client_id
    and a.session_id = v_session_id
    and a.status = 'confirmada'
  limit 1;

  if not found then
    return jsonb_build_object(
      'allowed', false,
      'basis', 'confirmed_appointment_required',
      'serviceStatus', v_current_status
    );
  end if;

  if now() < v_appointment.start_at - interval '6 hours'
     or now() > v_appointment.end_at + interval '30 days' then
    return jsonb_build_object(
      'allowed', false,
      'basis', 'offline_recovery_window_expired',
      'serviceStatus', v_current_status
    );
  end if;

  v_status_at_appointment := private.iberfit_training_service_status_at_v1(
    v_organization_id,
    v_client_id,
    v_appointment.start_at
  );

  if v_status_at_appointment <> 'active' then
    return jsonb_build_object(
      'allowed', false,
      'basis', 'service_not_active_at_appointment',
      'serviceStatus', v_current_status,
      'serviceStatusAtAppointment', v_status_at_appointment
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'basis', 'confirmed_appointment_offline_recovery',
    'serviceStatus', v_current_status,
    'serviceStatusAtAppointment', v_status_at_appointment
  );
end
$$;

revoke all on function private.iberfit_training_command_guard_v1(jsonb)
  from public, anon, authenticated;
grant execute on function private.iberfit_training_command_guard_v1(jsonb)
  to service_role;

alter function public.iberfit_command_preflight_v26(jsonb)
  rename to iberfit_command_preflight_v26_pre_training_service_guard_v1;

revoke all on function public.iberfit_command_preflight_v26_pre_training_service_guard_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.iberfit_command_preflight_v26_pre_training_service_guard_v1(jsonb)
  to service_role;

create or replace function public.iberfit_command_preflight_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard jsonb;
begin
  v_guard := private.iberfit_training_command_guard_v1(p_command);
  if coalesce((v_guard->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'kind', 'rejected',
      'operationId', p_command->>'operationId',
      'remoteRevision', null,
      'reason', 'TRAINING_SERVICE_NOT_ACTIVE',
      'guard', v_guard,
      'serverAt', now()
    );
  end if;
  return public.iberfit_command_preflight_v26_pre_training_service_guard_v1(p_command);
end
$$;

revoke all on function public.iberfit_command_preflight_v26(jsonb)
  from public, anon;
grant execute on function public.iberfit_command_preflight_v26(jsonb)
  to authenticated, service_role;

alter function public.iberfit_execute_command_v26(jsonb)
  rename to iberfit_execute_command_v26_pre_training_service_guard_v1;

revoke all on function public.iberfit_execute_command_v26_pre_training_service_guard_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.iberfit_execute_command_v26_pre_training_service_guard_v1(jsonb)
  to service_role;

create or replace function public.iberfit_execute_command_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guard jsonb;
  v_operation_id uuid;
begin
  begin
    v_operation_id := nullif(p_command->>'operationId','')::uuid;
  exception when invalid_text_representation then
    v_operation_id := null;
  end;

  -- Preserve canonical idempotency: an already-applied operation must continue
  -- returning its original acknowledgement even if service status changed later.
  if v_operation_id is not null
     and exists (
       select 1
       from public.command_receipts_v26 r
       where r.operation_id = v_operation_id
     ) then
    return public.iberfit_execute_command_v26_pre_training_service_guard_v1(p_command);
  end if;

  v_guard := private.iberfit_training_command_guard_v1(p_command);
  if coalesce((v_guard->>'allowed')::boolean, false) = false then
    return jsonb_build_object(
      'kind', 'rejected',
      'operationId', p_command->>'operationId',
      'remoteRevision', null,
      'reason', 'TRAINING_SERVICE_NOT_ACTIVE',
      'guard', v_guard,
      'serverAt', now()
    );
  end if;

  return public.iberfit_execute_command_v26_pre_training_service_guard_v1(p_command);
end
$$;

revoke all on function public.iberfit_execute_command_v26(jsonb)
  from public, anon;
grant execute on function public.iberfit_execute_command_v26(jsonb)
  to authenticated, service_role;
