-- IBERFIT M26 RC74.4C · least privilege · isolated QA ONLY
-- Applies only after the QA environment guard has proven:
-- environment=QA, realDataAllowed=false, productionBlocked=true.
-- No QA user/client is required yet: schema hardening precedes synthetic identity creation.

do $guard$
declare
  v_env jsonb;
begin
  v_env := public.iberfit_environment();

  if coalesce(v_env->>'environment','') <> 'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'M26_RC74_4_LEAST_PRIVILEGE_QA_GUARD_FAILED';
  end if;

  if to_regclass('public.domain_command_registry_v26') is null then
    raise exception 'M26_RC74_4_COMMAND_REGISTRY_REQUIRED';
  end if;

  if to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_operation_allowed(text,uuid)') is null then
    raise exception 'M26_RC74_4_REQUIRED_RPC_SIGNATURE_MISMATCH';
  end if;

  -- Fail closed if the replayed canonical baseline is not exactly the one audited.
  if not exists (
    select 1 from public.domain_command_registry_v26
    where command_type='SESION_INICIAR'
      and allowed_roles @> array['admin','coach','cliente']::text[]
      and cardinality(allowed_roles)=3
  ) then
    raise exception 'M26_RC74_4_BASELINE_SESION_INICIAR_DRIFT';
  end if;

  if not exists (
    select 1 from public.domain_command_registry_v26
    where command_type='EJECUCION_CANCELAR'
      and allowed_roles @> array['admin','coach']::text[]
      and cardinality(allowed_roles)=2
  ) then
    raise exception 'M26_RC74_4_BASELINE_EJECUCION_CANCELAR_DRIFT';
  end if;
end
$guard$;

update public.domain_command_registry_v26
set allowed_roles = case command_type
  when 'SESION_INICIAR' then array['coach','cliente']::text[]
  when 'SESION_COMPLETAR' then array['coach','sistema']::text[]
  when 'SESION_CANCELAR' then array['coach']::text[]
  when 'EJECUCION_INICIAR' then array['coach','cliente']::text[]
  when 'EJECUCION_GUARDAR_PROGRESO' then array['coach','cliente']::text[]
  when 'EJECUCION_PAUSAR' then array['coach','cliente']::text[]
  when 'EJECUCION_REANUDAR' then array['coach','cliente']::text[]
  when 'EJECUCION_COMPLETAR' then array['coach','cliente']::text[]
  when 'EJECUCION_CANCELAR' then array['coach','cliente']::text[]
  else allowed_roles
end
where command_type in (
  'SESION_INICIAR','SESION_COMPLETAR','SESION_CANCELAR',
  'EJECUCION_INICIAR','EJECUCION_GUARDAR_PROGRESO','EJECUCION_PAUSAR',
  'EJECUCION_REANUDAR','EJECUCION_COMPLETAR','EJECUCION_CANCELAR'
);

create or replace function public.iberfit_operation_allowed(p_type text, p_client_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    (select auth.uid()) is not null
    and (
      (
        public.iberfit_role()='admin'::public.iberfit_role
        and p_type not in (
          'SESION_INICIADA','SERIE_COMPLETADA','INCIDENCIA_REGISTRADA',
          'CHECKIN_REGISTRADO','FEEDBACK_REGISTRADO','SESION_CERRADA',
          'EJERCICIO_OMITIDO','EJERCICIO_REEMPLAZADO','EJERCICIO_AÑADIDO',
          'DESCANSO_EDITADO'
        )
      )
      or (
        public.iberfit_role()='coach'::public.iberfit_role
        and p_client_id is not null
        and public.is_assigned_coach(p_client_id)
      )
      or (
        public.iberfit_role()='client'::public.iberfit_role
        and p_client_id is not null
        and p_client_id=public.iberfit_client_id()
        and p_type in (
          'SESION_INICIADA','SERIE_COMPLETADA','INCIDENCIA_REGISTRADA',
          'CHECKIN_REGISTRADO','FEEDBACK_REGISTRADO','SESION_CERRADA',
          'EJERCICIO_OMITIDO','EJERCICIO_REEMPLAZADO','EJERCICIO_AÑADIDO',
          'DESCANSO_EDITADO'
        )
      )
    ),
    false
  )
$function$;

revoke all on function public.iberfit_operation_allowed(text,uuid) from public,anon;
grant execute on function public.iberfit_operation_allowed(text,uuid) to authenticated;

do $postcheck$
declare
  v_bad integer;
  v_env jsonb;
begin
  v_env := public.iberfit_environment();

  if coalesce(v_env->>'environment','') <> 'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'M26_RC74_4_POSTCHECK_QA_GUARD_FAILED';
  end if;

  select count(*) into v_bad
  from (
    values
      ('SESION_INICIAR', array['coach','cliente']::text[]),
      ('SESION_COMPLETAR', array['coach','sistema']::text[]),
      ('SESION_CANCELAR', array['coach']::text[]),
      ('EJECUCION_INICIAR', array['coach','cliente']::text[]),
      ('EJECUCION_GUARDAR_PROGRESO', array['coach','cliente']::text[]),
      ('EJECUCION_PAUSAR', array['coach','cliente']::text[]),
      ('EJECUCION_REANUDAR', array['coach','cliente']::text[]),
      ('EJECUCION_COMPLETAR', array['coach','cliente']::text[]),
      ('EJECUCION_CANCELAR', array['coach','cliente']::text[])
  ) expected(command_type, allowed_roles)
  left join public.domain_command_registry_v26 actual using(command_type)
  where actual.command_type is null
     or array(select unnest(actual.allowed_roles) order by 1)
        <> array(select unnest(expected.allowed_roles) order by 1);

  if v_bad <> 0 then
    raise exception 'M26_RC74_4_POSTCHECK_ROLE_DRIFT:%', v_bad;
  end if;

  if has_function_privilege('anon','public.iberfit_operation_allowed(text,uuid)','EXECUTE') then
    raise exception 'M26_RC74_4_LEGACY_ANON_EXECUTE_FORBIDDEN';
  end if;
end
$postcheck$;
