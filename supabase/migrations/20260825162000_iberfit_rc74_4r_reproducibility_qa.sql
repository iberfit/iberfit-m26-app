-- IBERFIT M26 RC74.4R · QA-ONLY REPRODUCIBILITY CLOSURE
-- Reproduces the live QA hardening that existed off-ledger before H–Q/K:
--   F. execution-completion feedback validation + source-table persistence hardening
--   G. session_executions + session_events RLS least-privilege boundary
-- Captures the six live G policies exactly; does not introduce product features.
-- QA only. No production project identifiers. No business-data writes.

do $guard$
declare
  v_env jsonb := public.iberfit_environment();
  v_unknown_policy text;
begin
  if coalesce(v_env->>'environment','') <> 'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'RC74_4R_QA_ENVIRONMENT_REQUIRED' using errcode='42501';
  end if;

  if to_regclass('public.domain_entities_v26') is null
     or to_regclass('public.client_checkins_v26') is null
     or to_regclass('public.client_habits_v26') is null
     or to_regclass('public.client_habit_logs_v26') is null
     or to_regclass('public.coach_private_notes_v26') is null
     or to_regclass('public.session_executions') is null
     or to_regclass('public.session_events') is null then
    raise exception 'RC74_4R_REQUIRED_TABLES_MISSING';
  end if;

  if to_regprocedure('public.iberfit_environment()') is null
     or to_regprocedure('public.iberfit_persist_entity_v26_rc29(text,uuid,uuid,text,bigint,jsonb)') is null
     or to_regprocedure('public.iberfit_role()') is null
     or to_regprocedure('public.iberfit_client_id()') is null
     or to_regprocedure('public.is_assigned_coach(uuid)') is null then
    raise exception 'RC74_4R_REQUIRED_FUNCTIONS_MISSING';
  end if;

  select p.tablename || '.' || p.policyname into v_unknown_policy
  from pg_policies p
  where p.schemaname='public'
    and p.tablename in ('session_executions','session_events')
    and not (
      (p.tablename='session_executions' and p.policyname in (
        'session_executions_read',
        'session_executions_insert',
        'session_executions_update_coach',
        'session_executions_delete_coach'
      ))
      or
      (p.tablename='session_events' and p.policyname in (
        'session_events_insert',
        'session_events_read'
      ))
    )
  order by p.tablename,p.policyname
  limit 1;

  if v_unknown_policy is not null then
    raise exception 'RC74_4R_UNEXPECTED_G_POLICY:%',v_unknown_policy;
  end if;
end
$guard$;

