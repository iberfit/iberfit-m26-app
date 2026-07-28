import test from 'node:test';
import assert from 'node:assert/strict';
import {ZERO_COST_POLICY,assertZeroCostDevelopmentAllowed,wearableZeroCostPolicy,zeroCostProviderReadiness} from '../src/m26/wearables/free-policy.js';
import {createWearableConnectionState,transitionWearableConnection,wearableConnectionHealth,wearableErrorMessage,WEARABLE_CONNECTION_STATES} from '../src/m26/wearables/connection-state.js';
import {normalizeWearableProvider,providerReadiness} from '../src/m26/wearables/contracts.js';
import {parseWearableExportTextAsync} from '../src/m26/wearables/normalization.js';
import {buildWearableViewModel} from '../src/m26/wearables/view-model.js';
import {renderActivityRoute} from '../src/m26/modules/route-render.js';

const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';

test('RC21 aplica política de coste cero sin borrar arquitectura futura',()=>{
  assert.equal(Object.keys(ZERO_COST_POLICY).length,8);
  assert.equal(wearableZeroCostPolicy('samsung_health').productionAllowed,false);
  assert.equal(wearableZeroCostPolicy('strava').productionAllowed,false);
  assert.equal(wearableZeroCostPolicy('normalized_file').productionAllowed,true);
  assert.equal(wearableZeroCostPolicy('health_connect').developmentAllowed,true);
  assert.equal(wearableZeroCostPolicy('apple_health').developmentAllowed,false);
  assert.equal(wearableZeroCostPolicy('garmin_connect').developmentAllowed,false);
  assert.throws(()=>assertZeroCostDevelopmentAllowed('apple_health'),/M26_ZERO_COST_POLICY_BLOCKED/);
  assert.equal(assertZeroCostDevelopmentAllowed('health_connect').definition.key,'health_connect');
});

test('RC21 normaliza Google Health API sobre el adaptador Fitbit compatible',()=>{
  assert.equal(normalizeWearableProvider('Google Health API'),'fitbit');
  assert.equal(normalizeWearableProvider('Pixel Watch'),'fitbit');
});

test('RC21 readiness separa disponible, desarrollo gratuito y bloqueado',()=>{
  const rows=zeroCostProviderReadiness(providerReadiness({}));
  assert.equal(rows.find((x)=>x.key==='normalized_file').usableNow,true);
  assert.equal(rows.find((x)=>x.key==='health_connect').policy.tier,'free_development');
  assert.equal(rows.find((x)=>x.key==='apple_health').activationBlocked,true);
  assert.equal(rows.find((x)=>x.key==='garmin_connect').policy.tier,'partner_access');
});

test('RC21 máquina de estados acepta únicamente transiciones explícitas',()=>{
  let state=createWearableConnectionState({provider:'health_connect',state:'available'});
  state=transitionWearableConnection(state,'authorizing');
  state=transitionWearableConnection(state,'connected',{grantedScopes:['steps','sleepMinutes']});
  state=transitionWearableConnection(state,'syncing');
  state=transitionWearableConnection(state,'connected',{lastSyncedAt:'2026-07-20T12:00:00Z'});
  state=transitionWearableConnection(state,'paused');
  assert.equal(state.state,'paused');
  assert.equal(state.revision,5);
  assert.throws(()=>transitionWearableConnection(state,'syncing'),/M26_WEARABLE_TRANSITION_INVALID/);
});

test('RC21 proveedores bloqueados no pueden aparecer conectados por estado heredado',()=>{
  const apple=createWearableConnectionState({provider:'apple_health',state:'connected',grantedScopes:['steps']});
  const garmin=createWearableConnectionState({provider:'garmin_connect',state:'syncing',grantedScopes:['steps']});
  assert.equal(apple.state,'unavailable');
  assert.equal(garmin.state,'unavailable');
});

