-- IBERFIT M26 · Action Outcome Tracking V1
-- Canonical coach/admin loop: signal -> decision -> intervention -> reviewed outcome.
-- No automatic load changes, diagnosis, messaging or client-visible publication.

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
    raise exception 'M26_ACTION_OUTCOME_REQUIRED_CANONICAL_SURFACE_MISSING';
  end if;

  if to_regprocedure('public.iberfit_command_preflight_v26_pre_action_outcome(jsonb)') is not null
     or to_regprocedure('public.iberfit_execute_command_v26_pre_action_outcome(jsonb)') is not null then
    raise exception 'M26_ACTION_OUTCOME_ALREADY_WRAPPED';
  end if;

  for v_existing in
    select * from public.domain_command_registry_v26
    where command_type in ('ACCION_SEGUIMIENTO_REGISTRAR','ACCION_RESULTADO_REGISTRAR')
  loop
    if v_existing.entity_type<>'action_outcome'
       or array(select unnest(v_existing.allowed_roles) order by 1)<>array['admin','coach']::text[]
       or v_existing.requires_reason
       or v_existing.requires_preview
       or v_existing.snapshot_on_apply
       or not v_existing.conflict_sensitive
       or v_existing.bootstrap_allowed
       or not v_existing.enabled then
      raise exception 'M26_ACTION_OUTCOME_COMMAND_CONTRACT_DRIFT:%',v_existing.command_type;
    end if;
  end loop;
end
$precheck$;

insert into public.domain_command_registry_v26(
  command_type,entity_type,event_name,allowed_roles,
  requires_reason,requires_preview,snapshot_on_apply,
  conflict_sensitive,bootstrap_allowed,enabled
)
values
  ('ACCION_SEGUIMIENTO_REGISTRAR','action_outcome','REGISTRAR',array['admin','coach']::text[],false,false,false,true,false,true),
  ('ACCION_RESULTADO_REGISTRAR','action_outcome','CERRAR',array['admin','coach']::text[],false,false,false,true,false,true)
on conflict(command_type) do nothing;

insert into public.domain_transitions_v26(entity_type,from_status,event_name,to_status)
values
  ('action_outcome','borrador','REGISTRAR','abierto'),
  ('action_outcome','abierto','CERRAR','cerrado')
on conflict(entity_type,from_status,event_name) do nothing;

do $transition_check$
declare v_bad integer;
begin
  select count(*) into v_bad
  from (
    values
      ('action_outcome','borrador','REGISTRAR','abierto'),
      ('action_outcome','abierto','CERRAR','cerrado')
  ) expected(entity_type,from_status,event_name,to_status)
  left join public.domain_transitions_v26 actual using(entity_type,from_status,event_name)
  where actual.entity_type is null or actual.to_status<>expected.to_status;
  if v_bad<>0 then raise exception 'M26_ACTION_OUTCOME_TRANSITION_CONTRACT_DRIFT:%',v_bad; end if;
end
$transition_check$;

create or replace function public.iberfit_validate_action_outcome_v26(p_command jsonb)
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
  v_value text;
  v_key text;
