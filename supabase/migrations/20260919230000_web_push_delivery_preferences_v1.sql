-- IBERFIT Web Push delivery + notification preference foundation v1
-- Security/privacy contract:
-- - authenticated browsers may only read/update their own six notification preferences;
-- - endpoints and encryption keys stay behind service-role-only sender RPCs;
-- - in-app notification content never becomes lock-screen payload content;
-- - one logical in-app notification can enqueue at most one Web Push delivery;
-- - one delivery can fan out to several owned browser subscriptions without duplicate attempts.

create table if not exists public.iberfit_notification_preferences (
  organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_reminders boolean not null default false,
  schedule_changes boolean not null default false,
  plan_published boolean not null default false,
  coach_messages boolean not null default false,
  challenges boolean not null default false,
  milestones boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.iberfit_notification_preferences enable row level security;
alter table public.iberfit_notification_preferences force row level security;
revoke all on table public.iberfit_notification_preferences from public, anon, authenticated;
grant all on table public.iberfit_notification_preferences to service_role;

alter table public.iberfit_notification_deliveries
  add column if not exists source_notification_id uuid null references public.iberfit_in_app_notifications(id) on delete cascade,
  add column if not exists preference_key text null,
  add column if not exists dedupe_key text null,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.iberfit_notification_deliveries
  drop constraint if exists iberfit_notification_deliveries_status_check;
alter table public.iberfit_notification_deliveries
  add constraint iberfit_notification_deliveries_status_check
  check (status in ('scheduled','processing','sent','delivered','failed','cancelled'));
alter table public.iberfit_notification_deliveries
  drop constraint if exists iberfit_notification_deliveries_attempt_count_check;
alter table public.iberfit_notification_deliveries
  add constraint iberfit_notification_deliveries_attempt_count_check check (attempt_count >= 0);
alter table public.iberfit_notification_deliveries
  drop constraint if exists iberfit_notification_deliveries_preference_key_check;
alter table public.iberfit_notification_deliveries
  add constraint iberfit_notification_deliveries_preference_key_check
  check (
    preference_key is null or preference_key in (
      'sessionReminders','scheduleChanges','planPublished','coachMessages','challenges','milestones'
    )
  );

create unique index if not exists iberfit_notification_deliveries_push_dedupe_uidx
  on public.iberfit_notification_deliveries(channel, dedupe_key)
  where dedupe_key is not null;
create index if not exists iberfit_notification_deliveries_push_queue_idx
  on public.iberfit_notification_deliveries(channel, status, scheduled_at, created_at)
  where channel = 'web_push';
create index if not exists iberfit_notification_deliveries_source_notification_idx
  on public.iberfit_notification_deliveries(source_notification_id)
  where source_notification_id is not null;

create table if not exists public.iberfit_web_push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.iberfit_notification_deliveries(id) on delete cascade,
  subscription_id uuid not null references public.iberfit_web_push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','revoked')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz null,
  sent_at timestamptz null,
  http_status integer null check (http_status is null or http_status between 100 and 599),
  error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint iberfit_web_push_delivery_attempt_unique unique(delivery_id, subscription_id)
);

create index if not exists iberfit_web_push_delivery_attempt_queue_idx
  on public.iberfit_web_push_delivery_attempts(status, next_attempt_at, created_at);
create index if not exists iberfit_web_push_delivery_attempt_delivery_idx
  on public.iberfit_web_push_delivery_attempts(delivery_id, status);

alter table public.iberfit_web_push_delivery_attempts enable row level security;
alter table public.iberfit_web_push_delivery_attempts force row level security;
revoke all on table public.iberfit_web_push_delivery_attempts from public, anon, authenticated;
grant all on table public.iberfit_web_push_delivery_attempts to service_role;

