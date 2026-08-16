import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createMemoryKeyValueStore,
} from '../src/m26/platform/key-value-store.js';
import {
  createCanonicalHeartRateEvent,
} from '../src/m26/telemetry/canonical-telemetry.js';
import {
  createTelemetryDurableOutbox,
} from '../src/m26/telemetry/durable-outbox.js';
import {
  createLiveTelemetryController,
} from '../src/m26/wearables/live-telemetry.js';
import {
  createExecution,
  startExecution,
} from '../src/m26/workflows/session-execution.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function canonical({
  eventId,
  clientId='CLIENT-1',
  sessionId='SESSION-1',
  executionId='EXEC-1',
  bpm=120,
  receivedAt='2026-08-14T20:00:00.000Z',
}){
  const result=createCanonicalHeartRateEvent(
    {
      eventId,
      provider:'ble_direct',
      providerId:'ble_runtime',
      heartRateBpm:bpm,
      quality:'alta',
      canonicalQuality:'valid',
      deviceType:'chest_strap',
      recordedAt:receivedAt,
    },
    {
      clientId,
      sessionId,
      executionId,
      receivedAt,
      transport:'native-webview',
    }
  );
  assert.equal(result.ok,true);
  return result.value;
}

const session={
  id:'SESSION-LIVE',
  title:'RC59.0C1',
  blocks:[{
    id:'BLOCK-1',
    type:'exercise',
    exerciseId:'EXERCISE-1',
    sets:2,
    reps:'8',
    restSeconds:60,
  }],
};

test('RC59.0C1 outbox aisla propietarios sobre el mismo storage',async()=>{
  const storage=createMemoryKeyValueStore();
  const first=createTelemetryDurableOutbox({
    ownerId:'USER-A',
    storage,
  });
  const second=createTelemetryDurableOutbox({
    ownerId:'USER-B',
    storage,
  });

  await first.stage(canonical({eventId:'EVENT-1'}));

  assert.equal((await first.summary()).totalCount,1);
  assert.equal((await second.summary()).totalCount,0);
});

test('RC59.0C1 replay identico es idempotente y colision distinta falla',async()=>{
  const storage=createMemoryKeyValueStore();
  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-A',
    storage,
  });
  const first=canonical({eventId:'EVENT-1',bpm:120});

  const staged=await outbox.stage(first);
  const replay=await outbox.stage(structuredClone(first));

  assert.equal(staged.staged,true);
  assert.equal(replay.duplicate,true);
  assert.equal((await outbox.summary()).totalCount,1);

  await assert.rejects(
    ()=>outbox.stage(canonical({eventId:'EVENT-1',bpm:130})),
    /M26_TELEMETRY_EVENT_ID_COLLISION/
  );
});

test('RC59.0C1 sobrevive recreacion de repositorio crash replay',async()=>{
  const storage=createMemoryKeyValueStore();
  const before=createTelemetryDurableOutbox({
    ownerId:'USER-A',
    storage,
  });

  await before.stage(canonical({eventId:'EVENT-CRASH'}));

  const after=createTelemetryDurableOutbox({
    ownerId:'USER-A',
    storage,
  });

  assert.equal((await after.summary()).pendingCount,1);
  assert.equal(
    (await after.pending())[0].event.eventId,
    'EVENT-CRASH'
  );
});

test('RC59.0C1 ACK granular borra accepted duplicate y retiene rejected terminal',async()=>{
  const storage=createMemoryKeyValueStore();
  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-A',
    storage,
  });

  for(const id of ['A','B','C']){
    await outbox.stage(canonical({eventId:id}));
  }

  const [batch]=await outbox.batches();

  const result=await outbox.applyBatchAck(
    batch,
    {
      acceptedEventIds:['A'],
      duplicateEventIds:['B'],
      rejectedEventIds:['C'],
      rejectedReasons:{
        C:'M26_TEST_REJECTED',
      },
    }
  );

  assert.equal(result.removed,2);
  assert.equal(result.terminal,1);

  const summary=await outbox.summary();
  assert.equal(summary.totalCount,1);
  assert.equal(summary.pendingCount,0);
  assert.equal(summary.terminalCount,1);

  const rejected=await outbox.get('CLIENT-1','C');
  assert.equal(rejected.status,'terminal');
  assert.equal(rejected.lastErrorCode,'M26_TEST_REJECTED');
});

test('RC59.0C1 retry aplica backoff y no ofrece batch antes de due',async()=>{
  let now=Date.parse('2026-08-14T20:00:00.000Z');
  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-A',
    storage:createMemoryKeyValueStore(),
    now:()=>now,
  });

  await outbox.stage(canonical({eventId:'EVENT-RETRY'}));
  const [batch]=await outbox.batches();

  const failed=await outbox.markBatchFailure(
    batch,
    {
      status:503,
      errorCode:'M26_NETWORK',
    }
  );

  assert.equal(failed.disposition,'retry');
  assert.equal((await outbox.batches()).length,0);

  const record=await outbox.get('CLIENT-1','EVENT-RETRY');
  assert.equal(record.attempts,1);
  assert.ok(Date.parse(record.nextRetryAt)>now);

  now=Date.parse(record.nextRetryAt);
  assert.equal((await outbox.batches()).length,1);
});

