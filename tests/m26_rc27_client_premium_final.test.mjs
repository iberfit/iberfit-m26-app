import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clientContentView,projectCollectionsForRole,assertClientProjectionSafe,
  stateFromBootstrap,createProductionState,createShellViewModel,createRouteViewModel,
  renderPlanningRoute,renderSessionsRoute,renderReportsRoute,createWorkflowController,
} from '../src/m26/index.js';

const clientId='CLI-RC27-001';
const client={id:'USR-RC27-CLIENT',role:'client',clientId,name:'Cliente RC27'};
const coach={id:'USR-RC27-COACH',role:'coach',name:'Entrenador RC27'};
function published(id,title,extra={}){return {id,clientId,title,status:'publicado',visibleToClient:true,revision:1,...extra};}
function collections(){return {
  clients:[{id:clientId,name:'Cliente RC27',modality:'Híbrido',internalNote:'NO-COMPARTIR-CLIENTE'}],
  clientProfiles:[{id:clientId,clientId,birthDate:'1992-04-03',objective:'Mejorar fuerza',coachNotes:'NO-COMPARTIR-PERFIL'}],
  clientAccess:[],
  iriAssessments:[{id:'IRI-27',clientId,status:'completado',score:76,classification:'Buen nivel',internalComment:'NO-COMPARTIR-IRI'}],
  trainingCycles:[published('PLAN-27','Plan de fuerza',{goal:'Mejorar fuerza y autonomía.',startDate:'2026-07-01',endDate:'2026-08-31',privateNotes:'NO-COMPARTIR-PLAN'})],
  sessions:[
    published('SESSION-27-A','Sesión de fuerza A',{objective:'Trabajo global controlado.',durationMinutes:48,coachNotes:'NO-COMPARTIR-SESION',blocks:[{id:'B1',exerciseId:'EX-1',name:'Sentadilla al cajón',sets:3,reps:'8',restSeconds:75,internalNote:'NO-COMPARTIR-BLOQUE'}]}),
    published('SESSION-27-B','Sesión de fuerza B',{objective:'Control y estabilidad.',durationMinutes:42,revision:2,blocks:[{id:'B2',exerciseId:'EX-2',name:'Remo con banda',sets:3,reps:'10',restSeconds:60}]})
  ],
  sessionExecutions:[{id:'EXEC-27',clientId,sessionId:'SESSION-27-A',status:'completado',completedAt:'2026-07-20T10:00:00Z',results:[{blockId:'B1',reps:8,loadKg:12,rpe:7,coachNote:'NO-COMPARTIR-RESULTADO'}],auditLog:'NO-COMPARTIR-AUDITORIA'}],
  reports:[published('REPORT-27','Informe de evolución',{periodStart:'2026-07-01',periodEnd:'2026-07-20',summary:'Evolución estable y buena adherencia.',conclusions:'La tolerancia al trabajo ha mejorado.',recommendations:'Mantener la progresión revisada.',internalNotes:'NO-COMPARTIR-INFORME',cost:99})],
  appointments:[{id:'APT-27',clientId,sessionId:'SESSION-27-A',status:'confirmado',title:'Sesión guiada',startAt:'2026-07-21T10:00:00Z',internalNote:'NO-COMPARTIR-CITA'}],
  checkins:[],habits:[],habitLogs:[],privateNotes:[{id:'PRIVATE',clientId,body:'NO-COMPARTIR-NOTA'}],intelligenceRuns:[{id:'AI',clientId,prompt:'NO-COMPARTIR-IA'}],domainEvents:[],coachAvailability:[],wearableConnections:[],wearableDailySummaries:[],wearableSyncRuns:[],m26Entities:[],
};}
function stateFor(user,area){return stateFromBootstrap({user,canary:{active:true},data:collections()},createProductionState({activeArea:area,selectedClientId:clientId}));}
function routeHtml(user,area){const state=stateFor(user,area);const vm=createRouteViewModel(createShellViewModel(state),state);return area==='planificacion'?renderPlanningRoute(vm):area==='sesion'?renderSessionsRoute(vm):renderReportsRoute(vm);}

