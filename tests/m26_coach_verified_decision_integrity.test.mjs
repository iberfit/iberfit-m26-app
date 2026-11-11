import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIberfitDecisionBrief} from '../src/m26/intelligence/decision-brief.js';
import {__nextSessionPreparationInternals} from '../src/m26/intelligence/next-session-prep.js';
import {buildPeriodizationSnapshot} from '../src/m26/planning/periodization-workbench.js';
import {buildTraining360DecisionPack} from '../src/m26/intelligence/training360-decision-pack.js';
import {createOccurrencePrivateReader} from '../src/m26/workflows/occurrence-private-reader.js';

const NOW=new Date('2026-11-11T12:00:00.000Z');
const SAMPLE={plannedSessions:4,completedSessions:3,adherence:0.75,averageRpe:7.5,
  checkins:2,unconfirmedExecutions:1,wearable:{daysWithData:0}};
const brief=(summary)=>buildIberfitDecisionBrief({summary,now:NOW});
test('Coach decision brief uses verified counts and stable confirmed range',()=>{
 const result=brief(SAMPLE);
 assert.equal(result.signals.includes('Adherencia confirmada: 75% (3 de 4 sesiones).'),true);
 assert.equal(result.signals.includes('RPE medio confirmado: 7.5.'),true);
 assert.ok(result.limitations.some(x=>/ejecución queda fuera/u.test(x)));
 assert.equal(result.safetyNote.includes('no modifica cargas'),true);
});
test('missing, contradictory and non-numeric adherence never becomes a confirmed percentage',()=>{
 for(const changes of [
  {completedSessions:5},{completedSessions:1},{plannedSessions:0},
  {completedSessions:false},{completedSessions:-1},{completedSessions:1.5},
  {plannedSessions:null,completedSessions:0},{plannedSessions:undefined,completedSessions:0},
 ]){
  const result=brief({...SAMPLE,...changes});
  assert.equal(result.signals.some(x=>x.includes('Adherencia confirmada:')),false,JSON.stringify(changes));
  assert.ok(result.limitations.some(x=>/Adherencia no calculable/u.test(x)));
 }
 assert.equal(brief({plannedSessions:3,completedSessions:0}).signals
  .some(x=>/Adherencia confirmada: 0% \(0 de 3/u.test(x)),true,'genuine zero is not missing');
});
test('wrong RPE, boolean and blank values are absence, not evidence',()=>{
 for(const value of [false,true,'',null,'  ',NaN,11,-1,{},[]]){
  const r=brief({...SAMPLE,averageRpe:value});
  assert.equal(r.signals.some(x=>x.includes('RPE medio confirmado:')),false,String(value));
 }
 const r=brief({checkins:true,unconfirmedExecutions:-2});
 assert.equal(r.evidenceCount,0);
 assert.equal(r.confidence,'limitada');
});
test('wearable without valid provenance, owner-day count or confirmed source is only a limitation',()=>{
 const base={daysWithData:2,decision:{eligible:true,currentEvidenceDays:2,providers:['health_connect']}};
 assert.equal(brief({wearable:base}).signals.some(x=>/datos actuales de dispositivo/u.test(x)),true);
 for(const changes of [{providers:[]},{providers:['one','two']},{providers:[null]},
 {currentEvidenceDays:3},{currentEvidenceDays:-1},{currentEvidenceDays:1.5}]){
  const result=brief({wearable:{daysWithData:2,decision:{...base.decision,...changes}}});
  assert.equal(result.signals.some(x=>/datos actuales de dispositivo/u.test(x)),false);
 }
});
test('qualitative high quality does not turn a single alert into high-confidence evidence',()=>{
 const result=buildIberfitDecisionBrief({summary:{dataQuality:'alta'},alerts:[{title:'Señal 1'}]});
 assert.equal(result.evidenceCount,1);
 assert.equal(result.confidence,'limitada');
});
test('out-of-range check-ins are not treated as a valid 0–10 worsening trend',()=>{
 const {wellbeingScores,wellbeingShift}=__nextSessionPreparationInternals;
 assert.equal(wellbeingScores({stress:99}).stress,null);
 assert.equal(wellbeingScores({energy:-2}).energy,null);
 const state={collections:{checkins:[0,1,2,3].map((k)=>({
  id:'c'+k,clientId:'client-fixture',recordedAt:new Date(NOW.getTime()-k*86400000).toISOString(),
  stress:k<2?99:1,energy:k<2?-20:8,
 }))}};
 const result=wellbeingShift(state,'client-fixture',{now:NOW});
 assert.equal(result.available,false);
 assert.equal(result.signals.length,0);
});
test('weekly Coach volume excludes omitted and contradictory kg loads without losing session completion',()=>{
 const c='client-fixture';
 const cycle={clientId:c,startDate:'2026-11-01',endDate:'2026-11-28',name:'Fuerza'};
 const state={collections:{appointments:[],sessionExecutions:[{
  id:'e1',clientId:c,status:'completed',syncStatus:'clean',
  completedAt:'2026-11-11T10:00:00.000Z',feedback:{sessionRpe:7},
  results:{
   one:{reps:10,load:'20 kg'},
   skipped:{reps:10,load:'30 kg',skipped:true},
   inconsistent:{reps:10,load:'30 kg',loadKg:60},
   notDone:{reps:10,load:'10 kg',completed:false},
   valid:{reps:10,loadKg:15,load:'15 kg'},
   ambiguous:{reps:10,loadKg:10,load:'30 lb'},
  },
 }]}};
 const result=buildPeriodizationSnapshot(state,c,{cycle,now:NOW});
 assert.equal(result.completed,1);
 assert.equal(result.weeks[1].strengthSets,2);
 assert.equal(result.weeks[1].strengthVolume,350);
 assert.equal(result.weeks[1].rpe,7);
});

test('U60: contradictory duplicate execution cannot certify an occurred workout',()=>{
 const CLIENT='10000000-0000-4000-8000-000000000101';
 const S='10000000-0000-4000-8000-000000000103';
 const O='10000000-0000-4000-8000-000000000104';
 const E='10000000-0000-4000-8000-000000000107';
 const AP='10000000-0000-4000-8000-000000000108';
 const session={id:S,clientId:CLIENT,title:'Fuerza',status:'disponible',
  deliveryModality:'guiada_en_app',visibleToClient:true,clientVisibilityLevel:'full'};
 const appointment={id:AP,clientId:CLIENT,sessionId:S,status:'completada'};
 const occurrence={id:O,clientId:CLIENT,sessionId:S,localDate:'2026-11-10',
  timeZone:'America/Santiago',status:'completada',revision:3,executionId:E,appointmentId:AP};
 const good={id:E,clientId:CLIENT,sessionId:S,occurrenceId:O,status:'completada',revision:3};
 const run=(executions,appointments=[appointment],sessions=[session])=>
  buildTraining360DecisionPack({role:'coach',clientId:CLIENT,now:NOW,
   sessions,appointments,occurrences:[occurrence],executions});
 const ok=run([good,{...good}]);
 assert.equal(ok.summary.completedDue,1,'identical canonical snapshots are safe');
 assert.equal(ok.summary.verifiedAdherencePct,100);
 for(const arr of [[good,{...good,status:'en_curso'}],
                    [{...good,status:'en_curso'},good],
                    [good,{...good,clientId:'10000000-0000-4000-8000-000000000102'}]]){
  const result=run(arr);
  assert.equal(result.summary.completedDue,0);
  assert.equal(result.summary.verifiedAdherencePct,null);
  assert.equal(result.summary.insufficientEvidence,true);
  assert.equal(result.needsRecovery.length,1);
 }
 const conflictingAppointment=run([good],[appointment,{...appointment,status:'cancelada'}]);
 assert.equal(conflictingAppointment.summary.insufficientEvidence,true);
 const conflictingPrescription=run([good],[appointment],[session,{...session,title:'Borrador contradictorio'}]);
 assert.equal(conflictingPrescription.summary.scheduledDates,0);
 assert.equal(conflictingPrescription.summary.insufficientEvidence,true);
});

test('U60 unrelated duplicate does not inflate an honest client integrity warning',()=>{
 const ids={
  client:'10000000-0000-4000-8000-000000000111',
  other:'10000000-0000-4000-8000-000000000112',
  session:'10000000-0000-4000-8000-000000000113',
  occurrence:'10000000-0000-4000-8000-000000000114',
  appointment:'10000000-0000-4000-8000-000000000115',
  unrelated:'10000000-0000-4000-8000-000000000116',
 };
 const presc={id:ids.session,clientId:ids.client,title:'Fuerza',
  status:'disponible',deliveryModality:'guiada_en_app',
  visibleToClient:true,clientVisibilityLevel:'full'};
 const original={role:'client',clientId:ids.client,now:NOW,
  sessions:[presc],
  appointments:[{id:ids.appointment,clientId:ids.client,
   sessionId:ids.session,status:'confirmada'}],
  occurrences:[{id:ids.occurrence,clientId:ids.client,sessionId:ids.session,
   timeZone:'America/Santiago',localDate:'2026-11-13',status:'confirmada',
   revision:1,appointmentId:ids.appointment}],
  executions:[{id:ids.unrelated,clientId:ids.other,status:'completed',revision:1},
   {id:ids.unrelated,clientId:ids.other,status:'en_curso',revision:1}],
 };
 const clean=buildTraining360DecisionPack(original);
 assert.equal(clean.summary.scheduledDates,1);
 assert.equal(clean.summary.insufficientEvidence,false,'unlinked foreign collision is not client evidence');
 const crossVisibility=buildTraining360DecisionPack({...original,sessions:[
  presc,{...presc,visibleToClient:false}
 ]});
 assert.equal(crossVisibility.summary.scheduledDates,0);
 assert.equal(crossVisibility.summary.insufficientEvidence,true);
});

test('two independent dates count only independently confirmed executions',()=>{
 const C='10000000-0000-4000-8000-000000000211',S='10000000-0000-4000-8000-000000000212';
 const O1='10000000-0000-4000-8000-000000000213',O2='10000000-0000-4000-8000-000000000214';
 const E1='10000000-0000-4000-8000-000000000215',E2='10000000-0000-4000-8000-000000000216';
 const AP='10000000-0000-4000-8000-000000000217';
 const s={id:S,clientId:C,status:'disponible',deliveryModality:'guiada_en_app',visibleToClient:true,clientVisibilityLevel:'full'};
 const o=(id,date,executionId)=>({id,clientId:C,sessionId:S,localDate:date,timeZone:'America/Santiago',status:'completada',revision:3,appointmentId:AP,executionId});
 const e=(id,occurrenceId)=>({id,clientId:C,sessionId:S,occurrenceId,status:'completada',revision:3,syncStatus:'clean',serverConfirmed:true});
 const input={role:'coach',clientId:C,now:new Date('2026-11-15T16:00:00Z'),sessions:[s],appointments:[{id:AP,clientId:C,sessionId:S,status:'completada'}],occurrences:[o(O1,'2026-11-12',E1),o(O2,'2026-11-13',E2)],executions:[e(E1,O1),e(E2,O2)]};
 const good=buildTraining360DecisionPack(input);
 assert.equal(good.summary.prescriptions,1);assert.equal(good.summary.completedDue,2);assert.equal(good.summary.verifiedAdherencePct,100);
 for(const bad of [{syncStatus:'pending'},{serverConfirmed:false},{occurrenceId:O1}]){
  const broken=buildTraining360DecisionPack({...input,executions:[e(E1,O1),{...e(E2,O2),...bad}]});
  assert.equal(broken.summary.completedDue,1);assert.equal(broken.summary.verifiedAdherencePct,null);assert.equal(broken.needsRecovery.length,1);
 }
});
test('dated reader rejects foreign source snapshot with matching queue and blocks',async()=>{
 const C='10000000-0000-4000-8000-000000000211',S='10000000-0000-4000-8000-000000000212';
 const O='10000000-0000-4000-8000-000000000213',E='10000000-0000-4000-8000-000000000215';
 const queue=[{exerciseId:'squat',sets:2}],blocks=[{id:'b',exerciseId:'squat',sets:2}];
 const p={clientId:C,sessionId:S,queue,blocks};
 const fixture={kind:'private-occurrence',occurrence:{id:O,clientId:C,sessionId:S,appointmentId:O,localDate:'2026-11-11',timeZone:'America/Santiago',status:'en_curso',revision:2,executionId:E},prescriptionSnapshot:p,executionBody:{id:E,clientId:C,sessionId:S,occurrenceId:O,status:'en_curso',revision:1,queue,sourceSnapshot:{...p}}};
 const getAuthContext=async()=>({userId:'10000000-0000-4000-8000-000000000219',clientId:C,role:'client',accessToken:'test-jwt'});
 const read=data=>createOccurrencePrivateReader({enabled:true,getAuthContext,transport:{occurrencePrivateRead:async()=>data}}).read({clientId:C,occurrenceId:O});
 assert.equal((await read(fixture)).executionBody.id,E);
 for(const invalid of [{clientId:'10000000-0000-4000-8000-000000000220'},{sessionId:'10000000-0000-4000-8000-000000000221'}]){
  const changed=structuredClone(fixture);changed.executionBody.sourceSnapshot={...p,...invalid};
  await assert.rejects(read(changed),/U60_PRIVATE_EXECUTION_DRIFT/);
 }
});
