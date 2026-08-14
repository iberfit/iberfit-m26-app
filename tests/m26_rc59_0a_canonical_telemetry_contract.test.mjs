import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CANONICAL_TELEMETRY_SCHEMA_VERSION,
  createCanonicalHeartRateEvent,
  telemetryContextFromExecution,
} from '../src/m26/telemetry/canonical-telemetry.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function execution(overrides={}){
  return {
    id:'EXEC-1',
    sessionId:'SESSION-1',
    clientId:'CLIENT-1',
    status:'active',
    queue:[
      {
        blockId:'BLOCK-1',
        exerciseId:'EXERCISE-1',
        sets:3,
      },
    ],
    index:0,
    setIndex:1,
    restUntil:null,
    ...overrides,
  };
}

test('RC59.0A crea evento correlacionado con cliente sesion ejecucion y contexto',()=>{
  const result=createCanonicalHeartRateEvent(
    {
      provider:'ble_direct',
      providerId:'preferred_ble',
      heartRateBpm:148.25,
      rrIntervalsMs:[731.2,744.8],
      quality:'alta',
      canonicalQuality:'valid',
      contactStatus:'detected',
      deviceType:'chest_strap',
      recordedAt:'2026-08-14T19:10:00.000Z',
    },
    {
      execution:execution(),
      receivedAt:'2026-08-14T19:10:00.120Z',
      transport:'native-webview',
    }
  );

  assert.equal(result.ok,true);
  assert.equal(result.value.schemaVersion,CANONICAL_TELEMETRY_SCHEMA_VERSION);
  assert.equal(result.value.clientId,'CLIENT-1');
  assert.equal(result.value.sessionId,'SESSION-1');
  assert.equal(result.value.executionId,'EXEC-1');
  assert.deepEqual(
    result.value.context,
    {
      phase:'work',
      blockId:'BLOCK-1',
      exerciseId:'EXERCISE-1',
      setNumber:2,
    }
  );
});

test('RC59.0A preserva BPM y RR crudos sin recorte fisiologico',()=>{
  const result=createCanonicalHeartRateEvent(
    {
      provider:'ble_direct',
      heartRateBpm:248.375,
      rrIntervalsMs:[201.4,2750.75],
      quality:'limitada',
      canonicalQuality:'out_of_range',
      deviceType:'sensor',
      recordedAt:'2026-08-14T19:11:00.000Z',
    },
    {execution:execution()}
  );

  assert.equal(result.ok,true);
  assert.equal(result.value.raw.heartRateBpm,248.375);
  assert.deepEqual(result.value.raw.rrIntervalsMs,[201.4,2750.75]);
  assert.equal(result.value.quality.code,'out_of_range');
});

test('RC59.0A separa hecho crudo de futuras derivaciones',()=>{
  const result=createCanonicalHeartRateEvent(
    {
      provider:'wear_os_health_services',
      heartRateBpm:132,
      rrIntervalsMs:[],
      quality:'alta',
      canonicalQuality:'valid',
      deviceType:'watch',
    },
    {execution:execution()}
  );

  assert.equal(result.ok,true);
  assert.equal('derived' in result.value,false);
  assert.equal(result.value.provenance.rawPreserved,true);
  assert.equal(Object.isFrozen(result.value),true);
  assert.equal(Object.isFrozen(result.value.raw),true);
  assert.equal(Object.isFrozen(result.value.raw.rrIntervalsMs),true);
});

test('RC59.0A exige correlacion completa y provider canonico',()=>{
  const missingClient=createCanonicalHeartRateEvent(
    {
      provider:'ble_direct',
      heartRateBpm:120,
      sessionId:'SESSION-1',
      executionId:'EXEC-1',
    }
  );

  assert.equal(missingClient.ok,false);
  assert.ok(missingClient.issues.includes('clientId'));

  const badProvider=createCanonicalHeartRateEvent(
    {
      provider:'fabricante_inventado',
      heartRateBpm:120,
    },
    {execution:execution()}
  );

  assert.equal(badProvider.ok,false);
  assert.ok(badProvider.issues.includes('provider'));
});

test('RC59.0A no filtra silenciosamente RR invalidos',()=>{
  const result=createCanonicalHeartRateEvent(
    {
      provider:'ble_direct',
      heartRateBpm:120,
      rrIntervalsMs:[700,-1,710],
    },
    {execution:execution()}
  );

  assert.equal(result.ok,false);
  assert.ok(result.issues.includes('rrIntervalsMs'));
});

test('RC59.0A minimiza identificadores de dispositivo y conserva provenance util',()=>{
  const result=createCanonicalHeartRateEvent(
    {
      provider:'ble_direct',
      providerId:'ble_runtime',
      deviceId:'AA:BB:CC:DD:EE:FF',
      deviceType:'chest_strap',
      heartRateBpm:121,
      quality:'alta',
      canonicalQuality:'valid',
      contactStatus:'detected',
      recordedAt:'2026-08-14T19:12:00.000Z',
    },
    {
      execution:execution(),
      transport:'native-webview',
    }
  );

  assert.equal(result.ok,true);
  assert.equal(result.value.source.deviceType,'chest_strap');
  assert.equal(result.value.source.transport,'native-webview');
  assert.equal(result.value.source.provider,'ble_direct');
  assert.equal(result.value.source.providerId,'ble_runtime');
  assert.equal('deviceId' in result.value.source,false);
  assert.doesNotMatch(JSON.stringify(result.value),/AA:BB:CC:DD:EE:FF/u);
});

test('RC59.0A contexto distingue descanso y no inventa ejercicio',()=>{
  const context=telemetryContextFromExecution(
    execution({
      restUntil:new Date(Date.now()+60_000).toISOString(),
    })
  );

  assert.equal(context.phase,'rest');
  assert.equal(context.exerciseId,'EXERCISE-1');
  assert.equal(context.setNumber,2);

  const empty=telemetryContextFromExecution({
    status:'ready',
    queue:[],
  });

  assert.equal(empty.exerciseId,null);
  assert.equal(empty.setNumber,null);
});

test('RC59.0A queda exportado y precacheado con version nueva',()=>{
  const rootIndex=read('src/m26/index.js');
  const sw=read('public/m26/sw.js');

  assert.match(rootIndex,/export \* from '\.\/telemetry\/index\.js';/u);
  assert.match(sw,/VERSION='m26-rc59-0a'/u);
  assert.match(sw,/PREVIOUS_VERSION='m26-rc58-6'/u);
  assert.match(sw,/"\/src\/m26\/telemetry\/canonical-telemetry\.js"/u);
  assert.match(sw,/"\/src\/m26\/telemetry\/index\.js"/u);
});

test('RC59.0A no conecta persistencia remota antes de definir ingestion',()=>{
  const module=read('src/m26/telemetry/canonical-telemetry.js');
  const doc=read('docs/RC59_0A_CANONICAL_TELEMETRY_CONTRACT.md');

  assert.doesNotMatch(module,/fetch\(|supabase|rpc\(|commandBus|localStorage/iu);
  assert.match(doc,/REMOTE_PERSISTENCE_CHANGED=FALSE/u);
  assert.match(doc,/LIVE_INGESTION_CHANGED=FALSE/u);
  assert.match(doc,/NEXT_PRODUCT_ACTION=RC59_0B_LIVE_INGESTION_BOUNDED_TIMELINE/u);
});