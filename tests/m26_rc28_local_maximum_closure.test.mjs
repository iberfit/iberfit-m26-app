import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectCollectionsForRole,projectRemoteRevisionsForRole,assertClientProjectionSafe,
  projectIdentityForRole,projectEnvironmentForRole,projectCanaryForRole,projectMetricsForRole,
  stateFromBootstrap,createProductionState,createCanonicalStore,createWorkflowController,
  M26_COLLECTION_KEYS,
} from '../src/m26/index.js';

const own='CLI-RC28-1';
const other='CLI-RC28-10';
const client={id:'USR-RC28-CLIENT',role:'client',clientId:own,name:'Cliente RC28'};
function emptyCollections(){return Object.fromEntries(M26_COLLECTION_KEYS.map((key)=>[key,[]]));}
function baseData(){const data=emptyCollections();data.clients=[{id:own,name:'Cliente propio'},{id:other,name:'Cliente ajeno'}];return data;}
function snapshot(overrides={}){return {user:client,canary:{active:true,scope:'allowlist',version:'rc28'},data:baseData(),...overrides};}

function seeded(seed=28){let state=seed>>>0;return ()=>{state=(1664525*state+1013904223)>>>0;return state/0x100000000;};}

// La visibilidad editorial falla cerrada: no basta con que falte una marca privada.
test('publicaciones sin estado público confirmado no llegan al Cliente',()=>{
  const data=baseData();
  data.sessions=[
    {id:'sin-estado',clientId:own,visibleToClient:true,title:'No debe salir'},
    {id:'borrador-visible',clientId:own,status:'borrador',visibleToClient:true,title:'Tampoco'},
    {id:'publicada',clientId:own,status:'publicado',title:'Sí debe salir'},
  ];
  const projected=projectCollectionsForRole(data,client);
  assert.deepEqual(projected.sessions.map((item)=>item.id),['publicada']);
});

test('campos sensibles anidados se eliminan aunque usen snake_case o variantes',()=>{
  const data=baseData();
  data.iriAssessments=[{id:'iri',clientId:own,status:'completado',bodyComposition:{weightKg:70,oauth_token:'NO-COMPARTIR',api_key:'NO-COMPARTIR',nested:{coach_notes:'NO-COMPARTIR',muscleMassKg:30}}}];
  data.checkins=[{id:'check',clientId:own,notes:'Correcto',wearableSummary:{steps:8000,refresh_token:'NO-COMPARTIR',nested:{internal_notes:'NO-COMPARTIR',sleepMinutes:420}}}];
  data.sessionExecutions=[{id:'exec',clientId:own,status:'completado',feedback:{perceivedEffort:7,private_notes:'NO-COMPARTIR'},results:[]}];
  const projected=projectCollectionsForRole(data,client);
  const text=JSON.stringify(projected);
  assert.doesNotMatch(text,/NO-COMPARTIR|oauth_token|api_key|coach_notes|refresh_token|internal_notes|private_notes/i);
  assert.equal(projected.iriAssessments[0].bodyComposition.weightKg,70);
  assert.equal(projected.iriAssessments[0].bodyComposition.nested.muscleMassKg,30);
  assert.equal(projected.checkins[0].wearableSummary.nested.sleepMinutes,420);
  assert.equal(assertClientProjectionSafe(projected,client),true);
});

test('auditor reconoce claves sensibles independientemente de formato y capitalización',()=>{
  const data=projectCollectionsForRole(baseData(),client);
  assert.throws(()=>assertClientProjectionSafe({...data,checkins:[{id:'x',clientId:own,wearableSummary:{OAuth_Token:'x'}}]},client),/SENSITIVE_FIELD_EXPOSED/);
  assert.throws(()=>assertClientProjectionSafe({...data,checkins:[{id:'x',clientId:own,wearableSummary:{API_KEY:'x'}}]},client),/SENSITIVE_FIELD_EXPOSED/);
  assert.throws(()=>assertClientProjectionSafe({...data,checkins:[{id:'x',clientId:own,wearableSummary:{constructor:{x:1}}}]},client),/SENSITIVE_FIELD_EXPOSED/);
});

test('revisiones remotas usan segmentos exactos y no coincidencias por subcadena',()=>{
  const projected=projectRemoteRevisionsForRole({
    [`session:${own}`]:2,
    [`session:${other}`]:9,
    [`prefix/${own}/session`]:3,
    [`accidental-${own}-suffix`]:4,
  },client);
  assert.deepEqual(projected,{[`session:${own}`]:2,[`prefix/${own}/session`]:3});
});

