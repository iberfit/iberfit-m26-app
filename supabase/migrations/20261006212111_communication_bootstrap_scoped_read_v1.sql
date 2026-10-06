-- #759: Remove redundant full authenticated bootstrap from communication reads.
-- The public v14 RPC, its JSON contract and caller permissions are unchanged.
-- Security-critical parity: membership, application role, privileged assurance
-- (WebAuthn/MFA), organization, participant scope and client-name visibility.
create or replace function public.iberfit_communication_bootstrap_v14_pre_v65e(p_application text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_context jsonb;
  v_org uuid;
  v_user uuid := auth.uid();
  v_app text := lower(btrim(p_application));
  v_client text;
  v_threads jsonb;
  v_messages jsonb;
  v_notifications jsonb;
begin
  select public.iberfit_application_context_v14() into v_context;
  if coalesce(v_context->>'membershipStatus','') <> 'active' then
    raise exception using errcode='42501', message='V14_ORGANIZATION_ACCESS_SUSPENDED';
  end if;
  if not coalesce(v_context->'roles','[]'::jsonb) ? v_app
     or v_app not in ('client','coach') then
    raise exception using errcode='42501', message='V14_COMMUNICATION_ROLE_FORBIDDEN';
  end if;

  -- The former general bootstrap performed this check before returning any data.
  -- Removing that bootstrap must NOT silently remove privileged assurance.
  perform public.iberfit_require_privileged_assurance_v65d();
  v_org := (v_context->>'organizationId')::uuid;
  -- The former snapshot's user.clientId is sourced from this very function.
  v_client := coalesce(public.iberfit_client_id()::text,'');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,
    'clientId',t.client_id,
    'coachUserId',t.coach_user_id,
    'status',t.status,
    'subject',t.subject,
    'clientName',coalesce((
      select c.name
      from public.clients c
      where c.id::text=t.client_id
        and public.iberfit_can_access_client_v26(c.id)
      limit 1
    ),'Cliente'),
    'coachName',coalesce(
      (select raw_user_meta_data->>'name' from auth.users where id=t.coach_user_id),
      (select email from auth.users where id=t.coach_user_id),
      'Coach IBERFIT'
    ),
    'createdAt',t.created_at,
    'updatedAt',t.updated_at,
    'unreadCount',(
      select count(*) from public.iberfit_messages m
      where m.thread_id=t.id
        and (
          (v_app='client' and m.read_by_client_at is null and m.sender_role<>'client')
          or (v_app='coach' and m.read_by_coach_at is null and m.sender_role<>'coach')
        )
    ),
    'revision',t.revision
  ) order by t.updated_at desc),'[]'::jsonb)
  into v_threads
  from public.iberfit_conversation_threads t
  where t.organization_id=v_org
    and t.status='active'
    and (
      (v_app='client' and t.client_id=v_client)
      or (v_app='coach' and t.coach_user_id=v_user)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,
    'threadId',m.thread_id,
    'senderUserId',m.sender_user_id,
    'senderRole',m.sender_role,
    'body',m.body,
    'createdAt',m.created_at,
    'readByClientAt',m.read_by_client_at,
    'readByCoachAt',m.read_by_coach_at,
    'revision',m.revision
  ) order by m.created_at),'[]'::jsonb)
  into v_messages
  from public.iberfit_messages m
  join public.iberfit_conversation_threads t on t.id=m.thread_id
  where t.organization_id=v_org
    and (
      (v_app='client' and t.client_id=v_client)
      or (v_app='coach' and t.coach_user_id=v_user)
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',n.id,
    'title',n.title,
    'body',n.body,
    'status',n.status,
    'createdAt',n.created_at,
    'readAt',n.read_at,
    'actionArea',n.action_area,
    'actionEntityId',n.action_entity_id,
    'revision',n.revision
  ) order by n.created_at desc),'[]'::jsonb)
  into v_notifications
  from public.iberfit_in_app_notifications n
  where n.organization_id=v_org
    and (
      (v_app='client' and n.recipient_client_id=v_client)
      or (v_app='coach' and n.recipient_user_id=v_user)
    );

  return jsonb_build_object(
    'ok',true,
    'threads',v_threads,
    'messages',v_messages,
    'notifications',v_notifications,
    'revision',1,
    'serverTime',now()
  );
end
$function$;

-- Defensive direct-RPC boundary: the internal implementation remains private
-- to trusted SQL callers, without touching the authenticated public v14 entrypoint.
revoke execute on function public.iberfit_communication_bootstrap_v14_pre_v65e(text)
from public, anon, authenticated;
