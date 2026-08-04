-- IBERFIT M26 RC44 · rollback manual guardado.
-- No ejecutar sin establecer:
-- set iberfit.allow_rc44_rollback = 'canary-only';

begin;

do $m26_guard$
begin
  if current_setting(
    'iberfit.allow_rc44_rollback',
    true
  ) is distinct from 'canary-only' then
    raise exception 'M26_RC44_ROLLBACK_NOT_AUTHORIZED';
  end if;
end
$m26_guard$;

drop function if exists
public.m26_wearable_health_v44();

drop function if exists
public.m26_wearable_delete_all_v44();

drop function if exists
public.m26_wearable_revoke_v44(text,boolean);

drop function if exists
public.m26_wearable_connection_upsert_v44(jsonb);

drop function if exists
public.m26_wearable_import_v44(jsonb);

drop function if exists
public.m26_wearable_bootstrap_v44();

drop table if exists
public.m26_wearable_consents_v44;

drop table if exists
public.m26_wearable_daily_summaries_v44;

drop table if exists
public.m26_wearable_connections_v44;

drop function if exists
public.m26_json_has_forbidden_key_v44(jsonb);

delete from public.m26_schema_releases_v43
where version = 'RC44';

commit;
