import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  TELEMETRY_BATCH_MAX_BYTES,
  TELEMETRY_BATCH_MAX_EVENTS,
  TELEMETRY_OUTBOX_MAX_AGE_MS,
  TELEMETRY_OUTBOX_MAX_EVENTS,
  TELEMETRY_RAW_RETENTION_DAYS,
  buildTelemetryUploadBatches,
  deduplicateTelemetryEvents,
  telemetryEventIdempotencyKey,
  telemetryOutboxStorageKey,
  telemetryPersistencePolicy,
  telemetryRetryDisposition,
} from '../src/m26/telemetry/persistence-contract.js';
import {
  createCanonicalHeartRateEvent,
} from '../src/m26/telemetry/canonical-telemetry.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function event({
  eventId,
  clientId='CLIENT-1',
  sessionId='SESSION-1',
  executionId='EXEC-1',
  bpm=120,
  rrIntervalsMs=[],
  receivedAt='2026-08-14T20:00:00.000Z',
}){
  const result=createCanonicalHeartRateEvent(
    {
      eventId,
      provider:'ble_direct',
      providerId:'ble_runtime',
      heartRateBpm:bpm,
      rrIntervalsMs,
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

test('RC59.0C identidad idempotente depende de cliente y eventId',()=>{
  const first=event({eventId:'EVENT-1'});
  const replay=structuredClone(first);

  assert.equal(
    telemetryEventIdempotencyKey(first),
    telemetryEventIdempotencyKey(replay)
  );
  assert.match(
    telemetryEventIdempotencyKey(first),
    /iberfit\.telemetry\.remote\.v1:CLIENT-1:EVENT-1/u
  );
  assert.match(
    telemetryOutboxStorageKey(first),
    /CLIENT-1:EXEC-1:EVENT-1/u
  );
});

test('RC59.0C deduplica replay sin perder orden temporal',()=>{
  const first=event({
    eventId:'EVENT-1',
    receivedAt:'2026-08-14T20:00:02.000Z',
  });
  const second=event({
    eventId:'EVENT-2',
    receivedAt:'2026-08-14T20:00:01.000Z',
  });

  const output=deduplicateTelemetryEvents([
    first,
    second,
    structuredClone(first),
  ]);

  assert.deepEqual(
    output.map((item)=>item.eventId),
    ['EVENT-2','EVENT-1']
  );
});

test('RC59.0C batching nunca mezcla ejecuciones',()=>{
  const batches=buildTelemetryUploadBatches([
    event({eventId:'A1',executionId:'EXEC-A'}),
    event({eventId:'B1',executionId:'EXEC-B'}),
    event({eventId:'A2',executionId:'EXEC-A',receivedAt:'2026-08-14T20:00:01.000Z'}),
  ]);

  assert.equal(batches.length,3);
  for(const batch of batches){
    assert.equal(
      new Set(batch.payload.events.map((item)=>item.executionId)).size,
      1
    );
  }
});

test('RC59.0C batching respeta maximo de eventos',()=>{
  const input=Array.from({length:205},(_,index)=>
    event({
      eventId:`EVENT-${index}`,
      receivedAt:new Date(
        Date.parse('2026-08-14T20:00:00.000Z')+index*1000
      ).toISOString(),
    })
  );

  const batches=buildTelemetryUploadBatches(input);

  assert.equal(TELEMETRY_BATCH_MAX_EVENTS,100);
  assert.ok(batches.length>=3);
  assert.ok(batches.every((batch)=>batch.eventCount<=100));
});

test('RC59.0C batching respeta presupuesto de bytes',()=>{
  const input=Array.from({length:100},(_,index)=>
    event({
      eventId:`EVENT-${index}`,
      rrIntervalsMs:Array.from({length:128},(_,rr)=>700+rr/10),
      receivedAt:new Date(
        Date.parse('2026-08-14T20:00:00.000Z')+index*1000
      ).toISOString(),
    })
  );

  const batches=buildTelemetryUploadBatches(input);

  assert.equal(TELEMETRY_BATCH_MAX_BYTES,192000);
  assert.ok(
    batches.every((batch)=>batch.byteLength<=TELEMETRY_BATCH_MAX_BYTES)
  );
});

test('RC59.0C policy limita outbox y raw retention',()=>{
  const policy=telemetryPersistencePolicy();

  assert.equal(TELEMETRY_OUTBOX_MAX_EVENTS,20000);
  assert.equal(TELEMETRY_OUTBOX_MAX_AGE_MS,7*24*60*60*1000);
  assert.equal(TELEMETRY_RAW_RETENTION_DAYS,180);
  assert.equal(policy.remote.derivedSeparately,true);
  assert.equal(policy.remote.deviceIdStored,false);
});

test('RC59.0C RLS esperada protege raw frente a Admin operacional',()=>{
  const policy=telemetryPersistencePolicy();

  assert.deepEqual(
    policy.authorization.rawWrite,
    ['client_own','assigned_coach']
  );
  assert.deepEqual(
    policy.authorization.rawRead,
    ['client_own','assigned_coach']
  );
  assert.equal(policy.authorization.adminRawRead,false);
  assert.equal(policy.authorization.adminOperationalMetadata,true);
  assert.equal(
    policy.authorization.roleClaimIsNotAuthorizationSource,
    true
  );
});

test('RC59.0C ACK granular permite borrar solo accepted o duplicate',()=>{
  const policy=telemetryPersistencePolicy();

  assert.deepEqual(
    policy.outbox.removeOnlyAfter,
    ['accepted','duplicate']
  );
  assert.equal(policy.ack.acceptedEventIds,true);
  assert.equal(policy.ack.duplicateEventIds,true);
  assert.equal(policy.ack.rejectedEventIds,true);
  assert.equal(policy.ack.wholeBatchSuccessRequired,false);
});

test('RC59.0C retry distingue fallos terminales de transitorios',()=>{
  for(const status of [400,401,403,404,409,413,422]){
    assert.equal(telemetryRetryDisposition(status),'terminal');
  }
  for(const status of [408,425,429,500,502,503]){
    assert.equal(telemetryRetryDisposition(status),'retry');
  }
});

test('RC59.0C contrato no implementa IO ni reutiliza Command Bus',()=>{
  const source=read('src/m26/telemetry/persistence-contract.js');
  const doc=read('docs/RC59_0C_TELEMETRY_PERSISTENCE_OUTBOX_DESIGN.md');

  assert.doesNotMatch(
    source,
    /fetch\(|supabase|indexedDB|localStorage|createCommandBus|repository\.put/iu
  );
  assert.match(doc,/BACKEND_MUTATION=FALSE/u);
  assert.match(doc,/COMMAND_BUS_REUSED_FOR_SAMPLES=FALSE/u);
});

test('RC59.0C cache versiona contrato y conserva lineage',()=>{
  const sw=read('public/m26/sw.js');

  assert.match(sw,/PREVIOUS_VERSION='m26-rc59-0c-design'/u);
  assert.match(sw,/m26-rc59-0b/u);
  assert.match(sw,/m26-rc59-0a/u);
  assert.doesNotMatch(sw,/const VERSION='m26-rc59-0c-design'/u);
  assert.match(
    sw,
    /"\/src\/m26\/telemetry\/persistence-contract\.js"/u
  );
});