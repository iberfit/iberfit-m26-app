-- IBERFIT M26 · Action Outcome Tracking V1 · Preflight bootstrap fix
-- Makes the generic command preflight understand a not-yet-persisted action_outcome
-- without mutating state. Existing entities are returned from domain_entities_v26.

begin;

do $precheck$
begin
  if to_regprocedure('public.iberfit_base_entity_v26(text,uuid,uuid)') is null then
    raise exception 'M26_ACTION_OUTCOME_BASE_ENTITY_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_base_entity_v26_pre_action_outcome(text,uuid,uuid)') is not null then
    raise exception 'M26_ACTION_OUTCOME_BASE_ENTITY_ALREADY_WRAPPED';
  end if;
  if to_regprocedure('public.iberfit_validate_action_outcome_v26(jsonb)') is null then
    raise exception 'M26_ACTION_OUTCOME_VALIDATOR_REQUIRED';
  end if;
end
$precheck$;

alter function public.iberfit_base_entity_v26(text,uuid,uuid)
  rename to iberfit_base_entity_v26_pre_action_outcome;

revoke all on function public.iberfit_base_entity_v26_pre_action_outcome(text,uuid,uuid)
  from public,anon,authenticated;

create or replace function public.iberfit_base_entity_v26(
  p_entity_type text,
  p_entity_id uuid,
  p_client_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  if p_entity_type='action_outcome' then
    select e.body into v_result
    from public.domain_entities_v26 e
    where e.entity_type='action_outcome'
      and e.entity_id=p_entity_id
      and e.client_id=p_client_id;

    if v_result is not null then
      return v_result;
    end if;

    return jsonb_build_object(
      'id',p_entity_id,
      'clientId',p_client_id,
      'status','borrador',
      'revision',0,
      'visibleToClient',false,
      'createdAt',now(),
      'updatedAt',now()
    );
  end if;

  return public.iberfit_base_entity_v26_pre_action_outcome(
    p_entity_type,p_entity_id,p_client_id
  );
end
$function$;

revoke all on function public.iberfit_base_entity_v26(text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.iberfit_base_entity_v26(text,uuid,uuid)
  to service_role;

do $postcheck$
declare
  v_probe jsonb;
  v_source text;
begin
  v_probe:=public.iberfit_base_entity_v26(
    'action_outcome',
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid
  );
  if v_probe->>'status'<>'borrador'
     or coalesce((v_probe->>'revision')::integer,-1)<>0
     or coalesce((v_probe->>'visibleToClient')::boolean,true)<>false then
    raise exception 'M26_ACTION_OUTCOME_BASE_ENTITY_POSTCHECK';
  end if;

  select prosrc into v_source
  from pg_proc
  where oid='public.iberfit_base_entity_v26(text,uuid,uuid)'::regprocedure;

  if position('action_outcome' in v_source)=0
     or position('domain_entities_v26' in v_source)=0
     or position('iberfit_base_entity_v26_pre_action_outcome' in v_source)=0 then
    raise exception 'M26_ACTION_OUTCOME_BASE_ENTITY_SOURCE_INVALID';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.iberfit_base_entity_v26_pre_action_outcome(text,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'M26_ACTION_OUTCOME_BASE_ENTITY_INTERNAL_EXPOSED';
  end if;
end
$postcheck$;

commit;
