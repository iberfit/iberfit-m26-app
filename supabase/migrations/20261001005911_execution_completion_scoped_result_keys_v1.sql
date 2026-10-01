-- IBERFIT — align EJECUCION_COMPLETAR result-key validation with the canonical
-- grouped session engine while preserving the existing backend API contract.
--
-- Canonical rule, per set:
--   * prefer blockId:exerciseId:setNumber when a block scope exists;
--   * when more than one queue occurrence can own the same exercise/set,
--     scoped keys are mandatory except that the first compatible occurrence may
--     still consume the legacy exerciseId:setNumber key for recovery/backcompat;
--   * when the exercise/set is unique (or no scope exists), the legacy key is
--     still accepted;
--   * skippedSets resolves a set with the same key semantics as results.
--
-- Contract preservation is deliberate: validation reasons, empty-queue policy,
-- feedback normalization and the successful response shape remain identical to
-- the currently deployed v26 validator. This migration only changes result-key
-- resolution. It mutates no execution rows or user data and uses no anonymous
-- DO block, keeping the production data-safety gate fail-closed.

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
  v_item_index integer := 0;
  v_occurrence_index integer := 0;
  v_sets integer;
  v_set_number integer;
  v_exercise_id text;
  v_scope text := '';
  v_legacy_key text := '';
  v_scoped_key text := '';
  v_expected_key text := '';
  v_compatible_count integer := 0;
  v_first_compatible_index integer := 0;
  v_requires_scoped_key boolean := false;
  v_can_use_legacy_key boolean := false;
  v_resolved boolean := false;
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

  for v_item, v_item_index in
    select value, ordinality::integer
    from jsonb_array_elements(p_body->'queue') with ordinality
  loop
    v_exercise_id := nullif(btrim(coalesce(v_item->>'exerciseId','')),'');
    v_scope := btrim(coalesce(v_item->>'blockId',''));

    begin
      v_sets := nullif(v_item->>'sets','')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      return jsonb_build_object('ok',false,'reason','M26_EXECUTION_COMPLETION_SNAPSHOT_INVALID');
    end;
    if v_exercise_id is null or v_sets is null or v_sets < 1 or v_sets > 100 then
      return jsonb_build_object('ok',false,'reason','M26_EXECUTION_COMPLETION_SNAPSHOT_INVALID');
    end if;

    -- Match canUseLegacyEntry(): for scoped items the JS engine identifies the
    -- occurrence by the first queue position sharing blockId + exerciseId.
    if v_scope <> '' then
      select coalesce(min(candidate_idx), 0)::integer
        into v_occurrence_index
      from jsonb_array_elements(p_body->'queue') with ordinality as q(candidate_item, candidate_idx)
      where btrim(coalesce(candidate_item->>'blockId','')) = v_scope
        and btrim(coalesce(candidate_item->>'exerciseId','')) = v_exercise_id;
    else
      v_occurrence_index := v_item_index;
    end if;

    for v_set_number in 1..v_sets loop
      v_legacy_key := v_exercise_id || ':' || v_set_number::text;
      v_scoped_key := case
        when v_scope <> '' then v_scope || ':' || v_legacy_key
        else v_legacy_key
      end;

      -- Match requiresScopedEntry(): collision ownership is evaluated per set,
      -- so a second occurrence with fewer sets only collides on the sets it has.
      -- Guard peer parsing so a malformed later item is rejected by the existing
      -- snapshot validation on its own turn rather than raising here.
      select count(*)::integer, coalesce(min(candidate_idx), 0)::integer
        into v_compatible_count, v_first_compatible_index
      from jsonb_array_elements(p_body->'queue') with ordinality as q(candidate_item, candidate_idx)
      where btrim(coalesce(candidate_item->>'exerciseId','')) = v_exercise_id
        and case
          when coalesce(candidate_item->>'sets','') ~ '^[0-9]+$'
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

      -- Mirror storedEntry(): scoped evidence wins when present; the legacy key
      -- is a fallback only when canUseLegacyEntry permits it. skippedSets is
      -- intentionally equivalent to results for completion readiness.
      v_resolved := false;
      if v_scope <> ''
         and (((p_body->'results') ? v_scoped_key)
              or (coalesce(p_body->'skippedSets','{}'::jsonb) ? v_scoped_key)) then
        v_resolved := true;
      elsif v_can_use_legacy_key
            and (((p_body->'results') ? v_legacy_key)
                 or (coalesce(p_body->'skippedSets','{}'::jsonb) ? v_legacy_key)) then
        v_resolved := true;
      end if;

      if not v_resolved then
        return jsonb_build_object(
          'ok',false,
          'reason','M26_EXECUTION_NOT_READY_TO_COMPLETE',
          'missingResultKey',v_expected_key
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

comment on function public.iberfit_validate_execution_completion_v26(jsonb) is
  'Validates canonical session completion while preserving the v26 response contract and bounded legacy result-key compatibility.';