begin
  if v_type not in ('ACCION_SEGUIMIENTO_REGISTRAR','ACCION_RESULTADO_REGISTRAR') then return null; end if;
  if jsonb_typeof(p_command)<>'object' or v_entity_type is distinct from 'action_outcome' then
    return 'INVALID_ACTION_OUTCOME_COMMAND';
  end if;

  begin
    v_client_id:=nullif(p_command->>'clientId','')::uuid;
  exception when invalid_text_representation then
    return 'INVALID_CLIENT_ID';
  end;
  if v_client_id is null or not exists(select 1 from public.clients where id=v_client_id) then
    return 'CLIENT_NOT_FOUND';
  end if;
  if coalesce(public.iberfit_current_role_v26()::text,'') not in ('admin','coach') then
    return 'ROLE_NOT_ALLOWED';
  end if;
  if public.iberfit_can_access_client_v26(v_client_id) is distinct from true then
    return 'CLIENT_ACCESS_DENIED';
  end if;
  if public.iberfit_canary_enabled_v26(v_client_id) is distinct from true then
    return 'M26_CANARY_NOT_ENABLED';
  end if;

  v_patch:=p_command->'payload'->'patch';
  if jsonb_typeof(v_patch)<>'object' then return 'ACTION_OUTCOME_PATCH_REQUIRED'; end if;

  if v_type='ACCION_SEGUIMIENTO_REGISTRAR' then
    for v_key in select jsonb_object_keys(v_patch)
    loop
      if v_key not in ('id','clientId','signalSummary','signalSource','decisionSummary','interventionType','interventionSummary','expectedOutcome','reviewAt','visibleToClient') then
        return 'ACTION_TRACKING_FIELD_NOT_ALLOWED';
      end if;
    end loop;

    if coalesce(v_patch->>'visibleToClient','false')<>'false' then return 'ACTION_TRACKING_MUST_BE_PRIVATE'; end if;

    v_value:=nullif(btrim(v_patch->>'signalSummary'),'');
    if v_value is null or char_length(v_value)<3 or char_length(v_value)>1200 then return 'INVALID_ACTION_SIGNAL_SUMMARY'; end if;
    v_value:=nullif(btrim(v_patch->>'decisionSummary'),'');
    if v_value is null or char_length(v_value)<3 or char_length(v_value)>1200 then return 'INVALID_ACTION_DECISION_SUMMARY'; end if;
    v_value:=nullif(btrim(v_patch->>'interventionSummary'),'');
    if v_value is null or char_length(v_value)<3 or char_length(v_value)>1600 then return 'INVALID_ACTION_INTERVENTION_SUMMARY'; end if;
    v_value:=nullif(btrim(v_patch->>'expectedOutcome'),'');
    if v_value is null or char_length(v_value)<3 or char_length(v_value)>1200 then return 'INVALID_ACTION_EXPECTED_OUTCOME'; end if;

    if coalesce(v_patch->>'signalSource','') not in ('checkin','adherence','session','progress','coach_observation','other') then
      return 'INVALID_ACTION_SIGNAL_SOURCE';
    end if;
    if coalesce(v_patch->>'interventionType','') not in ('load_adjustment','technique','recovery','adherence','schedule','communication','plan','other') then
      return 'INVALID_ACTION_INTERVENTION_TYPE';
    end if;

    v_value:=nullif(btrim(v_patch->>'reviewAt'),'');
    if v_value is null or v_value !~ '^\d{4}-\d{2}-\d{2}$' then return 'INVALID_ACTION_REVIEW_DATE'; end if;
    begin
      if to_char(v_value::date,'YYYY-MM-DD')<>v_value then return 'INVALID_ACTION_REVIEW_DATE'; end if;
    exception when datetime_field_overflow or invalid_datetime_format then
      return 'INVALID_ACTION_REVIEW_DATE';
    end;
  else
    for v_key in select jsonb_object_keys(v_patch)
    loop
      if v_key not in ('outcomeStatus','outcomeSummary','outcomeEvidence','reviewedAt','visibleToClient') then
        return 'ACTION_OUTCOME_FIELD_NOT_ALLOWED';
      end if;
    end loop;

    if coalesce(v_patch->>'visibleToClient','false')<>'false' then return 'ACTION_OUTCOME_MUST_BE_PRIVATE'; end if;
    if coalesce(v_patch->>'outcomeStatus','') not in ('improved','stable','worse','mixed','not_assessable') then
      return 'INVALID_ACTION_OUTCOME_STATUS';
    end if;
    v_value:=nullif(btrim(v_patch->>'outcomeSummary'),'');
    if v_value is null or char_length(v_value)<3 or char_length(v_value)>1600 then return 'INVALID_ACTION_OUTCOME_SUMMARY'; end if;
    if v_patch ? 'outcomeEvidence' and jsonb_typeof(v_patch->'outcomeEvidence') not in ('string','null') then
      return 'INVALID_ACTION_OUTCOME_EVIDENCE';
    end if;
    if char_length(coalesce(v_patch->>'outcomeEvidence',''))>1600 then return 'INVALID_ACTION_OUTCOME_EVIDENCE'; end if;

    v_value:=nullif(btrim(v_patch->>'reviewedAt'),'');
    if v_value is null or v_value !~ '^\d{4}-\d{2}-\d{2}$' then return 'INVALID_ACTION_REVIEWED_DATE'; end if;
    begin
      if to_char(v_value::date,'YYYY-MM-DD')<>v_value then return 'INVALID_ACTION_REVIEWED_DATE'; end if;
    exception when datetime_field_overflow or invalid_datetime_format then
      return 'INVALID_ACTION_REVIEWED_DATE';
    end;
  end if;

  return null;
exception when others then
  return 'INVALID_ACTION_OUTCOME_COMMAND';
end
$function$;

revoke all on function public.iberfit_validate_action_outcome_v26(jsonb) from public,anon,authenticated;

