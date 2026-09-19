-- IBERFIT P0 · Restore primary-auth Admin read bootstrap after invitation regression.
-- Contract: authenticated bootstraps/authorized reads are available after primary auth;
-- privileged mutations continue to require server-side privileged assurance.
--
-- 2026-09-11 admin_client_invitation_v26 extended the Admin bootstrap with clientAccess
-- but accidentally reintroduced iberfit_require_privileged_assurance_v65d(). Keep the
-- clientAccess projection and restore the read-only bootstrap contract from 2026-09-02.

begin;

do $precheck$
begin
  if to_regprocedure('public.iberfit_admin_bootstrap_v14()') is null then
    raise exception 'IBERFIT_ADMIN_BOOTSTRAP_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_admin_bootstrap_v14_pre_v65e()') is null then
    raise exception 'IBERFIT_ADMIN_BOOTSTRAP_BASE_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_admin_execute_v14(jsonb)') is null then
    raise exception 'IBERFIT_ADMIN_EXECUTE_REQUIRED';
  end if;
  if to_regclass('public.client_access_v26') is null then
    raise exception 'IBERFIT_CLIENT_ACCESS_V26_REQUIRED';
  end if;
end
$precheck$;

create or replace function public.iberfit_admin_bootstrap_v14()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_org uuid;
  v_access jsonb;
begin
  -- Intentionally no privileged-assurance guard here. This is an authorized read
  -- bootstrap used after primary authentication. Privileged writes remain guarded
  -- by iberfit_admin_execute_v14() and their narrow mutation helpers.
  v_base:=public.iberfit_admin_bootstrap_v14_pre_v65e();
  v_org:=nullif(v_base#>>'{organization,id}','')::uuid;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',a.id,
        'clientId',a.client_id,
        'authUserId',a.auth_user_id,
        'email',a.email,
        'status',a.status,
        'revision',a.revision,
        'invitationAttemptCount',a.invitation_attempt_count,
        'lastInvitationAttemptAt',a.last_invitation_attempt_at,
        'invitationSentAt',a.invitation_sent_at,
        'invitationDeliveryStatus',a.invitation_delivery_status,
        'invitationErrorCode',a.invitation_error_code,
        'activatedAt',a.activated_at,
        'updatedAt',a.updated_at
      )
      order by a.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_access
  from public.client_access_v26 a
  where exists(
      select 1
      from public.iberfit_client_lifecycle_events e
      where e.organization_id=v_org
        and e.client_id=a.client_id::text
    )
    or exists(
      select 1
      from public.iberfit_coach_client_assignments ca
      where ca.organization_id=v_org
        and ca.client_id=a.client_id::text
    )
    or exists(
      select 1
      from public.iberfit_conversation_threads t
      where t.organization_id=v_org
        and t.client_id=a.client_id::text
    )
    or exists(
      select 1
      from public.iberfit_operational_tasks o
      where o.organization_id=v_org
        and o.client_id=a.client_id::text
    );

  return jsonb_set(
    v_base,
    '{data,clientAccess}',
    coalesce(v_access,'[]'::jsonb),
    true
  );
end
$function$;

revoke all on function public.iberfit_admin_bootstrap_v14() from public,anon;
grant execute on function public.iberfit_admin_bootstrap_v14() to authenticated;

comment on function public.iberfit_admin_bootstrap_v14() is
'IBERFIT Admin authorized read bootstrap. Primary authentication is sufficient; privileged mutations remain protected by iberfit_require_privileged_assurance_v65d().';

do $postcheck$
declare
  v_bootstrap_source text;
  v_execute_source text;
begin
  select p.prosrc
    into v_bootstrap_source
  from pg_proc p
  where p.oid='public.iberfit_admin_bootstrap_v14()'::regprocedure;

  select p.prosrc
    into v_execute_source
  from pg_proc p
  where p.oid='public.iberfit_admin_execute_v14(jsonb)'::regprocedure;

  if position('iberfit_require_privileged_assurance_v65d' in coalesce(v_bootstrap_source,''))<>0 then
    raise exception 'IBERFIT_ADMIN_BOOTSTRAP_PRIVILEGED_GUARD_REGRESSION';
  end if;
  if position('iberfit_admin_bootstrap_v14_pre_v65e' in coalesce(v_bootstrap_source,''))=0
     or position('client_access_v26' in coalesce(v_bootstrap_source,''))=0 then
    raise exception 'IBERFIT_ADMIN_BOOTSTRAP_READ_SURFACE_INCOMPLETE';
  end if;
  if position('iberfit_require_privileged_assurance_v65d' in coalesce(v_execute_source,''))=0 then
    raise exception 'IBERFIT_ADMIN_EXECUTE_PRIVILEGED_GUARD_REQUIRED';
  end if;
  if has_function_privilege('anon','public.iberfit_admin_bootstrap_v14()','EXECUTE') then
    raise exception 'IBERFIT_ADMIN_BOOTSTRAP_ANON_EXECUTE_FORBIDDEN';
  end if;
  if not has_function_privilege('authenticated','public.iberfit_admin_bootstrap_v14()','EXECUTE') then
    raise exception 'IBERFIT_ADMIN_BOOTSTRAP_AUTH_EXECUTE_REQUIRED';
  end if;
end
$postcheck$;

commit;
