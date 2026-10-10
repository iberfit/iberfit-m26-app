import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {buildNextSessionPreparation} from '../src/m26/intelligence/next-session-prep.js';
import {renderSessionsRoute} from '../src/m26/modules/route-render.js';

const CLIENT='client-coach-device-evidence';
const NOW=new Date('2026-10-10T12:00:00.000Z');

function record({clientId=CLIENT,provider='health_connect',date='2026-10-10',metrics={steps:8000}}={}){
  return {
    clientId,provider,date,
    sourceUpdatedAt:null,quality:'limitada',
    ...metrics,
  };
}
function state(rows=[]){
  return {
    pendingOperations:[],conflicts:[],rejectedOperations:[],
    collections:{
      clients:[],appointments:[],sessions:[],sessionExecutions:[],
      checkins:[],iriAssessments:[],trainingCycles:[],m26Entities:[],
      wearableDailySummaries:rows,
    },
  };
}
function render(prep){
  return renderSessionsRoute({
    kind:'sesion',role:'coach',clientId:CLIENT,serviceKind:'training',
    canBuild:true,serviceActive:true,sessions:[],executions:[],
    sessionCounts:{published:0},nextSessionPreparation:prep,
  });
}

test('Coach receives permitted recent daily activity automatically without altering sessions',()=>{
  const data=state([
    record({date:'2026-10-10',metrics:{steps:6000,sleepMinutes:450,restingHeartRate:58}}),
    record({date:'2026-10-09',metrics:{steps:10000,sleepMinutes:420,restingHeartRate:62}}),
  ]);
  const before=structuredClone(data);
  const prep=buildNextSessionPreparation(data,CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'recent');
  assert.equal(prep.deviceContext.recentDays,2);
  assert.deepEqual(prep.deviceContext.metrics,{
    steps:8000,sleepMinutes:435,restingHeartRate:60,
  });
  const html=render(prep);
  assert.match(html,/data-next-session-device-context/u);
  assert.match(html,/Pasos diarios/u);
  assert.match(html,/8000/u);
  assert.match(html,/7 h 15 min/u);
  assert.match(html,/60 lpm/u);
  assert.match(html,/No son mediciones en directo ni acreditan una conexión automática/u);
  assert.equal(prep.safety.automaticLoadChange,false);
  assert.equal(prep.safety.automaticExerciseChange,false);
  assert.deepEqual(data,before);
});

test('historical device records remain historical and do not imply current readiness',()=>{
  const prep=buildNextSessionPreparation(state([
    record({date:'2026-10-05',metrics:{steps:12000,sleepMinutes:480}}),
  ]),CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'historical');
  assert.equal(prep.deviceContext.metrics,null);
  const html=render(prep);
  assert.match(html,/ninguno sirve como contexto reciente/u);
  assert.doesNotMatch(html,/12000/u);
  assert.doesNotMatch(html,/8 h 00 min/u);
});

test('multiple devices never sum or average overlapping activity',()=>{
  const prep=buildNextSessionPreparation(state([
    record({provider:'health_connect',metrics:{steps:9000}}),
    record({provider:'apple_health',metrics:{steps:11000}}),
  ]),CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'multiple-sources');
  assert.equal(prep.deviceContext.metrics,null);
  const html=render(prep);
  assert.match(html,/Fuentes recientes superpuestas/u);
  assert.doesNotMatch(html,/20000/u);
  assert.doesNotMatch(html,/9000|11000/u);
});

test('cross-client records do not surface and missing metrics never turn into zero',()=>{
  const prep=buildNextSessionPreparation(state([
    record({clientId:'someone-else',metrics:{steps:99999,sleepMinutes:750}}),
    record({metrics:{restingHeartRate:55}}),
  ]),CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'recent');
  assert.equal(prep.deviceContext.metrics.steps,null);
  assert.equal(prep.deviceContext.metrics.sleepMinutes,null);
  assert.equal(prep.deviceContext.metrics.restingHeartRate,55);
  const html=render(prep);
  assert.match(html,/55 lpm/u);
  assert.doesNotMatch(html,/99999|12 h 30 min|Pasos diarios/u);
});

test('without records no device element is added and the Client has no Coach prep',()=>{
  const prep=buildNextSessionPreparation(state([]),CLIENT,{now:NOW});
  assert.equal(prep.deviceContext.status,'missing');
  assert.doesNotMatch(render(prep),/data-next-session-device-context/u);
  const route=readFileSync(new URL('../src/m26/modules/route-view-model.js',import.meta.url),'utf8');
  assert.match(route,/clientId&&trainingActive&&\['admin','coach'\]\.includes\(role\)/u);
  const renderSource=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(renderSource,/escapeHtml\(description\)/u);
  assert.match(renderSource,/escapeHtml\(value\)/u);
});