-- F1. Preserve the exact pre-RC74.4 command preparation contract under a stable helper.
create or replace function public.iberfit_prepare_command_rc30_v26_pre_rc74_4(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_command jsonb := p_command;
  v_payload jsonb;
  v_patch jsonb;
  v_def public.domain_command_registry_v26%rowtype;
  v_type text;
  v_entity_type text;
  v_client_id uuid;
  v_reason text;
  v_preview boolean;
  v_recorded_at timestamptz;
  v_habit_id uuid;
  v_energy numeric;
  v_sleep numeric;
  v_stress numeric;
  v_pain numeric;
  v_target numeric;
begin
  if jsonb_typeof(p_command) <> 'object' then
    raise exception 'INVALID_COMMAND' using errcode = '22023';
  end if;
  if octet_length(p_command::text) > 262144 then
    raise exception 'COMMAND_PAYLOAD_TOO_LARGE' using errcode = '22023';
  end if;

  v_type := nullif(p_command->>'type', '');
  v_entity_type := nullif(p_command->>'entityType', '');
  v_client_id := nullif(p_command->>'clientId', '')::uuid;
  v_payload := coalesce(p_command->'payload', '{}'::jsonb);
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'INVALID_COMMAND_PAYLOAD' using errcode = '22023';
  end if;

  select * into v_def
  from public.domain_command_registry_v26
  where command_type = v_type and enabled;

  if found then
    v_command := jsonb_set(
      v_command,
      '{conflictSensitive}',
      to_jsonb(v_def.conflict_sensitive),
      true
    );
  end if;

  v_reason := nullif(btrim(coalesce(p_command->>'reason', v_payload->>'reason')), '');
  if v_reason is not null then
    v_payload := jsonb_set(v_payload, '{reason}', to_jsonb(left(v_reason, 1000)), true);
  end if;

  v_preview := coalesce(
    nullif(p_command->>'previewAccepted', '')::boolean,
    nullif(v_payload->>'previewConfirmed', '')::boolean,
    false
  );
  if v_preview then
    v_payload := jsonb_set(v_payload, '{previewConfirmed}', 'true'::jsonb, true);
    v_payload := jsonb_set(v_payload, '{targetClientId}', to_jsonb(v_client_id::text), true);
  end if;

  v_patch := coalesce(v_payload->'patch', '{}'::jsonb);
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'INVALID_COMMAND_PATCH' using errcode = '22023';
  end if;

  if v_type = 'CHECKIN_REGISTRAR' then
    v_energy := nullif(v_patch->>'energy', '')::numeric;
    v_sleep := nullif(v_patch->>'sleep', '')::numeric;
    v_stress := nullif(v_patch->>'stress', '')::numeric;
    v_pain := nullif(v_patch->>'pain', '')::numeric;
    v_recorded_at := nullif(v_patch->>'recordedAt', '')::timestamptz;

    if v_entity_type <> 'checkin'
       or v_energy is null or v_energy not between 0 and 10
       or v_sleep is null or v_sleep not between 0 and 10
       or v_stress is null or v_stress not between 0 and 10
       or v_pain is null or v_pain not between 0 and 10
       or v_recorded_at is null or v_recorded_at > now() + interval '5 minutes' then
      raise exception 'INVALID_CHECKIN_PAYLOAD' using errcode = '22023';
    end if;

    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'energy', v_energy, 'sleep', v_sleep, 'stress', v_stress, 'pain', v_pain,
      'notes', left(coalesce(v_patch->>'notes', ''), 1000),
      'recordedAt', v_recorded_at
    ), true);

  elsif v_type = 'CHECKIN_ANULAR' then
    v_payload := jsonb_set(v_payload, '{patch}', '{}'::jsonb, true);

  elsif v_type = 'HABITO_DEFINIR' then
    v_target := nullif(v_patch->>'target', '')::numeric;
    if v_entity_type <> 'habit'
       or length(btrim(coalesce(v_patch->>'title', ''))) not between 2 and 120
       or v_target is null or v_target <= 0 or v_target > 1000000
       or length(btrim(coalesce(v_patch->>'unit', ''))) not between 1 and 40
       or length(btrim(coalesce(v_patch->>'frequency', ''))) not between 1 and 40 then
      raise exception 'INVALID_HABIT_PAYLOAD' using errcode = '22023';
    end if;

    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'title', left(btrim(v_patch->>'title'), 120),
      'description', left(coalesce(v_patch->>'description', ''), 500),
      'target', v_target,
      'unit', left(btrim(v_patch->>'unit'), 40),
      'frequency', left(btrim(v_patch->>'frequency'), 40)
    ), true);

  elsif v_type = 'HABITO_REGISTRAR' then
    v_habit_id := nullif(v_patch->>'habitId', '')::uuid;
    v_recorded_at := nullif(v_patch->>'recordedAt', '')::timestamptz;
    if v_entity_type <> 'habit_log'
       or v_habit_id is null
       or v_recorded_at is null or v_recorded_at > now() + interval '5 minutes'
       or not exists (
         select 1 from public.client_habits_v26
         where id = v_habit_id and client_id = v_client_id and status = 'activo'
       ) then
      raise exception 'INVALID_HABIT_LOG_PAYLOAD' using errcode = '22023';
    end if;
    if octet_length(coalesce((v_patch->'value')::text, 'null')) > 16384 then
      raise exception 'HABIT_LOG_VALUE_TOO_LARGE' using errcode = '22023';
    end if;

    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'habitId', v_habit_id,
      'completed', coalesce(nullif(v_patch->>'completed', '')::boolean, false),
      'value', v_patch->'value',
      'notes', left(coalesce(v_patch->>'notes', ''), 500),
      'recordedAt', v_recorded_at
    ), true);

  elsif v_type = 'HABITO_ARCHIVAR' then
    v_payload := jsonb_set(v_payload, '{patch}', '{}'::jsonb, true);

  elsif v_type in ('NOTA_PRIVADA_CREAR', 'NOTA_PRIVADA_ACTUALIZAR') then
    if v_entity_type <> 'private_note'
       or length(btrim(coalesce(v_patch->>'body', ''))) not between 3 and 4000 then
      raise exception 'INVALID_PRIVATE_NOTE_PAYLOAD' using errcode = '22023';
    end if;
    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'body', left(btrim(v_patch->>'body'), 4000),
      'visibility', 'coach_only'
    ), true);

  elsif v_type = 'NOTA_PRIVADA_ARCHIVAR' then
    v_payload := jsonb_set(v_payload, '{patch}', jsonb_build_object(
      'visibility', 'coach_only'
    ), true);
  end if;

  return jsonb_set(v_command, '{payload}', v_payload, true);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_COMMAND_IDENTIFIERS_OR_VALUES' using errcode = '22023';