test('RC59.0C1 error terminal no vuelve a cola retry',async()=>{
  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-A',
    storage:createMemoryKeyValueStore(),
  });

  await outbox.stage(canonical({eventId:'EVENT-403'}));
  const [batch]=await outbox.batches();

  const failed=await outbox.markBatchFailure(
    batch,
    {
      status:403,
      errorCode:'M26_FORBIDDEN',
    }
  );

  assert.equal(failed.disposition,'terminal');
  assert.equal((await outbox.batches()).length,0);
  assert.equal((await outbox.summary()).terminalCount,1);
});

test('RC59.0C1 expira backlog antiguo y capacidad no descarta pending silenciosamente',async()=>{
  let now=Date.parse('2026-08-14T20:00:00.000Z');
  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-A',
    storage:createMemoryKeyValueStore(),
    now:()=>now,
    maxEvents:2,
    maxAgeMs:60_000,
  });

  await outbox.stage(canonical({eventId:'OLD-1'}));
  await outbox.stage(canonical({eventId:'OLD-2'}));

  await assert.rejects(
    ()=>outbox.stage(canonical({eventId:'OVERFLOW'})),
    /M26_TELEMETRY_OUTBOX_CAPACITY_EXCEEDED/
  );

  assert.equal((await outbox.summary()).pendingCount,2);

  now+=61_000;
  const pruned=await outbox.prune();

  assert.equal(pruned.expired,2);
  assert.equal((await outbox.summary()).totalCount,0);
});

test('RC59.0C1 controller live stagea evento canonico durable',async()=>{
  let callback=null;
  const storage=createMemoryKeyValueStore();
  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-A',
    storage,
  });

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

  const execution=createExecution({
    session,
    clientId:'CLIENT-1',
    executionId:'EXEC-LIVE',
  });
  startExecution(execution);

  const controller=createLiveTelemetryController({
    scope,
    telemetryOutbox:outbox,
  });

  assert.equal(await controller.start(execution),true);

  callback({
    provider:'ble_direct',
    heartRateBpm:133.7,
    quality:'alta',
    canonicalQuality:'valid',
    deviceType:'chest_strap',
    executionId:execution.id,
    sessionId:execution.sessionId,
    recordedAt:'2026-08-14T20:10:00.000Z',
  });

  await controller.awaitTelemetryStaging();

  const summary=await outbox.summary();
  assert.equal(summary.pendingCount,1);

  const [record]=await outbox.pending();
  assert.equal(record.event.raw.heartRateBpm,133.7);
  assert.equal(record.event.executionId,'EXEC-LIVE');

  await controller.stop(execution);
});

test('RC59.0C1 fallo de outbox no rompe sesion live',async()=>{
  let callback=null;
  const diagnostics=[];

  const scope={
    IBERFIT_LIVE_TELEMETRY_BRIDGE:{
      provider:'ble_direct',
      async start(){return {provider:'ble_direct'};},
      subscribe(fn){
        callback=fn;
        return ()=>{};
      },
      async stop(){},
    },
  };

  const execution=createExecution({
    session,
    clientId:'CLIENT-1',
    executionId:'EXEC-FAILSAFE',
  });
  startExecution(execution);

  const controller=createLiveTelemetryController({
    scope,
    telemetryOutbox:{
      async stage(){
        throw new Error('M26_FAKE_STORAGE_FAILURE');
      },
    },
    onDiagnostic:(code)=>diagnostics.push(code),
  });

  assert.equal(await controller.start(execution),true);

  callback({
    provider:'ble_direct',
    heartRateBpm:140,
    executionId:execution.id,
    sessionId:execution.sessionId,
  });

  await controller.awaitTelemetryStaging();

  assert.equal(execution.liveTelemetry.heartRateBpm,140);
  assert.equal(execution.liveTelemetry.timeline.events.length,1);
  assert.ok(
    diagnostics.includes('M26_TELEMETRY_OUTBOX_STAGE_FAILED')
  );

  await controller.stop(execution);
});

test('RC59.0C1 mantiene outbox aislado y cablea sync remoto fuera del outbox',()=>{
  const app=read('src/m26/app/application.js');
  const controller=read('src/m26/workflows/session-controller.js');
  const outbox=read('src/m26/telemetry/durable-outbox.js');

  assert.match(
    app,
    /telemetryOutbox=createTelemetryDurableOutbox\(\{ownerId\}\)/u
  );
  assert.match(
    app,
    /createSessionController\(\{root,telemetryOutbox,telemetryRemoteSync,getContext:/u
  );
  assert.match(
    controller,
    /createLiveTelemetryController\(\{scope:globalThis,onUpdate:\(\)=>render\?\.\(\),onDiagnostic:\(\)=>\{\},telemetryOutbox,onOutboxStaged:/u
  );
  assert.doesNotMatch(
    outbox,
    /fetch\(|supabase|rpc\(|createCommandBus/iu
  );
});

test('RC59.0C1 usa DB separada y cache versionada',()=>{
  const outbox=read('src/m26/telemetry/durable-outbox.js');
  const sw=read('public/m26/sw.js');

  assert.match(outbox,/dbName:'iberfit-m26-telemetry'/u);
  assert.match(outbox,/storeName:'outbox_v1'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc59-0c1'/u);
  assert.match(sw,/Historical compatibility markers retained[^\n]*m26-rc59-0c1/u);
  assert.match(
    sw,
    /"\/src\/m26\/telemetry\/durable-outbox\.js"/u
  );
});