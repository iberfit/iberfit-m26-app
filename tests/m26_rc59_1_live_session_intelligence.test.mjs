import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  deriveLiveSessionIntelligence,
  LIVE_SESSION_INTELLIGENCE_SCHEMA_VERSION,
} from '../src/m26/intelligence/live-session-intelligence.js';
import {createCanonicalHeartRateEvent} from '../src/m26/telemetry/canonical-telemetry.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function canonical({
  eventId,
  bpm,
  at,
  phase='work',
  quality='alta',
  code='valid',
  setNumber=1,
}){
  const execution={
    id:'EXEC-RC591',
    sessionId:'SESSION-RC591',
    clientId:'CLIENT-RC591',
    status:'active',
    queue:[{
      blockId:'BLOCK-A',
      exerciseId:'EX-A',
      sets:2,
    }],
    index:0,
    setIndex:setNumber-1,
    restUntil:
      phase==='rest'
        ?new Date(Date.now()+60*60*1000).toISOString()
        :null,
  };
  const result=createCanonicalHeartRateEvent(
    {
      eventId,
      provider:'ble_direct',
      providerId:'ble-runtime',
      heartRateBpm:bpm,
      quality,
      canonicalQuality:code,
      deviceType:'chest_strap',
      recordedAt:at,
    },
    {
      execution,
      receivedAt:at,
      transport:'native-webview',
    }
  );
  assert.equal(result.ok,true);
  assert.equal(result.value.context.phase,phase);
  return result.value;
}

function executionFixture(){
  const events=[
    canonical({
      eventId:'WORK-1',
      bpm:120,
      at:'2026-08-16T16:00:00.000Z',
    }),
    canonical({
      eventId:'WORK-2',
      bpm:140,
      at:'2026-08-16T16:00:10.000Z',
    }),
    canonical({
      eventId:'RAW-OUTLIER',
      bpm:300,
      at:'2026-08-16T16:00:15.000Z',
      quality:'limitada',
      code:'out_of_range',
    }),
    canonical({
      eventId:'REST-1',
      bpm:138,
      at:'2026-08-16T16:00:20.000Z',
      phase:'rest',
    }),
    canonical({
      eventId:'REST-2',
      bpm:110,
      at:'2026-08-16T16:01:00.000Z',
      phase:'rest',
    }),
  ];

  return {
    id:'EXEC-RC591',
    sessionId:'SESSION-RC591',
    clientId:'CLIENT-RC591',
    status:'active',
    syncStatus:'clean',
    queue:[{
      blockId:'BLOCK-A',
      exerciseId:'EX-A',
      sets:2,
      prescription:{
        reps:'10',
        restSeconds:60,
        tempo:'controlado',
        targetRpe:7,
        targetRir:3,
      },
    }],
    index:0,
    setIndex:0,
    restUntil:new Date(Date.now()+60*1000).toISOString(),
    results:{
      'EX-A:1':{
        exerciseId:'EX-A',
        setNumber:1,
        reps:10,
        seconds:null,
        load:'20 kg',
        rpe:8,
        rir:2,
        completedAt:'2026-08-16T16:00:18.000Z',
      },
    },
    liveTelemetry:{
      status:'connected',
      provider:'ble_direct',
      providerLabel:'Banda BLE',
      heartRateBpm:110,
      averageHeartRateBpm:127,
      minHeartRateBpm:110,
      maxHeartRateBpm:140,
      sampleCount:4,
      heartRateSum:508,
      latestAt:'2026-08-16T16:01:00.000Z',
      quality:'alta',
      timeline:{
        events,
        acceptedCount:5,
        rejectedCount:0,
        evictedCount:0,
      },
    },
  };
}

test('RC59.1 deriva FC actual media maxima y timeline desde eventos interpretables',()=>{
  const execution=executionFixture();
  const intelligence=deriveLiveSessionIntelligence(execution);

  assert.equal(
    intelligence.schemaVersion,
    LIVE_SESSION_INTELLIGENCE_SCHEMA_VERSION
  );
  assert.equal(intelligence.rawEventCount,5);
  assert.equal(intelligence.interpretableEventCount,4);
  assert.equal(intelligence.currentHeartRateBpm,110);
  assert.equal(intelligence.averageHeartRateBpm,127);
  assert.equal(intelligence.maxHeartRateBpm,140);
  assert.equal(intelligence.minHeartRateBpm,110);
  assert.equal(intelligence.timeline.points.length,4);
  assert.equal(
    intelligence.timeline.points.some((point)=>point.bpm===300),
    false
  );
});

test('RC59.1 conserva raw dudoso pero lo excluye de interpretacion derivada',()=>{
  const intelligence=deriveLiveSessionIntelligence(executionFixture());

  assert.equal(intelligence.quality.totalEvents,5);
  assert.equal(intelligence.quality.excludedFromDerived,1);
  assert.equal(intelligence.maxHeartRateBpm,140);
  assert.match(
    intelligence.methodology.qualityFilter,
    /se conservan en raw/u
  );
});

