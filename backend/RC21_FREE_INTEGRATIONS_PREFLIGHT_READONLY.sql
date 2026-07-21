-- IBERFIT M26 RC21 · preflight de integraciones gratuitas · SOLO LECTURA
-- No crea, altera, inserta, actualiza ni elimina datos.
select jsonb_build_object(
  'wearable_connections_table',to_regclass('public.wearable_connections') is not null,
  'wearable_daily_summaries_table',to_regclass('public.wearable_daily_summaries') is not null,
  'wearable_sync_runs_table',to_regclass('public.wearable_sync_runs') is not null,
  'environment',coalesce((select value from public.iberfit_system_settings where key='environment'),'null'::jsonb),
  'checked_at',now()
) as rc21_free_integrations_preflight;

select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in ('wearable_connections','wearable_daily_summaries','wearable_sync_runs')
order by table_name,ordinal_position;

select tablename,policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public'
  and tablename in ('wearable_connections','wearable_daily_summaries','wearable_sync_runs')
order by tablename,policyname;