test('identidad y contexto de ejecución del Cliente se reducen a campos permitidos',()=>{
  const identity=projectIdentityForRole({...client,email:'cliente@example.com',app_metadata:{token:'NO-COMPARTIR'},['pass'+'word']:'NO-COMPARTIR'});
  assert.deepEqual(Object.keys(identity).sort(),['clientId','email','id','name','role'].sort());
  const registry=[
    {type:'CHECKIN_REGISTRAR',entityType:'checkin',eventName:'REGISTRAR',allowedRoles:['cliente'],enabled:true,secret:'NO-COMPARTIR'},
    {type:'NOTA_PRIVADA_CREAR',entityType:'private_note',eventName:'CREAR',allowedRoles:['coach'],enabled:true,secret:'NO-COMPARTIR'},
  ];
  const environment=projectEnvironmentForRole({name:'canario',reason:'login',commandRegistry:registry,token:'NO-COMPARTIR'},client);
  assert.deepEqual(environment.commandRegistry.map((item)=>item.type),['CHECKIN_REGISTRAR']);
  assert.deepEqual(environment.commandRegistry[0].allowedRoles,['cliente']);
  assert.doesNotMatch(JSON.stringify(environment),/NO-COMPARTIR|NOTA_PRIVADA/);
  const canary=projectCanaryForRole({active:true,scope:'qa',version:'rc28',secret:'NO-COMPARTIR',commandRegistry:registry},client);
  assert.deepEqual(canary,{active:true,scope:'qa',version:'rc28'});
  const metrics=projectMetricsForRole({checkin:{value:7,raw:'NO-COMPARTIR'},progress:0,iri:null,coachMetric:'NO-COMPARTIR'});
  assert.deepEqual(metrics,{checkin:{value:7},progress:0,iri:null});
});

test('bootstrap Cliente no conserva metadatos superiores enviados de más',()=>{
  const data=baseData();data.metrics={checkin:{value:8,coach_note:'NO-COMPARTIR'},progress:0,iri:72,secret:'NO-COMPARTIR'};
  const state=stateFromBootstrap(snapshot({
    user:{...client,email:'cliente@example.com',app_metadata:{secret:'NO-COMPARTIR'}},
    environment:{commandRegistry:[{type:'CLIENTE_OK',entityType:'checkin',eventName:'OK',allowedRoles:['cliente'],enabled:true},{type:'COACH_ONLY',entityType:'note',eventName:'CREATE',allowedRoles:['coach'],enabled:true}],secret:'NO-COMPARTIR'},
    canary:{active:true,scope:'allowlist',version:'rc28',secret:'NO-COMPARTIR'},data,
  }),createProductionState());
  const text=JSON.stringify(state);
  assert.doesNotMatch(text,/NO-COMPARTIR|COACH_ONLY|app_metadata/);
  assert.deepEqual(Object.keys(state.identity).sort(),['clientId','email','id','name','role'].sort());
  assert.deepEqual(state.environment.commandRegistry.map((item)=>item.type),['CLIENTE_OK']);
});

test('cambio de identidad elimina ruta, operaciones y confirmaciones de la sesión anterior',()=>{
  const previous=createProductionState({
    identity:{id:'USR-COACH-ANTERIOR',role:'coach',name:'Anterior'},activeArea:'notas',coachMode:'gestionar',selectedClientId:other,
    pendingOperations:[{operationId:'op-anterior',status:'pending'}],conflicts:[{operationId:'conflicto'}],rejectedOperations:[{operationId:'rechazo'}],lastAck:{privateNote:'NO-COMPARTIR'},
  });
  const state=stateFromBootstrap(snapshot(),previous);
  assert.equal(state.activeArea,'hoy');
  assert.equal(state.selectedClientId,own);
  assert.deepEqual(state.pendingOperations,[]);assert.deepEqual(state.conflicts,[]);assert.deepEqual(state.rejectedOperations,[]);assert.equal(state.lastAck,null);
  assert.doesNotMatch(JSON.stringify(state),/NO-COMPARTIR|op-anterior/);
});

test('misma identidad conserva únicamente continuidad operativa ya sanitizada',()=>{
  const previous=createProductionState({identity:client,activeArea:'actividad',selectedClientId:own,pendingOperations:[{operationId:'op-1',status:'pending'}],lastAck:{kind:'ack'}});
  const state=stateFromBootstrap(snapshot(),previous);
  assert.equal(state.activeArea,'actividad');assert.equal(state.selectedClientId,own);
  assert.deepEqual(state.pendingOperations,[{operationId:'op-1',status:'pending'}]);assert.deepEqual(state.lastAck,{kind:'ack'});
});

