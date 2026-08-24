-- IBERFIT M26 RC74.4E · COMPLETE ENGAGEMENT REGISTRY · QA ONLY
do $guard$
declare v_env jsonb; v_count integer;
begin
  v_env := public.iberfit_environment();
  if coalesce(v_env->>'environment','') <> 'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'M26_RC74_4E_QA_ENVIRONMENT_GUARD_FAILED';
  end if;
  select count(*) into v_count from public.domain_command_registry_v26 where enabled=true;
  if v_count <> 44 then raise exception 'M26_RC74_4E_BASE_COMMAND_COUNT_MISMATCH:%', v_count; end if;
  if exists (
    select 1 from public.domain_command_registry_v26
    where command_type in (
      'CHECKIN_REGISTRAR','CHECKIN_ANULAR',
      'HABITO_DEFINIR','HABITO_REGISTRAR','HABITO_ARCHIVAR',
      'NOTA_PRIVADA_CREAR','NOTA_PRIVADA_ACTUALIZAR','NOTA_PRIVADA_ARCHIVAR'
    )
  ) then raise exception 'M26_RC74_4E_EXTENSION_ALREADY_PRESENT'; end if;
  if to_regclass('public.client_checkins_v26') is null
     or to_regclass('public.client_habits_v26') is null
     or to_regclass('public.client_habit_logs_v26') is null
     or to_regclass('public.coach_private_notes_v26') is null
     or to_regclass('public.domain_transitions_v26') is null then
    raise exception 'M26_RC74_4E_REQUIRED_SCHEMA_MISSING';
  end if;
  if to_regprocedure('public.iberfit_base_entity_v26(text,uuid,uuid)') is null
     or to_regprocedure('public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)') is null
     or to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null then
    raise exception 'M26_RC74_4E_REQUIRED_RPC_MISSING';
  end if;
end
$guard$;

insert into public.domain_command_registry_v26(
  command_type,entity_type,event_name,allowed_roles,
  requires_reason,requires_preview,snapshot_on_apply,
  conflict_sensitive,bootstrap_allowed,enabled
) values
  ('CHECKIN_REGISTRAR','checkin','REGISTRAR',array['admin','coach','cliente']::text[],false,false,false,false,true,true),
  ('CHECKIN_ANULAR','checkin','ANULAR',array['admin','coach']::text[],true,false,false,true,true,true),
  ('HABITO_DEFINIR','habit','DEFINIR',array['admin','coach']::text[],false,false,false,true,true,true),
  ('HABITO_REGISTRAR','habit_log','REGISTRAR',array['admin','coach','cliente']::text[],false,false,false,false,true,true),
  ('HABITO_ARCHIVAR','habit','ARCHIVAR',array['admin','coach']::text[],true,false,false,true,true,true),
  ('NOTA_PRIVADA_CREAR','private_note','CREAR',array['admin','coach']::text[],false,false,false,true,false,true),
  ('NOTA_PRIVADA_ACTUALIZAR','private_note','ACTUALIZAR',array['admin','coach']::text[],false,false,false,true,false,true),
  ('NOTA_PRIVADA_ARCHIVAR','private_note','ARCHIVAR',array['admin','coach']::text[],true,false,false,true,false,true);

insert into public.domain_transitions_v26(entity_type,from_status,event_name,to_status) values
  ('checkin','borrador','REGISTRAR','confirmado'),
  ('checkin','confirmado','ANULAR','anulado'),
  ('habit','borrador','DEFINIR','activo'),
  ('habit','activo','ARCHIVAR','archivado'),
  ('habit_log','borrador','REGISTRAR','confirmado'),
  ('private_note','borrador','CREAR','activo'),
  ('private_note','activo','ACTUALIZAR','activo'),
  ('private_note','activo','ARCHIVAR','archivado');

do $postcheck$
declare v_count integer; v_bad integer;
begin
  select count(*) into v_count from public.domain_command_registry_v26 where enabled=true;
  if v_count <> 52 then raise exception 'M26_RC74_4E_EXTENDED_COMMAND_COUNT_MISMATCH:%', v_count; end if;

  select count(*) into v_bad
  from (
    values
      ('CHECKIN_REGISTRAR','checkin','REGISTRAR',array['admin','coach','cliente']::text[],false,false,false,false,true,true),
      ('CHECKIN_ANULAR','checkin','ANULAR',array['admin','coach']::text[],true,false,false,true,true,true),
      ('HABITO_DEFINIR','habit','DEFINIR',array['admin','coach']::text[],false,false,false,true,true,true),
      ('HABITO_REGISTRAR','habit_log','REGISTRAR',array['admin','coach','cliente']::text[],false,false,false,false,true,true),
      ('HABITO_ARCHIVAR','habit','ARCHIVAR',array['admin','coach']::text[],true,false,false,true,true,true),
      ('NOTA_PRIVADA_CREAR','private_note','CREAR',array['admin','coach']::text[],false,false,false,true,false,true),
      ('NOTA_PRIVADA_ACTUALIZAR','private_note','ACTUALIZAR',array['admin','coach']::text[],false,false,false,true,false,true),
      ('NOTA_PRIVADA_ARCHIVAR','private_note','ARCHIVAR',array['admin','coach']::text[],true,false,false,true,false,true)
  ) expected(command_type,entity_type,event_name,allowed_roles,requires_reason,requires_preview,snapshot_on_apply,conflict_sensitive,bootstrap_allowed,enabled)
  left join public.domain_command_registry_v26 actual using(command_type)
  where actual.command_type is null
     or actual.entity_type <> expected.entity_type
     or actual.event_name <> expected.event_name
     or array(select unnest(actual.allowed_roles) order by 1) <> array(select unnest(expected.allowed_roles) order by 1)
     or actual.requires_reason <> expected.requires_reason
     or actual.requires_preview <> expected.requires_preview
     or actual.snapshot_on_apply <> expected.snapshot_on_apply
     or actual.conflict_sensitive <> expected.conflict_sensitive
     or actual.bootstrap_allowed <> expected.bootstrap_allowed
     or actual.enabled <> expected.enabled;
  if v_bad <> 0 then raise exception 'M26_RC74_4E_COMMAND_CONTRACT_MISMATCH:%', v_bad; end if;

  select count(*) into v_bad
  from (
    values
      ('checkin','borrador','REGISTRAR','confirmado'),
      ('checkin','confirmado','ANULAR','anulado'),
      ('habit','borrador','DEFINIR','activo'),
      ('habit','activo','ARCHIVAR','archivado'),
      ('habit_log','borrador','REGISTRAR','confirmado'),
      ('private_note','borrador','CREAR','activo'),
      ('private_note','activo','ACTUALIZAR','activo'),
      ('private_note','activo','ARCHIVAR','archivado')
  ) expected(entity_type,from_status,event_name,to_status)
  left join public.domain_transitions_v26 actual using(entity_type,from_status,event_name)
  where actual.entity_type is null or actual.to_status <> expected.to_status;
  if v_bad <> 0 then raise exception 'M26_RC74_4E_TRANSITION_CONTRACT_MISMATCH:%', v_bad; end if;

  if exists(select 1 from public.coach_private_notes_v26)
     or exists(select 1 from public.client_checkins_v26)
     or exists(select 1 from public.client_habits_v26)
     or exists(select 1 from public.client_habit_logs_v26) then
    raise exception 'M26_RC74_4E_BUSINESS_DATA_MUST_REMAIN_EMPTY';
  end if;
end
$postcheck$;
