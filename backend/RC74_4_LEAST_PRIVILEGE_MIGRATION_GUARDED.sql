-- IBERFIT M26 RC74.4B-P0 · LEAST PRIVILEGE · QA/STAGING ONLY
-- NO AUTO-APPLY. Este archivo vive en backend/, NO en supabase/migrations/.
-- Requiere autorización explícita de sesión:
--   begin;
--   set local iberfit.allow_rc74_4_least_privilege = 'qa-only';
--   \i backend/RC74_4_LEAST_PRIVILEGE_MIGRATION_GUARDED.sql
--
-- Objetivo:
-- 1) Admin administra, pero NO ejecuta entrenamiento.
-- 2) Coach ejecuta sesiones asignadas.
-- 3) Cliente puede operar su ejecución autónoma, incluida cancelación.
-- 4) El camino legacy no permite a Admin fabricar eventos de entrenamiento/check-in/feedback.

begin;

do $guard$
declare
  v_active_canaries integer;
begin
  if current_setting('iberfit.allow_rc74_4_least_privilege', true) is distinct from 'qa-only' then
    raise exception 'M26_RC74_4_GUARD_NOT_AUTHORIZED';
  end if;

  if to_regclass('public.domain_command_registry_v26') is null then
    raise exception 'M26_RC74_4_COMMAND_REGISTRY_REQUIRED';
  end if;

  if to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_operation_allowed(text,uuid)') is null then
    raise exception 'M26_RC74_4_REQUIRED_RPC_SIGNATURE_MISMATCH';
  end if;

  select count(*) into v_active_canaries
  from public.m26_canary_clients_v26
  where active = true;

  if v_active_canaries < 2 then
    raise exception 'M26_RC74_4_QA_CANARIES_REQUIRED';
  end if;

  -- Fail closed si el remoto ya no coincide con el contrato histórico observado.
  if not exists (
    select 1 from public.domain_command_registry_v26
    where command_type='SESION_INICIAR'
      and allowed_roles @> array['admin','coach','cliente']::text[]
      and cardinality(allowed_roles)=3
  ) then raise exception 'M26_RC74_4_BASELINE_SESION_INICIAR_DRIFT'; end if;

  if not exists (
    select 1 from public.domain_command_registry_v26
    where command_type='EJECUCION_CANCELAR'
      and allowed_roles @> array['admin','coach']::text[]
      and cardinality(allowed_roles)=2
  ) then raise exception 'M26_RC74_4_BASELINE_EJECUCION_CANCELAR_DRIFT'; end if;
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

-- Compatibilidad legacy: Admin mantiene operaciones administrativas,
-- pero no puede suplantar actividad del Coach/Cliente ni fabricar datos de entrenamiento.
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
begin
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

commit;
