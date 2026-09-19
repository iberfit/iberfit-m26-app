begin;

create table if not exists public.iberfit_notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  application text not null check (application in ('client','coach')),
  client_id uuid null references public.clients(id) on delete cascade,
  session_reminders boolean not null default false,
  schedule_changes boolean not null default false,
  plan_published boolean not null default false,
  coach_messages boolean not null default false,
  challenges boolean not null default false,
  milestones boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, application),
  constraint iberfit_notification_preferences_client_scope_ck
    check ((application='client' and client_id is not null) or (application='coach' and client_id is null))
);

create table if not exists public.iberfit_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  application text not null check (application in ('client','coach')),
  client_id uuid null references public.clients(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  expiration_time bigint null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint iberfit_push_subscriptions_endpoint_uq unique (endpoint),
  constraint iberfit_push_subscriptions_client_scope_ck
    check ((application='client' and client_id is not null) or (application='coach' and client_id is null)),
  constraint iberfit_push_subscriptions_endpoint_len_ck check (char_length(endpoint) between 16 and 4096),
  constraint iberfit_push_subscriptions_p256dh_len_ck check (char_length(p256dh) between 16 and 1024),
  constraint iberfit_push_subscriptions_auth_len_ck check (char_length(auth_secret) between 8 and 512)
);

create index if not exists iberfit_push_subscriptions_user_idx
  on public.iberfit_push_subscriptions(user_id, application)
  where enabled=true;
create index if not exists iberfit_push_subscriptions_client_idx
  on public.iberfit_push_subscriptions(client_id)
  where enabled=true and client_id is not null;

alter table public.iberfit_notification_preferences enable row level security;
alter table public.iberfit_notification_preferences force row level security;
alter table public.iberfit_push_subscriptions enable row level security;
alter table public.iberfit_push_subscriptions force row level security;

revoke all on table public.iberfit_notification_preferences from public, anon, authenticated;
revoke all on table public.iberfit_push_subscriptions from public, anon, authenticated;
grant all on table public.iberfit_notification_preferences to service_role;
grant all on table public.iberfit_push_subscriptions to service_role;

