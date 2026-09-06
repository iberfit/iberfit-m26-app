-- IBERFIT M26 · CRM canonical commercial renewal command
-- One transactional write path: iberfit_execute_command_v26 -> domain_entities_v26.
-- No payment inference, charging or messaging automation is introduced here.

begin;

do $precheck$
declare
  v_existing public.domain_command_registry_v26%rowtype;
begin
  if to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_require_privileged_assurance_v65d()') is null
     or to_regprocedure('public.iberfit_current_role_v26()') is null
     or to_regclass('public.domain_entities_v26') is null
     or to_regclass('public.domain_events_v26') is null
     or to_regclass('public.command_receipts_v26') is null then
    raise exception 'M26_CRM_RENEWAL_REQUIRED_CANONICAL_SURFACE_MISSING';
  end if;

  if to_regprocedure('public.iberfit_command_preflight_v26_pre_crm_renewal(jsonb)') is not null
     or to_regprocedure('public.iberfit_execute_command_v26_pre_crm_renewal(jsonb)') is not null then
    raise exception 'M26_CRM_RENEWAL_ALREADY_WRAPPED';
  end if;

  select * into v_existing
  from public.domain_command_registry_v26
  where command_type='RENOVACION_REGISTRAR';

  if found and (
    v_existing.entity_type<>'renewal'
    or v_existing.event_name<>'REGISTRAR'
    or array(select unnest(v_existing.allowed_roles) order by 1)<>array['admin','coach']::text[]
    or v_existing.requires_reason
    or v_existing.requires_preview
    or v_existing.snapshot_on_apply
    or not v_existing.conflict_sensitive
    or v_existing.bootstrap_allowed
    or not v_existing.enabled
  ) then
    raise exception 'M26_CRM_RENEWAL_COMMAND_CONTRACT_DRIFT';
  end if;
end
$precheck$;

insert into public.domain_command_registry_v26(
  command_type,entity_type,event_name,allowed_roles,
  requires_reason,requires_preview,snapshot_on_apply,
  conflict_sensitive,bootstrap_allowed,enabled
)
values(
  'RENOVACION_REGISTRAR','renewal','REGISTRAR',array['admin','coach']::text[],
  false,false,false,true,false,true
)
on conflict(command_type) do nothing;

insert into public.domain_transitions_v26(entity_type,from_status,event_name,to_status)
values
  ('renewal','borrador','REGISTRAR','vigente'),
  ('renewal','vigente','REGISTRAR','vigente')
on conflict(entity_type,from_status,event_name) do nothing;

do $transition_check$
declare v_bad integer;
begin
  select count(*) into v_bad
  from (
    values
      ('renewal','borrador','REGISTRAR','vigente'),
      ('renewal','vigente','REGISTRAR','vigente')
  ) expected(entity_type,from_status,event_name,to_status)
  left join public.domain_transitions_v26 actual using(entity_type,from_status,event_name)
  where actual.entity_type is null or actual.to_status<>expected.to_status;
  if v_bad<>0 then raise exception 'M26_CRM_RENEWAL_TRANSITION_CONTRACT_DRIFT:%',v_bad; end if;
end
$transition_check$;

create or replace function public.iberfit_validate_commercial_renewal_v26(p_command jsonb)
returns text
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_type text:=nullif(p_command->>'type','');
  v_entity_type text:=nullif(p_command->>'entityType','');
  v_client_id uuid;
  v_patch jsonb;
  v_status text;
  v_date text;
  v_plan text;
  v_notes text;
  v_key text;
