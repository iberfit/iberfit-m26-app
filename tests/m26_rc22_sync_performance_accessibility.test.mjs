import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createCanonicalStore,createProductionState,createShellController,createShellViewModel,renderM26Shell,
  observeConnectivity,createLatestTaskCoordinator,createMemoryKeyValueStore,createKeyValueOperationRepository,
  createCommandBus,createMemoryOperationRepository,sanitizeOperation,
} from '../src/m26/index.js';
import {__commandBusInternals} from '../src/m26/command-bus.js';
import {__wearableControllerInternals} from '../src/m26/wearables/controller.js';

const command={operationId:'00000000-0000-4000-8000-000000000922',type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:'execution-22',clientId:'client-22',baseRevision:0,conflictSensitive:false,payload:{progressSnapshot:{id:'execution-22'}}};
function readyState(area='hoy'){return createProductionState({hydration:{status:'ready',error:null},identity:{id:'coach-22',role:'coach',name:'Coach QA'},canary:{active:true},selectedClientId:'client-22',activeArea:area,collections:{...createProductionState().collections,clients:[{id:'client-22',name:'Cliente QA',modality:'hibrido'}]}});}
const tick=()=>new Promise((resolve)=>setImmediate(resolve));

test('RC22 store evita emisiones redundantes y aísla listeners defectuosos',()=>{
  const errors=[],store=createCanonicalStore(readyState(),{onListenerError:(error)=>errors.push(error.message)});let first=0;const seen=[];
  store.subscribe((snapshot)=>{first+=1;snapshot.activeArea='alterada';throw new Error('listener roto');});
  store.subscribe((snapshot)=>seen.push(snapshot.activeArea));
  store.navigate('agenda');store.navigate('agenda');
  assert.equal(first,1);assert.deepEqual(seen,['agenda']);assert.deepEqual(errors,['listener roto']);assert.equal(store.getState().activeArea,'agenda');
});

test('RC22 shell agrupa cambios consecutivos en un solo render',async()=>{
  const store=createCanonicalStore(readyState());let writes=0,markup='';const root={addEventListener(){},removeEventListener(){},querySelector(){return null;},dispatchEvent(){},set innerHTML(value){writes+=1;markup=value;},get innerHTML(){return markup;}};
  const shell=createShellController({root,store,renderRoute:(vm)=>`<section>${vm.page.title}</section>`});shell.mount();
  store.navigate('clientes');store.navigate('agenda');await tick();
  assert.equal(writes,2);assert.match(markup,/Agenda/);shell.destroy();
});

test('RC22 conectividad emite estado inicial y deduplica eventos repetidos',async()=>{
  const target=new EventTarget(),navigatorLike={onLine:false},calls=[],events=[];target.addEventListener('m26:connectivity',(event)=>events.push(event.detail.online));
  const stop=observeConnectivity(target,{navigatorLike,emitInitial:true,onOffline:()=>calls.push('offline'),onOnline:()=>calls.push('online')});await tick();
  target.dispatchEvent(new Event('offline'));await tick();navigatorLike.onLine=true;target.dispatchEvent(new Event('online'));await tick();
  assert.deepEqual(calls,['offline','online']);assert.deepEqual(events,[false,true]);stop();
});

test('RC22 coordinador latest-task cancela trabajos obsoletos',()=>{
  const tasks=createLatestTaskCoordinator();const first=tasks.begin();const second=tasks.begin();
  assert.equal(first.signal.aborted,true);assert.equal(first.isCurrent(),false);assert.equal(second.isCurrent(),true);second.finish();assert.equal(tasks.current(),null);
});

test('RC22 repositorio local sella propietario y elimina contaminación cruzada',async()=>{
  const storage=createMemoryKeyValueStore();const repository=createKeyValueOperationRepository({storage,ownerId:'user-a'});
  await repository.put({...command,status:'pending'});const saved=await repository.get(command.operationId);assert.equal(saved.ownerId,'user-a');assert.equal(saved.schemaVersion,2);
  await storage.set('m26:operation:user-a:foreign-op',{...command,operationId:'foreign-op',ownerId:'user-b',status:'pending'});
  assert.deepEqual((await repository.list()).map((item)=>item.operationId),[command.operationId]);assert.equal(await storage.get('m26:operation:user-a:foreign-op'),undefined);
});

