-- IBERFIT M26 RC43 · rollback manual y guardado.
-- No ejecutar sin establecer:
-- set iberfit.allow_rc43_rollback = 'canary-only';

begin;

do $m26_guard$
begin
  if current_setting(
    'iberfit.allow_rc43_rollback',
    true
  ) is distinct from 'canary-only' then
    raise exception 'M26_RC43_ROLLBACK_NOT_AUTHORIZED';
  end if;
end
$m26_guard$;

drop function if exists
  public.m26_send_message_v43(jsonb);

drop function if exists
  public.m26_save_training_session_v43(jsonb);

drop function if exists
  public.m26_record_measurement_v43(jsonb);

drop function if exists
  public.m26_backend_bootstrap_v43();

drop function if exists
  public.m26_backend_health_v43();

drop table if exists
  public.m26_audit_events_v43;

drop table if exists
  public.m26_messages_v43;

drop table if exists
  public.m26_training_sessions_v43;

drop table if exists
  public.m26_training_plans_v43;

drop table if exists
  public.m26_client_measurements_v43;

drop table if exists
  public.m26_schema_releases_v43;

drop function if exists
  public.m26_audit_row_v43();

drop function if exists
  public.m26_touch_updated_at_v43();

drop function if exists
  public.m26_json_safe_v43(jsonb);

commit;
