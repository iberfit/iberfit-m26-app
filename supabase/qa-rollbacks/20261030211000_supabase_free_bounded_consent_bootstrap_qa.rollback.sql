-- QA-only rollback. Restore original full consent history response, without data changes.
BEGIN;
DO $qa_guard$
BEGIN
 IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA' THEN
   RAISE EXCEPTION 'IBERFIT_EGRESS_QA_ONLY' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.position('m26_wearable_consents_v44' in
    pg_catalog.pg_get_functiondef('public.m26_wearable_bootstrap_v44()'::pg_catalog.regprocedure))=0 THEN
   RAISE EXCEPTION 'IBERFIT_WEARABLE_SOURCE_CHANGED' USING ERRCODE='42501';
 END IF;
END; $qa_guard$;
CREATE OR REPLACE FUNCTION public.m26_wearable_bootstrap_v44()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$

COMMIT;
