import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {derivedUuid,chileanClock,dayOffset,sameClientCalendar,denied} from '../scripts/remote-gates/qa_u60_real_dated_journey.mjs';
test('U71 deterministic per-run QA operation IDs avoid duplicate writes',()=>{
 const a=derivedUuid('41900000','appointment-create-0');
 assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(a,derivedUuid('41900000','appointment-create-0'));
 assert.notEqual(a,derivedUuid('41900000','appointment-create-1'));
 assert.notEqual(a,derivedUuid('41900001','appointment-create-0'));
});
test('U71 date math is day-based and Santiago timezone is explicit',()=>{
 assert.equal(dayOffset('2026-11-04',7),'2026-11-11');
 assert.equal(dayOffset('2026-12-30',7),'2027-01-06');
 const today=chileanClock(new Date('2026-11-05T01:00:00.000Z'));
 assert.equal(today.day,'2026-11-04');
});
test('U71 calendar shape denies foreign private content and wrong client scope',()=>{
 const valid={status:200,body:{kind:'calendar',occurrences:[{clientId:'client-a',id:'one',status:'confirmada'}]}};
 assert.equal(sameClientCalendar(valid,'client-a'),true);
 assert.equal(sameClientCalendar(valid,'client-b'),false);
 assert.equal(sameClientCalendar({...valid,body:{kind:'calendar',occurrences:[{clientId:'client-a',publishedSnapshot:{}}]}},'client-a'),false);
 assert.equal(sameClientCalendar({status:403,body:valid.body},'client-a'),false);
});
test('U71 denial never mistakes HTTP success for forbidden',()=>{
 for(const s of [200,201,202,429,500])assert.equal(denied({status:s,body:{kind:'calendar'}}),false);
 for(const s of [401,403,404])assert.equal(denied({status:s,body:{}}),true);
 assert.equal(denied({status:200,body:{kind:'rejected',reason:'CLIENT_ACCESS_DENIED'}}),true);
});
test('U71 stage-2 reuses immutable originally certified Santiago time and same-day slot',()=>{
 const s=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.match(s,/const original=mode==='apply'/);
 assert.match(s,/async function authenticatedStage\(ctx,certified=null\)/);
 assert.match(s,/Number\(certified\.localTime\.slice/);
 assert.match(s,/original\.localTime===plan\.time/);
 assert.match(s,/old\.localTime===proof\.localTime/);
 assert.match(s,/APPOINTMENT_CLOCK_DRIFT/);
});
test('U71 only QA origin, ordinary JWT, native commands, two-phase write gate',()=>{
 const s=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.match(s,/M26_QA_ONLY/);assert.match(s,/gjztkdwfmunnzhtvxrsu/);
 assert.doesNotMatch(s,/pjhmrhejsoofmouedavw|SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(s,/buildAppointmentCommand/);assert.match(s,/buildConfirmAppointmentCommand/);
 assert.match(s,/old\.stage==='preflight'/);
 assert.match(s,/old\.sha===proof\.sha/);
 assert.match(s,/old\.runId===proof\.runId/);
 assert.match(s,/old\.fingerprint===proof\.fingerprint/);
 assert.match(s,/GITHUB_RUN_ATTEMPT==='2'/);
 assert.match(s,/COACH_EXECUTION_DETAIL_NOT_COMMITTED/);
});

test('U71 future dated appointment is rejected by start window, not un-timed date guard',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261025194000_signature_u31_private_occurrence_executor_v1.sql',import.meta.url),'utf8');
 const js=readFileSync(new URL('../scripts/remote-gates/qa_u60_real_dated_journey.mjs',import.meta.url),'utf8');
 assert.match(sql,/v_occ\.starts_at IS NOT NULL AND \(/);
 assert.match(sql,/'START_WINDOW_INVALID'/);
 assert.match(js,/futureAttempt\.body\?\.reason==='START_WINDOW_INVALID'/);
});
