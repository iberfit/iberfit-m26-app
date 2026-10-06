-- #766 rollback: exact verified original function definition from QA/PROD.
-- Preserve the existing EXECUTE grants; do not modify production without authorization.
CREATE OR REPLACE FUNCTION public.iberfit_appointment_change_requests_v13_pre_v65e()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid();
  v_snapshot jsonb;
  v_role text;
  v_own_client text;
  v_requests jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000',message='V13_AUTH_REQUIRED';
  end if;

  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_role:=lower(coalesce(v_snapshot#>>'{user,role}',''));
  v_own_client:=coalesce(
    v_snapshot#>>'{user,clientId}',
    v_snapshot#>>'{user,client_id}',
    ''
  );

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
    where exists(
      select 1
      from jsonb_array_elements(coalesce(v_snapshot#>'{data,appointments}','[]'::jsonb)) a
      where coalesce(a->>'id',a->>'entityId',a->>'entity_id','')=r.appointment_id
        and coalesce(a->>'clientId',a->>'client_id','')=r.client_id
    );
  else
    raise exception using errcode='42501',message='V13_ROLE_FORBIDDEN';
  end if;

  return jsonb_build_object('ok',true,'requests',v_requests);
end;
$function$;
