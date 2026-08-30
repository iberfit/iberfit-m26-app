-- IBERFIT RC65-C2/C3 · privileged server enforcement + BOLA/IDOR hardening
-- QA-first. Idempotent if it was already executed through Management API before migration-ledger ingestion.

create or replace function public.iberfit_assert_org_user_scope_v65e(
  p_organization_id uuid,
  p_user_id uuid,
  p_require_active boolean default true,
  p_required_role text default null
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_role text:=lower(nullif(btrim(coalesce(p_required_role,'')),''));
begin
  if p_organization_id is null or p_user_id is null then
    raise exception 'V65E_ORG_USER_SCOPE_REQUIRED' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.iberfit_organization_memberships m
    where m.organization_id=p_organization_id
      and m.user_id=p_user_id
      and (p_require_active is false or m.status='active')
  ) then
    raise exception 'V65E_ADMIN_TARGET_OUTSIDE_ORG' using errcode='42501';
  end if;

  if v_role is not null and not exists(
    select 1
    from public.user_application_roles r
    where r.user_id=p_user_id
      and lower(r.role::text)=v_role
      and r.active=true
  ) then
    raise exception 'V65E_REQUIRED_ROLE_MISSING' using errcode='42501';
  end if;

end
$function$;

revoke all on function public.iberfit_assert_org_user_scope_v65e(uuid,uuid,boolean,text) from public,anon,authenticated;

