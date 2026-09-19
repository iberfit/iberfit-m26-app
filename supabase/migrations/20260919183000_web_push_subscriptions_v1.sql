-- IBERFIT Web Push subscriptions v1
-- Privacy/security contract: subscription endpoints and encryption keys remain
-- internal data. Browser clients can only use narrow SECURITY DEFINER RPCs
-- scoped to auth.uid(); direct table access stays closed.

create table if not exists public.iberfit_web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  expiration_time bigint null,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint iberfit_web_push_endpoint_unique unique(endpoint),
  constraint iberfit_web_push_endpoint_length check (char_length(endpoint) between 12 and 4096),
  constraint iberfit_web_push_p256dh_length check (char_length(p256dh) between 16 and 1024),
  constraint iberfit_web_push_auth_key_length check (char_length(auth_key) between 8 and 512),
  constraint iberfit_web_push_expiration_nonnegative check (expiration_time is null or expiration_time >= 0)
);

create index if not exists iberfit_web_push_user_active_idx
  on public.iberfit_web_push_subscriptions(user_id, status, updated_at desc);
create index if not exists iberfit_web_push_org_active_idx
  on public.iberfit_web_push_subscriptions(organization_id, status, updated_at desc);

alter table public.iberfit_web_push_subscriptions enable row level security;
alter table public.iberfit_web_push_subscriptions force row level security;
revoke all on table public.iberfit_web_push_subscriptions from public, anon, authenticated;
grant all on table public.iberfit_web_push_subscriptions to service_role;

create or replace function public.iberfit_web_push_status_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select count(*)::integer, max(s.updated_at)
    into v_count, v_updated_at
  from public.iberfit_web_push_subscriptions s
  where s.user_id = v_user_id
    and s.status = 'active';

  return jsonb_build_object(
    'ok', true,
    'active', v_count > 0,
    'subscriptionCount', v_count,
    'updatedAt', v_updated_at
  );
end
$function$;

create or replace function public.iberfit_web_push_upsert_v1(p_subscription jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_ids uuid[];
  v_org_id uuid;
  v_endpoint text;
  v_p256dh text;
  v_auth_key text;
  v_expiration_text text;
  v_expiration_time bigint;
  v_subscription_id uuid;
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_subscription is null or jsonb_typeof(p_subscription) <> 'object' then
    raise exception 'invalid_subscription' using errcode = '22023';
  end if;

  select array_agg(m.organization_id order by m.joined_at, m.organization_id)
    into v_org_ids
  from public.iberfit_organization_memberships m
  where m.user_id = v_user_id
    and m.status = 'active';

  if coalesce(cardinality(v_org_ids), 0) = 0 then
    raise exception 'organization_membership_required' using errcode = '42501';
  end if;
  if cardinality(v_org_ids) <> 1 then
    raise exception 'organization_context_ambiguous' using errcode = '22023';
  end if;
  v_org_id := v_org_ids[1];

  v_endpoint := btrim(coalesce(p_subscription->>'endpoint', ''));
  v_p256dh := btrim(coalesce(p_subscription#>>'{keys,p256dh}', ''));
  v_auth_key := btrim(coalesce(p_subscription#>>'{keys,auth}', ''));
  v_expiration_text := p_subscription->>'expirationTime';

  if left(v_endpoint, 8) <> 'https://' or char_length(v_endpoint) > 4096 then
    raise exception 'invalid_push_endpoint' using errcode = '22023';
  end if;
  if char_length(v_p256dh) < 16 or char_length(v_p256dh) > 1024 then
    raise exception 'invalid_push_p256dh' using errcode = '22023';
  end if;
  if char_length(v_auth_key) < 8 or char_length(v_auth_key) > 512 then
    raise exception 'invalid_push_auth' using errcode = '22023';
  end if;

  if v_expiration_text is not null and btrim(v_expiration_text) <> '' then
    if v_expiration_text !~ '^[0-9]{1,16}$' then
      raise exception 'invalid_push_expiration' using errcode = '22023';
    end if;
    v_expiration_time := v_expiration_text::bigint;
  else
    v_expiration_time := null;
  end if;

  insert into public.iberfit_web_push_subscriptions(
    organization_id, user_id, endpoint, p256dh, auth_key, expiration_time, status, updated_at
  ) values (
    v_org_id, v_user_id, v_endpoint, v_p256dh, v_auth_key, v_expiration_time, 'active', now()
  )
  on conflict (endpoint) do update
    set organization_id = excluded.organization_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        expiration_time = excluded.expiration_time,
        status = 'active',
        updated_at = now()
    where public.iberfit_web_push_subscriptions.user_id = v_user_id
  returning id, updated_at into v_subscription_id, v_updated_at;

  if v_subscription_id is null then
    raise exception 'push_endpoint_conflict' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'active', true,
    'updatedAt', v_updated_at
  );
end
$function$;

create or replace function public.iberfit_web_push_revoke_v1(p_endpoint text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := nullif(btrim(coalesce(p_endpoint, '')), '');
  v_deleted integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_endpoint is not null and char_length(v_endpoint) > 4096 then
    raise exception 'invalid_push_endpoint' using errcode = '22023';
  end if;

  delete from public.iberfit_web_push_subscriptions s
  where s.user_id = v_user_id
    and (v_endpoint is null or s.endpoint = v_endpoint);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'ok', true,
    'active', exists(
      select 1 from public.iberfit_web_push_subscriptions s
      where s.user_id = v_user_id and s.status = 'active'
    ),
    'deletedCount', v_deleted
  );
end
$function$;

revoke all on function public.iberfit_web_push_status_v1() from public, anon, authenticated;
revoke all on function public.iberfit_web_push_upsert_v1(jsonb) from public, anon, authenticated;
revoke all on function public.iberfit_web_push_revoke_v1(text) from public, anon, authenticated;
grant execute on function public.iberfit_web_push_status_v1() to authenticated;
grant execute on function public.iberfit_web_push_upsert_v1(jsonb) to authenticated;
grant execute on function public.iberfit_web_push_revoke_v1(text) to authenticated;
grant execute on function public.iberfit_web_push_status_v1() to service_role;
grant execute on function public.iberfit_web_push_upsert_v1(jsonb) to service_role;
grant execute on function public.iberfit_web_push_revoke_v1(text) to service_role;
