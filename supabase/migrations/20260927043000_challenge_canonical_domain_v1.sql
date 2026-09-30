-- IBERFIT canonical personal challenges v1
-- Reuses domain_entities_v26 + command registry. No parallel challenge table.
-- Scope v1: personal Coach/Admin-defined challenges only. Group/community
-- participation remains closed until an explicit opt-in membership contract exists.

begin;

-- Named, auditable fail-closed guard. Anonymous DO blocks are intentionally avoided
-- so production data-safety policy can inspect the migration surface deterministically.
create function private.iberfit_assert_challenge_canonical_v1(p_phase text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
  v_base_definition text;
begin
  if p_phase='pre' then
    if to_regclass('public.domain_entities_v26') is null
       or to_regclass('public.domain_command_registry_v26') is null
       or to_regclass('public.domain_transitions_v26') is null
       or to_regclass('public.client_habits_v26') is null then
      raise exception 'M26_CHALLENGE_CANONICAL_INFRASTRUCTURE_REQUIRED';
    end if;

    if to_regprocedure('public.iberfit_base_entity_v26(text,uuid,uuid)') is null
       or to_regprocedure('public.iberfit_base_entity_v26_pre_action_outcome(text,uuid,uuid)') is null then
      raise exception 'M26_CHALLENGE_BASE_ENTITY_CHAIN_REQUIRED';
    end if;

    select pg_get_functiondef('public.iberfit_base_entity_v26(text,uuid,uuid)'::regprocedure)
      into v_base_definition;
    if position('p_entity_type=''action_outcome''' in v_base_definition)=0
       or position('iberfit_base_entity_v26_pre_action_outcome' in v_base_definition)=0 then
      raise exception 'M26_CHALLENGE_BASE_ENTITY_CHAIN_UNEXPECTED';
    end if;

    if exists(
      select 1 from pg_trigger
      where tgrelid='public.domain_entities_v26'::regclass
        and tgname='iberfit_validate_challenge_entity_v1'
        and not tgisinternal
    ) then
      raise exception 'M26_CHALLENGE_TRIGGER_ALREADY_EXISTS';
    end if;
    return;
  end if;

  if p_phase='post' then
    select count(*) into v_count
    from public.domain_command_registry_v26 r
    where (r.command_type,r.entity_type,r.event_name,r.requires_reason,r.conflict_sensitive,r.bootstrap_allowed,r.enabled) in (
      ('RETO_CREAR','challenge','CREAR',false,true,false,true),
      ('RETO_ACTUALIZAR','challenge','ACTUALIZAR',false,true,false,true),
      ('RETO_ARCHIVAR','challenge','ARCHIVAR',true,true,false,true)
    )
      and r.allowed_roles=array['admin','coach']::text[];
    if v_count<>3 then
      raise exception 'M26_CHALLENGE_COMMAND_REGISTRY_POSTCHECK_FAILED';
    end if;

    select count(*) into v_count
    from public.domain_transitions_v26 t
    where (t.entity_type,t.from_status,t.event_name,t.to_status) in (
      ('challenge','borrador','CREAR','activo'),
      ('challenge','activo','ACTUALIZAR','activo'),
      ('challenge','activo','ARCHIVAR','archivado')
    );
    if v_count<>3 then
      raise exception 'M26_CHALLENGE_TRANSITIONS_POSTCHECK_FAILED';
    end if;

    if position(
      'p_entity_type=''challenge'''
      in pg_get_functiondef('public.iberfit_base_entity_v26(text,uuid,uuid)'::regprocedure)
    )=0 then
      raise exception 'M26_CHALLENGE_BASE_ENTITY_POSTCHECK_FAILED';
    end if;

    if not exists(
      select 1 from pg_trigger
      where tgrelid='public.domain_entities_v26'::regclass
        and tgname='iberfit_validate_challenge_entity_v1'
        and not tgisinternal
    ) then
      raise exception 'M26_CHALLENGE_TRIGGER_POSTCHECK_FAILED';
    end if;
    return;
  end if;

  raise exception 'M26_CHALLENGE_ASSERT_PHASE_INVALID';
end
$function$;

revoke all on function private.iberfit_assert_challenge_canonical_v1(text) from public, anon, authenticated;

select private.iberfit_assert_challenge_canonical_v1('pre');

-- Canonical command contract. Mutations are professional-only; the existing
-- executor still enforces client scope, role, conflict policy, audit receipts
-- and Canary enablement.
insert into public.domain_command_registry_v26(
  command_type, entity_type, event_name, allowed_roles,
  requires_reason, requires_preview, snapshot_on_apply,
  conflict_sensitive, bootstrap_allowed, enabled
) values
  ('RETO_CREAR','challenge','CREAR',array['admin','coach']::text[],false,false,false,true,false,true),
  ('RETO_ACTUALIZAR','challenge','ACTUALIZAR',array['admin','coach']::text[],false,false,false,true,false,true),
  ('RETO_ARCHIVAR','challenge','ARCHIVAR',array['admin','coach']::text[],true,false,false,true,false,true)
on conflict (command_type) do nothing;

insert into public.domain_transitions_v26(entity_type,from_status,event_name,to_status) values
  ('challenge','borrador','CREAR','activo'),
  ('challenge','activo','ACTUALIZAR','activo'),
  ('challenge','activo','ARCHIVAR','archivado')
on conflict (entity_type,from_status,event_name) do nothing;

-- Challenge creation uses the existing generic executor. Extend only the base
-- entity factory so RETO_CREAR starts from a deterministic draft instead of
-- introducing a second persistence path.
create or replace function public.iberfit_base_entity_v26(
  p_entity_type text,
  p_entity_id uuid,
  p_client_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if p_entity_type='challenge' then
    select e.body into v_result
    from public.domain_entities_v26 e
    where e.entity_type='challenge'
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
      'mode','individual',
      'visibleToClient',true,
      'socialSharing',false,
      'rawHealthDataAllowed',false,
      'automaticPrescriptionChanges',false,
      'clinicalClassification',false,
      'createdAt',now(),
      'updatedAt',now()
    );
  end if;

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

-- Database-level integrity guard. This deliberately validates the persisted
-- canonical entity rather than trusting frontend builders or a single RPC.
create function private.iberfit_validate_challenge_entity_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_body jsonb:=coalesce(new.body,'{}'::jsonb);
  v_type text:=btrim(coalesce(v_body->>'type',''));
  v_metric text:=btrim(coalesce(v_body->>'metricKey',''));
  v_expected_metric text;
  v_title text:=btrim(coalesce(v_body->>'title',''));
  v_detail text:=coalesce(v_body->>'detail','');
  v_days integer;
  v_target numeric;
  v_habit_id uuid;
begin
  if new.entity_type<>'challenge' then
    return new;
  end if;

  if new.client_id is null then
    raise exception 'M26_CHALLENGE_CLIENT_REQUIRED' using errcode='23514';
  end if;

  if new.status not in ('borrador','activo','archivado') then
    raise exception 'M26_CHALLENGE_STATUS_INVALID' using errcode='23514';
  end if;

  -- A draft is only the transient bootstrap state used inside one command.
  if new.status='borrador' then
    return new;
  end if;

  if jsonb_typeof(v_body)<>'object' then
    raise exception 'M26_CHALLENGE_BODY_INVALID' using errcode='23514';
  end if;

  if char_length(v_title)<3 or char_length(v_title)>120 then
    raise exception 'M26_CHALLENGE_TITLE_INVALID' using errcode='23514';
  end if;
  if char_length(v_detail)>360 then
    raise exception 'M26_CHALLENGE_DETAIL_INVALID' using errcode='23514';
  end if;

  v_expected_metric:=case v_type
    when 'consistency' then 'adherencePct'
    when 'sessions' then 'completedSessions'
    when 'habits' then 'habitCompletions'
    else null
  end;
  if v_expected_metric is null then
    raise exception 'M26_CHALLENGE_TYPE_NOT_ENABLED_V1' using errcode='23514';
  end if;
  if v_metric<>v_expected_metric then
    raise exception 'M26_CHALLENGE_METRIC_MISMATCH' using errcode='23514';
  end if;

  begin
    v_days:=(v_body->>'days')::integer;
    v_target:=(v_body->>'target')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'M26_CHALLENGE_NUMERIC_CONTRACT_INVALID' using errcode='23514';
  end;
  if v_days is null or v_days not in (7,28,90) then
    raise exception 'M26_CHALLENGE_WINDOW_UNSUPPORTED' using errcode='23514';
  end if;
  if v_target is null or v_target<=0 or v_target>100000000 then
    raise exception 'M26_CHALLENGE_TARGET_INVALID' using errcode='23514';
  end if;

  if v_type='habits' then
    begin
      v_habit_id:=(v_body->>'habitId')::uuid;
    exception when invalid_text_representation then
      raise exception 'M26_CHALLENGE_HABIT_REQUIRED' using errcode='23514';
    end;
    if v_habit_id is null or not exists(
      select 1
      from public.client_habits_v26 h
      where h.id=v_habit_id
        and h.client_id=new.client_id
        and h.status='activo'
    ) then
      raise exception 'M26_CHALLENGE_HABIT_NOT_ACTIVE_FOR_CLIENT' using errcode='23514';
    end if;
  elsif nullif(v_body->>'habitId','') is not null then
    raise exception 'M26_CHALLENGE_HABIT_ONLY_FOR_HABIT_TYPE' using errcode='23514';
  end if;

  if coalesce(v_body->>'mode','')<>'individual' then
    raise exception 'M26_CHALLENGE_GROUP_REQUIRES_OPT_IN_DOMAIN' using errcode='23514';
  end if;
  if v_body->'visibleToClient' is distinct from 'true'::jsonb then
    raise exception 'M26_CHALLENGE_CLIENT_VISIBILITY_REQUIRED' using errcode='23514';
  end if;
  if v_body->'socialSharing' is distinct from 'false'::jsonb
     or v_body->'rawHealthDataAllowed' is distinct from 'false'::jsonb
     or v_body->'automaticPrescriptionChanges' is distinct from 'false'::jsonb
     or v_body->'clinicalClassification' is distinct from 'false'::jsonb then
    raise exception 'M26_CHALLENGE_PRIVACY_CONTRACT_INVALID' using errcode='23514';
  end if;
  if coalesce(v_body->>'requiresDeviceOptIn','false')<>'false' then
    raise exception 'M26_CHALLENGE_DEVICE_METRICS_NOT_ENABLED_V1' using errcode='23514';
  end if;

  -- Never persist raw/sensitive health or physiological fields inside a challenge.
  if v_body::text ~* '"(heartRate|heart_rate|restingHeartRate|resting_heart_rate|maxHeartRate|max_heart_rate|hrv|bpm|pulse|pain|diagnosis|diagnostico|rawTelemetry|rawHealthData)"[[:space:]]*:' then
    raise exception 'M26_CHALLENGE_SENSITIVE_DATA_FORBIDDEN' using errcode='23514';
  end if;

  return new;
end
$function$;

revoke all on function private.iberfit_validate_challenge_entity_v1() from public, anon, authenticated;

create trigger iberfit_validate_challenge_entity_v1
before insert or update on public.domain_entities_v26
for each row
when (new.entity_type='challenge')
execute function private.iberfit_validate_challenge_entity_v1();

select private.iberfit_assert_challenge_canonical_v1('post');

commit;
