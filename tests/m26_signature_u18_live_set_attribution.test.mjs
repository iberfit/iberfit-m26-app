import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveLiveSessionIntelligence} from '../src/m26/intelligence/live-session-intelligence.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';

function sample(blockId,bpm,second,setNumber=1){
  return {
    schemaVersion:'iberfit.telemetry.v1',
    eventType:'heart_rate_sample',
    recordedAt:new Date(Date.UTC(2026,9,19,18,0,second)).toISOString(),
    raw:{heartRateBpm:bpm},
    quality:{grade:'alta',code:'valid'},
    context:{phase:'work',blockId,exerciseId:'ex',setNumber},
  };
}
function result(rpe,rir,second){
  return {
    exerciseId:'ex',setNumber:1,reps:10,rpe,rir,
    completedAt:new Date(Date.UTC(2026,9,19,18,0,second)).toISOString(),
  };
}
function execution({results,events,queue=[
  {blockId:'block-a',exerciseId:'ex',sets:1},
  {blockId:'block-b',exerciseId:'ex',sets:1},
]}){
  return {queue,results,liveTelemetry:{
    status:'connected',
    timeline:{events},
  }};
}

test('U18: repeated exercise in two blocks never mixes live HR from another block',()=>{
  const source=execution({
    results:{
      'block-a:ex:1':result(7,3,11),
      'block-b:ex:1':result(9,1,31),
    },
    events:[
      sample('block-a',100,1),sample('block-a',120,6),
      sample('block-b',150,21),sample('block-b',160,26),
    ],
  });
  const before=structuredClone(source);
  const intelligence=deriveLiveSessionIntelligence(source);
  assert.equal(intelligence.setCorrelations.length,2);
  const [first,second]=intelligence.setCorrelations;
  assert.equal(first.blockId,'block-a');
  assert.equal(first.heartRate.averageBpm,110);
  assert.equal(first.heartRate.sampleCount,2);
  assert.equal(first.rpe,7);
  assert.equal(first.rir,3);
  assert.equal(second.blockId,'block-b');
  assert.equal(second.heartRate.averageBpm,155);
  assert.equal(second.heartRate.sampleCount,2);
  assert.equal(second.rpe,9);
  assert.equal(second.rir,1);
  assert.equal(second.joinMethod,'blockId+exerciseId+setNumber');
  assert.match(intelligence.methodology.rpeRirCorrelation,/bloque, ejercicio y serie/u);
  assert.deepEqual(source,before,'the original execution and telemetry must remain unchanged');
});

test('U18: legacy first-occurrence result remains attributable without hijacking later block',()=>{
  const intelligence=deriveLiveSessionIntelligence(execution({
    results:{'ex:1':result(8,2,11),'block-b:ex:1':result(7,3,32)},
    events:[sample('block-a',112,1),sample('block-b',170,22)],
  }));
  assert.equal(intelligence.setCorrelations.length,2);
  assert.equal(intelligence.setCorrelations[0].blockId,'block-a');
  assert.equal(intelligence.setCorrelations[0].heartRate.averageBpm,112);
  assert.equal(intelligence.setCorrelations[1].blockId,'block-b');
  assert.equal(intelligence.setCorrelations[1].heartRate.averageBpm,170);
});

test('U18: ambiguous unscoped telemetry does not masquerade as block-specific measurement',()=>{
  const intelligence=deriveLiveSessionIntelligence(execution({
    results:{'block-a:ex:1':result(8,2,11),'block-b:ex:1':result(9,1,32)},
    events:[sample(null,121,1),sample(null,151,22)],
  }));
  assert.equal(intelligence.interpretableEventCount,2,'raw observations stay available');
  assert.equal(intelligence.setCorrelations.length,2);
  for(const correlation of intelligence.setCorrelations){
    assert.equal(correlation.heartRate.sampleCount,0);
    assert.equal(correlation.heartRate.averageBpm,null);
    assert.equal(correlation.joinMethod,'blockId+exerciseId+setNumber');
  }
});

test('U18: absent legacy effort remains absent and ambiguous legacy events are not joined',()=>{
  const intelligence=deriveLiveSessionIntelligence(execution({
    queue:[],
    results:{'ex:1':result('',' ',33)},
    events:[sample('block-a',100,1),sample('block-b',180,20)],
  }));
  assert.equal(intelligence.setCorrelations.length,1);
  const correlation=intelligence.latestSetCorrelation;
  assert.equal(correlation.blockId,null);
  assert.equal(correlation.rpe,null);
  assert.equal(correlation.rir,null);
  assert.equal(correlation.heartRate.sampleCount,0);
  assert.equal(correlation.heartRate.averageBpm,null);
});

test('U18: a single legacy exercise with missing event block can still correlate safely',()=>{
  const intelligence=deriveLiveSessionIntelligence(execution({
    queue:[{blockId:'only-block',exerciseId:'ex',sets:1}],
    results:{'ex:1':result(7,0,11)},
    events:[sample(null,125,1),sample(null,135,6)],
  }));
  assert.equal(intelligence.latestSetCorrelation.blockId,'only-block');
  assert.equal(intelligence.latestSetCorrelation.heartRate.averageBpm,130);
  assert.equal(intelligence.latestSetCorrelation.rir,0,'a real observed RIR=0 is not missing');
});

test('U18: Coach sees an em dash rather than fabricated RPE or RIR zero',()=>{
  const catalog=createExerciseCatalog([{
    id:'ex',name_es:'Ejercicio probado',pattern:'empuje',
    equipment:'peso corporal',difficulty:'inicial',intent:'fuerza',
    primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],
    precautions:[],tags:[],aliases:[],
  }]);
  const session=createSessionDraft({clientId:'u18-client'});
  addCatalogExercise(session,'ex',catalog,{sets:1,reps:'10'});
  const live=createExecution({session,clientId:session.clientId,executionId:'u18-live'});
  startExecution(live,{actor:{role:'coach',id:'u18-coach'}});
  live.results={'ex:1':result('',null,10)};
  live.liveTelemetry={status:'connected',timeline:{events:[]}};
  const html=renderGuidedExecution({execution:live,session,catalog,role:'coach'});
  const card=html.match(/<article class="m26-live-context-card"><span>FC \+ esfuerzo percibido<\/span>[\s\S]*?<\/article>/u)?.[0]||'';
  assert.match(card,/RPE — · RIR — · FC media — · FC máxima —/u);
  assert.doesNotMatch(card,/RPE 0|RIR 0|FC media 0/u);
});
