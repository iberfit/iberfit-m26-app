-- #766: remove a redundant full snapshot in the appointment-change read path.
-- Internal function only; public v13 RPC, JSON contract and business mutations untouched.
-- Preserve org membership, authenticated primary role, privileged assurance and
-- the same visible appointment/client scope previously used by bootstrap_v26.
create or replace function public.iberfit_appointment_change_requests_v13_pre_v65e()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_context jsonb;
  v_role text;
  v_own_client text;
  v_requests jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;

  -- Original bootstrap_v26 enforced active organization membership and
  -- the current privileged WebAuthn/email assurance before exposing data.
  select public.iberfit_application_context_v14() into v_context;
  if coalesce(v_context->>'membershipStatus','') <> 'active' then
    raise exception using errcode='42501',message='V14_ORGANIZATION_ACCESS_SUSPENDED';
  end if;
  perform public.iberfit_require_privileged_assurance_v65d();

  -- Both values were read from the same public functions inside snapshot.user.
  v_role := lower(coalesce(public.iberfit_current_role_v26(),''));
  v_own_client := coalesce(public.iberfit_client_id()::text,'');

  if v_role in ('client','cliente') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'appointmentId',r.appointment_id,
      'clientId',r.client_id,
      'reason',r.reason,
      'status',r.status,
      'createdAt',r.created_at,
      'resolvedAt',r.resolved_at,
      'resolutionNote',r.resolution_note
    ) order by r.created_at desc),'[]'::jsonb)
    into v_requests
    from public.appointment_change_requests r
    where r.requester_user_id=v_user
      and r.client_id=v_own_client;

  elsif v_role in ('coach','entrenador','admin','administrador') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'appointmentId',r.appointment_id,
      'clientId',r.client_id,
      'reason',r.reason,
      'status',r.status,
      'createdAt',r.created_at,
      'resolvedAt',r.resolved_at,
      'resolutionNote',r.resolution_note
    ) order by r.created_at desc),'[]'::jsonb)
    into v_requests
    from public.appointment_change_requests r
    where exists (
      select 1
      from public.appointments a
      where a.id::text = r.appointment_id
        and a.client_id::text = r.client_id
        and public.iberfit_can_access_client_v26(a.client_id)
    );
  else
    raise exception using errcode='42501',message='V13_ROLE_FORBIDDEN';
  end if;

  return jsonb_build_object('ok',true,'requests',v_requests);
end;
$function$;

-- Preserve the existing least-privilege internal boundary; callers invoke only
-- public.iberfit_appointment_change_requests_v13().
revoke execute on function public.iberfit_appointment_change_requests_v13_pre_v65e()
from public, anon, authenticated;