create table if not exists public.iberfit_web_push_dispatch_kicks (
  operation_id text primary key references public.iberfit_communication_receipts(operation_id) on delete cascade,
  organization_id uuid not null references public.iberfit_organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.iberfit_web_push_dispatch_kicks enable row level security;
alter table public.iberfit_web_push_dispatch_kicks force row level security;
revoke all on table public.iberfit_web_push_dispatch_kicks from public, anon, authenticated;
grant all on table public.iberfit_web_push_dispatch_kicks to service_role;

create or replace function public.iberfit_notification_preferences_status_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_ids uuid[];
  v_org_id uuid;
  v_row public.iberfit_notification_preferences%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select array_agg(m.organization_id order by m.joined_at, m.organization_id)
    into v_org_ids
  from public.iberfit_organization_memberships m
  where m.user_id = v_user_id and m.status = 'active';

  if coalesce(cardinality(v_org_ids), 0) = 0 then
    raise exception 'organization_membership_required' using errcode = '42501';
  end if;
  if cardinality(v_org_ids) <> 1 then
    raise exception 'organization_context_ambiguous' using errcode = '22023';
  end if;
  v_org_id := v_org_ids[1];

  select p.* into v_row
  from public.iberfit_notification_preferences p
  where p.organization_id = v_org_id and p.user_id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'preferences', jsonb_build_object(
      'sessionReminders', coalesce(v_row.session_reminders, false),
      'scheduleChanges', coalesce(v_row.schedule_changes, false),
      'planPublished', coalesce(v_row.plan_published, false),
      'coachMessages', coalesce(v_row.coach_messages, false),
      'challenges', coalesce(v_row.challenges, false),
      'milestones', coalesce(v_row.milestones, false)
    ),
    'updatedAt', v_row.updated_at
  );
end
$function$;

create or replace function public.iberfit_notification_preferences_upsert_v1(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_ids uuid[];
  v_org_id uuid;
  v_key text;
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'invalid_notification_preferences' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_preferences)
  loop
    if v_key not in ('sessionReminders','scheduleChanges','planPublished','coachMessages','challenges','milestones') then
      raise exception 'invalid_notification_preference_key' using errcode = '22023';
    end if;
  end loop;

  foreach v_key in array array['sessionReminders','scheduleChanges','planPublished','coachMessages','challenges','milestones']
  loop
    if not (p_preferences ? v_key) or jsonb_typeof(p_preferences->v_key) <> 'boolean' then
      raise exception 'notification_preferences_complete_boolean_object_required' using errcode = '22023';
    end if;
  end loop;

  select array_agg(m.organization_id order by m.joined_at, m.organization_id)
    into v_org_ids
  from public.iberfit_organization_memberships m
  where m.user_id = v_user_id and m.status = 'active';

  if coalesce(cardinality(v_org_ids), 0) = 0 then
    raise exception 'organization_membership_required' using errcode = '42501';
  end if;
  if cardinality(v_org_ids) <> 1 then
    raise exception 'organization_context_ambiguous' using errcode = '22023';
  end if;
  v_org_id := v_org_ids[1];

  insert into public.iberfit_notification_preferences(
    organization_id,
    user_id,
    session_reminders,
    schedule_changes,
    plan_published,
    coach_messages,
    challenges,
    milestones,
    updated_at
  ) values (
    v_org_id,
    v_user_id,
    (p_preferences->>'sessionReminders')::boolean,
    (p_preferences->>'scheduleChanges')::boolean,
    (p_preferences->>'planPublished')::boolean,
    (p_preferences->>'coachMessages')::boolean,
    (p_preferences->>'challenges')::boolean,
    (p_preferences->>'milestones')::boolean,
    now()
  )
  on conflict (organization_id, user_id) do update
    set session_reminders = excluded.session_reminders,
        schedule_changes = excluded.schedule_changes,
        plan_published = excluded.plan_published,
        coach_messages = excluded.coach_messages,
        challenges = excluded.challenges,
        milestones = excluded.milestones,
        updated_at = now()
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'ok', true,
    'preferences', p_preferences,
    'updatedAt', v_updated_at
  );
end
$function$;

create or replace function public.iberfit_web_push_enqueue_notification_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_preference_key text;
  v_allowed boolean := false;
  v_delivery_id uuid;
