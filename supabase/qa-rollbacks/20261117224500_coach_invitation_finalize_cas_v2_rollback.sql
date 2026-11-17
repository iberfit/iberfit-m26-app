-- QA-only rollback, restoring the exact prior finalizer without modifying data.
BEGIN;
DO $qa_finalizer_rollback_guard$
DECLARE v_def text;
BEGIN
  IF (SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA'
     OR (SELECT (value#>>'{}')::boolean FROM public.iberfit_system_settings WHERE key='production_blocked') IS DISTINCT FROM true
     OR (SELECT (value#>>'{}')::boolean FROM public.iberfit_system_settings WHERE key='real_data_allowed') IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'M26_QA_FINALIZER_ROLLBACK_ENV_DENIED' USING errcode='42501'; END IF;
  v_def:=pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure);
  IF position('V26_INVITATION_OPERATION_STALE' IN v_def)=0
    OR position('V26_INVITATION_DELIVERY_TRANSITION_DENIED' IN v_def)=0
  THEN RAISE EXCEPTION 'M26_QA_FINALIZER_ROLLBACK_DRIFT' USING errcode='42501'; END IF;
END $qa_finalizer_rollback_guard$;
CREATE OR REPLACE FUNCTION public.iberfit_admin_client_invitation_finalize_v26(p_client_id uuid, p_operation_id text, p_delivery_status text, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_context jsonb;
  v_org uuid;
  v_actor uuid:=auth.uid();
  v_status text:=lower(btrim(coalesce(p_delivery_status,'')));
  v_code text:=upper(regexp_replace(btrim(coalesce(p_error_code,'')),'[^A-Za-z0-9_:-]+','','g'));
  v_access public.client_access_v26%rowtype;
  v_summary text;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_context:=public.iberfit_application_context_v14();
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if not (
    coalesce(v_context->'roles','[]'::jsonb)?'admin'
    or (
      coalesce(v_context->'roles','[]'::jsonb)?'coach'
      and v_actor is not null and v_org is not null
      and exists (
        select 1 from public.iberfit_organization_memberships m
        where m.user_id=v_actor and m.organization_id=v_org and m.status='active'
      )
      and (
        exists (
          select 1 from public.client_assignments a
          where a.client_id=p_client_id and a.coach_user_id=v_actor and a.active=true
        ) or exists (
          select 1 from public.iberfit_coach_client_assignments a
          where a.client_id=p_client_id::text and a.coach_user_id=v_actor
            and a.organization_id=v_org and a.status='active'
            and a.starts_at<=current_date
            and (a.ends_at is null or a.ends_at>=current_date)
        )
      )
    )
  ) then raise exception 'V26_INVITE_ROLE_OR_CLIENT_SCOPE_FORBIDDEN' using errcode='42501'; end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null or v_actor is null then raise exception 'V26_INVITE_FINALIZE_CONTEXT_REQUIRED' using errcode='42501'; end if;
  if v_status not in ('sent','error') then raise exception 'V26_INVITE_DELIVERY_STATUS_INVALID' using errcode='22023'; end if;
  perform public.iberfit_assert_client_org_scope_v65e(v_org,p_client_id::text);

  -- Recheck lifecycle at final delivery; an Admin may revoke while email is sent.
  if coalesce(v_context->'roles','[]'::jsonb)?'coach'
     and not coalesce(v_context->'roles','[]'::jsonb)?'admin' then
    select * into v_access from public.client_access_v26 a
      where a.client_id=p_client_id for update;
    if not found then raise exception 'V26_INVITE_ACCESS_NOT_FOUND' using errcode='P0002'; end if;
    if v_access.status in ('suspendido','revocado') then
      raise exception 'V26_COACH_INVITE_ACCESS_REVOKED' using errcode='42501';
    end if;
  end if;
  update public.client_access_v26 set
    invitation_delivery_status=v_status,
    invitation_sent_at=case when v_status='sent' then coalesce(invitation_sent_at,now()) else invitation_sent_at end,
    invitation_error_code=case when v_status='error' then left(coalesce(nullif(v_code,''),'INVITATION_SEND_FAILED'),100) else null end,
    updated_at=now(),revision=revision+1
  where client_id=p_client_id
  returning * into v_access;
  if not found then raise exception 'V26_INVITE_ACCESS_NOT_FOUND' using errcode='P0002'; end if;

  v_summary:=case when v_status='sent' then 'Invitación alojada aceptada por el proveedor de autenticación.' else 'La invitación no pudo entregarse; el cliente permanece creado y pendiente.' end;
  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,entity_type,entity_id,summary,trace_id,revision
  ) values(v_org,case when v_status='sent' then 'ADMIN_CLIENT_INVITATION_SENT' else 'ADMIN_CLIENT_INVITATION_ERROR' end,v_actor,case when coalesce(v_context->'roles','[]'::jsonb)?'admin' then 'admin' else 'coach' end,'client_access',p_client_id::text,v_summary,btrim(coalesce(p_operation_id,'')),v_access.revision::integer);

  return jsonb_build_object('ok',true,'clientId',p_client_id,'accessStatus',v_access.status,'deliveryStatus',v_status,'attemptCount',v_access.invitation_attempt_count,'lastAttemptAt',v_access.last_invitation_attempt_at,'sentAt',v_access.invitation_sent_at,'errorCode',v_access.invitation_error_code,'activatedAt',v_access.activated_at);
end
$function$
;
DO $qa_finalizer_rollback_verify$
BEGIN
  IF md5(pg_get_functiondef('public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)'::regprocedure)) IS DISTINCT FROM 'a4cc1e25bba797774ec3b7e1c4536947'
    OR has_function_privilege('anon','public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'M26_QA_FINALIZER_ROLLBACK_VERIFY_FAILED' USING errcode='42501'; END IF;
END $qa_finalizer_rollback_verify$;
COMMIT;
