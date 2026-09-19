-- Device-scoped Web Push status without exposing subscription material.
-- The browser supplies its own endpoint and receives only boolean/count metadata.

create or replace function public.iberfit_web_push_device_status_v1(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_device_active boolean := false;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if left(v_endpoint, 8) <> 'https://' or char_length(v_endpoint) > 4096 then
    raise exception 'invalid_push_endpoint' using errcode = '22023';
  end if;

  select exists(
    select 1
    from public.iberfit_web_push_subscriptions s
    where s.user_id = v_user_id
      and s.endpoint = v_endpoint
      and s.status = 'active'
  ), count(*)::integer
  into v_device_active, v_count
  from public.iberfit_web_push_subscriptions s
  where s.user_id = v_user_id
    and s.status = 'active';

  return jsonb_build_object(
    'ok', true,
    'deviceActive', v_device_active,
    'subscriptionCount', v_count
  );
end
$function$;

revoke all on function public.iberfit_web_push_device_status_v1(text) from public, anon, authenticated;
grant execute on function public.iberfit_web_push_device_status_v1(text) to authenticated;
grant execute on function public.iberfit_web_push_device_status_v1(text) to service_role;
