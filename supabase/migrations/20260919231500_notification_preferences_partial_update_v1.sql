-- IBERFIT notification preferences v1.1
-- Allow narrow partial updates so a single UI toggle can synchronize without
-- overwriting categories changed by another device. The function still rejects
-- unknown keys and non-boolean values, and returns the complete canonical state.

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
  v_key_count integer := 0;
  v_row public.iberfit_notification_preferences%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'invalid_notification_preferences' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_preferences)
  loop
    v_key_count := v_key_count + 1;
    if v_key not in ('sessionReminders','scheduleChanges','planPublished','coachMessages','challenges','milestones') then
      raise exception 'invalid_notification_preference_key' using errcode = '22023';
    end if;
    if jsonb_typeof(p_preferences->v_key) <> 'boolean' then
      raise exception 'invalid_notification_preference_value' using errcode = '22023';
    end if;
  end loop;

  if v_key_count = 0 then
    raise exception 'notification_preference_required' using errcode = '22023';
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
    case when p_preferences ? 'sessionReminders' then (p_preferences->>'sessionReminders')::boolean else false end,
    case when p_preferences ? 'scheduleChanges' then (p_preferences->>'scheduleChanges')::boolean else false end,
    case when p_preferences ? 'planPublished' then (p_preferences->>'planPublished')::boolean else false end,
    case when p_preferences ? 'coachMessages' then (p_preferences->>'coachMessages')::boolean else false end,
    case when p_preferences ? 'challenges' then (p_preferences->>'challenges')::boolean else false end,
    case when p_preferences ? 'milestones' then (p_preferences->>'milestones')::boolean else false end,
    now()
  )
  on conflict (organization_id, user_id) do update
    set session_reminders = case when p_preferences ? 'sessionReminders' then (p_preferences->>'sessionReminders')::boolean else public.iberfit_notification_preferences.session_reminders end,
        schedule_changes = case when p_preferences ? 'scheduleChanges' then (p_preferences->>'scheduleChanges')::boolean else public.iberfit_notification_preferences.schedule_changes end,
        plan_published = case when p_preferences ? 'planPublished' then (p_preferences->>'planPublished')::boolean else public.iberfit_notification_preferences.plan_published end,
        coach_messages = case when p_preferences ? 'coachMessages' then (p_preferences->>'coachMessages')::boolean else public.iberfit_notification_preferences.coach_messages end,
        challenges = case when p_preferences ? 'challenges' then (p_preferences->>'challenges')::boolean else public.iberfit_notification_preferences.challenges end,
        milestones = case when p_preferences ? 'milestones' then (p_preferences->>'milestones')::boolean else public.iberfit_notification_preferences.milestones end,
        updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'preferences', jsonb_build_object(
      'sessionReminders', v_row.session_reminders,
      'scheduleChanges', v_row.schedule_changes,
      'planPublished', v_row.plan_published,
      'coachMessages', v_row.coach_messages,
      'challenges', v_row.challenges,
      'milestones', v_row.milestones
    ),
    'updatedAt', v_row.updated_at
  );
end
$function$;

revoke all on function public.iberfit_notification_preferences_upsert_v1(jsonb) from public, anon, authenticated;
grant execute on function public.iberfit_notification_preferences_upsert_v1(jsonb) to authenticated;
grant execute on function public.iberfit_notification_preferences_upsert_v1(jsonb) to service_role;
