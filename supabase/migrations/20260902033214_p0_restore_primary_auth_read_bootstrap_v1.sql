-- IBERFIT P0 · producción
-- Restaura el contrato correcto: autenticación primaria permite bootstraps/lecturas
-- autorizadas; las mutaciones privilegiadas continúan requiriendo WebAuthn.
-- Aplicada primero en PROD para recuperar acceso urgente y registrada aquí
-- con la misma semántica para eliminar drift.

create or replace function public.iberfit_bootstrap_v26()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  return public.iberfit_bootstrap_v26_pre_v65e();
end
$function$;

create or replace function public.iberfit_appointment_change_requests_v13()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return public.iberfit_appointment_change_requests_v13_pre_v65e();
end
$function$;

create or replace function public.iberfit_admin_bootstrap_v14()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return public.iberfit_admin_bootstrap_v14_pre_v65e();
end
$function$;

create or replace function public.iberfit_communication_bootstrap_v14(p_application text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return public.iberfit_communication_bootstrap_v14_pre_v65e(p_application);
end
$function$;

create or replace function public.m26_backend_bootstrap_v43()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select jsonb_build_object(
    'ok', true,
    'ready', true,
    'version', 'RC43',
    'userId', auth.uid(),
    'clientId', public.iberfit_client_id(),
    'counts', jsonb_build_object(
      'measurements', (select count(*) from public.m26_client_measurements_v43),
      'plans', (select count(*) from public.m26_training_plans_v43),
      'sessions', (select count(*) from public.m26_training_sessions_v43),
      'messages', (select count(*) from public.m26_messages_v43)
    )
  )
  where auth.uid() is not null;
$function$;

create or replace function public.m26_wearable_bootstrap_v44()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select jsonb_build_object(
    'ok', true,
    'ready', true,
    'version', 'RC44',
    'connections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'clientId', client_id,
          'provider', provider,
          'status', status,
          'syncEnabled', sync_enabled,
          'scopes', granted_scopes,
          'lastSyncedAt', last_synced_at,
          'revision', revision
        ) order by provider
      )
      from public.m26_wearable_connections_v44
    ), '[]'::jsonb),
    'dailySummaries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'clientId', client_id,
          'provider', provider,
          'date', record_date,
          'metrics', jsonb_build_object(
            'steps', steps,
            'activeMinutes', active_minutes,
            'sleepMinutes', sleep_minutes,
            'restingHeartRate', resting_heart_rate,
            'hrvMs', hrv_ms,
            'activeEnergyKcal', active_energy_kcal,
            'workoutMinutes', workout_minutes
          ),
          'quality', quality,
          'sourceUpdatedAt', source_updated_at,
          'sourceRecordCount', source_record_count,
          'revision', revision
        ) order by record_date desc, provider
      )
      from public.m26_wearable_daily_summaries_v44
    ), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'clientId', client_id,
          'provider', provider,
          'action', action,
          'scopes', scopes,
          'createdAt', created_at
        ) order by created_at desc
      )
      from public.m26_wearable_consents_v44
    ), '[]'::jsonb)
  )
  where auth.uid() is not null;
$function$;
