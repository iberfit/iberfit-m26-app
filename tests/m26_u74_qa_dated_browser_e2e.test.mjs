import test from 'node:test';
import {checkpointContainsValues,checkpointRevisionAdvanced} from '../src/m26/workflows/occurrence-workout-service.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseUnoccupiedDatedSlot,chooseAppointmentlessDateOnlyQaSlot,buildQaAutonomousDateOnlyPair,u74PrescriptionFingerprint,verifyU74DatedReadback,verifyU74OwnerCoachReadback} from '../scripts/remote-gates/qa_u60_real_dated_journey.mjs';
import {santiagoAppointmentInstant} from '../src/m26/workflows/agenda-workflow.js';
import {isQaReadonlyDatedRequest,isQaScopedDatedSyntheticWrite} from '../qa/rc64/secure-current-source-auth.mjs';
const CLIENT='10000000-0000-4000-8000-000000000001';
const OCC='20000000-0000-4000-8000-000000000001';
const FOREIGN='30000000-0000-4000-8000-000000000001';
const scoped={clientId:CLIENT,occurrenceId:OCC};
const command={type:'OCURRENCIA_INICIAR',
 operationId:'40000000-0000-4000-8000-000000000001',
 clientId:CLIENT,entityId:OCC,baseRevision:1,
 payload:{executionId:'50000000-0000-4000-8000-000000000001'}};