end
$function$;

revoke all on function public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb) from public, anon, authenticated;
grant execute on function public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb) to service_role;

-- F2. Validate completed execution snapshots and normalize required feedback.
create or replace function public.iberfit_validate_execution_completion_v26(p_body jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_completion_event jsonb;
  v_feedback jsonb;
  v_session_rpe numeric;
  v_pain boolean;
  v_item jsonb;
  v_sets integer;
  v_set_number integer;
  v_exercise_id text;
  v_result_key text;
begin
  if jsonb_typeof(p_body) is distinct from 'object' then
    return jsonb_build_object('ok',false,'reason','M26_EXECUTION_COMPLETION_SNAPSHOT_INVALID');
  end if;

  if jsonb_typeof(p_body->'events') is distinct from 'array' then
    return jsonb_build_object('ok',false,'reason','M26_EXECUTION_FEEDBACK_REQUIRED');
  end if;

  select x.elem into v_completion_event
  from jsonb_array_elements(p_body->'events') with ordinality as x(elem, ord)
  where x.elem->>'type' = 'SESSION_COMPLETED'
  order by x.ord desc
  limit 1;

  v_feedback := v_completion_event->'payload';
  if jsonb_typeof(v_feedback) is distinct from 'object' then
    return jsonb_build_object('ok',false,'reason','M26_EXECUTION_FEEDBACK_REQUIRED');
  end if;

  begin
    v_session_rpe := nullif(v_feedback->>'sessionRpe','')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok',false,'reason','M26_EXECUTION_SESSION_RPE_REQUIRED');
  end;
  if v_session_rpe is null or v_session_rpe < 1 or v_session_rpe > 10 then
    return jsonb_build_object('ok',false,'reason','M26_EXECUTION_SESSION_RPE_REQUIRED');
  end if;

  if nullif(btrim(coalesce(v_feedback->>'comment','')),'') is null then
    return jsonb_build_object('ok',false,'reason','M26_EXECUTION_FEEDBACK_REQUIRED');
  end if;

  if jsonb_typeof(v_feedback->'pain') is distinct from 'boolean' then
    return jsonb_build_object('ok',false,'reason','M26_EXECUTION_PAIN_FLAG_REQUIRED');
  end if;
  v_pain := (v_feedback->>'pain')::boolean;
  if v_pain and nullif(btrim(coalesce(v_feedback->>'painNotes','')),'') is null then
    return jsonb_build_object('ok',false,'reason','M26_EXECUTION_PAIN_NOTES_REQUIRED');
  end if;

  if jsonb_typeof(p_body->'queue') is distinct from 'array'
     or jsonb_array_length(p_body->'queue') = 0
     or jsonb_typeof(p_body->'results') is distinct from 'object'
     or jsonb_typeof(coalesce(p_body->'skippedSets','{}'::jsonb)) is distinct from 'object' then
    return jsonb_build_object('ok',false,'reason','M26_EXECUTION_COMPLETION_SNAPSHOT_INVALID');
  end if;

  for v_item in select value from jsonb_array_elements(p_body->'queue') loop
    v_exercise_id := nullif(btrim(coalesce(v_item->>'exerciseId','')),'');
    begin
      v_sets := nullif(v_item->>'sets','')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      return jsonb_build_object('ok',false,'reason','M26_EXECUTION_COMPLETION_SNAPSHOT_INVALID');
    end;
    if v_exercise_id is null or v_sets is null or v_sets < 1 or v_sets > 100 then
      return jsonb_build_object('ok',false,'reason','M26_EXECUTION_COMPLETION_SNAPSHOT_INVALID');
    end if;

    for v_set_number in 1..v_sets loop
      v_result_key := v_exercise_id || ':' || v_set_number::text;
      if not (p_body->'results') ? v_result_key
         and not coalesce(p_body->'skippedSets','{}'::jsonb) ? v_result_key then
        return jsonb_build_object(
          'ok',false,
          'reason','M26_EXECUTION_NOT_READY_TO_COMPLETE',
          'missingResultKey',v_result_key
        );
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'feedback',jsonb_build_object(
      'sessionRpe',v_session_rpe,
      'comment',left(btrim(v_feedback->>'comment'),2000),
      'pain',v_pain,
      'painNotes',left(btrim(coalesce(v_feedback->>'painNotes','')),1000)
    )
  );
