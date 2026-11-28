import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/release-procedures/connected360_v54_apple_exercise_import_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/release-procedures/connected360_v54_apple_exercise_import_v1.rollback.sql',import.meta.url),'utf8');
test('Apple candidate import uses explicit workout consent, exact owner and replay ordering',()=>{
 for(const p of [/apple_exercise_enabled=false/u,/enabled AND apple_exercise_enabled/u,/private\.m26_v53_apple_client_context\(\)/u,/pg_try_advisory_xact_lock/u,/a\.revocation_cursor=v_cursor/u,/l\.scopes=ARRAY\['exerciseSessions'\]/u,/e\.provider IN \('apple_health','\*'\)/u,/provider='apple_health'/u,/M26_V54_SAME_TIMESTAMP_CONFLICT/u,/v_old\.acquired_at>=v_acquired/u,/v_old\.sport<>'other' AND v_sport='other'/u,/pg_catalog\.jsonb_array_length\(v_rows\) NOT BETWEEN 1 AND 20/u,/count\(DISTINCT r\.value->>'observationKey'\)/u,/SECURITY INVOKER SET search_path TO ''/u])assert.match(sql,p);
 assert.doesNotMatch(sql,/CREATE TABLE|SET apple_exercise_enabled\s*=\s*true|heart_rate_avg\s*=|calories_kcal\s*=|steps\s*=/u);
 assert.match(sql,/r \?& ARRAY\['observationKey','sport','startedAt','endedAt','activeSeconds','distanceMeters'\]/u);
 assert.match(rollback,/SET apple_exercise_enabled=false/u);
 assert.doesNotMatch(rollback,/DELETE FROM|TRUNCATE|DROP TABLE/u);
});

test('Apple candidate acquisition requires separate native approval and bounded complete snapshot',()=>{
 const reader=readFileSync(new URL('../native/apple/IBERFITIOSHealthKitWorkoutReader.swift',import.meta.url),'utf8');
 const host=readFileSync(new URL('../native/apple/QAApp/IBERFITCanaryClientQAView.swift',import.meta.url),'utf8');
 assert.match(reader,/requestWorkoutAccess\(includeHeartRate: false, candidate: true/u);
 assert.match(reader,/candidateApproved == candidate/u);
 assert.match(reader,/consume\(candidate: false\)/u);
 assert.match(reader,/consume\(candidate: true\), !approval.includeHeartRate/u);
 assert.match(reader,/IBERFITAppleWorkoutCandidatePager.maximumRows \+ 1/u);
 assert.match(reader,/returnedCount == workouts.count/u);
 assert.match(reader,/project\(rows, workouts.count\)[^]*?guard self.retire\(lease\)/u);
 assert.match(reader,/ReaderError.incompleteSnapshot/u);
 assert.doesNotMatch(host,/readCandidateOnce|requestExplicitCandidateWorkoutAccess/u);
});
