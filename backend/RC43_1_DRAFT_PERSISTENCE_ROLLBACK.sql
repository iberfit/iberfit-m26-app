-- IBERFIT M26 RC43.1 · rollback manual y guardado.
-- No ejecutar sin establecer:
-- set iberfit.allow_rc431_rollback = 'canary-only';

begin;

do $m26_guard$
begin
  if current_setting(
    'iberfit.allow_rc431_rollback',
    true
  ) is distinct from 'canary-only' then
    raise exception 'M26_RC431_ROLLBACK_NOT_AUTHORIZED';
  end if;
end
$m26_guard$;

drop function if exists
public.m26_backend_health_v431();

drop function if exists
public.m26_draft_delete_v431(uuid,text);

drop function if exists
public.m26_draft_get_v431(uuid,text);

drop function if exists
public.m26_draft_upsert_v431(jsonb);

drop table if exists
public.m26_session_drafts_v431;

delete from public.m26_schema_releases_v43
where version = 'RC43.1';

commit;
