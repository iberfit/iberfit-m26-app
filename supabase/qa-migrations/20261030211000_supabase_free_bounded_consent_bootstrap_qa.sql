-- P0 Supabase Free QA-only: return newest three consent events per client/provider.
-- No deletes, no user-data mutation, retain full audited consent table and SQL invoker RLS.
BEGIN;
DO $qa_guard$
BEGIN
 IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA' THEN
   RAISE EXCEPTION 'IBERFIT_EGRESS_QA_ONLY' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.m26_wearable_bootstrap_v44()'::pg_catalog.regprocedure),
    'm26_wearable_consents_v44')=0 THEN
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
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'clientId',c.client_id,'provider',c.provider,
        'action',c.action,'scopes',c.scopes,'createdAt',c.created_at
      ) order by c.created_at desc,c.id desc)
      from (
        select id,client_id,provider,action,scopes,created_at
        from (
          select id,client_id,provider,action,scopes,created_at,
            row_number() over (partition by client_id,provider
              order by created_at desc,id desc) as consent_rank
          from public.m26_wearable_consents_v44
        ) scoped
        where consent_rank <= 3
      ) c
    ), '[]'::jsonb)
  )
  where auth.uid() is not null;
$function$

COMMIT;
