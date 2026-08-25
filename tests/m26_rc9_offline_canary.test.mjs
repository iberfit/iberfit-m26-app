import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createMemoryKeyValueStore,createKeyValueOperationRepository,createCommandBus,
  createMemoryExecutionRecoveryStore,createExecutionSnapshot,reconcileExecutionSnapshots,
  executionElapsedMs,freezeExecutionClock,resumeExecutionClock,restRemainingSeconds,recoverExecutionTimers,
  createSessionDraft,addCatalogExercise,createExecution,startExecution,pauseExecution,resumeExecution,
  dispatchSessionAction,renderGuidedExecution,buildProgressExecutionCommand,createM26Transport,
  M26_COMMAND_REGISTRY,buildAuthenticatedQaReport
} from '../src/m26/index.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
const records=JSON.parse(fs.readFileSync(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url)));
const catalog=createExerciseCatalog(records);
function session(){const d=createSessionDraft({clientId:'c1'});addCatalogExercise(d,catalog.list()[0].id,catalog,{sets:1,reps:'10'});d.previewAccepted=true;return d;}

test('almacenamiento memoria clona valores y permite prefijos',async()=>{const s=createMemoryKeyValueStore();const value={a:1};await s.set('x:1',value);value.a=2;assert.equal((await s.get('x:1')).a,1);assert.deepEqual(await s.keys('x:'),['x:1']);});


test('persistencia local separa operaciones por usuario autenticado',async()=>{const storage=createMemoryKeyValueStore();const a=createKeyValueOperationRepository({storage,ownerId:'user-a'});const b=createKeyValueOperationRepository({storage,ownerId:'user-b'});await a.put({operationId:'op1',createdAt:'2026-01-01'});assert.equal((await a.list()).length,1);assert.equal((await b.list()).length,0);});

test('snapshot offline no conserva credenciales y se recupera',async()=>{const d=session();const x=createExecution({session:d,clientId:'c1'});startExecution(x);x.token='secret';const store=createMemoryExecutionRecoveryStore({ownerId:'user-qa',now:()=>new Date('2026-07-19T12:00:00Z')});await store.save({execution:x,session:d,appointmentId:'a1'});const loaded=await store.load(x.id);assert.equal(loaded.execution.token,undefined);assert.equal(loaded.execution.status,'active');assert.equal(loaded.appointmentId,'a1');});

test('reconciliación no sobreescribe progreso local sucio con revisión remota superior',()=>{const d=session(),x=createExecution({session:d,clientId:'c1'});const local=createExecutionSnapshot({execution:{...x,revision:2},session:d,ownerId:'user-qa',dirty:true});const remote=createExecutionSnapshot({execution:{...x,revision:3},session:d,ownerId:'user-qa',dirty:false});const result=reconcileExecutionSnapshots({local,remote});assert.equal(result.kind,'conflict');assert.equal(result.conflict.code,'REMOTE_REVISION_AHEAD');});

test('temporizador activo se congela en pausa y se reanuda',()=>{const execution={status:'active',activeSince:'2026-07-19T10:00:00Z',accumulatedActiveMs:1000};assert.equal(executionElapsedMs(execution,Date.parse('2026-07-19T10:00:05Z')),6000);freezeExecutionClock(execution,Date.parse('2026-07-19T10:00:05Z'));assert.equal(execution.accumulatedActiveMs,6000);execution.status='active';resumeExecutionClock(execution,Date.parse('2026-07-19T10:01:00Z'));assert.equal(execution.activeSince,'2026-07-19T10:01:00.000Z');});

test('descanso absoluto sobrevive cierre y expira al recuperar',()=>{const execution={status:'paused',activeSince:null,accumulatedActiveMs:0,restUntil:'2026-07-19T10:00:30Z'};assert.equal(restRemainingSeconds(execution,Date.parse('2026-07-19T10:00:10Z')),20);recoverExecutionTimers(execution,Date.parse('2026-07-19T10:01:00Z'));assert.equal(execution.restUntil,null);});