test('RC22 reintento automático respeta backoff y vuelve a intentar cuando vence',async()=>{
  let at=Date.parse('2026-07-20T12:00:00Z'),fail=true,calls=0;const repository=createMemoryOperationRepository();const bus=createCommandBus({repository,now:()=>at,getToken:async()=> 'token',transport:{preflight:async()=>({}),execute:async()=>{calls+=1;if(fail)throw new Error('M26_NETWORK_UNAVAILABLE');return {kind:'ack'};}}});
  await assert.rejects(()=>bus.execute(command),/NETWORK_UNAVAILABLE/);let pending=await bus.pending();assert.equal(pending[0].attempts,1);assert.equal(new Date(pending[0].nextRetryAt).getTime(),at+1000);
  const deferred=await bus.flushPending();assert.equal(deferred.attempted,0);assert.equal(deferred.deferred,1);assert.equal(calls,1);
  at+=1000;fail=false;const flushed=await bus.flushPending();assert.equal(flushed.attempted,1);assert.equal(calls,2);assert.equal((await bus.pending()).length,0);
});

test('RC22 backoff exponencial queda acotado',()=>{
  assert.equal(__commandBusInternals.retryDelayMs(1),1000);assert.equal(__commandBusInternals.retryDelayMs(2),2000);assert.equal(__commandBusInternals.retryDelayMs(20),300000);
});

test('RC22 operación sanitizada muestra reintento sin exponer payload',()=>{
  const safe=sanitizeOperation({...command,status:'pending',attempts:3,nextRetryAt:'2026-07-20T12:05:00Z'});assert.equal(safe.attempts,3);assert.equal(safe.nextRetryAt,'2026-07-20T12:05:00.000Z');assert.equal('payload' in safe,false);
});

test('RC22 resumen wearable para check-in es explícito y no contiene datos crudos',()=>{
  const text=__wearableControllerInternals.wearableContextText({providerLabel:'Archivo normalizado IBERFIT',summary:{daysWithData:3,metrics:{steps:7900,activeMinutes:44,sleepMinutes:null,restingHeartRate:59,hrvMs:47,workoutMinutes:35}}});
  assert.match(text,/revisado localmente/);assert.match(text,/Datos no sincronizados/);assert.doesNotMatch(text,/clientId|accepted|correo|token/i);assert.doesNotMatch(text,/sueño:/);
});

test('RC22 shell incorpora salto de contenido, título asociado y estado vivo',()=>{
  const html=renderM26Shell(createShellViewModel(readyState()),'<section>Contenido</section>');assert.match(html,/m26-skip-link/);assert.match(html,/aria-labelledby="m26-page-title"/);assert.match(html,/m26-operation-status[^>]*role="status"/);assert.doesNotMatch(html,/aria-current="false"/);
});

test('RC22 elimina marcadores operativos RC17 y respeta movimiento reducido',()=>{
  const app=fs.readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');const transport=fs.readFileSync(new URL('../src/m26/supabase-transport.js',import.meta.url),'utf8');const css=fs.readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');
  assert.doesNotMatch(app,/26\.0\.0-rc17/);assert.doesNotMatch(transport,/hardening-rc17/);assert.match(transport,/iberfit-m26-web/);assert.match(css,/RC22 · perceived performance/);assert.match(css,/prefers-reduced-motion/);
});

test('RC22 centro de verificación comunica intentos sin exponer payload',async()=>{
  const {buildVerificationCenter}=await import('../src/m26/engagement/conflict-center.js');
  const {renderVerificationRoute}=await import('../src/m26/modules/route-render.js');
  const center=buildVerificationCenter({pendingOperations:[{...command,status:'pending',attempts:2,nextRetryAt:'2026-07-20T12:05:00Z',retryable:true}],conflicts:[],rejectedOperations:[]});
  const html=renderVerificationRoute({center});assert.match(html,/Intentos: 2/);assert.match(html,/Reintentar ahora/);assert.doesNotMatch(html,/progressSnapshot/);
});
