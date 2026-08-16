import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  M26_CANONICAL_PROJECT_REF,
  createM26Transport,
} from '../src/m26/supabase-transport.js';
import {createMemoryKeyValueStore} from '../src/m26/platform/key-value-store.js';
import {createCanonicalHeartRateEvent} from '../src/m26/telemetry/canonical-telemetry.js';
import {createTelemetryDurableOutbox} from '../src/m26/telemetry/durable-outbox.js';
import {createTelemetryRemoteSync} from '../src/m26/telemetry/remote-sync.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const CLIENT_ID='11111111-1111-4111-8111-111111111111';

function canonical({
  eventId,
  bpm=120,
  clientId=CLIENT_ID,
  sessionId='SESSION-C3',
  executionId='EXEC-C3',
  receivedAt='2026-08-15T20:00:00.000Z',
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

function ackForPayload(
  payload,
  {
    accepted=payload.events.map((event)=>event.eventId),
    duplicate=[],
    rejected=[],
    rejectedReasons={},
  }={}
){
  return {
    ok:true,
    schemaVersion:'iberfit.telemetry.remote.v1',
    clientId:payload.clientId,
    sessionId:payload.sessionId,
    executionId:payload.executionId,
    acceptedEventIds:accepted,
    duplicateEventIds:duplicate,
    rejectedEventIds:rejected,
    rejectedReasons,
    received:payload.events.length,
    accepted:accepted.length,
    duplicate:duplicate.length,
    rejected:rejected.length,
  };
}

function mockResponse(payload,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{
      get(name){
        return String(name).toLowerCase()==='content-type'
          ?'application/json'
          :null;
      },
    },
    async json(){return payload;},
    async text(){return JSON.stringify(payload);},
  };
}

test('RC59.0C3 transporte usa RPC canonico con JWT y p_payload exacto',async()=>{
  const calls=[];
  const payload={
    schemaVersion:'iberfit.telemetry.remote.v1',
    clientId:CLIENT_ID,
    sessionId:'SESSION-C3',
    executionId:'EXEC-C3',
    events:[canonical({eventId:'TRANSPORT-1'})],
  };
  const expectedAck=ackForPayload(payload);

  const transport=createM26Transport(
    {
      enabled:true,
      projectRef:M26_CANONICAL_PROJECT_REF,
      url:'http://127.0.0.1:54321',
      publishableKey:'publishable-test-key',
      timeoutMs:5000,
    },
    {
      fetchImpl:async(url,options)=>{
        calls.push({url,options});
        return mockResponse(expectedAck);
      },
    }
  );

  const result=await transport.importTelemetryBatch(
    'authenticated-user-token',
    payload
  );

  assert.equal(result.ok,true);
  assert.equal(calls.length,1);
  assert.equal(
    calls[0].url,
    'http://127.0.0.1:54321/rest/v1/rpc/m26_telemetry_import_v59'
  );
  assert.equal(
    calls[0].options.headers.authorization,
    'Bearer authenticated-user-token'
  );
  assert.deepEqual(
    JSON.parse(calls[0].options.body),
    {p_payload:payload}
  );
});

test('RC59.0C3 ACK granular elimina accepted/duplicate y conserva rejected terminal',async()=>{
  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-C3',
    storage:createMemoryKeyValueStore(),
  });
  for(const id of ['A','B','C']){
    await outbox.stage(canonical({eventId:id}));
  }

  const sync=createTelemetryRemoteSync({
    outbox,
    getToken:async()=> 'token',
    transport:{
      async importTelemetryBatch(_token,payload){
        return ackForPayload(
          payload,
          {
            accepted:['A'],
            duplicate:['B'],
            rejected:['C'],
            rejectedReasons:{C:'M26_C3_TEST_REJECTED'},
          }
        );
      },
    },
  });

  const result=await sync.flush();
  assert.equal(result.ok,true);
  assert.equal(result.accepted,1);
  assert.equal(result.duplicate,1);
  assert.equal(result.rejected,1);

  const summary=await outbox.summary();
  assert.equal(summary.totalCount,1);
  assert.equal(summary.pendingCount,0);
  assert.equal(summary.terminalCount,1);

  const rejected=await outbox.get(CLIENT_ID,'C');
  assert.equal(rejected.status,'terminal');
  assert.equal(rejected.lastErrorCode,'M26_C3_TEST_REJECTED');
});

test('RC59.0C3 error 503 conserva evento, incrementa intento y respeta backoff',async()=>{
  let now=Date.parse('2026-08-15T20:00:00.000Z');
  let fail=true;
  const timers=[];

  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-C3',
    storage:createMemoryKeyValueStore(),
    now:()=>now,
  });
  await outbox.stage(canonical({eventId:'RETRY-1'}));

  const sync=createTelemetryRemoteSync({
    outbox,
    now:()=>now,
    getToken:async()=> 'token',
    setTimer:(fn,delay)=>{
      const item={fn,delay,cleared:false};
      timers.push(item);
      return item;
    },
    clearTimer:(item)=>{
      if(item)item.cleared=true;
    },
    transport:{
      async importTelemetryBatch(_token,payload){
        if(fail){
          throw Object.assign(new Error('M26_TEST_NETWORK'),{status:503});
        }
        return ackForPayload(payload);
      },
    },
  });

  const first=await sync.flush();
  assert.equal(first.ok,false);
  assert.equal(first.status,503);
  assert.equal(first.disposition,'retry');

  const retained=await outbox.get(CLIENT_ID,'RETRY-1');
  assert.equal(retained.status,'pending');
  assert.equal(retained.attempts,1);
  assert.ok(Date.parse(retained.nextRetryAt)>now);
  assert.ok(timers.some((item)=>item.delay>=250));

  now=Date.parse(retained.nextRetryAt);
  fail=false;
  const second=await sync.flush();
  assert.equal(second.ok,true);
  assert.equal((await outbox.summary()).totalCount,0);
});

