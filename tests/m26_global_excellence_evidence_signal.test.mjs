import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceNumber,currentWearableEvidence} from '../src/m26/domain/evidence-signal.js';
import {buildIberfitDecisionBrief} from '../src/m26/intelligence/decision-brief.js';
import {buildAdherenceWindows} from '../src/m26/engagement/progress-continuity.js';

test('GX06 rejects coercion and non-decimal strings without losing measured zero',()=>{
  for(const value of [null,undefined,true,false,[],[2],{},'', '  ','0x7','0b11','Infinity','NaN',Infinity,NaN]){
    assert.equal(evidenceNumber(value),null,String(value));
  }
  assert.equal(evidenceNumber(0),0);
  assert.equal(evidenceNumber('7.5',{min:1,max:10}),7.5);
  assert.equal(evidenceNumber('1.5',{integer:true}),null);
  assert.equal(evidenceNumber(-1,{min:0}),null);
});
test('GX19 wearable needs eligible current days and a single explicit provider',()=>{
  const wearable={daysWithData:3,decision:{eligible:true,currentEvidenceDays:2,providers:['health_connect']}};
  assert.deepEqual(currentWearableEvidence(wearable),{eligible:true,days:2,availableDays:3,provider:'health_connect',quality:'limitada'});
  for(const decision of [{providers:['a','b']},{providers:[' ']},{currentEvidenceDays:'0x2'},{currentEvidenceDays:4},{eligible:false}]){
    const bad={...wearable,decision:{...wearable.decision,...decision}};
    assert.equal(currentWearableEvidence(bad).days,null);
    assert.equal(buildIberfitDecisionBrief({summary:{wearable:bad}}).signals.some(x=>x.includes('datos actuales de dispositivo')),false);
  }
  assert.equal(currentWearableEvidence(null).availableDays,null);
});
test('GX07 unknown planning does not imply a confirmed absence of sessions',()=>{
  const unknown=buildIberfitDecisionBrief({summary:{averageRpe:'0x7'}});
  assert.match(unknown.nextStep,/Confirmar si existe planificación/u);
  assert.equal(unknown.signals.some(x=>x.includes('RPE medio confirmado')),false);
  const knownEmpty=buildIberfitDecisionBrief({summary:{plannedSessions:0}});
  assert.match(knownEmpty.nextStep,/Revisar la planificación/u);
});
test('GX10 legacy booked count absence stays unknown while real zero stays zero',()=>{
  const state={collections:{}};
  const legacy={clientId:'c1',days:28,plannedSessions:0,completedSessions:0,adherence:null};
  const [unknown]=buildAdherenceWindows(state,'c1',{windows:[28],summaries:{28:legacy}});
  assert.equal(unknown.completedSessions,null);
  assert.equal(unknown.unconfirmedExecutions,null);
  const [known]=buildAdherenceWindows(state,'c1',{windows:[28],summaries:{28:{...legacy,scheduledCompletedSessions:0,unconfirmedExecutions:0}}});
  assert.equal(known.completedSessions,0);
  assert.equal(known.unconfirmedExecutions,0);
  assert.equal(known.adherence,null);
});