create or replace function public.iberfit_assert_global_role_mutation_scope_v65e(
  p_organization_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if p_organization_id is null or p_user_id is null then
    raise exception 'V65E_GLOBAL_ROLE_SCOPE_REQUIRED' using errcode='42501';
  end if;

  -- user_application_roles is global today. Any role mutation on a user who is
  -- actively present in another organization can alter authorization outside
  -- the current organization, so fail closed until roles are organization-scoped.
  if exists(
    select 1
    from public.iberfit_organization_memberships m
    where m.user_id=p_user_id
      and m.organization_id<>p_organization_id
      and m.status='active'
  ) then
    raise exception 'V65E_GLOBAL_ROLE_MULTI_ORG_FORBIDDEN' using errcode='42501';
  end if;
end
$function$;

revoke all on function public.iberfit_assert_global_role_mutation_scope_v65e(uuid,uuid) from public,anon,authenticated;

create or replace function public.iberfit_assert_client_org_scope_v65e(
  p_organization_id uuid,
  p_client_id text
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_client uuid;
  v_client_text text:=btrim(coalesce(p_client_id,''));
  v_known_here boolean:=false;
  v_known_elsewhere boolean:=false;
begin
  if p_organization_id is null or v_client_text='' then
    raise exception 'V65E_CLIENT_SCOPE_REQUIRED' using errcode='42501';
  end if;

  begin
    v_client:=v_client_text::uuid;
  exception when others then
    raise exception 'V65E_CLIENT_ID_INVALID' using errcode='22023';
  end;

  if not exists(select 1 from public.clients c where c.id=v_client) then
    raise exception 'V65E_CLIENT_NOT_FOUND' using errcode='P0002';
  end if;

  select exists(
    select 1 from public.iberfit_coach_client_assignments a
      where a.client_id=v_client_text and a.organization_id=p_organization_id
    union all
    select 1 from public.iberfit_conversation_threads t
      where t.client_id=v_client_text and t.organization_id=p_organization_id
    union all
    select 1 from public.iberfit_client_lifecycle_events e
      where e.client_id=v_client_text and e.organization_id=p_organization_id
    union all
    select 1 from public.iberfit_operational_tasks o
      where o.client_id=v_client_text and o.organization_id=p_organization_id
  ) into v_known_here;

  select exists(
    select 1 from public.iberfit_coach_client_assignments a
      where a.client_id=v_client_text and a.organization_id<>p_organization_id
    union all
    select 1 from public.iberfit_conversation_threads t
      where t.client_id=v_client_text and t.organization_id<>p_organization_id
    union all
    select 1 from public.iberfit_client_lifecycle_events e
      where e.client_id=v_client_text and e.organization_id<>p_organization_id
    union all
    select 1 from public.iberfit_operational_tasks o
      where o.client_id=v_client_text and o.organization_id<>p_organization_id
  ) into v_known_elsewhere;

  if v_known_elsewhere and not v_known_here then
    raise exception 'V65E_CLIENT_OUTSIDE_ORG' using errcode='42501';
  end if;
end
$function$;

revoke all on function public.iberfit_assert_client_org_scope_v65e(uuid,text) from public,anon,authenticated;

-- Rename each canonical implementation exactly once. Existing compiled dependencies keep
-- pointing to the pre-v65e OID; every externally exposed sensitive entrypoint below is wrapped.
do $migration$
declare
  v_item record;
begin
  for v_item in
    select * from (values
      ('iberfit_admin_bootstrap_v14','', 'iberfit_admin_bootstrap_v14_pre_v65e'),
      ('iberfit_admin_execute_v14','jsonb', 'iberfit_admin_execute_v14_pre_v65e'),
      ('iberfit_bootstrap_v26','', 'iberfit_bootstrap_v26_pre_v65e'),
      ('iberfit_command_preflight_v26','jsonb', 'iberfit_command_preflight_v26_pre_v65e'),
      ('iberfit_execute_command_v26','jsonb', 'iberfit_execute_command_v26_pre_v65e'),
      ('iberfit_communication_bootstrap_v14','text', 'iberfit_communication_bootstrap_v14_pre_v65e'),
      ('iberfit_communication_execute_v14','text,jsonb', 'iberfit_communication_execute_v14_pre_v65e'),
      ('iberfit_appointment_change_requests_v13','', 'iberfit_appointment_change_requests_v13_pre_v65e'),
      ('iberfit_request_appointment_change_v13','text,text,text', 'iberfit_request_appointment_change_v13_pre_v65e'),
      ('iberfit_resolve_appointment_change_v13','text,text,text', 'iberfit_resolve_appointment_change_v13_pre_v65e'),
      ('iberfit_create_client_draft_v12','jsonb', 'iberfit_create_client_draft_v12_pre_v65e'),
      ('iberfit_register_iri_external_report_v12','uuid,uuid,text,text,bigint,text', 'iberfit_register_iri_external_report_v12_pre_v65e'),
      ('iberfit_client_onboarding_preflight_v12','', 'iberfit_client_onboarding_preflight_v12_pre_v65e'),
      ('iberfit_iri_external_report_preflight_v12','', 'iberfit_iri_external_report_preflight_v12_pre_v65e'),
      ('m26_telemetry_delete_own_v59','timestamp with time zone', 'm26_telemetry_delete_own_v59_pre_v65e'),
      ('m26_telemetry_import_v59','jsonb', 'm26_telemetry_import_v59_pre_v65e'),
      ('m26_telemetry_read_page_v59','uuid,timestamp with time zone,integer', 'm26_telemetry_read_page_v59_pre_v65e')
    ) as x(name,args,new_name)
  loop
    if to_regprocedure('public.'||v_item.new_name||'('||v_item.args||')') is null then
      if to_regprocedure('public.'||v_item.name||'('||v_item.args||')') is null then
        raise exception 'V65E_EXPECTED_FUNCTION_MISSING:%(%)',v_item.name,v_item.args;
      end if;
      execute format(
        'alter function public.%I(%s) rename to %I',
        v_item.name,
        v_item.args,
        v_item.new_name
      );
    end if;
  end loop;
end
$migration$;

-- Internal implementations are never directly callable by API roles.
revoke all on function public.iberfit_admin_bootstrap_v14_pre_v65e() from public,anon,authenticated;
revoke all on function public.iberfit_admin_execute_v14_pre_v65e(jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_bootstrap_v26_pre_v65e() from public,anon,authenticated;
revoke all on function public.iberfit_command_preflight_v26_pre_v65e(jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_execute_command_v26_pre_v65e(jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_communication_bootstrap_v14_pre_v65e(text) from public,anon,authenticated;
revoke all on function public.iberfit_communication_execute_v14_pre_v65e(text,jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_appointment_change_requests_v13_pre_v65e() from public,anon,authenticated;
revoke all on function public.iberfit_request_appointment_change_v13_pre_v65e(text,text,text) from public,anon,authenticated;
revoke all on function public.iberfit_resolve_appointment_change_v13_pre_v65e(text,text,text) from public,anon,authenticated;
revoke all on function public.iberfit_create_client_draft_v12_pre_v65e(jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_register_iri_external_report_v12_pre_v65e(uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.iberfit_client_onboarding_preflight_v12_pre_v65e() from public,anon,authenticated;
revoke all on function public.iberfit_iri_external_report_preflight_v12_pre_v65e() from public,anon,authenticated;
revoke all on function public.m26_telemetry_delete_own_v59_pre_v65e(timestamp with time zone) from public,anon,authenticated;
revoke all on function public.m26_telemetry_import_v59_pre_v65e(jsonb) from public,anon,authenticated;
revoke all on function public.m26_telemetry_read_page_v59_pre_v65e(uuid,timestamp with time zone,integer) from public,anon,authenticated;

-- Canonical SECURITY DEFINER wrappers keep the API contract and enforce session-bound WebAuthn server-side.
create or replace function public.iberfit_admin_bootstrap_v14()
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_admin_bootstrap_v14_pre_v65e();
end
$function$;

create or replace function public.iberfit_admin_execute_v14(p_command jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
declare
  v_context jsonb;
  v_org uuid;
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_target_user uuid;
  v_role text;
  v_client text;
  v_coach uuid;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_context:=public.iberfit_application_context_v14();
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then
    raise exception 'V65E_ADMIN_REQUIRED' using errcode='42501';
  end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then
    raise exception 'V65E_ORGANIZATION_REQUIRED' using errcode='42501';
  end if;

  if v_type in ('ADMIN_ROL_OTORGAR','ADMIN_ROL_REVOCAR') then
    begin
      v_target_user:=(v_payload->>'userId')::uuid;
    exception when others then
      raise exception 'V65E_TARGET_USER_INVALID' using errcode='22023';
    end;
    v_role:=lower(btrim(coalesce(v_payload->>'role','')));
    if v_role not in ('client','coach','admin') then
      raise exception 'V65E_ROLE_INVALID' using errcode='22023';
    end if;
    perform public.iberfit_assert_org_user_scope_v65e(
      v_org,
      v_target_user,
      v_type='ADMIN_ROL_OTORGAR',
      null
    );
    perform public.iberfit_assert_global_role_mutation_scope_v65e(v_org,v_target_user);
  elsif v_type='ADMIN_ASIGNACION_CREAR' then
    begin
      v_coach:=(v_payload->>'coachUserId')::uuid;
    exception when others then
      raise exception 'V65E_COACH_USER_INVALID' using errcode='22023';
    end;
    perform public.iberfit_assert_org_user_scope_v65e(v_org,v_coach,true,'coach');
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
  elsif v_type='ADMIN_CLIENTE_CAMBIAR_CICLO' then
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
  end if;

  return public.iberfit_admin_execute_v14_pre_v65e(p_command);
end
$function$;

create or replace function public.iberfit_bootstrap_v26()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_bootstrap_v26_pre_v65e();
end
$function$;

create or replace function public.iberfit_command_preflight_v26(p_command jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_command_preflight_v26_pre_v65e(p_command);
end
$function$;

create or replace function public.iberfit_execute_command_v26(p_command jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_execute_command_v26_pre_v65e(p_command);
end
$function$;

create or replace function public.iberfit_communication_bootstrap_v14(p_application text)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_communication_bootstrap_v14_pre_v65e(p_application);
end
$function$;

create or replace function public.iberfit_communication_execute_v14(p_application text,p_command jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_communication_execute_v14_pre_v65e(p_application,p_command);
end
$function$;

create or replace function public.iberfit_appointment_change_requests_v13()
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_appointment_change_requests_v13_pre_v65e();
end
$function$;

create or replace function public.iberfit_request_appointment_change_v13(
  p_appointment_id text,
  p_client_id text,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_request_appointment_change_v13_pre_v65e(p_appointment_id,p_client_id,p_reason);
end
$function$;

create or replace function public.iberfit_resolve_appointment_change_v13(
  p_request_id text,
  p_resolution text,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_resolve_appointment_change_v13_pre_v65e(p_request_id,p_resolution,p_note);
end
$function$;

create or replace function public.iberfit_create_client_draft_v12(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_create_client_draft_v12_pre_v65e(p_payload);
end
$function$;

create or replace function public.iberfit_register_iri_external_report_v12(
  p_client_id uuid,
  p_assessment_id uuid,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_object_path text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_register_iri_external_report_v12_pre_v65e(
    p_client_id,p_assessment_id,p_file_name,p_mime_type,p_size_bytes,p_object_path
  );
end
$function$;

create or replace function public.iberfit_client_onboarding_preflight_v12()
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_client_onboarding_preflight_v12_pre_v65e();
end
$function$;

create or replace function public.iberfit_iri_external_report_preflight_v12()
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_iri_external_report_preflight_v12_pre_v65e();
end
$function$;

create or replace function public.m26_telemetry_delete_own_v59(p_before timestamp with time zone)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.m26_telemetry_delete_own_v59_pre_v65e(p_before);
end
$function$;

create or replace function public.m26_telemetry_import_v59(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.m26_telemetry_import_v59_pre_v65e(p_payload);
end
$function$;

create or replace function public.m26_telemetry_read_page_v59(
  p_client_id uuid,
  p_before timestamp with time zone,
  p_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.m26_telemetry_read_page_v59_pre_v65e(p_client_id,p_before,p_limit);
end
$function$;

-- SECURITY INVOKER data RPCs must preserve RLS. Inject the assurance call into
-- their existing canonical function body in place rather than converting them
-- to SECURITY DEFINER or exposing an internal implementation.
do $invoker_guard$
declare
  v_item record;
  v_def text;
  v_source text;
  v_new_source text;
begin
  for v_item in
    select p.oid,p.proname,l.lanname,p.prosrc
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public'
      and p.proname=any(array[
        'iberfit_bootstrap',
        'iberfit_bootstrap_core',
        'iberfit_bootstrap_support',
        'iberfit_process_operation',
        'iberfit_reconcile_operations',
        'm26_backend_bootstrap_v43',
        'm26_draft_delete_v431',
        'm26_draft_get_v431',
        'm26_draft_upsert_v431',
        'm26_record_measurement_v43',
        'm26_save_training_session_v43',
        'm26_send_message_v43',
        'm26_wearable_bootstrap_v44',
        'm26_wearable_connection_upsert_v44',
        'm26_wearable_delete_all_v44',
        'm26_wearable_import_v44',
        'm26_wearable_revoke_v44'
      ])
  loop
    if position('iberfit_require_privileged_assurance_v65d' in v_item.prosrc)>0 then
      continue;
    end if;
    if v_item.lanname not in ('sql','plpgsql') then
      raise exception 'V65E_INVOKER_LANGUAGE_UNSUPPORTED:%:%',v_item.proname,v_item.lanname;
    end if;

    v_source:=v_item.prosrc;
    v_def:=pg_get_functiondef(v_item.oid);
    if position(v_source in v_def)=0 then
      raise exception 'V65E_INVOKER_SOURCE_NOT_EMBEDDED:%',v_item.proname;
    end if;

    if v_item.lanname='sql' then
      v_new_source:='select public.iberfit_require_privileged_assurance_v65d();'||E'\n'||v_source;
    else
      if (length(lower(v_source))-length(replace(lower(v_source),E'\nbegin\n','')))/length(E'\nbegin\n')<>1 then
        raise exception 'V65E_INVOKER_BEGIN_CONTRACT:%',v_item.proname;
      end if;
      v_new_source:=replace(
        v_source,
        E'\nbegin\n',
        E'\nbegin\n  perform public.iberfit_require_privileged_assurance_v65d();\n'
      );
    end if;

    execute replace(v_def,v_source,v_new_source);
  end loop;
end
$invoker_guard$;

-- Public API grants: canonical wrappers authenticated-only.
revoke all on function public.iberfit_admin_bootstrap_v14() from public,anon;
grant execute on function public.iberfit_admin_bootstrap_v14() to authenticated;
revoke all on function public.iberfit_admin_execute_v14(jsonb) from public,anon;
grant execute on function public.iberfit_admin_execute_v14(jsonb) to authenticated;
revoke all on function public.iberfit_bootstrap_v26() from public,anon;
grant execute on function public.iberfit_bootstrap_v26() to authenticated;
revoke all on function public.iberfit_command_preflight_v26(jsonb) from public,anon;
grant execute on function public.iberfit_command_preflight_v26(jsonb) to authenticated;
revoke all on function public.iberfit_execute_command_v26(jsonb) from public,anon;
grant execute on function public.iberfit_execute_command_v26(jsonb) to authenticated;
revoke all on function public.iberfit_communication_bootstrap_v14(text) from public,anon;
grant execute on function public.iberfit_communication_bootstrap_v14(text) to authenticated;
revoke all on function public.iberfit_communication_execute_v14(text,jsonb) from public,anon;
grant execute on function public.iberfit_communication_execute_v14(text,jsonb) to authenticated;
revoke all on function public.iberfit_appointment_change_requests_v13() from public,anon;
grant execute on function public.iberfit_appointment_change_requests_v13() to authenticated;
revoke all on function public.iberfit_request_appointment_change_v13(text,text,text) from public,anon;
grant execute on function public.iberfit_request_appointment_change_v13(text,text,text) to authenticated;
revoke all on function public.iberfit_resolve_appointment_change_v13(text,text,text) from public,anon;
grant execute on function public.iberfit_resolve_appointment_change_v13(text,text,text) to authenticated;
revoke all on function public.iberfit_create_client_draft_v12(jsonb) from public,anon;
grant execute on function public.iberfit_create_client_draft_v12(jsonb) to authenticated;
revoke all on function public.iberfit_register_iri_external_report_v12(uuid,uuid,text,text,bigint,text) from public,anon;
grant execute on function public.iberfit_register_iri_external_report_v12(uuid,uuid,text,text,bigint,text) to authenticated;
revoke all on function public.iberfit_client_onboarding_preflight_v12() from public,anon;
grant execute on function public.iberfit_client_onboarding_preflight_v12() to authenticated;
revoke all on function public.iberfit_iri_external_report_preflight_v12() from public,anon;
grant execute on function public.iberfit_iri_external_report_preflight_v12() to authenticated;
revoke all on function public.m26_telemetry_delete_own_v59(timestamp with time zone) from public,anon;
grant execute on function public.m26_telemetry_delete_own_v59(timestamp with time zone) to authenticated;
revoke all on function public.m26_telemetry_import_v59(jsonb) from public,anon;
grant execute on function public.m26_telemetry_import_v59(jsonb) to authenticated;
revoke all on function public.m26_telemetry_read_page_v59(uuid,timestamp with time zone,integer) from public,anon;
grant execute on function public.m26_telemetry_read_page_v59(uuid,timestamp with time zone,integer) to authenticated;

-- C3 least privilege: legacy/implementation-only security helpers are no longer client RPCs.
revoke all on function public.iberfit_auth_assurance_context_v65c() from public,anon,authenticated;
revoke all on function public.iberfit_admin_require_v14() from public,anon,authenticated;

comment on function public.iberfit_admin_execute_v14(jsonb) is
'RC65-C2/C3 canonical Admin API: session-bound IBERFIT WebAuthn required; organization/user/client BOLA guards precede legacy implementation.';
comment on function public.iberfit_bootstrap_v26() is
'RC65-C2 canonical bootstrap: privileged Coach/Admin reads fail closed without current-session IBERFIT WebAuthn; Client remains unchanged.';
comment on function public.iberfit_execute_command_v26(jsonb) is
'RC65-C2 canonical command execution: privileged actors require current-session IBERFIT WebAuthn before identity/client guards and mutation.';

-- Atomic postconditions. A failure here rolls the entire direct-query application back.
do $postcheck$
declare
  v_name text;
  v_args text;
  v_oid oid;
begin
  for v_name,v_args in
    select * from (values
      ('iberfit_admin_bootstrap_v14',''),
      ('iberfit_admin_execute_v14','jsonb'),
      ('iberfit_bootstrap_v26',''),
      ('iberfit_command_preflight_v26','jsonb'),
      ('iberfit_execute_command_v26','jsonb'),
      ('iberfit_communication_bootstrap_v14','text'),
      ('iberfit_communication_execute_v14','text,jsonb'),
      ('iberfit_appointment_change_requests_v13',''),
      ('iberfit_request_appointment_change_v13','text,text,text'),
      ('iberfit_resolve_appointment_change_v13','text,text,text'),
      ('iberfit_create_client_draft_v12','jsonb'),
      ('iberfit_register_iri_external_report_v12','uuid,uuid,text,text,bigint,text'),
      ('iberfit_client_onboarding_preflight_v12',''),
      ('iberfit_iri_external_report_preflight_v12',''),
      ('m26_telemetry_delete_own_v59','timestamp with time zone'),
      ('m26_telemetry_import_v59','jsonb'),
      ('m26_telemetry_read_page_v59','uuid,timestamp with time zone,integer')
    ) as x(name,args)
  loop
    v_oid:=to_regprocedure('public.'||v_name||'('||v_args||')');
    if v_oid is null then
      raise exception 'V65E_POSTCHECK_WRAPPER_MISSING:%(%)',v_name,v_args;
    end if;
    if position('iberfit_require_privileged_assurance_v65d' in (select prosrc from pg_proc where oid=v_oid))=0 then
      raise exception 'V65E_POSTCHECK_ASSURANCE_GUARD_MISSING:%',v_name;
    end if;
    if not has_function_privilege('authenticated',v_oid,'EXECUTE') then
      raise exception 'V65E_POSTCHECK_AUTH_GRANT_MISSING:%',v_name;
    end if;
    if has_function_privilege('anon',v_oid,'EXECUTE') then
      raise exception 'V65E_POSTCHECK_ANON_GRANT_PRESENT:%',v_name;
    end if;
  end loop;

  if has_function_privilege('authenticated','public.iberfit_auth_assurance_context_v65c()','EXECUTE') then
    raise exception 'V65E_POSTCHECK_LEGACY_ASSURANCE_STILL_EXECUTABLE';
  end if;
  if has_function_privilege('authenticated','public.iberfit_admin_require_v14()','EXECUTE') then
    raise exception 'V65E_POSTCHECK_ADMIN_REQUIRE_STILL_EXECUTABLE';
  end if;
  if has_function_privilege('authenticated','public.iberfit_admin_execute_v14_pre_v65e(jsonb)','EXECUTE') then
    raise exception 'V65E_POSTCHECK_INTERNAL_ADMIN_EXECUTE_EXPOSED';
  end if;
  if position('V65E_ADMIN_TARGET_OUTSIDE_ORG' in (select prosrc from pg_proc where oid='public.iberfit_assert_org_user_scope_v65e(uuid,uuid,boolean,text)'::regprocedure))=0 then
    raise exception 'V65E_POSTCHECK_ORG_USER_BOLA_GUARD_MISSING';
  end if;
  if position('V65E_CLIENT_OUTSIDE_ORG' in (select prosrc from pg_proc where oid='public.iberfit_assert_client_org_scope_v65e(uuid,text)'::regprocedure))=0 then
    raise exception 'V65E_POSTCHECK_CLIENT_BOLA_GUARD_MISSING';
  end if;
  if position('V65E_GLOBAL_ROLE_MULTI_ORG_FORBIDDEN' in (select prosrc from pg_proc where oid='public.iberfit_assert_global_role_mutation_scope_v65e(uuid,uuid)'::regprocedure))=0 then
    raise exception 'V65E_POSTCHECK_GLOBAL_ROLE_BOLA_GUARD_MISSING';
  end if;

  if (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=any(array[
        'iberfit_bootstrap','iberfit_bootstrap_core','iberfit_bootstrap_support',
        'iberfit_process_operation','iberfit_reconcile_operations',
        'm26_backend_bootstrap_v43','m26_draft_delete_v431','m26_draft_get_v431',
        'm26_draft_upsert_v431','m26_record_measurement_v43','m26_save_training_session_v43',
        'm26_send_message_v43','m26_wearable_bootstrap_v44',
        'm26_wearable_connection_upsert_v44','m26_wearable_delete_all_v44',
        'm26_wearable_import_v44','m26_wearable_revoke_v44'
      ])
      and p.prosecdef=false
      and position('iberfit_require_privileged_assurance_v65d' in p.prosrc)>0
  )<>17 then
    raise exception 'V65E_POSTCHECK_INVOKER_GUARD_COUNT';
  end if;
end
$postcheck$;