alter function public.iberfit_command_preflight_v26(jsonb)
  rename to iberfit_command_preflight_v26_pre_action_outcome;
alter function public.iberfit_execute_command_v26(jsonb)
  rename to iberfit_execute_command_v26_pre_action_outcome;

revoke all on function public.iberfit_command_preflight_v26_pre_action_outcome(jsonb) from public,anon,authenticated;
revoke all on function public.iberfit_execute_command_v26_pre_action_outcome(jsonb) from public,anon,authenticated;

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
  if p_command->>'type' in ('ACCION_SEGUIMIENTO_REGISTRAR','ACCION_RESULTADO_REGISTRAR') then
    perform public.iberfit_require_privileged_assurance_v65d();
    v_reason:=public.iberfit_validate_action_outcome_v26(p_command);
    if v_reason is not null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',null,'reason',v_reason,'serverAt',now());
    end if;
  end if;
  return public.iberfit_command_preflight_v26_pre_action_outcome(p_command);
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
  if p_command->>'type' not in ('ACCION_SEGUIMIENTO_REGISTRAR','ACCION_RESULTADO_REGISTRAR') then
    return public.iberfit_execute_command_v26_pre_action_outcome(p_command);
  end if;

  perform public.iberfit_require_privileged_assurance_v65d();
  v_reason:=public.iberfit_validate_action_outcome_v26(p_command);
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

  perform pg_advisory_xact_lock(hashtextextended('action_outcome:'||v_entity_id::text,0));

  if p_command->>'type'='ACCION_SEGUIMIENTO_REGISTRAR' then
    if not exists(
      select 1 from public.domain_entities_v26
      where entity_type='action_outcome' and entity_id=v_entity_id and client_id=v_client_id
    ) then
      if v_base_revision<>0 then
        return jsonb_build_object('kind','conflict','operationId',v_operation_id,'remoteRevision',0,'reason','REVISION_MISMATCH','serverAt',now());
      end if;
      insert into public.domain_entities_v26(entity_type,entity_id,client_id,status,revision,body,updated_at)
      values(
        'action_outcome',v_entity_id,v_client_id,'borrador',0,
        jsonb_build_object(
          'id',v_entity_id,
          'clientId',v_client_id,
          'status','borrador',
          'revision',0,
          'visibleToClient',false,
          'createdAt',now(),
          'updatedAt',now()
        ),
        now()
      );
      get diagnostics v_seeded=row_count;
    end if;
  end if;

  v_response:=public.iberfit_execute_command_v26_pre_action_outcome(p_command);

  if coalesce(v_response->>'kind','')<>'ack' and v_seeded=1 then
    delete from public.domain_entities_v26
    where entity_type='action_outcome' and entity_id=v_entity_id and client_id=v_client_id
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
  'Canonical M26 command bus with fail-closed Action Outcome Tracking. Coach/Admin record explicit signals, decisions, interventions and reviewed outcomes; no automated client-visible or training mutation is performed.';

do $postcheck$
declare
  v_tracking public.domain_command_registry_v26%rowtype;
  v_outcome public.domain_command_registry_v26%rowtype;
  v_source text;
begin
  select * into v_tracking from public.domain_command_registry_v26 where command_type='ACCION_SEGUIMIENTO_REGISTRAR';
  select * into v_outcome from public.domain_command_registry_v26 where command_type='ACCION_RESULTADO_REGISTRAR';
  if not found
     or v_tracking.entity_type<>'action_outcome'
     or v_outcome.entity_type<>'action_outcome'
     or v_tracking.allowed_roles<>array['admin','coach']::text[]
     or v_outcome.allowed_roles<>array['admin','coach']::text[] then
    raise exception 'M26_ACTION_OUTCOME_POSTCHECK_COMMAND';
  end if;
  select prosrc into v_source from pg_proc where oid='public.iberfit_execute_command_v26(jsonb)'::regprocedure;
  if position('iberfit_validate_action_outcome_v26' in v_source)=0
     or position('action_outcome' in v_source)=0
     or position('iberfit_execute_command_v26_pre_action_outcome' in v_source)=0 then
    raise exception 'M26_ACTION_OUTCOME_POSTCHECK_EXECUTE';
  end if;
  if has_function_privilege('authenticated','public.iberfit_execute_command_v26_pre_action_outcome(jsonb)','EXECUTE') then
    raise exception 'M26_ACTION_OUTCOME_INTERNAL_RPC_EXPOSED';
  end if;
end
$postcheck$;

commit;