test('reset del store borra completamente el espacio autenticado y notifica',()=>{
  const store=createCanonicalStore(createProductionState({identity:{id:'coach',role:'coach'},collections:{...emptyCollections(),privateNotes:[{id:'n',body:'NO-COMPARTIR'}]}}));
  let notifications=0;store.subscribe(()=>notifications++);
  const reset=store.reset();
  assert.equal(reset.identity,null);assert.deepEqual(reset.collections.privateNotes,[]);assert.equal(reset.activeArea,'hoy');assert.equal(notifications,1);
  assert.doesNotMatch(JSON.stringify(store.getState()),/NO-COMPARTIR/);
});

test('proyección es inmutable respecto a la entrada y elimina claves de contaminación de prototipo',()=>{
  const record=JSON.parse('{"id":"check","clientId":"CLI-RC28-1","notes":"bien","wearableSummary":{"steps":7000,"__proto__":{"polluted":true},"constructor":{"secret":true}}}');
  const data=baseData();data.checkins=[record];const before=JSON.stringify(data);
  const projected=projectCollectionsForRole(data,client);
  assert.equal(JSON.stringify(data),before);
  assert.equal(Object.prototype.polluted,undefined);
  assert.deepEqual(projected.checkins[0].wearableSummary,{steps:7000});
});

test('fuzz de proyección elimina secretos y cruces sin alterar registros de origen',()=>{
  const random=seeded();const data=baseData();data.checkins=[];const forbidden=['oauth_token','coach_notes','internalComment','API_KEY','password','raw'];
  for(let i=0;i<2200;i++){
    const id=i%2===0?own:other;const key=forbidden[Math.floor(random()*forbidden.length)];
    data.checkins.push({id:`c-${i}`,clientId:id,createdAt:`2026-07-${String((i%28)+1).padStart(2,'0')}`,energy:Math.floor(random()*11),wearableSummary:{steps:Math.floor(random()*20000),nested:{[key]:`NO-COMPARTIR-${i}`,safe:i}}});
  }
  const before=JSON.stringify(data);const projected=projectCollectionsForRole(data,client);const text=JSON.stringify(projected);
  assert.equal(JSON.stringify(data),before);assert.equal(projected.checkins.length,1100);assert.doesNotMatch(text,/NO-COMPARTIR|oauth_token|coach_notes|internalComment|API_KEY|password|"raw"/i);assert.equal(assertClientProjectionSafe(projected,client),true);
});

test('proyección de un historial amplio permanece acotada y correcta',()=>{
  const data=baseData();data.sessions=[];for(let i=0;i<10000;i++)data.sessions.push({id:`s-${i}`,clientId:i%2===0?own:other,status:'publicado',visibleToClient:true,title:`Sesión ${i}`,blocks:[{id:`b-${i}`,name:'Sentadilla',sets:3,reps:'8',restSeconds:60,private_note:'NO-COMPARTIR'}]});
  const started=performance.now();const projected=projectCollectionsForRole(data,client);const elapsed=performance.now()-started;
  assert.equal(projected.sessions.length,5000);assert.doesNotMatch(JSON.stringify(projected),/NO-COMPARTIR|private_note/i);assert.ok(elapsed<5000,`La proyección tardó ${elapsed.toFixed(1)} ms`);
});

test('búsqueda de clientes filtra sin distinguir tildes y anuncia el resultado',()=>{
  const listeners={};const cards=[
    {hidden:false,getAttribute:()=> 'cynthia hibrido activo'},
    {hidden:false,getAttribute:()=> 'alvaro presencial activo'},
  ];
  const status={textContent:''};
  const root={addEventListener(type,fn){listeners[type]=fn;},removeEventListener(){},querySelectorAll(selector){return selector==='[data-client-text]'?cards:[];},querySelector(selector){return selector==='[data-client-search-status]'?status:null;},dispatchEvent(){return true;}};
  const state=createProductionState({identity:{id:'coach',role:'coach'},selectedClientId:null});
  const controller=createWorkflowController({root,store:{getState:()=>state},commandBus:{execute:async()=>({ok:true})},catalog:{list:()=>[],count:367}});controller.mount();
  const search={value:'Alvaro',closest(selector){return selector==='[data-client-search]'?this:null;}};
  listeners.input({target:search});
  assert.equal(cards[0].hidden,true);assert.equal(cards[1].hidden,false);assert.equal(status.textContent,'1 cliente encontrado');
  controller.destroy();
});

test('pantalla de autenticación usa cálculo de caja seguro en móvil',async()=>{
  const {readFile}=await import('node:fs/promises');
  const css=await readFile(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');
  assert.match(css,/\.m26-auth-page,\s*\.m26-auth-page \*\s*\{\s*box-sizing:\s*border-box/);
  assert.match(css,/\.m26-auth-card\s*\{[^}]*max-width:\s*100%/s);
});