begin
  if v_type is distinct from 'RENOVACION_REGISTRAR' then return null; end if;
  if jsonb_typeof(p_command)<>'object' or v_entity_type is distinct from 'renewal' then
    return 'INVALID_RENEWAL_COMMAND';
  end if;

  begin
    v_client_id:=nullif(p_command->>'clientId','')::uuid;
  exception when invalid_text_representation then
    return 'INVALID_CLIENT_ID';
  end;
  if v_client_id is null or not exists(select 1 from public.clients where id=v_client_id) then
    return 'CLIENT_NOT_FOUND';
  end if;
  if public.iberfit_current_role_v26() not in ('admin','coach') then
    return 'ROLE_NOT_ALLOWED';
  end if;
  if not public.iberfit_can_access_client_v26(v_client_id) then
    return 'CLIENT_ACCESS_DENIED';
  end if;
  if not public.iberfit_canary_enabled_v26(v_client_id) then
    return 'M26_CANARY_NOT_ENABLED';
  end if;

  v_patch:=p_command->'payload'->'patch';
  if jsonb_typeof(v_patch)<>'object' then return 'RENEWAL_PATCH_REQUIRED'; end if;

  for v_key in select jsonb_object_keys(v_patch)
  loop
    if v_key not in ('renewalDate','renewalStatus','commercialPlan','notes') then
      return 'RENEWAL_FIELD_NOT_ALLOWED';
    end if;
  end loop;

  if v_patch ? 'renewalStatus' and jsonb_typeof(v_patch->'renewalStatus') not in ('string','null') then
    return 'INVALID_RENEWAL_STATUS';
  end if;
  v_status:=nullif(btrim(v_patch->>'renewalStatus'),'');
  if v_status is not null and v_status not in ('completed','overdue','upcoming','current') then
    return 'INVALID_RENEWAL_STATUS';
  end if;

  if v_patch ? 'renewalDate' and jsonb_typeof(v_patch->'renewalDate') not in ('string','null') then
    return 'INVALID_RENEWAL_DATE';
  end if;
  v_date:=nullif(btrim(v_patch->>'renewalDate'),'');
  if v_date is not null then
    if v_date !~ '^\d{4}-\d{2}-\d{2}$' then return 'INVALID_RENEWAL_DATE'; end if;
    begin
      if to_char(v_date::date,'YYYY-MM-DD')<>v_date then return 'INVALID_RENEWAL_DATE'; end if;
    exception when datetime_field_overflow or invalid_datetime_format then
      return 'INVALID_RENEWAL_DATE';
    end;
  end if;

  if v_status is null and v_date is null then
    return 'RENEWAL_EVIDENCE_REQUIRED';
  end if;

  if v_patch ? 'commercialPlan' and jsonb_typeof(v_patch->'commercialPlan') not in ('string','null') then
    return 'INVALID_COMMERCIAL_PLAN';
  end if;
  v_plan:=v_patch->>'commercialPlan';
  if v_plan is not null and char_length(v_plan)>140 then return 'INVALID_COMMERCIAL_PLAN'; end if;

  if v_patch ? 'notes' and jsonb_typeof(v_patch->'notes') not in ('string','null') then
    return 'INVALID_RENEWAL_NOTES';
  end if;
  v_notes:=v_patch->>'notes';
  if v_notes is not null and char_length(v_notes)>1000 then return 'INVALID_RENEWAL_NOTES'; end if;

  return null;
exception when others then
  return 'INVALID_RENEWAL_COMMAND';
end
$function$;

revoke all on function public.iberfit_validate_commercial_renewal_v26(jsonb) from public,anon,authenticated;

alter function public.iberfit_command_preflight_v26(jsonb)
  rename to iberfit_command_preflight_v26_pre_crm_renewal;
alter function public.iberfit_execute_command_v26(jsonb)
  rename to iberfit_execute_command_v26_pre_crm_renewal;