function request(cmd,{host='gjztkdwfmunnzhtvxrsu.supabase.co',method='POST',action='TRANSICION'}={}){
 return {method:()=>method,
  url:()=> 'https://'+host+'/rest/v1/rpc/iberfit_occurrence_api_u60_v1',
  postDataJSON:()=>({p_action:action,p_payload:cmd})};
}
test('U74 allows only the exact U39 payload schema for the signed QA date',()=>{
 assert.equal(isQaScopedDatedSyntheticWrite(request(command),scoped),true);
 for(const type of ['OCURRENCIA_PAUSAR','OCURRENCIA_REANUDAR',
  'OCURRENCIA_GUARDAR_PROGRESO','OCURRENCIA_COMPLETAR']){
  const payload={...command.payload,executionBaseRevision:1};
  if(type==='OCURRENCIA_GUARDAR_PROGRESO'||type==='OCURRENCIA_COMPLETAR')
   Object.assign(payload,{results:{},skippedSets:{}});
  if(type==='OCURRENCIA_COMPLETAR')payload.feedback={};
  assert.equal(isQaScopedDatedSyntheticWrite(request({...command,type,payload}),scoped),true);
 }
 assert.equal(isQaReadonlyDatedRequest(request(command),'iberfit_occurrence_api_u60_v1'),false);
});
test('U74 rejects nested foreign scope, unknown fields, malformed results and oversized writes',()=>{
 const base={...command.payload,executionBaseRevision:1};
 const progress={...command,type:'OCURRENCIA_GUARDAR_PROGRESO',
  payload:{...base,results:{},skippedSets:{}}};
 const complete={...command,type:'OCURRENCIA_COMPLETAR',
  payload:{...progress.payload,feedback:{}}};
 for(const malformed of [
  {...command,type:'OCURRENCIA_PAUSAR',payload:{...base,otherOccurrenceId:FOREIGN}},
  {...command,type:'OCURRENCIA_REANUDAR',payload:{...base,otherClientId:FOREIGN}},
  {...progress,payload:{...progress.payload,otherClientId:FOREIGN}},
  {...progress,payload:{...progress.payload,results:[]}},
  {...progress,payload:{...progress.payload,skippedSets:null}},
  {...progress,payload:{executionId:base.executionId,executionBaseRevision:1}},
  {...complete,payload:{...complete.payload,feedback:[]}},
  {...complete,payload:{...complete.payload,feedback:null}},
  {...complete,payload:{...complete.payload,unexpected:'cross-scope'}},
  {...progress,payload:{...progress.payload,results:{oversized:'x'.repeat(524289)}}},
 ])assert.equal(isQaScopedDatedSyntheticWrite(request(malformed),scoped),false);
});
test('U74 denies other owners, dates, destructive actions, malformed CAS and PROD',()=>{
 for(const bad of [
  {...command,clientId:FOREIGN},{...command,entityId:FOREIGN},
  {...command,type:'OCURRENCIA_CANCELAR'},
  {...command,type:'OCURRENCIAS_CREAR_LOTE'},
  {...command,operationId:'bad'},{...command,baseRevision:-1},
  {...command,payload:{}},{...command,payload:{...command.payload,extra:true}},
  {...command,unexpected:'extra'},{...command,type:'OCURRENCIA_PAUSAR'},
 ])
  assert.equal(isQaScopedDatedSyntheticWrite(request(bad),scoped),false);
 assert.equal(isQaScopedDatedSyntheticWrite(request(command,{host:'pjhmrhejsoofmouedavw.supabase.co'}),scoped),false);
 assert.equal(isQaScopedDatedSyntheticWrite(request(command,{action:'CREAR_LOTE'}),scoped),false);
 assert.equal(isQaScopedDatedSyntheticWrite(request(command,{method:'GET'}),scoped),false);
});
test('U74 requires exact source, explicit second attempt, least privilege and no PROD',()=>{
 const source=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 const workflow=readFileSync('.github/workflows/u74-qa-dated-browser-e2e.yml','utf8');
 const browser=readFileSync('qa/rc64/u74-dated-ui-write.spec.mjs','utf8');
 const policy=readFileSync('qa/rc64/secure-current-source-auth.mjs','utf8');
 assert.match(workflow,/feat\/iberfit-real-training-360-20261114/u);
 assert.match(workflow,/feat\/real-training-360-one-release-20261117/u);
 assert.match(source,/feat\/real-training-360-one-release-20261117/u);
 assert.match(workflow,/20261117_m1_u72_prod_guarded_materialized_v1\.sql/u);
 assert.match(workflow,/src\/m26\/supabase-transport\.js/u);
 assert.match(workflow,/src\/m26\/app\/application\.js/u);
 assert.match(workflow,/src\/m26\/command-bus\.js/u);
 assert.match(workflow,/qa\/rc64\/build-authenticated-surface\.mjs/u);
 assert.match(workflow,/m26_p0_free_progress_ack_deferred_read_qa\.test\.mjs/u);
 assert.match(workflow,/github\.run_attempt == 1/u);
 assert.match(workflow,/github\.run_attempt == 2/u);
 assert.match(workflow,/environment: m26-canary-readonly/u);
 assert.doesNotMatch(workflow,/workflow_dispatch|SUPABASE_SERVICE_ROLE_KEY|IBERFIT_PROD_DATABASE_URL/u);
 assert.match(source,/proof\.status='QA_BROWSER_FIXTURE_READY'/u);
 assert.match(source,/proof\.status='QA_BROWSER_HOSTED_E2E_SUCCESS'/u);
 assert.match(source,/if\(mode==='verify-browser'\)return await verifyBrowserWorkout\(ctx\)/u);
 assert.match(source,/currentSha\(ctx\)/u);
 assert.match(source,/original\.runId===ctx\.e\.GITHUB_RUN_ID/u);
 assert.match(policy,/allowQaSyntheticWrite\(request\)===true/u);
 assert.match(browser,/isQaScopedDatedSyntheticWrite\(request,f\)/u);
 assert.match(browser,/expect\(acks\)\.toEqual\(expected\)/u);
 assert.match(browser,/:scope > label > input\[name=/u);
 assert.match(browser,/expect\(observed,[^\n]+\)\.toBeGreaterThan\(0\)/u);
 assert.match(browser,/await field\.fill\(value,\{timeout:10000\}\)/u);
 assert.doesNotMatch(browser,/force:\s*true/u);
 assert.doesNotMatch(browser,/service_role|pjhmrhejsoofmouedavw/u);
});

test('U74 uses UTF-8 byte size, never character count, for synthetic progress writes',()=>{
 const unicode={...command,type:'OCURRENCIA_GUARDAR_PROGRESO',
  payload:{executionId:command.payload.executionId,executionBaseRevision:1,
   results:{observation:'á'.repeat(262200)},skippedSets:{}}};
 assert.equal(isQaScopedDatedSyntheticWrite(request(unicode),scoped),false);
});

test('U74 actual Real Training branch retains signed two-attempt QA boundaries',()=>{
 const wf=readFileSync('.github/workflows/u74-qa-dated-browser-e2e.yml','utf8');
 const js=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 assert.match(wf,/branches:\s*\n\s+- 'feat\/iberfit-real-training-360-20261114'\s*\n\s+- 'feat\/real-training-360-one-release-20261117'\s*\n\s+- 'canary\/rc74-4'/u);
 for(const attempt of [1,2])assert.ok(wf.includes('github.run_attempt == '+attempt));
 for(const action of ['preflight-browser','prepare-browser','verify-browser'])
   assert.ok(wf.includes('qa_u60_real_dated_journey.mjs '+action));
 assert.match(js,/BRANCH_HEAD_MOVED/u);
 assert.match(js,/'canary\/rc74-4'/u);
 assert.match(wf,/if:\s*\$\{\{ github\.run_attempt == 1 \}\}/u);
 assert.match(wf,/if:\s*\$\{\{ github\.run_attempt == 2 \}\}/u);
 assert.match(js,/PREFLIGHT_MISSING_STALE_OR_CHANGED/u);
 assert.match(js,/old\.sha===proof\.sha/u);
 assert.match(js,/old\.runId===proof\.runId/u);
 assert.match(js,/ENV_ISOLATION/u);
 assert.doesNotMatch(wf,/workflow_dispatch|SUPABASE_SERVICE_ROLE_KEY|pjhmrhejsoofmouedavw/u);
});

test('U74 persisted preflight binds same synthetic source, revision, SHA, run and date',()=>{
 const src=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 assert.match(src,/candidateId:plan\.chosen\.id,candidateRevision:plan\.chosen\.revision/u);
 assert.match(src,/UUID\.test\(original\.candidateId\)/u);
 assert.match(src,/old\.candidateId===proof\.candidateId/u);
 assert.match(src,/old\.candidateRevision===proof\.candidateRevision/u);
 assert.match(src,/selectCertifiedDatedCandidate\(candidates,old,today,future,certified\)/u);
 assert.match(src,/CERTIFIED_SOURCE_REVISION_CHANGED/u);
 assert.match(src,/CERTIFIED_SOURCE_DATES_OCCUPIED/u);
});


test('U74 one-PR authenticated no-cita browser workflow is strict branch and two-attempt signed',()=>{
 const wf=readFileSync('.github/workflows/u74-qa-dated-browser-e2e.yml','utf8');
 const code=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 const ui=readFileSync('qa/rc64/u74-dated-ui-write.spec.mjs','utf8');
 assert.ok(wf.includes('feat/m26-autonomous-dates-m44-one-prod-release-20261121')&&code.includes('feat/m26-autonomous-dates-m44-one-prod-release-20261121'));
 for(const marker of ['M26_QA_U74_AUTONOMOUS_NO_APPOINTMENT','github.run_attempt == 2','m26-canary-readonly']) assert.ok(wf.includes(marker));
 for(const marker of ['AUTONOMOUS_BRANCH_DENIED','MODE_EXPLICIT_REQUIRED','two_no_appointment_dates_persisted','AUTONOMOUS_PROOF_MODE_MISMATCH']) assert.ok(code.includes(marker));
 assert.ok(code.includes('?buildQaAutonomousDateOnlyPair(today,future)'));
 assert.ok(ui.includes('proof.fixture.appointmentless'));
 assert.doesNotMatch(wf,/workflow_dispatch|SUPABASE_SERVICE_ROLE_KEY|IBERFIT_PROD_DATABASE_URL/u);
});

// The protected exact-SHA branch must test the autonomous product path,
// not silently fall back to the legacy appointment-linked case.
test('M1 Canary U74 explicitly enables appointmentless signed QA only',()=>{
 const workflow=readFileSync('.github/workflows/u74-qa-dated-browser-e2e.yml','utf8');
 const runner=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 assert.match(workflow,/M26_QA_U74_AUTONOMOUS_NO_APPOINTMENT:.*refs\/heads\/canary\/rc74-4/u);
 assert.match(workflow,/github\.run_attempt == 1/u);
 assert.match(workflow,/github\.run_attempt == 2/u);
 assert.match(runner,/authorizedAutonomousQaBranch\(e,branch\)/u);
 assert.match(runner,/GITHUB_WORKFLOW==='IBERFIT U74 Real QA Dated Browser Write E2E'/u);
 assert.match(runner,/GITHUB_EVENT_NAME==='push'/u);
 assert.doesNotMatch(workflow,/workflow_dispatch|SUPABASE_SERVICE_ROLE_KEY|IBERFIT_PROD_DATABASE_URL/u);
});

test('M1 U74 no-cita slot does not depend on another session appointment',()=>{
 const source=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 assert.match(source,/calendar:ctx\.autonomous\?\[\]:old/u);
 assert.match(source,/const chosen=selectCertifiedDatedCandidate\(candidates,old,today,future,certified\)/u);
 assert.match(source,/assert\(!old\.some\(row=>row\.status==='en_curso'\)/u);
 assert.match(source,/boundedQaCalendarPage\(r,owner\)/u);
});

// A first-run signed QA slot can expire while the Free-tier QA mutex is held.
// Never execute a dated workout against that stale slot; a new run must do a
// fresh read-only preflight and sign a NEW time before performing any write.
test('U74 stale signed time fails closed after QA queue, fresh read-only slot remains viable',()=>{
 const today='2026-11-22',future='2026-11-29';
 const original=Date.parse(santiagoAppointmentInstant(today+'T13:00'));
 const old=chooseUnoccupiedDatedSlot({today,future,duration:20,
  clockMinute:13*60,calendar:[],nowMs:original});
 assert.equal(old.time,'13:25');
 assert.throws(()=>chooseUnoccupiedDatedSlot({today,future,duration:20,
  clockMinute:13*60+26,calendar:[],fixedTime:old.time,
  nowMs:original+26*60_000}),/U71_QA_NO_CONFLICT_FREE_SLOT/);
 const fresh=chooseUnoccupiedDatedSlot({today,future,duration:20,
  clockMinute:13*60+26,calendar:[],nowMs:original+26*60_000});
 assert.equal(fresh.time,'13:55');
 assert.ok(Date.parse(fresh.start1)>original+26*60_000);
 assert.notEqual(fresh.start1,old.start1);
});

// The no-cita path stores TWO date-only occurrences; its fixed signed time
// is an internal evidence marker and never an appointment/occurrence time.
// QA mutex delays must not invalidate it, unlike appointment-bound U71.
test('U74 date-only preflight is stable across QA queue without relaxing signed dates',()=>{
 const today='2026-11-22',future='2026-11-29',duration=30;
 const one=chooseAppointmentlessDateOnlyQaSlot({today,future,duration,clockDay:today});
 const second=chooseAppointmentlessDateOnlyQaSlot({today,future,duration,
  clockDay:today,fixedTime:one.time});
 assert.equal(one.time,'12:00');
 assert.deepEqual(second,one);
 assert.equal(Date.parse(one.end1)-Date.parse(one.start1),30*60_000);
 assert.equal(Date.parse(one.end2)-Date.parse(one.start2),30*60_000);
 assert.throws(()=>chooseAppointmentlessDateOnlyQaSlot({today,future,duration,
  clockDay:'2026-11-23',fixedTime:one.time}),/U74_DATE_ONLY_SLOT_INVALID/);
 assert.throws(()=>chooseAppointmentlessDateOnlyQaSlot({today,future,duration,
  clockDay:today,fixedTime:'13:25'}),/U74_DATE_ONLY_SLOT_INVALID/);
 assert.throws(()=>chooseAppointmentlessDateOnlyQaSlot({today,
  future:'2026-11-30',duration,clockDay:today}),/U74_DATE_ONLY_SLOT_INVALID/);
 const runner=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 assert.match(runner,/ctx\.autonomous\s*\?chooseAppointmentlessDateOnlyQaSlot/u);
 assert.match(runner,/fixedTime:certified\?\.localTime\|\|null/u);
 assert.match(runner,/old\.fingerprint===proof\.fingerprint/u);
 assert.match(runner,/old\.localDate===proof\.localDate/u);
 assert.match(runner,/old\.localTime===proof\.localTime/u);
});

test('U74 creates two independent date-only occurrences without fabricating time or bookings',()=>{
 const rows=buildQaAutonomousDateOnlyPair('2026-11-22','2026-11-29');
 assert.deepEqual(rows,[{localDate:'2026-11-22'},{localDate:'2026-11-29'}]);
 assert.equal(Object.isFrozen(rows),true);
 assert.ok(rows.every(row=>Object.isFrozen(row)&&!('localTime' in row)&&!('appointmentId' in row)));
 assert.throws(()=>buildQaAutonomousDateOnlyPair('2026-11-22','2026-11-30'),
  /U74_DATE_ONLY_PAIR_INVALID/);
 assert.throws(()=>buildQaAutonomousDateOnlyPair('bad','2026-11-29'),
  /U74_DATE_ONLY_PAIR_INVALID/);
 const runner=readFileSync('scripts/remote-gates/qa_u60_real_dated_journey.mjs','utf8');
 assert.match(runner,/dates:ctx\.autonomous\s*\?buildQaAutonomousDateOnlyPair\(today,future\)/u);
 assert.match(runner,/appointments\.map\(\(x,i\)=>\(\{localDate:x\.date,localTime:plan\.time,/u);
 assert.match(runner,/appointmentId:commands\[i\]\.entityId/u);
});

test('U74 verifies immutable original prescriptions, final feedback and untouched second date',()=>{
 const sessionId='50000000-0000-4000-8000-000000000001',executionId='60000000-0000-4000-8000-000000000001';
 const snapshot={clientId:CLIENT,sessionId,blocks:[{id:'b',exerciseId:'squat',sets:1}],queue:[{blockId:'b',exerciseId:'squat',sets:1}]};
 const fingerprint=u74PrescriptionFingerprint(snapshot,CLIENT,sessionId);
 const fixture={clientId:CLIENT,sessionId,occurrenceId:OCC,futureOccurrenceId:FOREIGN,localDate:'2026-11-28',futureDate:'2026-12-05',stepsExpected:1,appointmentless:true,firstPrescriptionHash:fingerprint,futurePrescriptionHash:fingerprint,futureRevision:1};
 const detail=(id,day,status,exec,body)=>({kind:'private-occurrence',occurrence:{id,clientId:CLIENT,sessionId,localDate:day,appointmentId:null,status,executionId:exec,revision:status==='confirmada'?1:3},prescriptionSnapshot:structuredClone(snapshot),executionBody:body});
 const first=detail(OCC,fixture.localDate,'completada',executionId,{id:executionId,revision:5,clientId:CLIENT,sessionId,occurrenceId:OCC,status:'completada',sourceSnapshot:structuredClone(snapshot),results:{'squat:1':{exerciseId:'squat',setNumber:1,reps:8}},skippedSets:{},feedback:{sessionRpe:7,comment:'IBERFIT U74 QA ejecución real sintética'}});
 const future=detail(FOREIGN,fixture.futureDate,'confirmada',null,null);
 assert.equal(verifyU74DatedReadback(first,future,fixture),true);
 const owner={first:structuredClone(first),future:structuredClone(future)};
 const coach=structuredClone(owner);
 const invalid=structuredClone(owner);delete invalid.first.executionBody.revision;
 assert.throws(()=>verifyU74OwnerCoachReadback(invalid,invalid,fixture),/U71_UI_EXECUTION_REVISION_INVALID/);
 assert.equal(verifyU74OwnerCoachReadback(owner,coach,fixture),true);
 for(const alter of [
  x=>{x.first.executionBody.results['squat:1'].reps=9;},
  x=>{x.first.executionBody.revision=99;},
  x=>{x.first.executionBody.id=FOREIGN;x.first.occurrence.executionId=FOREIGN;},
 ]){const bad=structuredClone(coach);alter(bad);assert.throws(
  ()=>verifyU74OwnerCoachReadback(owner,bad,fixture),/U71_UI_OWNER_COACH_EXECUTION_DIVERGED/);}

 assert.equal(u74PrescriptionFingerprint({queue:snapshot.queue,blocks:snapshot.blocks,sessionId,clientId:CLIENT},CLIENT,sessionId),fingerprint);
 for(const mutate of [
  (a,b)=>{a.executionBody.sourceSnapshot.blocks[0].sets=2;},
  (a,b)=>{a.executionBody.feedback.comment='';},
  (a,b)=>{a.executionBody.results={'squat:1':null};},
  (a,b)=>{a.executionBody.results={'wrong:1':{exerciseId:'squat',setNumber:1,reps:8}};},
  (a,b)=>{a.executionBody.results['squat:1'].exerciseId='wrong';},
  (a,b)=>{a.executionBody.results['squat:1'].setNumber=2;},
  (a,b)=>{b.occurrence.revision=2;},
  (a,b)=>{b.executionBody={status:'en_curso'};},
  (a,b)=>{b.prescriptionSnapshot.queue[0].sets=2;},
  (a,b)=>{a.executionBody.clientId=FOREIGN;},
  (a,b)=>{b.occurrence.appointmentId=executionId;}
 ]){const a=structuredClone(first),b=structuredClone(future);mutate(a,b);assert.throws(()=>verifyU74DatedReadback(a,b,fixture),/U71_UI_/);}
 // Two blocks can prescribe the same exercise; each must resolve its own set.
 const repeated=structuredClone(first);
 repeated.prescriptionSnapshot.queue.push({blockId:'b2',exerciseId:'squat',sets:1});
 repeated.prescriptionSnapshot.blocks.push({id:'b2',exerciseId:'squat',sets:1});
 repeated.executionBody.sourceSnapshot=structuredClone(repeated.prescriptionSnapshot);
 const repeatedFixture={...fixture,stepsExpected:2,firstPrescriptionHash:u74PrescriptionFingerprint(repeated.prescriptionSnapshot,CLIENT,sessionId)};
 repeated.executionBody.results={'b:squat:1':{exerciseId:'squat',setNumber:1,reps:8},'b2:squat:1':{exerciseId:'squat',setNumber:1,reps:9}};
 assert.equal(verifyU74DatedReadback(repeated,future,repeatedFixture),true);
 repeated.executionBody.results={'b:squat:1':{exerciseId:'squat',setNumber:1,reps:8},'squat:1':{exerciseId:'squat',setNumber:1,reps:9}};
 assert.throws(()=>verifyU74DatedReadback(repeated,future,repeatedFixture),/U71_UI_EXECUTION_SET_IDENTITY_INVALID/);
});


test('U74 encrypted checkpoint accepts reordered JSON fields but preserves array order and types',()=>{
 const saved={set1:{reps:8,loadKg:20,details:{side:'left',sequence:[1,2]}}};
 const remote={set2:{reps:9},set1:{details:{sequence:[1,2],side:'left'},loadKg:20,reps:8}};
 assert.equal(checkpointContainsValues(saved,remote),true);
 for(const mutate of [
  x=>{x.set1.reps='8';},x=>{x.set1.loadKg=21;},
  x=>{x.set1.details.sequence.reverse();},x=>{delete x.set1.details.side;},
  x=>{delete x.set1;},x=>{x.set1.details.extra=true;},
 ]){const wrong=structuredClone(remote);mutate(wrong);assert.equal(checkpointContainsValues(saved,wrong),false);}
 assert.equal(checkpointContainsValues({set1:{reps:0}},{set1:{reps:0}}),true);
 assert.equal(checkpointContainsValues({set1:{reps:0}},{set1:{reps:null}}),false);
});

test('U74 encrypted checkpoint never clears against an older or invalid private revision',()=>{
 const local={occurrenceRevision:3,executionRevision:5};
 assert.equal(checkpointRevisionAdvanced(local,{...local}),false);
 assert.equal(checkpointRevisionAdvanced(local,{occurrenceRevision:3,executionRevision:6}),true);
 assert.equal(checkpointRevisionAdvanced(local,{occurrenceRevision:4,executionRevision:5}),true);
 assert.equal(checkpointRevisionAdvanced(local,{...local},true),true);
 for(const remote of [{occurrenceRevision:2,executionRevision:6},{occurrenceRevision:4,executionRevision:4},{occurrenceRevision:2,executionRevision:4}]){
  for(const completed of [false,true])assert.throws(()=>checkpointRevisionAdvanced(local,remote,completed),/U49_CHECKPOINT_REMOTE_REVISION_REGRESSED/);
 }
 for(const bad of [null,0,-1,1.5,'5',Infinity]){
  assert.throws(()=>checkpointRevisionAdvanced({...local,executionRevision:bad},local),/U49_CHECKPOINT_REVISION_INVALID/);
  assert.throws(()=>checkpointRevisionAdvanced(local,{...local,executionRevision:bad}),/U49_CHECKPOINT_REVISION_INVALID/);
 }
});