test('RC59.0C3 ACK incompleto nunca borra silenciosamente el evento',async()=>{
  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-C3',
    storage:createMemoryKeyValueStore(),
  });
  await outbox.stage(canonical({eventId:'ACK-GAP'}));

  const sync=createTelemetryRemoteSync({
    outbox,
    getToken:async()=> 'token',
    setTimer:()=>1,
    clearTimer:()=>{},
    transport:{
      async importTelemetryBatch(_token,payload){
        return ackForPayload(
          payload,
          {accepted:[],duplicate:[],rejected:[]}
        );
      },
    },
  });

  const result=await sync.flush();
  assert.equal(result.ok,false);
  assert.equal(result.errorCode,'M26_TELEMETRY_ACK_INCOMPLETE');

  const record=await outbox.get(CLIENT_ID,'ACK-GAP');
  assert.equal(record.status,'pending');
  assert.equal(record.attempts,1);
});

test('RC59.0C3 flush concurrente es single-flight',async()=>{
  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-C3',
    storage:createMemoryKeyValueStore(),
  });
  await outbox.stage(canonical({eventId:'SINGLE-FLIGHT'}));

  let calls=0;
  let release;
  const transport={
    async importTelemetryBatch(_token,payload){
      calls+=1;
      await new Promise((resolve)=>{
        release=resolve;
      });
      return ackForPayload(payload);
    },
  };

  const sync=createTelemetryRemoteSync({
    outbox,
    transport,
    getToken:async()=> 'token',
  });

  const first=sync.flush();
  const second=sync.flush();
  assert.equal(first,second);

  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(calls,1);
  release();
  await first;
  assert.equal(calls,1);
  assert.equal((await outbox.summary()).totalCount,0);
});

test('RC59.0C3 backlog offline sube al volver online',async()=>{
  let online=false;
  let calls=0;
  const target=new EventTarget();

  const outbox=createTelemetryDurableOutbox({
    ownerId:'USER-C3',
    storage:createMemoryKeyValueStore(),
  });
  await outbox.stage(canonical({eventId:'RECONNECT-1'}));

  const sync=createTelemetryRemoteSync({
    outbox,
    isOnline:()=>online,
    getToken:async()=> 'token',
    transport:{
      async importTelemetryBatch(_token,payload){
        calls+=1;
        return ackForPayload(payload);
      },
    },
  });

  const stop=sync.start({target});
  await new Promise((resolve)=>setTimeout(resolve,5));
  assert.equal(calls,0);
  assert.equal((await outbox.summary()).pendingCount,1);

  online=true;
  target.dispatchEvent(new Event('online'));
  await new Promise((resolve)=>setTimeout(resolve,20));

  assert.equal(calls,1);
  assert.equal((await outbox.summary()).totalCount,0);
  stop();
});

test('RC59.0C3 app dispara sync tras stage, login y reconexion sin acoplar outbox a red',()=>{
  const app=read('src/m26/app/application.js');
  const controller=read('src/m26/workflows/session-controller.js');
  const live=read('src/m26/wearables/live-telemetry.js');
  const outbox=read('src/m26/telemetry/durable-outbox.js');
  const telemetryIndex=read('src/m26/telemetry/index.js');
  const sw=read('public/m26/sw.js');

  assert.match(app,/createTelemetryRemoteSync/u);
  assert.match(app,/telemetryRemoteSync=createTelemetryRemoteSync/u);
  assert.match(app,/telemetrySyncStop=telemetryRemoteSync\.start\(\)/u);
  assert.match(controller,/telemetryRemoteSync/u);
  assert.match(live,/onOutboxStaged/u);
  assert.match(live,/M26_TELEMETRY_REMOTE_SYNC_TRIGGER_FAILED/u);
  assert.doesNotMatch(outbox,/fetch\(|supabase|rpc\(|importTelemetryBatch/iu);
  assert.match(telemetryIndex,/remote-sync\.js/u);
  assert.match(sw,/VERSION='m26-rc59-0c3'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc59-0c1'/u);
  assert.match(sw,/"\/src\/m26\/telemetry\/remote-sync\.js"/u);
});

test('RC59.0C3 backend canonico conserva limites y ACK contractual',()=>{
  const baseline=read(
    'supabase/migrations/20260815195022_RECOVERED_CURRENT_PRODUCTION_BASELINE.sql'
  );
  assert.match(baseline,/m26_telemetry_import_v59/u);
  assert.match(baseline,/jsonb_array_length\(v_events\) > 100/u);
  assert.match(baseline,/v_payload_bytes > 192000/u);
  for(const field of [
    'acceptedEventIds',
    'duplicateEventIds',
    'rejectedEventIds',
    'rejectedReasons',
  ]){
    assert.ok(baseline.includes(`'${field}'`));
  }
  assert.match(
    baseline,
    /GRANT ALL ON FUNCTION public\.m26_telemetry_import_v59\(jsonb\) TO authenticated/u
  );
});