revoke all on function public.iberfit_command_preflight_v26_pre_crm_renewal(jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_execute_command_v26_pre_crm_renewal(jsonb) from public,anon,authenticated;

create or replace function public.iberfit_command_preflight_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_reason text;
  v_operation_id text:=p_command->>'operationId';
begin
  if p_command->>'type'='RENOVACION_REGISTRAR' then
    perform public.iberfit_require_privileged_assurance_v65d();
    v_reason:=public.iberfit_validate_commercial_renewal_v26(p_command);
    if v_reason is not null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason',v_reason,'serverAt',now());
    end if;
  end if;
  return public.iberfit_command_preflight_v26_pre_crm_renewal(p_command);
end
$function$;

create or replace function public.iberfit_execute_command_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_reason text;
  v_response jsonb;
  v_operation_id text:=p_command->>'operationId';
  v_entity_id uuid;
  v_client_id uuid;
  v_base_revision bigint;
  v_seeded integer:=0;
begin
  if p_command->>'type'<>'RENOVACION_REGISTRAR' then
    return public.iberfit_execute_command_v26_pre_crm_renewal(p_command);
  end if;

  perform public.iberfit_require_privileged_assurance_v65d();
  v_reason:=public.iberfit_validate_commercial_renewal_v26(p_command);
  if v_reason is not null then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason',v_reason,'serverAt',now());
  end if;

  begin
    v_entity_id:=(p_command->>'entityId')::uuid;
    v_client_id:=(p_command->>'clientId')::uuid;
    v_base_revision:=(p_command->>'baseRevision')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason','INVALID_COMMAND_IDENTIFIERS','serverAt',now());
  end;
  if v_entity_id is null or v_base_revision is null or v_base_revision<0 then
    return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason','INVALID_COMMAND_IDENTIFIERS','serverAt',now());
  end if;

  perform pg_advisory_xact_lock(hashtextextended('renewal:'||v_entity_id::text,0));
  if not exists(
    select 1 from public.domain_entities_v26
    where entity_type='renewal' and entity_id=v_entity_id and client_id=v_client_id
  ) then
    if v_base_revision<>0 then
      return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',0,'reason','REVISION_MISMATCH','serverAt',now());
    end if;
    insert into public.domain_entities_v26(entity_type,entity_id,client_id,status,revision,body,updated_at)
    values(
      'renewal',v_entity_id,v_client_id,'borrador',0,
      jsonb_build_object('id',v_entity_id,'clientId',v_client_id,'status','borrador','revision',0,'createdAt',now(),'updatedAt',now()),
      now()
    );
    get diagnostics v_seeded=row_count;
  end if;

  v_response:=public.iberfit_execute_command_v26_pre_crm_renewal(p_command);

  if coalesce(v_response->>'kind','')<>'ack' and v_seeded=1 then
    delete from public.domain_entities_v26
    where entity_type='renewal' and entity_id=v_entity_id and client_id=v_client_id
      and revision=0 and status='borrador';
  end if;

  return v_response;
end
$function$;

revoke all on function public.iberfit_command_preflight_v26(jsonb) from public,anon;
revoke all on function public.iberfit_execute_command_v26(jsonb) from public,anon;
grant execute on function public.iberfit_command_preflight_v26(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_execute_command_v26(jsonb) to authenticated,service_role;

comment on function public.iberfit_execute_command_v26(jsonb) is
  'Canonical M26 command bus with fail-closed commercial renewal validation. Renewal writes persist only in domain_entities_v26 and retain canonical idempotency/audit semantics.';

do $postcheck$
declare
  v_command public.domain_command_registry_v26%rowtype;
  v_source text;
begin
  select * into v_command from public.domain_command_registry_v26 where command_type='RENOVACION_REGISTRAR';
  if not found or v_command.entity_type<>'renewal' or v_command.allowed_roles<>array['admin','coach']::text[] then
    raise exception 'M26_CRM_RENEWAL_POSTCHECK_COMMAND';
  end if;
  select prosrc into v_source from pg_proc where oid='public.iberfit_execute_command_v26(jsonb)'::regprocedure;
  if position('iberfit_validate_commercial_renewal_v26' in v_source)=0
     or position('domain_entities_v26' in v_source)=0
     or position('iberfit_execute_command_v26_pre_crm_renewal' in v_source)=0 then
    raise exception 'M26_CRM_RENEWAL_POSTCHECK_EXECUTE';
  end if;
  if has_function_privilege('authenticated','public.iberfit_execute_command_v26_pre_crm_renewal(jsonb)','EXECUTE') then
    raise exception 'M26_CRM_RENEWAL_INTERNAL_RPC_EXPOSED';
  end if;
end
$postcheck$;

commit;