test('proyección visible usa una lista explícita y elimina campos internos en todas las capas',()=>{
  const projected=projectCollectionsForRole(collections(),client);
  const serialized=JSON.stringify(projected);
  assert.doesNotMatch(serialized,/NO-COMPARTIR|coachNotes|internalNote|internalNotes|auditLog|cost/);
  assert.equal(projected.sessions[0].blocks[0].name,'Sentadilla al cajón');
  assert.equal(projected.sessions[0].blocks[0].internalNote,undefined);
  assert.equal(projected.sessionExecutions[0].results[0].rpe,7);
  assert.equal(projected.sessionExecutions[0].results[0].coachNote,undefined);
  assert.equal(assertClientProjectionSafe(projected,client),true);
});

test('auditor falla cerrado ante body, raw o secretos reintroducidos',()=>{
  const safe=projectCollectionsForRole(collections(),client);
  assert.throws(()=>assertClientProjectionSafe({...safe,sessions:[{...safe.sessions[0],raw:{coachNote:'x'}}]},client),/SENSITIVE_FIELD_EXPOSED/);
  assert.throws(()=>assertClientProjectionSafe({...safe,reports:[{...safe.reports[0],token:'x'}]},client),/SENSITIVE_FIELD_EXPOSED/);
});

test('proyección de contenido Cliente no expone campos desconocidos',()=>{
  const view=clientContentView('session',published('S','Sesión segura',{objective:'Objetivo visible',durationMinutes:50,coachNotes:'SECRETO',price:100,blocks:[{name:'Peso muerto con mancuerna',sets:3,reps:'8',restSeconds:60,privateNote:'SECRETO'}]}));
  const text=JSON.stringify(view);
  assert.match(text,/Objetivo visible|Peso muerto con mancuerna/);
  assert.doesNotMatch(text,/SECRETO|coachNotes|price|privateNote/);
  assert.deepEqual(view.facts,['50 min','1 bloque']);
});

test('proyección limita valores imposibles y textos excesivos',()=>{
  const view=clientContentView('session',published('S','X'.repeat(400),{durationMinutes:-4,blocks:[{name:'Y'.repeat(400),sets:-2,reps:'8',restSeconds:99999}]}));
  assert.equal(view.title.length,160);
  assert.deepEqual(view.facts,['1 bloque']);
  assert.equal(view.sections[0].items[0].title.length,120);
  assert.equal(view.sections[0].items[0].detail,'8');
});

test('informe Cliente evita repetir el resumen dentro del desplegable',()=>{
  const view=clientContentView('report',collections().reports[0]);
  assert.equal(view.summary,'Evolución estable y buena adherencia.');
  assert.deepEqual(view.sections.map((item)=>item.title),['Conclusiones','Próximos pasos']);
});

test('ViewModel Cliente no conserva raw, body ni metadatos editoriales',()=>{
  for(const area of ['planificacion','sesion','informes']){
    const state=stateFor(client,area);const vm=createRouteViewModel(createShellViewModel(state),state);
    const items=area==='planificacion'?[...vm.cycles,...vm.sessions]:area==='sesion'?vm.sessions:vm.reports;
    for(const item of items){assert.equal(item.raw,undefined);assert.equal(item.body,undefined);assert.equal(item.publication,undefined);assert.ok(item.clientContent);}
    assert.doesNotMatch(JSON.stringify(vm),/NO-COMPARTIR/);
  }
});

test('pantallas Cliente usan lenguaje de acción y no estados editoriales',()=>{
  for(const area of ['planificacion','sesion','informes']){
    const html=routeHtml(client,area);
    assert.doesNotMatch(html,/Publicado|publicado|Visible para el cliente|Gestionar publicación|Aprobar|Retirar|Borrador|estado editorial|data-publication-action/);
    assert.match(html,/m26-client-content-card/);
    assert.doesNotMatch(html,/NO-COMPARTIR/);
  }
});

