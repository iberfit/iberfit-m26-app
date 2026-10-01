-- IBERFIT — align EJECUCION_COMPLETAR backend validation with the canonical
-- session engine result-key semantics introduced by the grouped session engine.
--
-- Canonical rule, per set:
--   * prefer blockId:exerciseId:setNumber when a block scope exists;
--   * when more than one queue occurrence can own the same exercise/set,
--     scoped keys are mandatory except that the first compatible occurrence may
--     still consume the legacy exerciseId:setNumber key for recovery/backcompat;
--   * when the exercise/set is unique (or no scope exists), the legacy key is
--     still accepted.
--
-- This migration is intentionally contract-only: it replaces one validator
-- function and does not mutate execution entities or user data. Behavioural
-- cases are certified by repository tests plus the directed QA migration gate;
-- no anonymous DO block is used so the production data-safety gate stays strict.

create or replace function public.iberfit_validate_execution_completion_v26(p_execution jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_execution jsonb := coalesce(p_execution, '{}'::jsonb);
  v_queue jsonb := coalesce(v_execution->'queue', '[]'::jsonb);
  v_results jsonb := coalesce(v_execution->'results', '{}'::jsonb);
  v_skipped_sets jsonb := coalesce(v_execution->'skippedSets', '{}'::jsonb);
  v_events jsonb := coalesce(v_execution->'events', '[]'::jsonb);
  v_feedback jsonb := '{}'::jsonb;
  v_session_rpe numeric := 0;
  v_pain boolean := false;
  v_pain_notes text := '';
  v_comment text := '';
  v_item jsonb;
  v_item_index integer := 0;
  v_occurrence_index integer := 0;
  v_exercise_id text := '';
  v_scope text := '';
  v_sets integer := 0;
  v_set_number integer := 0;
  v_legacy_key text := '';
  v_scoped_key text := '';
  v_expected_key text := '';
  v_compatible_count integer := 0;
  v_first_compatible_index integer := 0;
  v_requires_scoped_key boolean := false;
  v_can_use_legacy_key boolean := false;
  v_resolved boolean := false;
begin
  if jsonb_typeof(v_events) <> 'array' or jsonb_array_length(v_events) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'M26_EXECUTION_COMPLETION_EVENT_MISSING');
  end if;

  select coalesce(evt->'payload', '{}'::jsonb)
    into v_feedback
  from jsonb_array_elements(v_events) with ordinality as e(evt, idx)
  where evt->>'type' = 'SESSION_COMPLETED'
  order by idx desc
  limit 1;

  if v_feedback is null or jsonb_typeof(v_feedback) <> 'object' or v_feedback = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'M26_EXECUTION_COMPLETION_EVENT_MISSING');
  end if;

  begin
    v_session_rpe := (v_feedback->>'sessionRpe')::numeric;
  exception when others then
    v_session_rpe := 0;
  end;

  if v_session_rpe < 1 or v_session_rpe > 10 then
    return jsonb_build_object('ok', false, 'reason', 'M26_EXECUTION_FEEDBACK_INVALID', 'field', 'sessionRpe');
  end if;

  v_comment := btrim(coalesce(v_feedback->>'comment', ''));
  if v_comment = '' then
    return jsonb_build_object('ok', false, 'reason', 'M26_EXECUTION_FEEDBACK_INVALID', 'field', 'comment');
  end if;

  begin
    v_pain := (v_feedback->>'pain')::boolean;
  exception when others then
    return jsonb_build_object('ok', false, 'reason', 'M26_EXECUTION_FEEDBACK_INVALID', 'field', 'pain');
  end;

  v_pain_notes := btrim(coalesce(v_feedback->>'painNotes', ''));
  if v_pain and v_pain_notes = '' then
    return jsonb_build_object('ok', false, 'reason', 'M26_EXECUTION_FEEDBACK_INVALID', 'field', 'painNotes');
  end if;

  if jsonb_typeof(v_queue) <> 'array'
     or jsonb_typeof(v_results) <> 'object'
     or jsonb_typeof(v_skipped_sets) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'M26_EXECUTION_SNAPSHOT_INVALID');
  end if;

  for v_item, v_item_index in
    select value, ordinality::integer
    from jsonb_array_elements(v_queue) with ordinality
  loop
    v_exercise_id := btrim(coalesce(v_item->>'exerciseId', ''));
    v_scope := btrim(coalesce(v_item->>'blockId', ''));

    begin
      v_sets := (v_item->>'sets')::integer;
    exception when others then
      v_sets := 0;
    end;

    if v_exercise_id = '' or v_sets < 1 or v_sets > 100 then
      return jsonb_build_object('ok', false, 'reason', 'M26_EXECUTION_SNAPSHOT_INVALID');
    end if;

    -- Match canUseLegacyEntry(): for scoped queue items the JS engine resolves
    -- an occurrence by the first queue position sharing blockId + exerciseId.
    -- Canonical plans have a unique block/exercise occurrence; retaining this
    -- identity rule also preserves recovery semantics for historical snapshots.
    if v_scope <> '' then
      select coalesce(min(candidate_idx), 0)::integer
        into v_occurrence_index
      from jsonb_array_elements(v_queue) with ordinality as q(candidate_item, candidate_idx)
      where btrim(coalesce(candidate_item->>'blockId', '')) = v_scope
        and btrim(coalesce(candidate_item->>'exerciseId', '')) = v_exercise_id;
    else
      v_occurrence_index := v_item_index;
    end if;

    for v_set_number in 1..v_sets loop
      v_legacy_key := v_exercise_id || ':' || v_set_number::text;
      v_scoped_key := case
        when v_scope <> '' then v_scope || ':' || v_legacy_key
        else v_legacy_key
      end;

      -- Match requiresScopedEntry(): only queue entries whose set count reaches
      -- this exact set can collide with the current exercise/set. The guarded
      -- parse prevents malformed peers from throwing before their own snapshot
      -- validation is reached.
      select count(*)::integer, coalesce(min(candidate_idx), 0)::integer
        into v_compatible_count, v_first_compatible_index
      from jsonb_array_elements(v_queue) with ordinality as q(candidate_item, candidate_idx)
      where btrim(coalesce(candidate_item->>'exerciseId', '')) = v_exercise_id
        and case
          when coalesce(candidate_item->>'sets', '') ~ '^[0-9]+$'
               and length(candidate_item->>'sets') <= 10
            then (candidate_item->>'sets')::bigint >= v_set_number
                 and (candidate_item->>'sets')::bigint between 1 and 100
          else false
        end;

      v_requires_scoped_key := v_scope <> '' and v_compatible_count > 1;
      v_can_use_legacy_key := not v_requires_scoped_key
        or v_occurrence_index = v_first_compatible_index;
      v_expected_key := case
        when v_requires_scoped_key then v_scoped_key
        else v_legacy_key
      end;

      -- Mirror storedEntry(): a scoped value wins whenever present, including
      -- recovered/imported unique entries; legacy fallback is then limited to
      -- the compatibility rule above.
      v_resolved := false;
      if v_scope <> ''
         and ((v_results ? v_scoped_key) or (v_skipped_sets ? v_scoped_key)) then
        v_resolved := true;
      elsif v_can_use_legacy_key
            and ((v_results ? v_legacy_key) or (v_skipped_sets ? v_legacy_key)) then
        v_resolved := true;
      end if;

      if not v_resolved then
        return jsonb_build_object(
          'ok', false,
          'reason', 'M26_EXECUTION_NOT_READY_TO_COMPLETE',
          'missingResultKey', v_expected_key
        );
      end if;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'reason', 'M26_EXECUTION_COMPLETION_ALLOWED');
end
$function$;

comment on function public.iberfit_validate_execution_completion_v26(jsonb) is
  'Validates canonical session completion, including per-set scoped block result keys and bounded legacy compatibility.';
