-- IBERFIT · Entrenamiento Operativo 360 · training guard access-scope hardening v1
--
-- Follow-up is intentionally idempotent. QA received the first guard revision
-- before this information-disclosure hardening was discovered. Fresh environments
-- receive the corrected main migration and this CREATE OR REPLACE safely repeats it.

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

  -- Preserve the canonical access-control response and avoid leaking training
  -- service state for people outside the caller's authorized scope.
  if not public.iberfit_can_access_client_v26(v_client_id) then
    return jsonb_build_object('allowed', true, 'basis', 'delegate_client_access');
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
