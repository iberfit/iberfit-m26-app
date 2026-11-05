import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPostSessionSportEvidence} from '../src/m26/workflows/report-sport-evidence.js';
test('sport report fails closed with no workout evidence',()=>{assert.deepEqual(buildPostSessionSportEvidence(null,{}),[]);});
test('running pace uses only measured duration and distance',()=>{
  const execution={clientId:'c1',sport:'running',distanceKm:6.5,durationSeconds:2145};
  const rows=buildPostSessionSportEvidence(execution,{clientId:'c1'});
  assert.equal(rows.length,3);
  assert.equal(rows[2].text,'5:30 min/km');
});
test('swimming report labels a globally measured pace',()=>{
  const row={clientId:'c1',sport:'swimming',distanceMeters:1000,durationSeconds:1800};
  const data=buildPostSessionSportEvidence(row,{clientId:'c1'});
  assert.equal(data[0].text,'1000 m');
  assert.match(data[2].text,/3:00 min/);
});

import {createExecution,startExecution,recordSet,advanceExecution,finishExecution} from '../src/m26/workflows/session-execution.js';
function completeRealSession(sport,observed){
  const names={running:'Carrera suave',swimming:'Natación libre',strength:'Sentadilla'};
  const session={id:'test-session-'+sport,clientId:'c1',
    blocks:[{id:'block-'+sport,type:'exercise',exerciseId:'exercise-'+sport,
      name:names[sport],sets:1,reps:'8',restSeconds:0,targetRpe:7,targetRir:3,
      ...(sport==='running'?{plannedDistanceKm:'15'}:{}),
      ...(sport==='swimming'?{plannedDistanceM:'2000'}:{})}]};
  const execution=createExecution({session,clientId:'c1',executionId:'test-'+sport});
  startExecution(execution);
  recordSet(execution,session,observed);
  advanceExecution(execution);
  finishExecution(execution,{sessionRpe:7,comment:'Sesión completada con datos observados',pain:false});
  return execution;
}
test('Life360 actual M26 running set generates distance and pace from recorded results',()=>{
  const execution=completeRealSession('running',{distanceKm:6.5,durationMinutes:35.8,rpe:7,paceMinPerKm:'05:30'});
  const rows=buildPostSessionSportEvidence(execution,{clientId:'c1'});
  assert.ok(rows.some(row=>row.label==='Distancia realizada'&&row.text==='6.5 km'));
  assert.ok(rows.some(row=>row.label==='Ritmo observado'&&row.text.endsWith('min/km')));
  assert.equal(rows.some(row=>row.text.includes('15 km')),false);
  assert.deepEqual(buildPostSessionSportEvidence(execution,{clientId:'not-c1'}),[]);
});
test('Life360 actual M26 swimming set is measured as metres and per-100m',()=>{
  const execution=completeRealSession('swimming',{distanceM:1000,durationMinutes:30,rpe:7,pacePer100M:'03:00'});
  const rows=buildPostSessionSportEvidence(execution,{clientId:'c1'});
  assert.ok(rows.some(row=>row.label==='Distancia acuática realizada'&&row.text==='1000 m'));
  assert.ok(rows.some(row=>row.label==='Tiempo observado por 100 m'&&row.text.includes('3:00')));
  assert.equal(rows.some(row=>row.text.includes('2000')),false);
});
test('Life360 actual M26 strength set uses observed load string without multiplication',()=>{
  const execution=completeRealSession('strength',{reps:8,load:'10 kg',rpe:7});
  const rows=buildPostSessionSportEvidence(execution,{clientId:'c1'});
  assert.equal(rows.length,1);
  assert.ok(rows[0].text.includes('8 rep'));
  assert.ok(rows[0].text.includes('10 kg'));
  assert.equal(rows[0].text.includes('20 kg'),false);
});
