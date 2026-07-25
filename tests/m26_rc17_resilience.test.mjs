import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createM26Transport,M26_CANONICAL_PROJECT_REF,stateFromBootstrap,createProductionState,
  createCommandBus,createMemoryOperationRepository,M26_EXTENDED_COMMAND_REGISTRY,
  validatedRuntimeRegistry,createEngagementCommandService,createMemoryKeyValueStore,
  createKeyValueOperationRepository,createSessionVault,observeConnectivity,
  createSessionDraft,addCatalogExercise,addTrainingGroup,updateSessionBlock,validateSessionDraft,
  createExecution,startExecution,markExecutionSync,dispatchSessionAction,
} from '../src/m26/index.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createM26Id} from '../src/m26/platform/id.js';
import {__applicationInternals} from '../src/m26/app/application.js';

const root=new URL('..',import.meta.url);
const catalog=createExerciseCatalog(JSON.parse(fs.readFileSync(new URL('baseline_m25_2/exercise-catalog-m25.json',root),'utf8')));
const exercises=catalog.list();
const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';
const otherClientId='67339e70-7a99-48d6-820f-7d4a51f89d9e';
const userId='61227666-d8b4-4d1e-aa08-2405ad2000db';
const operationId='00000000-0000-4000-8000-000000000777';
const command={operationId,type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:'execution-1',clientId,baseRevision:0,conflictSensitive:false,payload:{progressSnapshot:{id:'execution-1'}}};
function runtime(overrides={}){return {enabled:true,projectRef:M26_CANONICAL_PROJECT_REF,url:`https://${M26_CANONICAL_PROJECT_REF}.supabase.co`,publishableKey:'public-key',qaOnly:false,...overrides};}
function response(body,status=200,headers={}){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});}
function remoteRegistry(){return M26_EXTENDED_COMMAND_REGISTRY.map((row)=>({command_type:row.type,entity_type:row.entityType,event_name:row.eventName,allowed_roles:[...row.allowedRoles],requires_reason:row.requiresReason,requires_preview:row.requiresPreview,enabled:row.enabled}));}
function simpleSession(){const draft=createSessionDraft({clientId});addCatalogExercise(draft,exercises[0].id,catalog,{sets:1,reps:'10'});return draft;}

 test('transporte fija el proyecto Supabase canónico y rechaza respuestas de identidad incompletas',async()=>{
  assert.throws(()=>createM26Transport(runtime({projectRef:'aaaaaaaaaaaaaaaaaaaa',url:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'}),{fetchImpl:async()=>response({})}),/PROJECT_REF_MISMATCH/);
  const transport=createM26Transport(runtime(),{fetchImpl:async()=>response({access_token:'token',refresh_token:'refresh',expires_at:9999999999,user:{id:userId,email:''}})});
  await assert.rejects(()=>transport.login('qa@example.com','password-segura'),/AUTH_INVALID_RESPONSE/);
 });

 test('bootstrap Cliente filtra datos y revisiones de otros clientes y elimina notas privadas',()=>{
  const snapshot={environment:'PRODUCTION',canary:{active:true},user:{id:userId,role:'client',clientId},remoteRevisions:{[`session:${clientId}`]:2,[`session:${otherClientId}`]:7},data:{clients:[{id:clientId,name:'Propio'},{id:otherClientId,name:'Ajeno'}],sessions:[{id:'s1',clientId,status:'publicado'},{id:'s2',clientId:otherClientId,status:'publicado'}],appointments:[{id:'a1',clientId,status:'confirmada',modality:'online'},{id:'a2',clientId:otherClientId,status:'confirmada',modality:'online'}],privateNotes:[{id:'n1',clientId,body:'privado'}]}};
  const state=stateFromBootstrap(snapshot,createProductionState());
  assert.deepEqual(state.collections.clients.map((x)=>x.id),[clientId]);
  assert.deepEqual(state.collections.sessions.map((x)=>x.id),['s1']);
  assert.deepEqual(state.collections.appointments.map((x)=>x.id),['a1']);
  assert.deepEqual(state.collections.privateNotes,[]);
  assert.deepEqual(Object.keys(state.remoteRevisions),[`session:${clientId}`]);
  assert.throws(()=>stateFromBootstrap({...snapshot,user:{id:userId,role:'client'}},createProductionState()),/CLIENT_IDENTITY_REQUIRED/);
 });

 test('cita de inicio debe estar confirmada, vigente y no vinculada a otra sesión',()=>{
  const {confirmedAppointmentForSession}=__applicationInternals;const now=Date.parse('2026-07-19T18:00:00Z');const session={id:'session-1',clientId};
  assert.equal(confirmedAppointmentForSession([{id:'x',clientId,status:'confirmed'}],session,now),null);
  assert.equal(confirmedAppointmentForSession([{id:'x',clientId,status:'confirmed',startAt:'2026-07-25T18:00:00Z'}],session,now),null);
  assert.equal(confirmedAppointmentForSession([{id:'x',clientId,status:'confirmed',sessionId:'session-2',startAt:'2026-07-19T19:00:00Z'}],session,now),null);
  assert.equal(confirmedAppointmentForSession([{id:'ok',clientId,status:'confirmed',sessionId:'session-1',startAt:'2026-07-19T19:00:00Z'}],session,now)?.id,'ok');
 });

 test('Command Bus bloquea reutilización de operationId con contenido distinto en vuelo',async()=>{
  let release;const wait=new Promise((resolve)=>{release=resolve;});const repository=createMemoryOperationRepository();
  const bus=createCommandBus({repository,getToken:async()=> 'token',transport:{preflight:async()=>({}),execute:async()=>{await wait;return {kind:'ack'};}}});
  const first=bus.execute(command);await assert.rejects(()=>bus.execute({...command,payload:{progressSnapshot:{id:'otra'}}}),/OPERATION_ID_COLLISION/);release();await first;
 });

 test('Command Bus bloquea colisión contra una operación persistida',async()=>{
  const repository=createMemoryOperationRepository();await repository.put({...command,status:'pending',createdAt:'2026-01-01T00:00:00.000Z',retryable:true});
  const bus=createCommandBus({repository,getToken:async()=> 'token',transport:{preflight:async()=>({}),execute:async()=>({kind:'ack'})}});
  await assert.rejects(()=>bus.execute({...command,payload:{progressSnapshot:{id:'otra'}}}),/OPERATION_ID_COLLISION/);
 });

 test('pausa, reanudación y cancelación envían el estado objetivo exacto',async()=>{
  const session=simpleSession(),execution=createExecution({session,clientId});startExecution(execution);const sent=[];
  const commandBus={execute:async(commandInput)=>{sent.push(structuredClone(commandInput));return {ok:true,kind:'ack',command:{operationId:createM26Id()},response:{remoteRevision:2}};},enqueue:async()=>{throw new Error('unexpected');}};
  await dispatchSessionAction({action:'pause',execution,session,catalog,commandBus,online:true}).value;assert.equal(sent.at(-1).payload.patch.status,'paused');assert.equal(execution.status,'paused');
  await dispatchSessionAction({action:'resume',execution,session,catalog,commandBus,online:true}).value;assert.equal(sent.at(-1).payload.patch.status,'active');assert.equal(execution.status,'active');
  await dispatchSessionAction({action:'cancel',execution,session,catalog,commandBus,online:true,payload:{reason:'Cambio de planificación'}}).value;assert.equal(sent.at(-1).payload.patch.status,'cancelled');assert.equal(execution.status,'cancelled');
 });

 test('conflicto y rechazo retiran la operación de la lista pendiente',()=>{
  const execution={syncStatus:'pending',pendingOperationIds:['op-1','op-2'],lastSyncError:null};markExecutionSync(execution,'conflict',{operationId:'op-1',errorCode:'REVISION'});assert.deepEqual(execution.pendingOperationIds,['op-2']);markExecutionSync(execution,'rejected',{operationId:'op-2',errorCode:'REJECTED'});assert.deepEqual(execution.pendingOperationIds,[]);
 });

 test('validador de sesiones rechaza grupos desconocidos, IDs duplicados y alternativas propias',()=>{
  const draft=simpleSession();draft.blocks.push({...structuredClone(draft.blocks[0]),type:'desconocido'});let check=validateSessionDraft(draft,catalog);assert.equal(check.ok,false);assert.ok(check.errors.some((x)=>x.startsWith('blockId:'))||check.errors.some((x)=>x.startsWith('groupType:')));
  const self=simpleSession();self.blocks[0].alternativeId=self.blocks[0].exerciseId;check=validateSessionDraft(self,catalog);assert.equal(check.ok,false);assert.ok(check.errors.some((x)=>x.startsWith('alternative:')));
 });

 test('edición fallida de alternativa de grupo es transaccional',()=>{
  const draft=createSessionDraft({clientId});addTrainingGroup(draft,'biserie',[exercises[0].id,exercises[1].id]);const block=draft.blocks[0],before=structuredClone(block);
  assert.throws(()=>updateSessionBlock(draft,{blockId:block.id,exerciseId:exercises[0].id,field:'alternativeId',value:'no-existe',catalog}),/ALTERNATIVE_NOT_IN_CATALOG/);assert.deepEqual(block,before);
 });

 test('mutaciones de engagement no autorizadas offline fallan sin encolar',async()=>{
  let executed=0,enqueued=0;const service=createEngagementCommandService({commandBus:{execute:async()=>{executed++;},enqueue:async()=>{enqueued++;}},installedRegistry:remoteRegistry(),getRole:()=> 'coach',isOnline:()=>false});
  await assert.rejects(()=>service.defineHabit({clientId,habit:{title:'Caminar',target:3,unit:'veces',frequency:'semanal'}}),/ONLINE_REQUIRED/);assert.equal(executed,0);assert.equal(enqueued,0);
 });

 test('registro remoto exige filas completas, únicas y exactas',()=>{
  const incomplete=validatedRuntimeRegistry(M26_EXTENDED_COMMAND_REGISTRY.map((x)=>({command_type:x.type})));assert.equal(incomplete.base.ok,false);assert.ok(incomplete.base.incomplete.length>0);
  const rows=remoteRegistry();const duplicate=validatedRuntimeRegistry([...rows,structuredClone(rows[0])]);assert.equal(duplicate.ok,false);assert.ok(duplicate.rejected.length>0||duplicate.base.duplicates.length>0);
 });

 test('cambios de conectividad durante sincronización conservan el estado final',async()=>{
  const target=new EventTarget(),navigatorLike={onLine:true};let release;const wait=new Promise((resolve)=>{release=resolve;});const calls=[];let offlineDone;const done=new Promise((resolve)=>{offlineDone=resolve;});
  const stop=observeConnectivity(target,{navigatorLike,onOnline:async()=>{calls.push('online');await wait;},onOffline:async()=>{calls.push('offline');offlineDone();}});
  target.dispatchEvent(new Event('online'));await Promise.resolve();navigatorLike.onLine=false;target.dispatchEvent(new Event('offline'));release();await done;stop();assert.deepEqual(calls,['online','offline']);
 });

 test('repositorio persistente purga registros cuyo ID no coincide con la clave',async()=>{
  const storage=createMemoryKeyValueStore();await storage.set('m26:operation:user-a:op-a',{operationId:'op-b',status:'pending'});const repository=createKeyValueOperationRepository({storage,ownerId:'user-a'});assert.deepEqual(await repository.list(),[]);assert.equal(await storage.get('m26:operation:user-a:op-a'),undefined);
 });

 test('generador de ID usa entropía criptográfica y conserva UUID v4',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');let tick=0;Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=(tick+i)&255;tick++;return bytes;}}});
  try{const a=createM26Id(),b=createM26Id();assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.notEqual(a,b);}finally{Object.defineProperty(globalThis,'crypto',descriptor);}
 });

 test('vault rechaza sesiones corruptas, controles y correos inexistentes',()=>{
  const map=new Map();const storage={setItem:(k,v)=>map.set(k,v),getItem:(k)=>map.get(k)||null,removeItem:(k)=>map.delete(k)};const vault=createSessionVault({storage});
  assert.throws(()=>vault.save({token:'token',refreshToken:'refresh',user:{id:userId,email:''}}),/SESSION_INVALID/);
  map.set('iberfit:m26:session:v1',JSON.stringify({token:'bad\n',user:{id:userId,email:'qa@example.com'}}));assert.equal(vault.load(),null);assert.equal(map.has('iberfit:m26:session:v1'),false);
 });
