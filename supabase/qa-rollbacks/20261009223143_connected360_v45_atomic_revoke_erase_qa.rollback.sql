-- QA-only operational rollback: do not use in production.
-- Refuse destructive rollback if v45 holds any data.
-- Intentionally KEEP the fail-closed v45 write blocker, so no import becomes
-- inadvertently enabled when rolling back the cleanup hooks.
begin;
do $qa_rollback$
begin
  if to_regclass('public.m26_wearable_source_daily_v45') is null then
    raise exception 'CONNECTED360_V45_ROLLBACK_STAGING_MISSING';
  end if;
  if exists(select 1 from public.m26_wearable_source_daily_v45 limit 1) then
    raise exception 'CONNECTED360_V45_ROLLBACK_NONEMPTY_FORBIDDEN';
  end if;
end;
$qa_rollback$;
drop trigger m26_wearable_v45_cleanup_on_delete_consent_qa_v1
  on public.m26_wearable_consents_v44;
drop trigger m26_wearable_v45_cleanup_on_global_revoke_qa_v1
  on public.m26_wearable_revocation_events_v2;
drop function public.m26_wearable_v45_cleanup_after_revoke_qa_v1();
CREATE OR REPLACE FUNCTION public.m26_wearable_revoke_v44(p_provider text, p_delete_data boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer := 0;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;

  v_client_id := public.iberfit_client_id();
  v_provider := lower(trim(p_provider));

  if
    v_client_id is null
    or v_provider not in (
      'normalized_file',
      'health_connect',
      'samsung_health',
      'apple_health',
      'strava',
      'garmin_connect',
      'fitbit',
      'oura'
    )
  then
    raise exception 'M26_RC44_REVOKE_INVALID';
  end if;

  update public.m26_wearable_connections_v44
  set
    status = 'revoked',
    sync_enabled = false
  where owner_user_id = auth.uid()
    and client_id = v_client_id
    and provider = v_provider;

  if coalesce(p_delete_data, false) then
    delete from public.m26_wearable_daily_summaries_v44
    where client_id = v_client_id
      and provider = v_provider;

    get diagnostics
      v_deleted = row_count;
  end if;

  insert into public.m26_wearable_consents_v44 (
    actor_user_id,
    client_id,
    provider,
    action,
    scopes,
    policy_version
  )
  values (
    auth.uid(),
    v_client_id,
    v_provider,
    case
      when coalesce(p_delete_data, false)
        then 'delete'
      else 'revoke'
    end,
    '{}'::text[],
    'v44-zero-cost'
  );

  return jsonb_build_object(
    'ok',
    true,
    'revoked',
    true,
    'provider',
    v_provider,
    'deleted',
    v_deleted
  );
end
$function$;
commit;