create or replace function public.iberfit_notification_preferences_v1(p_application text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_application text:=lower(trim(coalesce(p_application,'')));
  v_context jsonb;
  v_org uuid;
  v_client uuid;
  v_row public.iberfit_notification_preferences%rowtype;
  v_subscription_count integer:=0;
begin
  if v_user is null then
    raise exception using errcode='28000',message='IBERFIT_NOTIFICATION_AUTH_REQUIRED';
  end if;
  if v_application not in ('client','coach') then
    raise exception using errcode='22023',message='IBERFIT_NOTIFICATION_APPLICATION_INVALID';
  end if;

  v_context:=public.iberfit_application_context_v14();
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or not coalesce((v_context->'roles') ? v_application,false) then
    raise exception using errcode='42501',message='IBERFIT_NOTIFICATION_APPLICATION_FORBIDDEN';
  end if;

  if v_application='client' then
    select up.client_id into v_client
    from public.user_profiles up
    where up.user_id=v_user;
    if v_client is null then
      raise exception using errcode='42501',message='IBERFIT_NOTIFICATION_CLIENT_REQUIRED';
    end if;
  end if;

  select p.* into v_row
  from public.iberfit_notification_preferences p
  where p.user_id=v_user and p.application=v_application;

  select count(*)::integer into v_subscription_count
  from public.iberfit_push_subscriptions s
  where s.user_id=v_user
    and s.application=v_application
    and s.enabled=true;

  return jsonb_build_object(
    'ok',true,
    'application',v_application,
    'preferences',jsonb_build_object(
      'sessionReminders',coalesce(v_row.session_reminders,false),
      'scheduleChanges',coalesce(v_row.schedule_changes,false),
      'planPublished',coalesce(v_row.plan_published,false),
      'coachMessages',coalesce(v_row.coach_messages,false),
      'challenges',coalesce(v_row.challenges,false),
      'milestones',coalesce(v_row.milestones,false)
    ),
    'subscriptionCount',v_subscription_count,
    'subscriptionActive',v_subscription_count>0,
    'revision',1,
    'serverTime',now()
  );
end
$function$;

create or replace function public.iberfit_notification_preferences_update_v1(
  p_application text,
  p_preferences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_application text:=lower(trim(coalesce(p_application,'')));
  v_context jsonb;
  v_org uuid;
  v_client uuid;
  v_unknown_key text;
  v_existing public.iberfit_notification_preferences%rowtype;
  v_result jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000',message='IBERFIT_NOTIFICATION_AUTH_REQUIRED';
  end if;
  if v_application not in ('client','coach') then
    raise exception using errcode='22023',message='IBERFIT_NOTIFICATION_APPLICATION_INVALID';
  end if;
  if p_preferences is null or jsonb_typeof(p_preferences)<>'object' then
    raise exception using errcode='22023',message='IBERFIT_NOTIFICATION_PREFERENCES_INVALID';
  end if;

  select key into v_unknown_key
  from jsonb_object_keys(p_preferences) key
  where key not in ('sessionReminders','scheduleChanges','planPublished','coachMessages','challenges','milestones')
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode='22023',message='IBERFIT_NOTIFICATION_PREFERENCE_UNKNOWN';
  end if;
  if exists (
    select 1
    from jsonb_each(p_preferences) item
    where jsonb_typeof(item.value)<>'boolean'
  ) then
    raise exception using errcode='22023',message='IBERFIT_NOTIFICATION_PREFERENCE_TYPE_INVALID';
  end if;

  v_context:=public.iberfit_application_context_v14();
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or not coalesce((v_context->'roles') ? v_application,false) then
    raise exception using errcode='42501',message='IBERFIT_NOTIFICATION_APPLICATION_FORBIDDEN';
  end if;

  if v_application='client' then
    select up.client_id into v_client
    from public.user_profiles up
    where up.user_id=v_user;
    if v_client is null then
      raise exception using errcode='42501',message='IBERFIT_NOTIFICATION_CLIENT_REQUIRED';
    end if;
  end if;

  select p.* into v_existing
  from public.iberfit_notification_preferences p
  where p.user_id=v_user and p.application=v_application;

  insert into public.iberfit_notification_preferences(
    user_id,organization_id,application,client_id,
    session_reminders,schedule_changes,plan_published,coach_messages,challenges,milestones,
    updated_at
  ) values (
    v_user,v_org,v_application,v_client,
    case when p_preferences ? 'sessionReminders' then (p_preferences->>'sessionReminders')::boolean else coalesce(v_existing.session_reminders,false) end,
    case when p_preferences ? 'scheduleChanges' then (p_preferences->>'scheduleChanges')::boolean else coalesce(v_existing.schedule_changes,false) end,
    case when p_preferences ? 'planPublished' then (p_preferences->>'planPublished')::boolean else coalesce(v_existing.plan_published,false) end,
    case when p_preferences ? 'coachMessages' then (p_preferences->>'coachMessages')::boolean else coalesce(v_existing.coach_messages,false) end,
    case when p_preferences ? 'challenges' then (p_preferences->>'challenges')::boolean else coalesce(v_existing.challenges,false) end,
    case when p_preferences ? 'milestones' then (p_preferences->>'milestones')::boolean else coalesce(v_existing.milestones,false) end,
    now()
  )
  on conflict (user_id,application) do update set
    organization_id=excluded.organization_id,
    client_id=excluded.client_id,
    session_reminders=excluded.session_reminders,
    schedule_changes=excluded.schedule_changes,
    plan_published=excluded.plan_published,
    coach_messages=excluded.coach_messages,
    challenges=excluded.challenges,
    milestones=excluded.milestones,
    updated_at=now();

  select public.iberfit_notification_preferences_v1(v_application) into v_result;
  return v_result;
end
$function$;

create or replace function public.iberfit_push_subscription_upsert_v1(
  p_application text,
  p_subscription jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_application text:=lower(trim(coalesce(p_application,'')));
  v_context jsonb;
  v_org uuid;
  v_client uuid;
  v_endpoint text:=trim(coalesce(p_subscription->>'endpoint',''));
  v_p256dh text:=trim(coalesce(p_subscription#>>'{keys,p256dh}',''));
  v_auth text:=trim(coalesce(p_subscription#>>'{keys,auth}',''));
  v_expiration bigint;
  v_owner uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception using errcode='28000',message='IBERFIT_PUSH_AUTH_REQUIRED';
  end if;
  if v_application not in ('client','coach') then
    raise exception using errcode='22023',message='IBERFIT_PUSH_APPLICATION_INVALID';
  end if;
  if p_subscription is null or jsonb_typeof(p_subscription)<>'object' then
    raise exception using errcode='22023',message='IBERFIT_PUSH_SUBSCRIPTION_INVALID';
  end if;
  if char_length(v_endpoint) not between 16 and 4096 or v_endpoint !~ '^https://[^[:space:]]+$' then
    raise exception using errcode='22023',message='IBERFIT_PUSH_ENDPOINT_INVALID';
  end if;
  if char_length(v_p256dh) not between 16 and 1024 or char_length(v_auth) not between 8 and 512 then
    raise exception using errcode='22023',message='IBERFIT_PUSH_KEYS_INVALID';
  end if;
  if p_subscription ? 'expirationTime' and p_subscription->'expirationTime' <> 'null'::jsonb then
    begin
      v_expiration:=(p_subscription->>'expirationTime')::bigint;
    exception when others then
      raise exception using errcode='22023',message='IBERFIT_PUSH_EXPIRATION_INVALID';
    end;
    if v_expiration<0 then
      raise exception using errcode='22023',message='IBERFIT_PUSH_EXPIRATION_INVALID';
    end if;
  end if;

  v_context:=public.iberfit_application_context_v14();
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or not coalesce((v_context->'roles') ? v_application,false) then
    raise exception using errcode='42501',message='IBERFIT_PUSH_APPLICATION_FORBIDDEN';
  end if;

  if v_application='client' then
    select up.client_id into v_client
    from public.user_profiles up
    where up.user_id=v_user;
    if v_client is null then
      raise exception using errcode='42501',message='IBERFIT_PUSH_CLIENT_REQUIRED';
    end if;
  end if;

  select s.user_id into v_owner
  from public.iberfit_push_subscriptions s
  where s.endpoint=v_endpoint
  for update;
  if v_owner is not null and v_owner<>v_user then
    raise exception using errcode='42501',message='IBERFIT_PUSH_ENDPOINT_OWNERSHIP_CONFLICT';
  end if;

  insert into public.iberfit_push_subscriptions(
    organization_id,user_id,application,client_id,endpoint,p256dh,auth_secret,expiration_time,enabled,last_seen_at,updated_at
  ) values (
    v_org,v_user,v_application,v_client,v_endpoint,v_p256dh,v_auth,v_expiration,true,now(),now()
  )
  on conflict (endpoint) do update set
    organization_id=excluded.organization_id,
    application=excluded.application,
    client_id=excluded.client_id,
    p256dh=excluded.p256dh,
    auth_secret=excluded.auth_secret,
    expiration_time=excluded.expiration_time,
    enabled=true,
    last_seen_at=now(),
    updated_at=now()
  returning id into v_id;

  return jsonb_build_object('ok',true,'kind','ack','subscriptionId',v_id,'revision',1);
end
$function$;

create or replace function public.iberfit_push_subscription_delete_v1(
  p_application text,
  p_endpoint text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_application text:=lower(trim(coalesce(p_application,'')));
  v_context jsonb;
  v_endpoint text:=trim(coalesce(p_endpoint,''));
  v_deleted integer:=0;
begin
  if v_user is null then
    raise exception using errcode='28000',message='IBERFIT_PUSH_AUTH_REQUIRED';
  end if;
  if v_application not in ('client','coach') then
    raise exception using errcode='22023',message='IBERFIT_PUSH_APPLICATION_INVALID';
  end if;
  if char_length(v_endpoint) not between 16 and 4096 then
    raise exception using errcode='22023',message='IBERFIT_PUSH_ENDPOINT_INVALID';
  end if;

  v_context:=public.iberfit_application_context_v14();
  if not coalesce((v_context->'roles') ? v_application,false) then
    raise exception using errcode='42501',message='IBERFIT_PUSH_APPLICATION_FORBIDDEN';
  end if;

  delete from public.iberfit_push_subscriptions s
  where s.user_id=v_user
    and s.application=v_application
    and s.endpoint=v_endpoint;
  get diagnostics v_deleted=row_count;

  return jsonb_build_object('ok',true,'kind',case when v_deleted>0 then 'ack' else 'duplicate' end,'revision',1);
end
$function$;

revoke all on function public.iberfit_notification_preferences_v1(text) from public, anon;
revoke all on function public.iberfit_notification_preferences_update_v1(text,jsonb) from public, anon;
revoke all on function public.iberfit_push_subscription_upsert_v1(text,jsonb) from public, anon;
revoke all on function public.iberfit_push_subscription_delete_v1(text,text) from public, anon;

grant execute on function public.iberfit_notification_preferences_v1(text) to authenticated, service_role;
grant execute on function public.iberfit_notification_preferences_update_v1(text,jsonb) to authenticated, service_role;
grant execute on function public.iberfit_push_subscription_upsert_v1(text,jsonb) to authenticated, service_role;
grant execute on function public.iberfit_push_subscription_delete_v1(text,text) to authenticated, service_role;

comment on table public.iberfit_notification_preferences is
  'Server-side notification consent. Direct client table access is denied; authenticated users use scoped RPCs.';
comment on table public.iberfit_push_subscriptions is
  'Private Web Push endpoints and keys. Never exposed through bootstrap payloads or direct authenticated table access.';

commit;