end
$function$;

revoke all on function public.iberfit_validate_execution_completion_v26(jsonb) from public, anon, authenticated;
grant execute on function public.iberfit_validate_execution_completion_v26(jsonb) to service_role;

-- F3. Recreate the exact RC74.4 feedback-enforcing wrapper.
create or replace function public.iberfit_prepare_command_rc30_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_command jsonb;
  v_payload jsonb;
  v_patch jsonb;
  v_feedback jsonb;
  v_session_rpe numeric;
  v_comment text;
  v_pain boolean;
  v_pain_notes text;
begin
  v_command := public.iberfit_prepare_command_rc30_v26_pre_rc74_4(p_command);
  if v_command->>'type' <> 'EJECUCION_COMPLETAR' then return v_command; end if;
  if v_command->>'entityType' <> 'session_execution' then
    raise exception 'INVALID_EXECUTION_FEEDBACK_PAYLOAD' using errcode='22023';
  end if;
  v_payload := coalesce(v_command->'payload', '{}'::jsonb);
  v_patch := coalesce(v_payload->'patch', '{}'::jsonb);
  if jsonb_typeof(v_payload->'feedback') = 'object' then
    v_feedback := v_payload->'feedback';
  elsif jsonb_typeof(v_patch->'feedback') = 'object' then
    v_feedback := v_patch->'feedback';
  else
    raise exception 'INVALID_EXECUTION_FEEDBACK_PAYLOAD' using errcode='22023';
  end if;
  v_session_rpe := nullif(v_feedback->>'sessionRpe','')::numeric;
  v_comment := btrim(coalesce(v_feedback->>'comment',''));
  v_pain := coalesce(nullif(v_feedback->>'pain','')::boolean,false);
  v_pain_notes := btrim(coalesce(v_feedback->>'painNotes',''));
  if v_session_rpe is null or v_session_rpe not between 1 and 10
     or length(v_comment) < 1
     or (v_pain and length(v_pain_notes) < 1) then
    raise exception 'INVALID_EXECUTION_FEEDBACK_PAYLOAD' using errcode='22023';
  end if;
  v_feedback := v_feedback || jsonb_build_object(
    'sessionRpe',v_session_rpe,
    'comment',left(v_comment,2000),
    'pain',v_pain,
    'painNotes',left(v_pain_notes,1000)
  );
  v_patch := jsonb_set(v_patch,'{feedback}',v_feedback,true);
  v_payload := jsonb_set(v_payload,'{patch}',v_patch,true);
  v_payload := jsonb_set(v_payload,'{feedback}',v_feedback,true);
  return jsonb_set(v_command,'{payload}',v_payload,true);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_EXECUTION_FEEDBACK_PAYLOAD' using errcode='22023';
end
$function$;

revoke all on function public.iberfit_prepare_command_rc30_v26(jsonb) from public, anon, authenticated;
grant execute on function public.iberfit_prepare_command_rc30_v26(jsonb) to service_role;

