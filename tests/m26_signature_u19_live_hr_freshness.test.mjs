import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveLiveSessionIntelligence,LIVE_SESSION_CURRENT_READING_MAX_AGE_MS} from '../src/m26/intelligence/live-session-intelligence.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';

const NOW=Date.parse('2026-10-20T01:00:00.000Z');
function event(bpm,ageMs=0){
  return {
    schemaVersion:'iberfit.telemetry.v1',eventType:'heart_rate_sample',
    raw:{heartRateBpm:bpm},quality:{grade:'alta',code:'valid'},
    recordedAt:new Date(NOW-ageMs).toISOString(),
    context:{phase:'work',blockId:'b1',exerciseId:'ex',setNumber:1},
  };
}
function telemetry(status,events,extra={}){
  return {liveTelemetry:{status,providerLabel:'Banda de prueba',timeline:{events},...extra}};
}

test('U19: a genuinely fresh connected sample is live and historical metrics remain intact',()=>{
  assert.equal(LIVE_SESSION_CURRENT_READING_MAX_AGE_MS,30000);
  const source=telemetry('connected',[event(120,2000),event(140,500)]);
  const before=structuredClone(source);
  const x=deriveLiveSessionIntelligence(source,{nowMs:NOW});
  assert.equal(x.liveReading.state,'current');
  assert.equal(x.liveReading.currentBpm,140);
  assert.equal(x.liveReading.lastBpm,140);
  assert.equal(x.liveReading.ageSeconds,0);
  assert.equal(x.currentHeartRateBpm,140);
  assert.equal(x.averageHeartRateBpm,130);
  assert.equal(x.timeline.points.length,2);
  assert.deepEqual(source,before,'read-only calculation never alters telemetry');
});

test('U19: disconnect or paused capture keeps history but cannot report current HR',()=>{
  for(const status of ['stopped','paused','error','unavailable','connecting','disconnected']){
    const x=deriveLiveSessionIntelligence(telemetry(status,[event(125,400)]),{nowMs:NOW});
    assert.equal(x.liveReading.state,'not-connected',status);
    assert.equal(x.liveReading.currentBpm,null,status);
    assert.equal(x.liveReading.lastBpm,125,status);
    assert.equal(x.averageHeartRateBpm,125,status);
    assert.equal(x.interpretableEventCount,1,status);
  }
});

test('U19: stale, future or undated sensor values are never announced as current',()=>{
  for(const age of [30001,900000,-6000]){
    const x=deriveLiveSessionIntelligence(telemetry('connected',[event(144,age)]),{nowMs:NOW});
    assert.equal(x.liveReading.state,'stale',String(age));
    assert.equal(x.liveReading.currentBpm,null,String(age));
    assert.equal(x.liveReading.lastBpm,144,String(age));
  }
  const legacy=deriveLiveSessionIntelligence(telemetry('connected',[],{heartRateBpm:115}),{nowMs:NOW});
  assert.equal(legacy.liveReading.state,'undated');
  assert.equal(legacy.liveReading.currentBpm,null);
  assert.equal(legacy.liveReading.lastBpm,115);
  const empty=deriveLiveSessionIntelligence(telemetry('connected',[]),{nowMs:NOW});
  assert.equal(empty.liveReading.state,'no-reading');
  assert.equal(empty.liveReading.currentBpm,null);
});

test('U19: newer direct sensor timestamp wins over retained old timeline data without mixing values',()=>{
  const x=deriveLiveSessionIntelligence(telemetry('connected',[event(115,90000)],{
    heartRateBpm:150,latestAt:new Date(NOW-1500).toISOString(),
  }),{nowMs:NOW});
  assert.equal(x.liveReading.state,'current');
  assert.equal(x.liveReading.currentBpm,150);
  assert.equal(x.liveReading.lastBpm,150);
  assert.equal(x.averageHeartRateBpm,115,'timeline averages are kept historically correct');
  const y=deriveLiveSessionIntelligence(telemetry('connected',[event(115,90000)],{
    heartRateBpm:null,latestAt:new Date(NOW-1500).toISOString(),
  }),{nowMs:NOW});
  assert.equal(y.liveReading.currentBpm,null,'a newer invalid sample cannot revive an old HR reading');
});

function guided(status,ageMs){
  const catalog=createExerciseCatalog([{
    id:'ex',name_es:'Sentadilla guiada',pattern:'sentadilla',
    equipment:'peso corporal',difficulty:'inicial',intent:'fuerza',
    primary_muscles:[],secondary_muscles:[],cues:[],instructions_es:[],
    precautions:[],tags:[],aliases:[],
  }]);
  const session=createSessionDraft({clientId:'u19-client'});
  addCatalogExercise(session,'ex',catalog,{sets:2,reps:'10'});
  const execution=createExecution({session,clientId:session.clientId,executionId:'u19-execution'});
  startExecution(execution,{actor:{role:'coach',id:'u19-coach'}});
  execution.liveTelemetry={status,providerLabel:'Banda de prueba',timeline:{events:[{
    ...event(132,0),
    recordedAt:new Date(Date.now()-ageMs).toISOString(),
  }]}};
  return renderGuidedExecution({execution,session,catalog,role:'coach'});
}

test('U19: Coach mobile/session view never presents disconnected or old HR as live',()=>{
  const disconnected=guided('stopped',400);
  assert.match(disconnected,/FC actual · —/u);
  assert.match(disconnected,/Última FC registrada: 132 lpm/u);
  assert.match(disconnected,/Sin señal en directo/u);
  assert.doesNotMatch(disconnected,/FC actual · 132 lpm/u);
  const stale=guided('connected',90000);
  assert.match(stale,/FC actual · —/u);
  assert.match(stale,/Última FC registrada: 132 lpm/u);
  assert.match(stale,/Esperando una lectura reciente/u);
  assert.doesNotMatch(stale,/FC actual · 132 lpm/u);
  const current=guided('connected',600);
  assert.match(current,/FC actual · 132 lpm/u);
  assert.doesNotMatch(current,/Última FC registrada:/u);
});