test('RC59.1 resume respuesta por bloque y ejercicio sin cambiar prescripcion',()=>{
  const execution=executionFixture();
  const before=structuredClone(execution.queue);
  const intelligence=deriveLiveSessionIntelligence(execution);

  assert.equal(intelligence.responseByBlockExercise.length,1);
  assert.equal(intelligence.latestResponse.blockId,'BLOCK-A');
  assert.equal(intelligence.latestResponse.exerciseId,'EX-A');
  assert.equal(intelligence.latestResponse.sampleCount,2);
  assert.equal(intelligence.latestResponse.averageBpm,130);
  assert.equal(intelligence.latestResponse.maxBpm,140);
  assert.deepEqual(execution.queue,before);
  assert.equal(
    intelligence.decisionPolicy.automaticPrescriptionChanges,
    false
  );
  assert.equal(
    intelligence.decisionPolicy.coachDecisionRequired,
    true
  );
});

test('RC59.1 calcula recuperacion observada durante descanso sin clasificacion clinica',()=>{
  const intelligence=deriveLiveSessionIntelligence(executionFixture());
  const recovery=intelligence.latestRecovery;

  assert.equal(recovery.available,true);
  assert.equal(recovery.exerciseId,'EX-A');
  assert.equal(recovery.setNumber,1);
  assert.equal(recovery.startBpm,138);
  assert.equal(recovery.latestBpm,110);
  assert.equal(recovery.elapsedSeconds,40);
  assert.equal(recovery.dropBpm,28);
  assert.equal(recovery.direction,'down');
  assert.match(
    intelligence.methodology.recovery,
    /sin clasificación clínica/u
  );
});

test('RC59.1 correlaciona FC de la serie con RPE y RIR registrados',()=>{
  const intelligence=deriveLiveSessionIntelligence(executionFixture());
  const correlation=intelligence.latestSetCorrelation;

  assert.equal(correlation.exerciseId,'EX-A');
  assert.equal(correlation.setNumber,1);
  assert.equal(correlation.rpe,8);
  assert.equal(correlation.rir,2);
  assert.equal(correlation.heartRate.sampleCount,2);
  assert.equal(correlation.heartRate.averageBpm,130);
  assert.equal(correlation.heartRate.maxBpm,140);
  assert.equal(correlation.joinMethod,'exerciseId+setNumber');
});

test('RC59.1 UI muestra metricas timeline recuperacion y RPE RIR con metodo explicito',()=>{
  const execution=executionFixture();
  const session={
    id:'SESSION-RC591',
    title:'Sesión RC59.1',
    blocks:[{
      id:'BLOCK-A',
      type:'exercise',
      exerciseId:'EX-A',
      sets:2,
    }],
  };
  const catalog={
    get(id){
      return id==='EX-A'
        ?{
            id,
            name_es:'Sentadilla',
            pattern:'squat',
            cues:['Controla el movimiento'],
          }
        :null;
    },
    search(){return [];},
  };

  const html=renderGuidedExecution({
    execution,
    session,
    catalog,
    role:'client',
    mediaMap:null,
  });

  assert.match(html,/FC actual/u);
  assert.match(html,/FC media/u);
  assert.match(html,/FC máxima/u);
  assert.match(html,/m26-live-hr-chart/u);
  assert.match(html,/Sentadilla/u);
  assert.match(html,/Descenso observado/u);
  assert.match(html,/28 lpm/u);
  assert.match(html,/RPE 8/u);
  assert.match(html,/RIR 2/u);
  assert.match(html,/Cómo se calcula/u);
  assert.match(html,/entrenador decide/u);
  assert.doesNotMatch(html,/ajusta automáticamente/u);
});

test('RC59.1 PWA versiona la nueva capacidad y conserva lineage C3',()=>{
  const sw=read('public/m26/sw.js');
  const intelligenceIndex=read('src/m26/intelligence/index.js');

  assert.match(sw,/VERSION='m26-rc59-3'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc59-2'/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc59-1/u);
  assert.match(
    sw,
    /Historical compatibility markers retained[^\n]*m26-rc59-0c3/u
  );
  assert.match(
    sw,
    /"\/src\/m26\/intelligence\/live-session-intelligence\.js"/u
  );
  assert.match(
    intelligenceIndex,
    /live-session-intelligence\.js/u
  );
});

test('RC59.1 roadmap cierra live intelligence y abre acquisition historica',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');

  assert.match(
    roadmap,
    /RC59_1=CLOSED_LIVE_SESSION_INTELLIGENCE/u
  );
  assert.match(
    roadmap,
    /RC59_2=SOFTWARE_CLOSED_HISTORICAL_DEVICE_ACQUISITION/u
  );
  assert.match(
    roadmap,
    /RC59_3=CLOSED_LONGITUDINAL_AGGREGATION_LAYER/u
  );
});