import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  appendCanonicalTelemetryEvent,
  createBoundedTelemetryTimeline,
  telemetryTimelineSummary,
} from '../src/m26/telemetry/bounded-timeline.js';
import {
  createCanonicalHeartRateEvent,
} from '../src/m26/telemetry/canonical-telemetry.js';
import {
  applyLiveTelemetrySample,
  createLiveTelemetryController,
  ingestLiveTelemetrySample,
  liveTelemetrySummary,
} from '../src/m26/wearables/live-telemetry.js';
import {
  buildProgressExecutionCommand,
  createExecution,
  startExecution,
} from '../src/m26/workflows/session-execution.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

const session={
  id:'SESSION-RC59-0B',
  title:'Session RC59.0B',
  blocks:[{
    id:'BLOCK-1',
    type:'exercise',
    exerciseId:'EXERCISE-1',
    sets:3,
    reps:'8',
    restSeconds:60,
    targetRpe:7,
    targetRir:3,
  }],
};

function execution(id='EXEC-RC59-0B'){
  return createExecution({
    session,
    clientId:'CLIENT-1',
    executionId:id,
  });
}

function canonicalEvent({
  eventId,
  receivedAt,
  recordedAt=receivedAt,
  bpm=120,
}){
  const result=createCanonicalHeartRateEvent(
    {
      eventId,
      provider:'ble_direct',
      heartRateBpm:bpm,
      recordedAt,
    },
    {
      execution:execution('EXEC-TIMELINE'),
      receivedAt,
    }
  );
  assert.equal(result.ok,true);
  return result.value;
}

test('RC59.0B timeline acota cantidad conservando eventos mas recientes',()=>{
  const timeline=createBoundedTelemetryTimeline({
    maxEvents:3,
    maxAgeMs:60*60*1000,
  });

  for(let index=0;index<5;index+=1){
    appendCanonicalTelemetryEvent(
      timeline,
      canonicalEvent({
        eventId:`EVENT-${index}`,
        receivedAt:`2026-08-14T20:00:0${index}.000Z`,
        bpm:120+index,
      }),
      {now:new Date('2026-08-14T20:00:10.000Z').getTime()}
    );
  }

  assert.equal(timeline.events.length,3);
  assert.deepEqual(
    timeline.events.map((item)=>item.eventId),
    ['EVENT-2','EVENT-3','EVENT-4']
  );
  assert.equal(timeline.acceptedCount,5);
  assert.equal(timeline.evictedCount,2);
});

test('RC59.0B timeline elimina datos locales fuera de ventana temporal',()=>{
  const timeline=createBoundedTelemetryTimeline({
    maxEvents:10,
    maxAgeMs:60_000,
  });

  appendCanonicalTelemetryEvent(
    timeline,
    canonicalEvent({
      eventId:'EVENT-OLD',
      receivedAt:'2026-08-14T20:00:00.000Z',
    }),
    {now:new Date('2026-08-14T20:00:10.000Z').getTime()}
  );

  appendCanonicalTelemetryEvent(
    timeline,
    canonicalEvent({
      eventId:'EVENT-NEW',
      receivedAt:'2026-08-14T20:02:00.000Z',
    }),
    {now:new Date('2026-08-14T20:02:00.000Z').getTime()}
  );

  assert.deepEqual(
    timeline.events.map((item)=>item.eventId),
    ['EVENT-NEW']
  );
  assert.equal(timeline.evictedCount,1);
});

test('RC59.0B muestra valida alimenta raw timeline y agregados legacy',()=>{
  const current=execution();
  startExecution(current);

  const result=ingestLiveTelemetrySample(
    current,
    {
      provider:'ble_direct',
      providerId:'ble_runtime',
      heartRateBpm:142.6,
      rrIntervalsMs:[720.2,731.8],
      quality:'alta',
      canonicalQuality:'valid',
      contactStatus:'detected',
      deviceType:'chest_strap',
      executionId:current.id,
      sessionId:current.sessionId,
      recordedAt:'2026-08-14T20:10:00.000Z',
    },
    {
      receivedAt:'2026-08-14T20:10:00.100Z',
      transport:'native-webview',
    }
  );

  assert.equal(result.canonicalAccepted,true);
  assert.equal(result.legacyApplied,true);
  assert.equal(current.liveTelemetry.timeline.events.length,1);
  assert.equal(
    current.liveTelemetry.timeline.events[0].raw.heartRateBpm,
    142.6
  );
  assert.equal(current.liveTelemetry.heartRateBpm,143);
  assert.equal(current.liveTelemetry.sampleCount,1);
  assert.equal(
    current.liveTelemetry.timeline.events[0].source.transport,
    'native-webview'
  );
});