-- F4. Recreate the live persistence hardening and source-table synchronization.
create or replace function public.iberfit_persist_entity_v26(
  p_entity_type text,
  p_entity_id uuid,
  p_client_id uuid,
  p_status text,
  p_revision bigint,
  p_body jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_safe_body jsonb := p_body;
  v_completion_check jsonb;
begin
  if p_entity_type = 'session_execution' and p_status = 'completada' then
    v_completion_check := public.iberfit_validate_execution_completion_v26(p_body);
    if coalesce((v_completion_check->>'ok')::boolean,false) is not true then
      raise exception '%', coalesce(v_completion_check->>'reason','M26_EXECUTION_COMPLETION_INVALID')
        using errcode = '22023', detail = coalesce(v_completion_check->>'missingResultKey','');
    end if;
    v_safe_body := jsonb_set(p_body, '{feedback}', v_completion_check->'feedback', true);
  end if;

  if p_entity_type = any(array['checkin','habit','habit_log','private_note']) and exists (
    select 1 from public.domain_entities_v26
    where entity_type = p_entity_type
      and entity_id = p_entity_id
      and client_id <> p_client_id
  ) then
    raise exception 'ENTITY_CLIENT_MISMATCH' using errcode = '42501';
  end if;

  perform public.iberfit_persist_entity_v26_rc29(
    p_entity_type, p_entity_id, p_client_id, p_status, p_revision, v_safe_body
  );

  if p_entity_type = 'checkin' then
    insert into public.client_checkins_v26(
      id, client_id, energy, sleep, stress, pain, notes, status, revision,
      recorded_at, created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, (v_safe_body->>'energy')::numeric,
      (v_safe_body->>'sleep')::numeric, (v_safe_body->>'stress')::numeric,
      (v_safe_body->>'pain')::numeric, coalesce(v_safe_body->>'notes',''), p_status,
      p_revision, (v_safe_body->>'recordedAt')::timestamptz,
      coalesce(nullif(v_safe_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(v_safe_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      energy = excluded.energy, sleep = excluded.sleep, stress = excluded.stress,
      pain = excluded.pain, notes = excluded.notes, status = excluded.status,
      revision = excluded.revision, recorded_at = excluded.recorded_at, updated_at = now()
    where client_checkins_v26.client_id = excluded.client_id;

  elsif p_entity_type = 'habit' then
    insert into public.client_habits_v26(
      id, client_id, title, description, target, unit, frequency, status,
      revision, created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, v_safe_body->>'title', coalesce(v_safe_body->>'description',''),
      (v_safe_body->>'target')::numeric, v_safe_body->>'unit', v_safe_body->>'frequency',
      p_status, p_revision, coalesce(nullif(v_safe_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(v_safe_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      title = excluded.title, description = excluded.description, target = excluded.target,
      unit = excluded.unit, frequency = excluded.frequency, status = excluded.status,
      revision = excluded.revision, updated_at = now()
    where client_habits_v26.client_id = excluded.client_id;

  elsif p_entity_type = 'habit_log' then
    insert into public.client_habit_logs_v26(
      id, client_id, habit_id, completed, value, notes, status, revision,
      recorded_at, created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, (v_safe_body->>'habitId')::uuid,
      coalesce((v_safe_body->>'completed')::boolean, false), v_safe_body->'value',
      coalesce(v_safe_body->>'notes',''), p_status, p_revision,
      (v_safe_body->>'recordedAt')::timestamptz,
      coalesce(nullif(v_safe_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(v_safe_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      completed = excluded.completed, value = excluded.value, notes = excluded.notes,
      status = excluded.status, revision = excluded.revision,
      recorded_at = excluded.recorded_at, updated_at = now()
    where client_habit_logs_v26.client_id = excluded.client_id;

  elsif p_entity_type = 'private_note' then
    insert into public.coach_private_notes_v26(
      id, client_id, body, visibility, status, revision,
      created_by, created_at, updated_at
    ) values (
      p_entity_id, p_client_id, v_safe_body->>'body', 'coach_only', p_status, p_revision,
      coalesce(nullif(v_safe_body->>'createdBy','')::uuid, v_actor),
      coalesce(nullif(v_safe_body->>'createdAt','')::timestamptz, now()), now()
    ) on conflict(id) do update set
      body = excluded.body, visibility = 'coach_only', status = excluded.status,
      revision = excluded.revision, updated_at = now()
    where coach_private_notes_v26.client_id = excluded.client_id;
  end if;
end
$function$;

revoke all on function public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)
  to service_role;

-- G. Reproduce the exact six live least-privilege RLS policies.
alter table public.session_executions enable row level security;
alter table public.session_events enable row level security;

drop policy if exists session_executions_read on public.session_executions;
drop policy if exists session_executions_insert on public.session_executions;
drop policy if exists session_executions_update_coach on public.session_executions;
drop policy if exists session_executions_delete_coach on public.session_executions;
drop policy if exists session_events_insert on public.session_events;
drop policy if exists session_events_read on public.session_events;

create policy session_executions_read on public.session_executions
for select to authenticated
using (
  ((select public.iberfit_role()) = 'admin'::public.iberfit_role)
  or (((select public.iberfit_role()) = 'coach'::public.iberfit_role)
      and public.is_assigned_coach(client_id))
  or (((select public.iberfit_role()) = 'client'::public.iberfit_role)
      and client_id = (select public.iberfit_client_id()))
);

create policy session_executions_insert on public.session_executions
for insert to authenticated
with check (
  (((select public.iberfit_role()) = 'coach'::public.iberfit_role)
   and public.is_assigned_coach(client_id))
  or (((select public.iberfit_role()) = 'client'::public.iberfit_role)
      and client_id = (select public.iberfit_client_id())
      and started_by = (select auth.uid()))
);

create policy session_executions_update_coach on public.session_executions
for update to authenticated
using (
  ((select public.iberfit_role()) = 'coach'::public.iberfit_role)
  and public.is_assigned_coach(client_id)
)
with check (
  ((select public.iberfit_role()) = 'coach'::public.iberfit_role)
  and public.is_assigned_coach(client_id)
);

create policy session_executions_delete_coach on public.session_executions
for delete to authenticated
using (
  ((select public.iberfit_role()) = 'coach'::public.iberfit_role)
  and public.is_assigned_coach(client_id)
);

create policy session_events_insert on public.session_events
for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and (
    (((select public.iberfit_role()) = 'coach'::public.iberfit_role)
     and public.is_assigned_coach(client_id))
    or (((select public.iberfit_role()) = 'client'::public.iberfit_role)
        and client_id = (select public.iberfit_client_id())
        and event_type = any(array[
          'SESION_INICIADA','SERIE_COMPLETADA','INCIDENCIA_REGISTRADA',
          'CHECKIN_REGISTRADO','FEEDBACK_REGISTRADO','SESION_CERRADA',
          'EJERCICIO_OMITIDO','EJERCICIO_REEMPLAZADO','EJERCICIO_AÑADIDO',
          'DESCANSO_EDITADO'
        ]::text[]))
  )
);

create policy session_events_read on public.session_events
for select to authenticated
using (
  ((select public.iberfit_role()) = 'admin'::public.iberfit_role)
  or (((select public.iberfit_role()) = 'coach'::public.iberfit_role)
      and public.is_assigned_coach(client_id))
  or (((select public.iberfit_role()) = 'client'::public.iberfit_role)
      and client_id = (select public.iberfit_client_id()))
);

do $postcheck$
declare
  v_env jsonb := public.iberfit_environment();
  v_policy_count integer;
  v_bad integer;
  v_secdef boolean;
  v_volatility "char";
begin
  if coalesce(v_env->>'environment','') <> 'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'RC74_4R_POSTCHECK_QA_ENVIRONMENT_FAILED';
  end if;

  if has_function_privilege('anon','public.iberfit_prepare_command_rc30_v26(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.iberfit_prepare_command_rc30_v26(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.iberfit_validate_execution_completion_v26(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.iberfit_validate_execution_completion_v26(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)','EXECUTE') then
    raise exception 'RC74_4R_INTERNAL_FUNCTION_EXECUTE_EXPOSED';
  end if;

  if not has_function_privilege('service_role','public.iberfit_prepare_command_rc30_v26(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.iberfit_validate_execution_completion_v26(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)','EXECUTE') then
    raise exception 'RC74_4R_SERVICE_ROLE_EXECUTE_REQUIRED';
  end if;

  select p.prosecdef into v_secdef
  from pg_proc p
  where p.oid='public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)'::regprocedure;
  if v_secdef is not true then
    raise exception 'RC74_4R_PERSIST_SECURITY_DEFINER_REQUIRED';
  end if;

  select p.provolatile into v_volatility
  from pg_proc p
  where p.oid='public.iberfit_validate_execution_completion_v26(jsonb)'::regprocedure;
  if v_volatility <> 'i' then
    raise exception 'RC74_4R_VALIDATOR_IMMUTABLE_REQUIRED';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='session_executions'
      and c.relrowsecurity=true and c.relforcerowsecurity=false
  ) then
    raise exception 'RC74_4R_SESSION_EXECUTIONS_RLS_REQUIRED';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='session_events'
      and c.relrowsecurity=true and c.relforcerowsecurity=false
  ) then
    raise exception 'RC74_4R_SESSION_EVENTS_RLS_REQUIRED';
  end if;

  select count(*) into v_policy_count
  from pg_policies p
  where p.schemaname='public'
    and p.tablename in ('session_executions','session_events');
  if v_policy_count <> 6 then
    raise exception 'RC74_4R_G_POLICY_COUNT:%',v_policy_count;
  end if;

  select count(*) into v_bad
  from pg_policies
  where schemaname='public'
    and tablename in ('session_executions','session_events')
    and cmd in ('INSERT','UPDATE','DELETE')
    and (
      coalesce(qual,'') ilike '%admin%'
      or coalesce(with_check,'') ilike '%admin%'
    );
  if v_bad <> 0 then
    raise exception 'RC74_4R_ADMIN_LIVE_WRITE_POLICY_DRIFT:%',v_bad;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='session_executions'
      and policyname='session_executions_read' and cmd='SELECT'
      and roles = array['authenticated']::name[]
      and qual ilike '%admin%'
      and qual ilike '%coach%'
      and qual ilike '%client%'
  ) then
    raise exception 'RC74_4R_SESSION_EXECUTIONS_READ_POLICY_FAILED';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='session_executions'
      and policyname='session_executions_insert' and cmd='INSERT'
      and roles = array['authenticated']::name[]
      and with_check ilike '%coach%'
      and with_check ilike '%client%'
      and with_check not ilike '%admin%'
      and with_check ilike '%started_by%'
  ) then
    raise exception 'RC74_4R_SESSION_EXECUTIONS_INSERT_POLICY_FAILED';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='session_executions'
      and policyname='session_executions_update_coach' and cmd='UPDATE'
      and qual ilike '%coach%' and qual not ilike '%admin%'
      and with_check ilike '%coach%' and with_check not ilike '%admin%'
  ) then
    raise exception 'RC74_4R_SESSION_EXECUTIONS_UPDATE_POLICY_FAILED';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='session_executions'
      and policyname='session_executions_delete_coach' and cmd='DELETE'
      and qual ilike '%coach%' and qual not ilike '%admin%'
  ) then
    raise exception 'RC74_4R_SESSION_EXECUTIONS_DELETE_POLICY_FAILED';
  end if;


  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='session_events'
      and policyname='session_events_insert' and cmd='INSERT'
      and roles = array['authenticated']::name[]
      and with_check ilike '%actor_user_id%'
      and with_check ilike '%auth.uid%'
      and with_check ilike '%coach%'
      and with_check ilike '%client%'
      and with_check ilike '%SESION_INICIADA%'
      and with_check ilike '%DESCANSO_EDITADO%'
      and with_check not ilike '%admin%'
  ) then
    raise exception 'RC74_4R_SESSION_EVENTS_INSERT_POLICY_FAILED';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='session_events'
      and policyname='session_events_read' and cmd='SELECT'
      and roles = array['authenticated']::name[]
      and qual ilike '%admin%'
      and qual ilike '%coach%'
      and qual ilike '%client%'
  ) then
    raise exception 'RC74_4R_SESSION_EVENTS_READ_POLICY_FAILED';
  end if;
end
$postcheck$;