test('cada sesión Cliente tiene una acción ligada a su identificador exacto',()=>{
  const html=routeHtml(client,'sesion');
  assert.match(html,/data-entity-id="SESSION-27-A"/);
  assert.match(html,/data-entity-id="SESSION-27-B"/);
  assert.equal((html.match(/Comenzar esta sesión/g)||[]).length,2);
});

test('vista Coach muestra la representación segura exacta y no campos privados',()=>{
  const html=routeHtml(coach,'sesion');
  assert.match(html,/Así lo verá el cliente/);
  assert.match(html,/Contenido completo que recibirá el cliente/);
  assert.match(html,/Sentadilla al cajón/);
  assert.doesNotMatch(html,/NO-COMPARTIR|coachNotes|internalNote/);
  assert.match(html,/Gestionar publicación/);
});

test('contenido malicioso se escapa en la interfaz Cliente',()=>{
  const source=collections();source.sessions=[published('X','<img src=x onerror=alert(1)>',{objective:'<script>alert(1)</script>',blocks:[]})];
  const state=stateFromBootstrap({user:client,canary:{active:true},data:source},createProductionState({activeArea:'sesion'}));
  const html=renderSessionsRoute(createRouteViewModel(createShellViewModel(state),state));
  assert.doesNotMatch(html,/<script>|<img/);
  assert.match(html,/&lt;script&gt;|&lt;img/);
});

test('controlador inicia la sesión publicada seleccionada y no la última por defecto',async()=>{
  const listeners={};const events=[];const statusNode={textContent:'',dataset:{}};
  const root={
    addEventListener(type,fn){listeners[type]=fn;},removeEventListener(type){delete listeners[type];},
    querySelector(selector){return selector==='[data-workflow-status="session"]'?statusNode:null;},
    dispatchEvent(event){events.push(event);return true;},
  };
  const state=stateFor(client,'sesion');
  const controller=createWorkflowController({root,store:{getState:()=>state},commandBus:{execute:async()=>({ok:true})},catalog:{list:()=>[]}});
  controller.mount();
  const button={dataset:{entityId:'SESSION-27-A'},disabled:false,setAttribute(){},removeAttribute(){},closest(selector){if(selector==='[data-workflow-action]')return this;if(selector==='form')return null;return null;},getAttribute(name){return name==='data-workflow-action'?'start-published-session':null;}};
  await listeners.click({target:button,preventDefault(){}});
  const start=events.find((event)=>event.type==='m26:start-session');
  assert.equal(start?.detail?.session?.id,'SESSION-27-A');
  assert.equal(statusNode.textContent,'Preparando sesión guiada.');
  controller.destroy();
});

test('identificador inexistente falla cerrado y no inicia otra sesión',async()=>{
  const listeners={};const events=[];const statusNode={textContent:'',dataset:{}};
  const root={addEventListener(type,fn){listeners[type]=fn;},removeEventListener(type){delete listeners[type];},querySelector(selector){return selector==='[data-workflow-status="session"]'?statusNode:null;},dispatchEvent(event){events.push(event);return true;}};
  const state=stateFor(client,'sesion');
  const controller=createWorkflowController({root,store:{getState:()=>state},commandBus:{execute:async()=>({ok:true})},catalog:{list:()=>[]}});controller.mount();
  const button={dataset:{entityId:'NO-EXISTE'},disabled:false,setAttribute(){},removeAttribute(){},closest(selector){if(selector==='[data-workflow-action]')return this;if(selector==='form')return null;return null;},getAttribute(){return 'start-published-session';}};
  await listeners.click({target:button,preventDefault(){}});
  assert.equal(events.some((event)=>event.type==='m26:start-session'),false);
  assert.equal(events.some((event)=>event.type==='m26:workflow-error'),true);
  controller.destroy();
});