test('RC59.0B conserva outlier crudo pero no contamina promedio visual legacy',()=>{
  const current=execution();
  startExecution(current);

  applyLiveTelemetrySample(
    current,
    {
      provider:'ble_direct',
      heartRateBpm:248.375,
      rrIntervalsMs:[201.4,2750.75],
      quality:'limitada',
      canonicalQuality:'out_of_range',
      deviceType:'sensor',
      executionId:current.id,
      sessionId:current.sessionId,
      recordedAt:'2026-08-14T20:11:00.000Z',
    }
  );

  assert.equal(current.liveTelemetry.timeline.events.length,1);
  assert.equal(
    current.liveTelemetry.timeline.events[0].raw.heartRateBpm,
    248.375
  );
  assert.equal(
    current.liveTelemetry.timeline.events[0].quality.code,
    'out_of_range'
  );
  assert.equal(current.liveTelemetry.sampleCount,0);
  assert.equal(current.liveTelemetry.heartRateBpm,null);
});

test('RC59.0B descarta muestra tardia con executionId ajeno',()=>{
  const current=execution('EXEC-CURRENT');
  startExecution(current);

  const result=ingestLiveTelemetrySample(
    current,
    {
      provider:'wear_os_health_services',
      heartRateBpm:135,
      executionId:'EXEC-OLD',
      sessionId:current.sessionId,
    }
  );

  assert.equal(result.canonicalAccepted,false);
  assert.equal(result.legacyApplied,false);
  assert.equal(
    result.reason,
    'M26_LIVE_TELEMETRY_CORRELATION_MISMATCH'
  );
  assert.equal(current.liveTelemetry.timeline.events.length,0);
  assert.equal(current.liveTelemetry.timeline.rejectedCount,1);
  assert.equal(current.liveTelemetry.sampleCount,0);
});

test('RC59.0B controller conserva transport provenance del bridge',async()=>{
  let callback=null;
  const scope={
    IBERFIT_LIVE_TELEMETRY_BRIDGE:{
      provider:'ble_direct',
      transport:'native-webview',
      async start(){
        return {
          provider:'ble_direct',
          transport:'native-webview',
        };
      },
      subscribe(fn){
        callback=fn;
        return ()=>{};
      },
      async stop(){},
    },
  };

  const current=execution('EXEC-BRIDGE');
  startExecution(current);
  const controller=createLiveTelemetryController({scope});

  assert.equal(await controller.start(current),true);

  callback({
    heartRateBpm:128,
    quality:'alta',
    canonicalQuality:'valid',
    deviceType:'chest_strap',
    executionId:current.id,
    sessionId:current.sessionId,
  });

  assert.equal(current.liveTelemetry.timeline.events.length,1);
  assert.equal(
    current.liveTelemetry.timeline.events[0].source.transport,
    'native-webview'
  );

  await controller.stop(current);
});

test('RC59.0B summary expone salud del timeline sin exponer eventos completos',()=>{
  const current=execution();
  startExecution(current);

  applyLiveTelemetrySample(current,{
    provider:'ble_direct',
    heartRateBpm:121,
    executionId:current.id,
    sessionId:current.sessionId,
  });

  const summary=liveTelemetrySummary(current);

  assert.equal(summary.timeline.eventCount,1);
  assert.equal(summary.timeline.acceptedCount,1);
  assert.equal('events' in summary.timeline,false);
});

test('RC59.0B snapshot operativo remoto sigue excluyendo telemetria',()=>{
  const current=execution();
  startExecution(current);

  applyLiveTelemetrySample(current,{
    provider:'ble_direct',
    heartRateBpm:129,
    executionId:current.id,
    sessionId:current.sessionId,
  });

  const command=buildProgressExecutionCommand(current,0);
  const serialized=JSON.stringify(command);

  assert.doesNotMatch(
    serialized,
    /liveTelemetry|telemetry\.v1|heart_rate_sample|timeline/
  );
});

test('RC59.0B no introduce persistencia remota ni decision automatica',()=>{
  const live=read('src/m26/wearables/live-telemetry.js');
  const bounded=read('src/m26/telemetry/bounded-timeline.js');
  const doc=read('docs/RC59_0B_LIVE_INGESTION_BOUNDED_TIMELINE.md');

  assert.doesNotMatch(
    `${live}\n${bounded}`,
    /supabase|rpc\(|fetch\(|localStorage|indexedDB|EJECUCION_TELEMETRIA/iu
  );
  assert.match(doc,/REMOTE_PERSISTENCE_CHANGED=FALSE/u);
  assert.match(doc,/PRESCRIPTION_AUTOMATION_CHANGED=FALSE/u);
});

test('RC59.0B cache versiona nuevo modulo y conserva lineage',()=>{
  const sw=read('public/m26/sw.js');

  assert.match(sw,/VERSION='m26-rc59-0b'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc59-0a'/u);
  assert.match(
    sw,
    /"\/src\/m26\/telemetry\/bounded-timeline\.js"/u
  );
});

test('RC59.0B defaults son bounded y resumen declara capacidad',()=>{
  const current=execution();
  current.liveTelemetry={
    timeline:createBoundedTelemetryTimeline(),
  };

  const summary=telemetryTimelineSummary(
    current.liveTelemetry.timeline
  );

  assert.equal(summary.maxEvents,7200);
  assert.equal(summary.maxAgeMs,6*60*60*1000);
});