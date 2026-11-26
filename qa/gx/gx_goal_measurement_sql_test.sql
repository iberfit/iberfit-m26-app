DO $gx_tests$
DECLARE p jsonb:='{"startDate": "2026-11-01", "endDate": "2026-12-31", "goalMeasurement": {"schemaVersion": 1, "metric": "Levantarse de la silla en 30 s", "unit": "reps", "direction": "increase", "baseline": 0, "baselineDate": "2026-11-01", "target": 15, "deadline": "2026-12-31", "protocol": "Misma silla y técnica", "evidenceRef": "11111111-1111-4111-8111-111111111111|1|chair-stand-30s:not-applicable:repetitions"}}'::jsonb; s jsonb:='{"assessmentDate": "2026-11-01", "firstSessionCompletedAt": "2026-11-01T12:00:00Z", "protocolRecords": [{"testId": "chair-stand-30s", "side": "not-applicable", "variant": "standard-arms-crossed", "configuration": "silla 45 cm", "protocolVersion": "1", "date": "2026-11-01", "valid": true, "executionValid": true, "trackingComparable": true, "stopReason": "", "result": {"repetitions": 0, "valid": true}}]}'::jsonb; g jsonb; bad jsonb; projected jsonb;
BEGIN
 g:=private.iberfit_gx_goal_definition_v1(p,'2026-11-26');
 IF g IS DISTINCT FROM p->'goalMeasurement' THEN RAISE EXCEPTION 'GX_TEST_VALID'; END IF;
 IF private.iberfit_gx_goal_definition_v1(p-'goalMeasurement','2026-11-26') IS NOT NULL THEN RAISE EXCEPTION 'GX_TEST_LEGACY'; END IF;
 IF private.iberfit_gx_goal_definition_v1(jsonb_set(p,'{goalMeasurement}','null'),'2026-11-26') IS NOT NULL THEN RAISE EXCEPTION 'GX_TEST_NULL'; END IF;
 FOREACH bad IN ARRAY ARRAY[
   jsonb_set(p,'{goalMeasurement,baseline}','false'),
   jsonb_set(p,'{goalMeasurement,baseline}','"0"'),
   jsonb_set(p,'{goalMeasurement,target}','0'),
   jsonb_set(p,'{goalMeasurement,target}','1.5'),
   jsonb_set(p,'{goalMeasurement,deadline}','"2026-02-30"'),
   jsonb_set(p,'{goalMeasurement,baselineDate}','"2026-12-01"'),
   jsonb_set(p,'{goalMeasurement,deadline}','"2027-01-01"'),
   jsonb_set(p,'{goalMeasurement,protocol}','""'),
   jsonb_set(p,'{goalMeasurement,evidenceRef}','"other|1|anything"'),
   jsonb_set(p,'{goalMeasurement,privateNotes}','"secreto"'),
   jsonb_set(p,'{goalMeasurement,unit}','"__proto__"'),
   p||jsonb_build_object('start_date','2026-11-02')
 ] LOOP
   IF private.iberfit_gx_goal_definition_v1(bad,'2026-11-26') IS NOT NULL THEN RAISE EXCEPTION 'GX_TEST_BAD_DEFINITION'; END IF;
 END LOOP;
 IF NOT private.iberfit_gx_goal_anchor_measurement_v1(g,s) THEN RAISE EXCEPTION 'GX_TEST_ANCHOR_VALID'; END IF;
 IF private.iberfit_gx_goal_anchor_measurement_v1(jsonb_set(g,'{baseline}','1'),s) THEN RAISE EXCEPTION 'GX_TEST_ANCHOR_VALUE'; END IF;
 IF private.iberfit_gx_goal_anchor_measurement_v1(jsonb_set(g,'{unit}','"kg"'),s) THEN RAISE EXCEPTION 'GX_TEST_ANCHOR_UNIT'; END IF;
 IF private.iberfit_gx_goal_anchor_measurement_v1(g,jsonb_set(s,'{protocolRecords,0,trackingComparable}','false')) THEN RAISE EXCEPTION 'GX_TEST_ANCHOR_INVALID'; END IF;
 IF private.iberfit_gx_goal_anchor_measurement_v1(g,jsonb_set(s,'{protocolRecords}',(s->'protocolRecords')||(s->'protocolRecords'))) THEN RAISE EXCEPTION 'GX_TEST_ANCHOR_DUPLICATE'; END IF;
 projected:=public.iberfit_m43_client_safe_plan_v2(p||jsonb_build_object('privateNotes','no','name','Ciclo'));
 IF projected->'goalMeasurement' IS DISTINCT FROM g-'evidenceRef' OR projected ? 'privateNotes' OR projected#>'{goalMeasurement,evidenceRef}' IS NOT NULL THEN RAISE EXCEPTION 'GX_TEST_PROJECTION'; END IF;
 IF public.iberfit_m43_client_safe_plan_v2(jsonb_set(p,'{goalMeasurement,privateNotes}','"no"')) ? 'goalMeasurement' THEN RAISE EXCEPTION 'GX_TEST_PROJECTION_MALFORMED'; END IF;
 -- Missing or cross-client anchor cannot become a canonical planning row.
 -- Use a temp table with matching trigger fields; no real records are written.
 CREATE TEMP TABLE gx_goal_fixture(entity_type text,entity_id uuid,client_id uuid,status text,body jsonb) ON COMMIT DROP;
 CREATE TRIGGER gx_goal_fixture_guard BEFORE INSERT OR UPDATE ON gx_goal_fixture FOR EACH ROW EXECUTE FUNCTION private.iberfit_gx_goal_guard_v1();
 INSERT INTO gx_goal_fixture VALUES('planning','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','validado',jsonb_set(p,'{goalMeasurement}',g-'evidenceRef'));
 BEGIN
   INSERT INTO gx_goal_fixture VALUES('planning','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','validado',p);
   RAISE EXCEPTION 'GX_TEST_MISSING_ANCHOR_ACCEPTED';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'M26_GOAL_ANCHOR_INVALID' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM gx_goal_fixture)<>1 THEN RAISE EXCEPTION 'GX_TEST_FIXTURE_COUNT'; END IF;
END;
$gx_tests$;
