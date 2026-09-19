-- IBERFIT Web Push device-aware status v1
-- `active` means the supplied browser endpoint belongs to auth.uid() and is active.
-- `subscriptionCount` remains the total active subscription count for that user.
-- Contract: another registered device never marks the current browser as active.

-- Replace the zero-argument RPC instead of overloading it, so PostgREST has one
-- unambiguous public API surface for this operation.
drop function if exists public.iberfit_web_push_status_v1();

create or replace function public.iberfit_web_push_status_v1(p_endpoint text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := nullif(btrim(coalesce(p_endpoint, '')), '');
  v_count integer := 0;
  v_updated_at timestamptz;
  v_device_active boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if v_endpoint is not null then
    if left(v_endpoint, 8) <> 'https://' or char_length(v_endpoint) < 12 or char_length(v_endpoint) > 4096 then
      raise exception 'invalid_push_endpoint' using errcode = '22023';
    end if;
  end if;

  select count(*)::integer, max(s.updated_at)
    into v_count, v_updated_at
  from public.iberfit_web_push_subscriptions s
  where s.user_id = v_user_id
    and s.status = 'active';

  if v_endpoint is not null then
    select exists(
      select 1
      from public.iberfit_web_push_subscriptions s
      where s.user_id = v_user_id
        and s.endpoint = v_endpoint
        and s.status = 'active'
    ) into v_device_active;
  end if;

  return jsonb_build_object(
    'ok', true,
    'active', v_device_active,
    'subscriptionCount', v_count,
    'updatedAt', v_updated_at
  );
end
$function$;

revoke all on function public.iberfit_web_push_status_v1(text) from public, anon, authenticated;
grant execute on function public.iberfit_web_push_status_v1(text) to authenticated;
grant execute on function public.iberfit_web_push_status_v1(text) to service_role;
