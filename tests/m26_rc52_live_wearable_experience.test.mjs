import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_TELEMETRY_PROVIDERS,
  createLiveTelemetryController,
  createLiveTelemetryState,
  normalizeLiveTelemetrySample,
  applyLiveTelemetrySample,
  liveTelemetrySummary,
} from '../src/m26/wearables/live-telemetry.js';
import {
  createExecution,
  startExecution,
  buildProgressExecutionCommand,
} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const session={
  id:'S-RC52',
  title:'Sesión RC52',
  blocks:[{
    id:'B1',
    type:'exercise',
    exerciseId:'EX1',
    sets:2,
    reps:'8–10',
    restSeconds:60,
    tempo:'controlado',
    targetRpe:7,
    targetRir:3,
  }],
};
const catalog={
  get(id){return id==='EX1'?{id:'EX1',name_es:'Sentadilla',pattern:'sentadilla',cues:['Controla el movimiento']}:null;},
  search(){return [];},
};

test('RC52 reserva la telemetría en vivo para Apple Watch, Wear OS y BLE',()=>{
  assert.deepEqual(
    [...LIVE_TELEMETRY_PROVIDERS],
    ['apple_health','wear_os_health_services','ble_direct']
  );
  assert.equal(LIVE_TELEMETRY_PROVIDERS.includes('health_connect'),false);
});

test('RC52 normaliza FC y conserva RR sin fabricar VFC',()=>{
  const sample=normalizeLiveTelemetrySample({
    provider:'ble',
    heartRateBpm:132.4,
    rrIntervalsMs:[810,790,10,5000],
    quality:'alta',
    recordedAt:'2026-08-10T16:00:00Z',
  });
  assert.equal(sample.ok,true);
  assert.equal(sample.value.provider,'ble_direct');
  assert.equal(sample.value.heartRateBpm,132);
  assert.deepEqual(sample.value.rrIntervalsMs,[810,790]);
  assert.equal('vfcMs' in sample.value,false);
  assert.equal('hrvMs' in sample.value,false);
});

test('RC52 telemetría no modifica cola, prescripción ni RPE/RIR',()=>{
  const execution=createExecution({session,clientId:'C1',executionId:'E1'});
  const before=structuredClone(execution.queue);
  applyLiveTelemetrySample(execution,{
    provider:'wear_os_health_services',
    heartRateBpm:145,
    quality:'media',
  });
  assert.deepEqual(execution.queue,before);
  assert.equal(execution.queue[0].prescription.targetRpe,7);
  assert.equal(execution.queue[0].prescription.targetRir,3);
  assert.equal(execution.liveTelemetry.heartRateBpm,145);
});

test('RC52 resume FC sin convertir intervalos RR en VFC',()=>{
  const execution=createExecution({session,clientId:'C1',executionId:'E2'});
  execution.liveTelemetry=createLiveTelemetryState();
  applyLiveTelemetrySample(execution,{provider:'apple_health',heartRateBpm:120,quality:'alta'});
  applyLiveTelemetrySample(execution,{provider:'apple_health',heartRateBpm:140,quality:'alta'});
  const summary=liveTelemetrySummary(execution);
  assert.equal(summary.averageHeartRateBpm,130);
  assert.equal(summary.minHeartRateBpm,120);
  assert.equal(summary.maxHeartRateBpm,140);
  assert.equal(summary.sampleCount,2);
  assert.equal('vfcMs' in summary,false);
});

test('RC52 bridge nativo inicia, pausa, reanuda y detiene sin bloquear sesión',async()=>{
  let callback=null;
  const calls=[];
  const scope={IBERFIT_LIVE_TELEMETRY_BRIDGE:{
    provider:'ble_direct',
    async start(payload){calls.push(['start',payload.executionId]);return {provider:'ble_direct'};},
    subscribe(fn){callback=fn;calls.push(['subscribe']);return ()=>calls.push(['unsubscribe']);},
    async pause(payload){calls.push(['pause',payload.executionId]);},
    async resume(payload){calls.push(['resume',payload.executionId]);},
    async stop(payload){calls.push(['stop',payload.executionId]);},
  }};
  const execution=createExecution({session,clientId:'C1',executionId:'E3'});
  const controller=createLiveTelemetryController({scope});
  assert.equal(await controller.start(execution),true);
  callback({heartRateBpm:138,quality:'alta'});
  assert.equal(execution.liveTelemetry.heartRateBpm,138);
  await controller.pause(execution);
  assert.equal(execution.liveTelemetry.status,'paused');
  await controller.resume(execution);
  assert.equal(execution.liveTelemetry.status,'connected');
  await controller.stop(execution);
  assert.equal(execution.liveTelemetry.status,'stopped');
  assert.deepEqual(calls.map((x)=>x[0]),['start','subscribe','pause','resume','unsubscribe','stop']);
});

test('RC52 excluye telemetría efímera del snapshot operativo remoto',()=>{
  const execution=createExecution({session,clientId:'C1',executionId:'E4'});
  startExecution(execution);
  applyLiveTelemetrySample(execution,{provider:'ble_direct',heartRateBpm:150,quality:'alta'});
  const command=buildProgressExecutionCommand(execution,0);
  const serialized=JSON.stringify(command);
  assert.doesNotMatch(serialized,/liveTelemetry|heartRateBpm|rrIntervalsMs/);
  assert.equal(execution.liveTelemetry.heartRateBpm,150);
});

test('RC52 muestra FC en vivo en castellano y declara que no cambia la prescripción',()=>{
  const execution=createExecution({session,clientId:'C1',executionId:'E5'});
  startExecution(execution);
  applyLiveTelemetrySample(execution,{provider:'ble_direct',heartRateBpm:136,quality:'alta'});
  const html=renderGuidedExecution({execution,session,catalog,role:'client'});
  assert.match(html,/FC en vivo/);
  assert.match(html,/136 lpm/);
  assert.match(html,/Sensor Bluetooth compatible/);
  assert.match(html,/No modifica automáticamente la prescripción/);
  assert.doesNotMatch(html,/\bHRV\b/);
});