test('cola persistente conserva operationId y sincroniza al volver online',async()=>{const storage=createMemoryKeyValueStore();const repository=createKeyValueOperationRepository({storage,ownerId:'user-qa'});let calls=0;const bus=createCommandBus({repository,getToken:async()=> 'token',transport:{preflight:async()=>({}),execute:async(_token,command)=>{calls+=1;return {kind:'ack',operationId:command.operationId,remoteRevision:1};}}});const command={type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:'e1',clientId:'c1',baseRevision:0,conflictSensitive:true,payload:{progressSnapshot:{id:'e1'}}};const queued=await bus.enqueue(command);assert.equal(queued.queued,true);assert.equal((await bus.pending()).length,1);const result=await bus.flushPending();assert.equal(result.attempted,1);assert.equal(calls,1);assert.equal((await bus.pending()).length,0);});

test('inicio offline está bloqueado sin permiso canario cacheado',()=>{const d=session(),x=createExecution({session:d,clientId:'c1'});assert.throws(()=>dispatchSessionAction({action:'start',execution:x,session:d,catalog,online:false,commandBus:{enqueue:async()=>({})},appointmentId:'a1'}),/OFFLINE_START_NOT_ALLOWED/);});

test('sesión autorizada puede continuar offline y queda pendiente de sincronización',async()=>{const d=session(),x=createExecution({session:d,clientId:'c1'});const queued=[];const bus={enqueue:async(command)=>{queued.push(command);return {ok:false,queued:true,kind:'queued',command:{operationId:command.operationId||`op-${queued.length}`}};}};await dispatchSessionAction({action:'start',execution:x,session:d,catalog,online:false,offlinePermit:{canStart:true},commandBus:bus,appointmentId:'a1'}).value;assert.equal(x.status,'active');assert.equal(x.syncStatus,'pending');await dispatchSessionAction({action:'pause',execution:x,session:d,catalog,online:false,commandBus:bus}).value;assert.equal(x.status,'paused');assert.equal(queued.length,2);});

test('payload remoto excluye metadatos locales de sincronización',()=>{const d=session(),x=createExecution({session:d,clientId:'c1'});startExecution(x);x.syncStatus='pending';x.pendingOperationIds=['op'];const command=buildProgressExecutionCommand(x);assert.equal(command.payload.progressSnapshot.syncStatus,undefined);assert.equal(command.payload.progressSnapshot.pendingOperationIds,undefined);});

test('UI no presenta como confirmado un cierre pendiente',()=>{const d=session(),x=createExecution({session:d,clientId:'c1'});x.status='completed';x.syncStatus='pending';const html=renderGuidedExecution({execution:x,session:d,catalog});assert.match(html,/pendientes de sincronización/);assert.doesNotMatch(html,/resultados quedaron confirmados/);});

test('transporte lee el registro canónico mediante GET autenticado',async()=>{let request;const fetchImpl=async(url,options)=>{request={url,options};return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>M26_COMMAND_REGISTRY.map(x=>({command_type:x.type}))};};const t=createM26Transport({enabled:true,projectRef:'pjhmrhejsoofmouedavw',url:'https://pjhmrhejsoofmouedavw.supabase.co',publishableKey:'pk'},{fetchImpl});const rows=await t.commandRegistry('qa-token');assert.equal(rows.length,44);assert.match(request.url,/domain_command_registry_v26/);assert.equal(request.options.method,'GET');assert.equal(request.options.headers.authorization,'Bearer qa-token');});

test('reporte autenticado exige rol y catálogo completos',()=>{const coach={session:{token:'t',user:{id:'u1',email:'iberfit.cl+qa.coach@gmail.com'}},bootstrap:{role:'coach'}};const client={session:{token:'t',user:{id:'u2',email:'iberfit.cl+qa.client@gmail.com'}},bootstrap:{role:'cliente'}};const report=buildAuthenticatedQaReport({coach,client,installedCommands:M26_COMMAND_REGISTRY,preflights:[]});assert.equal(report.ok,true);});