test('RC21 salud de sincronización mantiene ausencia y frescura sin convertir a cero',()=>{
  const empty=wearableConnectionHealth({provider:'health_connect',state:'available'},{now:'2026-07-20T12:00:00Z'});
  assert.equal(empty.ageHours,null);assert.equal(empty.freshness,'sin_datos');
  const recent=wearableConnectionHealth({provider:'health_connect',state:'connected',grantedScopes:['steps'],lastSyncedAt:'2026-07-20T10:00:00Z'},{now:'2026-07-20T12:00:00Z'});
  assert.equal(recent.ageHours,2);assert.equal(recent.freshness,'reciente');
});

test('RC21 errores exponen mensajes seguros y nunca detalles internos',()=>{
  assert.match(wearableErrorMessage('M26_PERMISSION_DENIED'),/permiso/i);
  assert.match(wearableErrorMessage('stack trace database password'),/formato válido/i);
  assert.doesNotMatch(wearableErrorMessage('stack trace database password'),/password|stack|database/i);
});

test('RC21 parser asíncrono cede el hilo y admite cancelación',async()=>{
  let yielded=0;const scope={scheduler:{yield:async()=>{yielded+=1;}}};
  const parsed=await parseWearableExportTextAsync(JSON.stringify({records:[{date:'2026-07-20',steps:8000}]}),{fileName:'datos.json',clientId,provider:'normalized_file',scope});
  assert.equal(yielded,1);assert.equal(parsed.accepted.length,1);
  const abort=new AbortController();abort.abort();
  await assert.rejects(()=>parseWearableExportTextAsync('{}',{fileName:'datos.json',clientId,signal:abort.signal}),/M26_WEARABLE_IMPORT_ABORTED/);
});

test('RC21 fuzz de estados no genera estados desconocidos ni salta controles',()=>{
  let seed=21871;const random=()=>((seed=(seed*48271)%2147483647)/2147483647);
  const candidates=['available','authorizing','connected','syncing','paused','revoked','error','invalid'];
  for(let iteration=0;iteration<1500;iteration+=1){
    const provider=['health_connect','normalized_file','apple_health','garmin_connect'][Math.floor(random()*4)];
    let state=createWearableConnectionState({provider,state:'available'});
    for(let step=0;step<8;step+=1){
      const target=candidates[Math.floor(random()*candidates.length)];
      try{state=transitionWearableConnection(state,target,{grantedScopes:['steps'],errorCode:'M26_NETWORK_UNAVAILABLE'});}catch(error){assert.match(String(error.message),/^M26_/);}
      assert.ok(WEARABLE_CONNECTION_STATES.includes(state.state));
      if(['apple_health','garmin_connect'].includes(provider))assert.ok(['unavailable','error'].includes(state.state));
    }
  }
});

test('RC21 UX comunica coste cero y evita acciones de conexión falsas',()=>{
  const vm={checkins:[],habits:[],canManageHabits:false,capabilities:{checkins:{ready:false},habits:{ready:false}},wearables:buildWearableViewModel({role:'client',records:[],connections:[],scope:{},now:'2026-07-20T12:00:00Z'})};
  const html=renderActivityRoute(vm);
  assert.match(html,/Plan gratuito de integraciones/);
  assert.match(html,/Solo vista previa local · gratuito/);
  assert.match(html,/No disponible/);
  assert.match(html,/No está conectada ni comparte datos/);
  assert.doesNotMatch(html,/data-wearable-action="connect|Conectar Apple|Conectar Garmin/);
  assert.match(html,/aria-atomic="true"/);
});

test('RC21 Coach mantiene datos wearable en solo lectura y sin importador',()=>{
  const vm={checkins:[],habits:[],canManageHabits:true,capabilities:{checkins:{ready:false},habits:{ready:false}},wearables:buildWearableViewModel({role:'coach',records:[],connections:[],scope:{},now:'2026-07-20T12:00:00Z'})};
  const html=renderActivityRoute(vm);
  assert.doesNotMatch(html,/data-wearable-import/);
  assert.match(html,/El entrenador recibe únicamente resúmenes confirmados/);
});
