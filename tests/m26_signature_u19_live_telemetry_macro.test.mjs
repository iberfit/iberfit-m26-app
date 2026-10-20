import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveLiveSessionIntelligence} from '../src/m26/intelligence/live-session-intelligence.js';
import {renderGuidedExecution,renderHeartRateSparkline} from '../src/m26/workflows/session-ui.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';

const NOW=Date.parse('2026-10-20T01:30:00.000Z');
function sample(bpm,at,blockId='block-1',qualityCode='valid'){
  return {
    schemaVersion:'iberfit.telemetry.v1',eventType:'heart_rate_sample',
    recordedAt:new Date(at).toISOString(),
    raw:{heartRateBpm:bpm},quality:{grade:qualityCode==='valid'?'alta':'limitada',code:qualityCode},
    context:{phase:'work',blockId,exerciseId:'ex',setNumber:1},
  };
}

test('U19: a newer rejected wearable sample invalidates current FC but retains truthful session history',()=>{
  const events=[sample(123,NOW-2000),sample(165,NOW-500,'block-1','poor_contact')];
  const source={liveTelemetry:{status:'connected',timeline:{events},heartRateBpm:123,latestAt:new Date(NOW-2000).toISOString()}};
  const before=structuredClone(source);
  const intel=deriveLiveSessionIntelligence(source,{nowMs:NOW});
  assert.equal(intel.liveReading.state,'signal-invalid');
  assert.equal(intel.liveReading.currentBpm,null);
  assert.equal(intel.liveReading.lastBpm,123);
  assert.equal(intel.currentHeartRateBpm,123,'historical intelligence contract remains unchanged');
  assert.equal(intel.averageHeartRateBpm,123);
  assert.equal(intel.interpretableEventCount,1);
  assert.equal(intel.quality.excludedFromDerived,1);
  assert.deepEqual(source,before);
});

test('U19: recovered fresh direct signal does not get blocked by earlier bad raw quality',()=>{
  const events=[sample(123,NOW-10000),sample(170,NOW-4000,'block-1','disconnected')];
  const intel=deriveLiveSessionIntelligence({liveTelemetry:{
    status:'connected',heartRateBpm:135,latestAt:new Date(NOW-300).toISOString(),timeline:{events},
  }},{nowMs:NOW});
  assert.equal(intel.liveReading.state,'current');
  assert.equal(intel.liveReading.currentBpm,135);
  assert.equal(intel.quality.excludedFromDerived,1);
});

test('U19: irregular but continuous sampling uses real elapsed time, not equal false time steps',()=>{
  const points=[
    {bpm:100,at:new Date(NOW-20000).toISOString()},
    {bpm:110,at:new Date(NOW-15000).toISOString()},
    {bpm:120,at:new Date(NOW).toISOString()},
  ];
  const before=structuredClone(points);
  const html=renderHeartRateSparkline(points);
  assert.match(html,/points="0,34 25,19 100,4"/u);
  assert.equal((html.match(/<polyline/gu)||[]).length,1);
  assert.doesNotMatch(html,/Señal interrumpida/u);
  assert.deepEqual(points,before);
});

test('U19: dropouts are explicit gaps, never a fabricated continuous pulse trace',()=>{
  const points=[
    {bpm:110,at:new Date(NOW-75000).toISOString()},
    {bpm:112,at:new Date(NOW-70000).toISOString()},
    {bpm:120,at:new Date(NOW-5000).toISOString()},
    {bpm:125,at:new Date(NOW).toISOString()},
  ];
  const html=renderHeartRateSparkline(points);
  assert.equal((html.match(/<polyline/gu)||[]).length,2,'separate lines across >30s gap');
  assert.match(html,/Señal interrumpida: el gráfico no une periodos sin mediciones/u);
  assert.match(html,/con interrupciones de señal/u);
  const isolated=renderHeartRateSparkline([
    {bpm:110,at:new Date(NOW-70000).toISOString()},
    {bpm:130,at:new Date(NOW).toISOString()},
  ]);
  assert.doesNotMatch(isolated,/<polyline/u);
  assert.equal((isolated.match(/<circle /gu)||[]).length,2);
  assert.doesNotMatch(isolated,/NaN|Infinity/u);
});

function catalog(){
  return createExerciseCatalog([{id:'ex',name_es:'Press guiado',pattern:'empuje',equipment:'mancuernas',
    difficulty:'inicial',intent:'fuerza',primary_muscles:[],secondary_muscles:[],cues:[],
    instructions_es:[],precautions:[],tags:[],aliases:[]}]);
}
test('U19: repeated exercise card identifies its actual block occurrence without exposing raw ID',()=>{
  const items=catalog();
  const session=createSessionDraft({clientId:'client-u19'});
  addCatalogExercise(session,'ex',items,{sets:1,reps:'10'});
  addCatalogExercise(session,'ex',items,{sets:1,reps:'10'});
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-u19'});
  startExecution(execution,{actor:{role:'coach',id:'coach-u19'}});
  assert.equal(execution.queue.length,2);
  const [first,second]=execution.queue;
  const events=[sample(110,NOW-10000,first.blockId),sample(155,NOW-1000,second.blockId)];
  execution.results={[`${second.blockId}:ex:1`]:{
    exerciseId:'ex',setNumber:1,reps:10,rpe:8,rir:2,completedAt:new Date(NOW).toISOString(),
  }};
  execution.liveTelemetry={status:'connected',timeline:{events}};
  const html=renderGuidedExecution({execution,session,catalog:items,role:'coach'});
  assert.match(html,/<strong>[^<]+ · aparición 2 de 2 · serie 1<\/strong>/u);
  assert.match(html,/RPE 8 · RIR 2 · FC media 155 lpm/u);
  assert.doesNotMatch(html,new RegExp(second.blockId+' · serie 1','u'));
});