begin
  v_preference_key := case lower(coalesce(new.action_area, ''))
    when 'sesion' then 'sessionReminders'
    when 'agenda' then 'scheduleChanges'
    when 'planificacion' then 'planPublished'
    when 'mensajes' then 'coachMessages'
    when 'retos' then 'challenges'
    when 'progreso' then 'milestones'
    else null
  end;

  if v_preference_key is null then
    return new;
  end if;

  v_user_id := new.recipient_user_id;
  if v_user_id is null and new.recipient_client_id is not null and new.recipient_client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select a.auth_user_id into v_user_id
    from public.client_access_v26 a
    where a.client_id = new.recipient_client_id::uuid
      and a.status = 'activo'
      and a.auth_user_id is not null;
  end if;

  if v_user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.iberfit_organization_memberships m
    where m.organization_id = new.organization_id
      and m.user_id = v_user_id
      and m.status = 'active'
  ) then
    return new;
  end if;

  select case v_preference_key
    when 'sessionReminders' then p.session_reminders
    when 'scheduleChanges' then p.schedule_changes
    when 'planPublished' then p.plan_published
    when 'coachMessages' then p.coach_messages
    when 'challenges' then p.challenges
    when 'milestones' then p.milestones
    else false
  end
  into v_allowed
  from public.iberfit_notification_preferences p
  where p.organization_id = new.organization_id and p.user_id = v_user_id;

  if coalesce(v_allowed, false) is not true then
    return new;
  end if;

  if not exists (
    select 1
    from public.iberfit_web_push_subscriptions s
    where s.organization_id = new.organization_id
      and s.user_id = v_user_id
      and s.status = 'active'
      and (s.expiration_time is null or s.expiration_time > (extract(epoch from now()) * 1000)::bigint)
  ) then
    return new;
  end if;

  insert into public.iberfit_notification_deliveries(
    organization_id,
    template_key,
    recipient_type,
    recipient_id,
    channel,
    status,
    scheduled_at,
    source_notification_id,
    preference_key,
    dedupe_key,
    updated_at
  ) values (
    new.organization_id,
    'web_push:' || v_preference_key,
    'user',
    v_user_id::text,
    'web_push',
    'scheduled',
    now(),
    new.id,
    v_preference_key,
    'notification:' || new.id::text,
    now()
  )
  on conflict (channel, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_delivery_id;

  return new;
end
$function$;

drop trigger if exists iberfit_web_push_enqueue_notification_v1 on public.iberfit_in_app_notifications;
create trigger iberfit_web_push_enqueue_notification_v1
after insert on public.iberfit_in_app_notifications
for each row execute function public.iberfit_web_push_enqueue_notification_v1();

create or replace function public.iberfit_web_push_dispatch_authorize_v1(p_operation_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_operation_id text := btrim(coalesce(p_operation_id, ''));
  v_receipt public.iberfit_communication_receipts%rowtype;
  v_inserted boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if char_length(v_operation_id) < 3 or char_length(v_operation_id) > 200 or v_operation_id ~ '[[:cntrl:]]' then
    raise exception 'invalid_dispatch_operation_id' using errcode = '22023';
  end if;

  select r.* into v_receipt
  from public.iberfit_communication_receipts r
  where r.operation_id = v_operation_id
    and r.actor_user_id = v_user_id
    and r.command_type = 'MESSAGE_SEND'
    and r.created_at >= now() - interval '15 minutes';

  if not found then
    raise exception 'dispatch_operation_not_authorized' using errcode = '42501';
  end if;

  insert into public.iberfit_web_push_dispatch_kicks(operation_id, organization_id, actor_user_id)
  values(v_receipt.operation_id, v_receipt.organization_id, v_user_id)
  on conflict (operation_id) do nothing
  returning true into v_inserted;

  return jsonb_build_object(
    'ok', true,
    'authorized', coalesce(v_inserted, false),
    'duplicate', not coalesce(v_inserted, false)
  );
end
$function$;

create or replace function public.iberfit_web_push_claim_v1(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_claims jsonb := '[]'::jsonb;
begin
  update public.iberfit_web_push_delivery_attempts a
  set status = case when a.attempt_count >= 3 then 'failed' else 'pending' end,
      next_attempt_at = case when a.attempt_count >= 3 then a.next_attempt_at else now() end,
      error_code = case when a.attempt_count >= 3 then 'push_attempt_stale_exhausted' else 'push_attempt_stale_recovered' end,
      updated_at = now()
  where a.status = 'processing'
    and a.last_attempt_at < now() - interval '2 minutes';

  update public.iberfit_notification_deliveries d
  set status = 'cancelled',
      error_code = 'push_not_eligible',
      updated_at = now()
  where d.channel = 'web_push'
    and d.status in ('scheduled','processing')
    and (
      not exists (
        select 1 from public.iberfit_in_app_notifications n
        where n.id = d.source_notification_id and n.status = 'unread'
      )
      or not exists (
        select 1
        from public.iberfit_notification_preferences p
        where p.organization_id = d.organization_id
          and p.user_id = d.recipient_id::uuid
          and case d.preference_key
            when 'sessionReminders' then p.session_reminders
            when 'scheduleChanges' then p.schedule_changes
            when 'planPublished' then p.plan_published
            when 'coachMessages' then p.coach_messages
            when 'challenges' then p.challenges
            when 'milestones' then p.milestones
            else false
          end
      )
      or not exists (
        select 1
        from public.iberfit_web_push_subscriptions s
        where s.organization_id = d.organization_id
          and s.user_id = d.recipient_id::uuid
          and s.status = 'active'
          and (s.expiration_time is null or s.expiration_time > (extract(epoch from now()) * 1000)::bigint)
      )
    );

  insert into public.iberfit_web_push_delivery_attempts(delivery_id, subscription_id)
  select d.id, s.id
  from public.iberfit_notification_deliveries d
  join public.iberfit_in_app_notifications n
    on n.id = d.source_notification_id and n.status = 'unread'
  join public.iberfit_notification_preferences p
    on p.organization_id = d.organization_id and p.user_id = d.recipient_id::uuid
  join public.iberfit_web_push_subscriptions s
    on s.organization_id = d.organization_id
   and s.user_id = d.recipient_id::uuid
   and s.status = 'active'
   and (s.expiration_time is null or s.expiration_time > (extract(epoch from now()) * 1000)::bigint)
  where d.channel = 'web_push'
    and d.status in ('scheduled','processing')
    and coalesce(d.scheduled_at, d.created_at) <= now()
    and case d.preference_key
      when 'sessionReminders' then p.session_reminders
      when 'scheduleChanges' then p.schedule_changes
      when 'planPublished' then p.plan_published
      when 'coachMessages' then p.coach_messages
      when 'challenges' then p.challenges
      when 'milestones' then p.milestones
      else false
    end
  on conflict (delivery_id, subscription_id) do nothing;

  with picked as (
    select a.id
    from public.iberfit_web_push_delivery_attempts a
    join public.iberfit_notification_deliveries d on d.id = a.delivery_id
    where d.channel = 'web_push'
      and d.status in ('scheduled','processing')
      and a.status = 'pending'
      and a.next_attempt_at <= now()
      and a.attempt_count < 3
    order by a.next_attempt_at, a.created_at, a.id
    for update of a skip locked
    limit v_limit
  ), claimed as (
    update public.iberfit_web_push_delivery_attempts a
    set status = 'processing',
        attempt_count = a.attempt_count + 1,
        last_attempt_at = now(),
        updated_at = now(),
        error_code = null
    from picked
    where a.id = picked.id
    returning a.id, a.delivery_id, a.subscription_id, a.attempt_count
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attemptId', c.id,
        'deliveryId', c.delivery_id,
        'notificationId', d.source_notification_id,
        'attemptCount', c.attempt_count,
        'endpoint', s.endpoint,
        'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth_key),
        'path', '/'
      ) order by c.id
    ),
    '[]'::jsonb
  ) into v_claims
  from claimed c
  join public.iberfit_notification_deliveries d on d.id = c.delivery_id
  join public.iberfit_web_push_subscriptions s on s.id = c.subscription_id;

  update public.iberfit_notification_deliveries d
  set status = 'processing',
      last_attempt_at = now(),
      attempt_count = d.attempt_count + 1,
      updated_at = now()
  where d.id in (
    select distinct a.delivery_id
    from public.iberfit_web_push_delivery_attempts a
    where a.status = 'processing'
      and a.last_attempt_at >= now() - interval '10 seconds'
  );

  return jsonb_build_object('ok', true, 'claims', v_claims);
end
$function$;

create or replace function public.iberfit_web_push_finalize_v1(
  p_attempt_id uuid,
  p_outcome text,
  p_http_status integer default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt public.iberfit_web_push_delivery_attempts%rowtype;
  v_outcome text := lower(btrim(coalesce(p_outcome, '')));
  v_error_code text := nullif(left(regexp_replace(coalesce(p_error_code, ''), '[^A-Za-z0-9._:-]+', '_', 'g'), 120), '');
  v_has_pending boolean := false;
  v_has_sent boolean := false;
  v_all_terminal boolean := false;
  v_all_revoked boolean := false;
  v_delivery_status text;
begin
  if v_outcome not in ('sent','retry','revoked','failed') then
    raise exception 'invalid_push_delivery_outcome' using errcode = '22023';
  end if;
  if p_http_status is not null and (p_http_status < 100 or p_http_status > 599) then
    raise exception 'invalid_push_http_status' using errcode = '22023';
  end if;

  select a.* into v_attempt
  from public.iberfit_web_push_delivery_attempts a
  where a.id = p_attempt_id
  for update;

  if not found then
    raise exception 'push_delivery_attempt_not_found' using errcode = 'P0002';
  end if;

  if v_attempt.status in ('sent','failed','revoked') then
    return jsonb_build_object('ok', true, 'duplicate', true, 'status', v_attempt.status);
  end if;

  if v_outcome = 'sent' then
    update public.iberfit_web_push_delivery_attempts
    set status = 'sent', sent_at = now(), http_status = p_http_status,
        error_code = null, updated_at = now()
    where id = p_attempt_id;
  elsif v_outcome = 'revoked' then
    update public.iberfit_web_push_delivery_attempts
    set status = 'revoked', http_status = p_http_status,
        error_code = coalesce(v_error_code, 'push_subscription_revoked'), updated_at = now()
    where id = p_attempt_id;
    update public.iberfit_web_push_subscriptions
    set status = 'revoked', updated_at = now()
    where id = v_attempt.subscription_id;
  elsif v_outcome = 'retry' and v_attempt.attempt_count < 3 then
    update public.iberfit_web_push_delivery_attempts
    set status = 'pending', http_status = p_http_status,
        error_code = coalesce(v_error_code, 'push_temporary_failure'),
        next_attempt_at = now() + case v_attempt.attempt_count
          when 1 then interval '1 minute'
          when 2 then interval '5 minutes'
          else interval '15 minutes'
        end,
        updated_at = now()
    where id = p_attempt_id;
  else
    update public.iberfit_web_push_delivery_attempts
    set status = 'failed', http_status = p_http_status,
        error_code = coalesce(v_error_code, 'push_permanent_failure'), updated_at = now()
    where id = p_attempt_id;
  end if;

  select
    coalesce(bool_or(a.status in ('pending','processing')), false),
    coalesce(bool_or(a.status = 'sent'), false),
    coalesce(bool_and(a.status in ('sent','failed','revoked')), false),
    coalesce(bool_and(a.status = 'revoked'), false)
  into v_has_pending, v_has_sent, v_all_terminal, v_all_revoked
  from public.iberfit_web_push_delivery_attempts a
  where a.delivery_id = v_attempt.delivery_id;

  v_delivery_status := case
    when v_has_pending then 'scheduled'
    when v_has_sent and v_all_terminal then 'sent'
    when v_all_revoked then 'cancelled'
    when v_all_terminal then 'failed'
    else 'processing'
  end;

  update public.iberfit_notification_deliveries d
  set status = v_delivery_status,
      sent_at = case when v_delivery_status = 'sent' then coalesce(d.sent_at, now()) else d.sent_at end,
      error_code = case
        when v_delivery_status = 'sent' then null
        when v_delivery_status = 'cancelled' then 'push_no_active_subscription'
        when v_delivery_status = 'failed' then 'push_delivery_failed'
        else d.error_code
      end,
      updated_at = now()
  where d.id = v_attempt.delivery_id;

  return jsonb_build_object('ok', true, 'duplicate', false, 'status', v_delivery_status);
end
$function$;

revoke all on function public.iberfit_notification_preferences_status_v1() from public, anon, authenticated;
revoke all on function public.iberfit_notification_preferences_upsert_v1(jsonb) from public, anon, authenticated;
revoke all on function public.iberfit_web_push_dispatch_authorize_v1(text) from public, anon, authenticated;
revoke all on function public.iberfit_web_push_claim_v1(integer) from public, anon, authenticated;
revoke all on function public.iberfit_web_push_finalize_v1(uuid,text,integer,text) from public, anon, authenticated;
revoke all on function public.iberfit_web_push_enqueue_notification_v1() from public, anon, authenticated;

grant execute on function public.iberfit_notification_preferences_status_v1() to authenticated;
grant execute on function public.iberfit_notification_preferences_upsert_v1(jsonb) to authenticated;
grant execute on function public.iberfit_web_push_dispatch_authorize_v1(text) to authenticated;

grant execute on function public.iberfit_notification_preferences_status_v1() to service_role;
grant execute on function public.iberfit_notification_preferences_upsert_v1(jsonb) to service_role;
grant execute on function public.iberfit_web_push_dispatch_authorize_v1(text) to service_role;
grant execute on function public.iberfit_web_push_claim_v1(integer) to service_role;
grant execute on function public.iberfit_web_push_finalize_v1(uuid,text,integer,text) to service_role;
grant execute on function public.iberfit_web_push_enqueue_notification_v1() to service_role;
