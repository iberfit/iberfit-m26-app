import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIberfitDecisionBrief} from '../src/m26/intelligence/decision-brief.js';
import {__nextSessionPreparationInternals} from '../src/m26/intelligence/next-session-prep.js';
import {buildPeriodizationSnapshot} from '../src/m26/planning/periodization-workbench.js';

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
