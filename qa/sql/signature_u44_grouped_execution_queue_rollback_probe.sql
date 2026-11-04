-- SQL QA only: BEGIN/ROLLBACK; no persistent fixture records.
DO $qa$
DECLARE q jsonb; name text;
BEGIN
 q:=private.iberfit_u32_build_execution_queue_v1(
 '[{"id":"solo","type":"exercise","exerciseId":"squat","sets":3},
 {"id":"pair","type":"biserie","rounds":4,"exerciseIds":["row","press"],
 "prescriptions":{"row":{"reps":"10"},"press":{"plannedLoad":"12"}}},
 {"id":"tri","type":"triserie","rounds":2,"exerciseIds":["a","b","c"]},
 {"id":"circ","type":"circuito","rounds":3,"exerciseIds":["x","y"]},
 {"id":"amrap","type":"amrap","rounds":1,"exerciseIds":["z"]},
 {"id":"tabata","type":"tabata","rounds":8,"exerciseIds":["jump","bike"]}]'::jsonb);
 IF jsonb_array_length(q)<>11
 OR q#>>'{0,exerciseId}'<>'squat'
 OR q#>>'{1,groupOrder}'<>'0'
 OR q#>>'{2,groupOrder}'<>'1'
 OR q#>>'{2,prescription,plannedLoad}'<>'12'
 OR q#>>'{10,groupType}'<>'tabata'
 OR q#>>'{10,sets}'<>'8' THEN
   RAISE EXCEPTION 'U44_QUEUE_SEMANTICS_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(q) x(v)
 WHERE nullif(v->>'exerciseId','') IS NULL OR (v->>'sets') !~ '^[0-9]{1,3}$'
 OR (v->>'sets')::integer NOT BETWEEN 1 AND 100) THEN
   RAISE EXCEPTION 'U44_U31_START_VALIDATOR_REJECTED_QUEUE';END IF;
 FOREACH name IN ARRAY ARRAY['biserie','triserie','circuito','amrap','tabata'] LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q) x(v) WHERE v->>'groupType'=name)
   THEN RAISE EXCEPTION 'U44_GROUP_MISSING';END IF;
 END LOOP;
 BEGIN
   PERFORM private.iberfit_u32_build_execution_queue_v1(
   '[{"type":"circuito","rounds":2,"exerciseIds":[]}]'::jsonb);
   RAISE EXCEPTION 'U44_EMPTY_GROUP_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN
   PERFORM private.iberfit_u32_build_execution_queue_v1(
   '[{"type":"biserie","rounds":2,"exerciseIds":["a"],"prescriptions":{"a":[]}}]'::jsonb);
   RAISE EXCEPTION 'U44_INVALID_PRESCRIPTION_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN
   PERFORM private.iberfit_u32_build_execution_queue_v1(
   '[{"type":"exercise","exerciseId":"a","sets":0}]'::jsonb);
   RAISE EXCEPTION 'U44_ZERO_SETS_ACCEPTED';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 IF has_function_privilege('authenticated',
 'private.iberfit_u32_build_execution_queue_v1(jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'U44_PRIVATE_FUNCTION_EXPOSED';END IF;
 RAISE NOTICE 'U44_GROUPED_EXECUTION_QUEUE_QA_PASS';
END $qa$;