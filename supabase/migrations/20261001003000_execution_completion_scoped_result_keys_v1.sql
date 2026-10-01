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
-- This migration is intentionally contract-only: it does not mutate execution
-- entities or user data. The DO block provides transactional behavioural
-- assertions so the migration aborts if scoped/legacy compatibility regresses.

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

    for v_set_number in 1..v_sets loop
      v_legacy_key := v_exercise_id || ':' || v_set_number::text;
      v_scoped_key := case
        when v_scope <> '' then v_scope || ':' || v_legacy_key
        else v_legacy_key
      end;

      -- Match queueOccurrencesForStep(): only queue entries whose set count
      -- reaches this exact set can collide with the current exercise/set.
      -- Canonical queue snapshots store sets as small positive integers. The
      -- CASE keeps malformed peer entries from throwing before their own
      -- snapshot validation is reached.
      select count(*)::integer, coalesce(min(candidate_idx), 0)::integer
        into v_compatible_count, v_first_compatible_index
      from jsonb_array_elements(v_queue) with ordinality as q(candidate_item, candidate_idx)
      where btrim(coalesce(candidate_item->>'exerciseId', '')) = v_exercise_id
        and case
          when coalesce(candidate_item->>'sets', '') ~ '^[0-9]{1,3}$'
            then (candidate_item->>'sets')::integer >= v_set_number
                 and (candidate_item->>'sets')::integer between 1 and 100
          else false
        end;

      v_requires_scoped_key := v_scope <> '' and v_compatible_count > 1;
      v_can_use_legacy_key := not v_requires_scoped_key
        or v_item_index = v_first_compatible_index;
      v_expected_key := case
        when v_requires_scoped_key then v_scoped_key
        else v_legacy_key
      end;

      -- Mirror executionResultLookup(): a scoped value wins whenever present,
      -- including recovered/imported unique entries; legacy fallback is then
      -- limited to the compatibility rule above.
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

-- Behavioural migration assertions. These are read-only function calls; no
-- domain rows are created or changed. Any mismatch aborts the migration.
do $assertions$
declare
  v_feedback jsonb := jsonb_build_array(
    jsonb_build_object(
      'type', 'SESSION_COMPLETED',
      'payload', jsonb_build_object(
        'sessionRpe', 7,
        'comment', 'migration-contract-check',
        'pain', false,
        'painNotes', ''
      )
    )
  );
  v_check jsonb;
begin
  -- Unique entries keep accepting the legacy key written by the canonical
  -- engine when there is no collision for that exercise/set.
  v_check := public.iberfit_validate_execution_completion_v26(jsonb_build_object(
    'events', v_feedback,
    'queue', jsonb_build_array(
      jsonb_build_object('blockId', 'block-a', 'exerciseId', 'unique-exercise', 'sets', 1)
    ),
    'results', jsonb_build_object(
      'unique-exercise:1', jsonb_build_object('exerciseId', 'unique-exercise', 'setNumber', 1)
    ),
    'skippedSets', '{}'::jsonb
  ));
  if coalesce((v_check->>'ok')::boolean, false) is not true then
    raise exception 'execution completion validator regression: unique legacy key rejected: %', v_check;
  end if;

  -- The production bug: repeated exercise/set occurrences are valid when both
  -- canonical block-scoped results exist.
  v_check := public.iberfit_validate_execution_completion_v26(jsonb_build_object(
    'events', v_feedback,
    'queue', jsonb_build_array(
      jsonb_build_object('blockId', 'block-a', 'exerciseId', 'same-exercise', 'sets', 1),
      jsonb_build_object('blockId', 'block-b', 'exerciseId', 'same-exercise', 'sets', 1)
    ),
    'results', jsonb_build_object(
      'block-a:same-exercise:1', jsonb_build_object('exerciseId', 'same-exercise', 'setNumber', 1),
      'block-b:same-exercise:1', jsonb_build_object('exerciseId', 'same-exercise', 'setNumber', 1)
    ),
    'skippedSets', '{}'::jsonb
  ));
  if coalesce((v_check->>'ok')::boolean, false) is not true then
    raise exception 'execution completion validator regression: canonical scoped results rejected: %', v_check;
  end if;

  -- A single legacy key may recover only the first compatible occurrence; it
  -- must never silently satisfy a second block occurrence.
  v_check := public.iberfit_validate_execution_completion_v26(jsonb_build_object(
    'events', v_feedback,
    'queue', jsonb_build_array(
      jsonb_build_object('blockId', 'block-a', 'exerciseId', 'same-exercise', 'sets', 1),
      jsonb_build_object('blockId', 'block-b', 'exerciseId', 'same-exercise', 'sets', 1)
    ),
    'results', jsonb_build_object(
      'same-exercise:1', jsonb_build_object('exerciseId', 'same-exercise', 'setNumber', 1)
    ),
    'skippedSets', '{}'::jsonb
  ));
  if coalesce((v_check->>'ok')::boolean, false) is not false
     or v_check->>'reason' <> 'M26_EXECUTION_NOT_READY_TO_COMPLETE'
     or v_check->>'missingResultKey' <> 'block-b:same-exercise:1' then
    raise exception 'execution completion validator regression: duplicate legacy key over-accepted: %', v_check;
  end if;

  -- Scope is decided per set, not merely per exercise. Set 1 collides and is
  -- scoped in both blocks; set 2 exists only in the first block and remains a
  -- legacy key, matching resultStorageKey().
  v_check := public.iberfit_validate_execution_completion_v26(jsonb_build_object(
    'events', v_feedback,
    'queue', jsonb_build_array(
      jsonb_build_object('blockId', 'block-a', 'exerciseId', 'mixed-exercise', 'sets', 2),
      jsonb_build_object('blockId', 'block-b', 'exerciseId', 'mixed-exercise', 'sets', 1)
    ),
    'results', jsonb_build_object(
      'block-a:mixed-exercise:1', jsonb_build_object('exerciseId', 'mixed-exercise', 'setNumber', 1),
      'block-b:mixed-exercise:1', jsonb_build_object('exerciseId', 'mixed-exercise', 'setNumber', 1),
      'mixed-exercise:2', jsonb_build_object('exerciseId', 'mixed-exercise', 'setNumber', 2)
    ),
    'skippedSets', '{}'::jsonb
  ));
  if coalesce((v_check->>'ok')::boolean, false) is not true then
    raise exception 'execution completion validator regression: per-set scope mismatch: %', v_check;
  end if;

  -- Scoped skipped sets are completion evidence too.
  v_check := public.iberfit_validate_execution_completion_v26(jsonb_build_object(
    'events', v_feedback,
    'queue', jsonb_build_array(
      jsonb_build_object('blockId', 'block-a', 'exerciseId', 'skip-exercise', 'sets', 1),
      jsonb_build_object('blockId', 'block-b', 'exerciseId', 'skip-exercise', 'sets', 1)
    ),
    'results', jsonb_build_object(
      'block-a:skip-exercise:1', jsonb_build_object('exerciseId', 'skip-exercise', 'setNumber', 1)
    ),
    'skippedSets', jsonb_build_object(
      'block-b:skip-exercise:1', jsonb_build_object('reason', 'coach-skip')
    )
  ));
  if coalesce((v_check->>'ok')::boolean, false) is not true then
    raise exception 'execution completion validator regression: scoped skipped set rejected: %', v_check;
  end if;
end
$assertions$;
