import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createCommandBus,createMemoryOperationRepository,createM26Transport,createSessionVault,
  createSessionDraft,addCatalogExercise,createExecution,startExecution,recordSet,finishExecution,
  validateExecutionSnapshot,createExecutionSnapshot,renderProgressRoute
} from '../src/m26/index.js';
import {createExerciseCatalog,resolveBrowserCatalogUrl} from '../src/m26/exercises/catalog.js';
import {__applicationInternals} from '../src/m26/app/application.js';
import {renderAccessUi} from '../src/m26/app/access-ui.js';
const root=new URL('..',import.meta.url);const text=(p)=>fs.readFileSync(new URL(p,root),'utf8');
const catalog=createExerciseCatalog(JSON.parse(text('baseline_m25_2/exercise-catalog-m25.json')));
const command={operationId:'00000000-0000-4000-8000-000000000111',type:'EJECUCION_GUARDAR_PROGRESO',entityType:'session_execution',entityId:'e1',clientId:'c1',baseRevision:0,conflictSensitive:false,payload:{progressSnapshot:{id:'e1'}}};
function session(){const d=createSessionDraft({clientId:'c1'});addCatalogExercise(d,catalog.list()[0].id,catalog,{sets:1,reps:'10'});return d;}
function response(body,status=200){return {ok:status>=200&&status<300,status,headers:{get:()=> 'application/json'},json:async()=>body,text:async()=>JSON.stringify(body)};}

test('Command Bus aplica single-flight por operationId y evita dobles escrituras',async()=>{
  const repository=createMemoryOperationRepository();let calls=0;let release;const wait=new Promise((resolve)=>{release=resolve;});
  const bus=createCommandBus({repository,getToken:async()=> 'token',transport:{preflight:async()=>({}),execute:async()=>{calls++;await wait;return {kind:'ack',remoteRevision:1};}}});
  const a=bus.execute(command),b=bus.execute(command);assert.equal(a,b);release();const [ra,rb]=await Promise.all([a,b]);assert.equal(calls,1);assert.equal(ra.ok,true);assert.deepEqual(ra,rb);
});

test('flush concurrente comparte una sola ejecución y conserva createdAt',async()=>{
  const repository=createMemoryOperationRepository();let calls=0;const bus=createCommandBus({repository,getToken:async()=> 'token',transport:{preflight:async()=>({}),execute:async()=>{calls++;return {kind:'ack'};}}});
  await repository.put({...command,status:'pending',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',retryable:true});
  const a=bus.flushPending(),b=bus.flushPending();assert.equal(a,b);await Promise.all([a,b]);assert.equal(calls,1);
});

test('transporte fija origen Supabase, RPC permitidas y no filtra token como opción fetch',async()=>{
  assert.throws(()=>createM26Transport({enabled:true,projectRef:'pjhmrhejsoofmouedavw',url:'https://evil.example',publishableKey:'pk'}),/ORIGIN_MISMATCH/);
  assert.throws(()=>createM26Transport({enabled:true,projectRef:'pjhmrhejsoofmouedavw',url:'https://pjhmrhejsoofmouedavw.supabase.co',publishableKey:'pk',rpc:{execute:'otro_rpc'}}),/RPC_CONFIG_INVALID/);
  let options;const transport=createM26Transport({enabled:true,projectRef:'pjhmrhejsoofmouedavw',url:'https://pjhmrhejsoofmouedavw.supabase.co',publishableKey:'pk'},{fetchImpl:async(_url,input)=>{options=input;return response([]);}});
  await transport.commandRegistry('secret-token');assert.equal('token' in options,false);assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
});

test('refresh rechaza respuesta incompleta y no reemplaza silenciosamente identidad',async()=>{
  const transport=createM26Transport({enabled:true,projectRef:'pjhmrhejsoofmouedavw',url:'https://pjhmrhejsoofmouedavw.supabase.co',publishableKey:'pk'},{fetchImpl:async()=>response({refresh_token:'r2'})});
  await assert.rejects(()=>transport.refresh('r1'),/REFRESH_INVALID_RESPONSE/);
});

test('vault elimina almacenamiento corrupto',()=>{
  const data=new Map([['iberfit:m26:session:v1','{bad']]);const storage={setItem:(k,v)=>data.set(k,v),getItem:(k)=>data.get(k)||null,removeItem:(k)=>data.delete(k)};
  const vault=createSessionVault({storage});assert.equal(vault.load(),null);assert.equal(data.has('iberfit:m26:session:v1'),false);
});

test('snapshot rechaza credenciales con variantes de mayúsculas y guiones',()=>{
  const d=session(),execution=createExecution({session:d,clientId:'c1'});const snapshot=createExecutionSnapshot({execution,session:d,ownerId:'u1'});snapshot.session.metadata={Authorization:'Bearer secret'};const result=validateExecutionSnapshot(snapshot);assert.equal(result.ok,false);assert.ok(result.errors.includes('CREDENTIALS_FORBIDDEN'));
});

test('registro de series rechaza números no finitos, RIR inválido y dolor sin detalle',()=>{
  const d=session(),execution=createExecution({session:d,clientId:'c1'});startExecution(execution);
  assert.throws(()=>recordSet(execution,d,{reps:'Infinity',rpe:7}),/REPS_INVALID/);
  assert.throws(()=>recordSet(execution,d,{reps:10,rpe:7,rir:11}),/RIR_INVALID/);
  recordSet(execution,d,{reps:10,rpe:7,rir:2});execution.status='awaiting_feedback';assert.throws(()=>finishExecution(execution,{sessionRpe:7,comment:'Bien',pain:true}),/PAIN_NOTES_REQUIRED/);
});

test('selector de cita prioriza vínculo de sesión y descarta citas antiguas no vinculadas',()=>{
  const s={id:'s1',clientId:'c1'};const now=Date.parse('2026-07-19T15:00:00Z');const records=[
    {id:'old',clientId:'c1',status:'confirmed',startAt:'2026-07-01T10:00:00Z'},
    {id:'other',clientId:'c1',status:'confirmed',sessionId:'s2',startAt:'2026-07-19T16:00:00Z'},
    {id:'linked',clientId:'c1',status:'confirmed',sessionId:'s1',startAt:'2026-07-19T17:00:00Z'},
  ];assert.equal(__applicationInternals.confirmedAppointmentForSession(records,s,now).id,'linked');
});

test('timeline tolera fechas inválidas sin romper renderizado',()=>{
  const html=renderProgressRoute({summary:{days:28,dataQuality:'limited',adherence:null,completedSessions:0,plannedSessions:0,averageRpe:null,volume:null,iriDelta:null,iriCurrent:null,checkinAverage:{energy:null,sleep:null,stress:null,pain:null}},signal:{label:'Sin datos',level:'info'},timeline:[{date:'fecha-invalida',title:'Registro',detail:'Detalle'}],alerts:[]});
  assert.match(html,/Sin fecha/);
});

test('PWA queda confinada a /m26 y excluye runtime, API y rutas ajenas',()=>{
  const sw=text('public/m26/sw.js'),headers=text('public/m26/_headers'),pwa=text('src/m26/platform/pwa.js');
  assert.match(sw,/m26-rc(?:16|17|19)/);assert.match(sw,/NEVER_CACHE_PREFIXES/);assert.match(sw,/isRuntimeConfig/);assert.match(sw,/Response\.error/);assert.doesNotMatch(sw,/caches\.match\(OFFLINE\).*return/);
  assert.match(headers,/Service-Worker-Allowed: \/m26\//);assert.doesNotMatch(headers,/style-src[^\n]*unsafe-inline/);assert.match(pwa,/scope='\/m26\/'/);
});

test('HTML entregado no requiere estilos ni scripts inline',()=>{
  for(const file of ['public/m26/index.html','public/m26/offline.html']){const html=text(file);assert.doesNotMatch(html,/<style\b/i);assert.doesNotMatch(html,/<script(?![^>]*\bsrc=)[^>]*>/i);assert.doesNotMatch(html,/\sstyle=/i);}
});

test('acceso y rutas no exponen jerga técnica en el texto comercial',()=>{
  const access=renderAccessUi({backendReady:true,qaOnly:false});assert.doesNotMatch(access,/backend|canario|QA|Supabase/i);
  const route=text('src/m26/modules/route-render.js');for(const term of ['Command Bus','RLS específica','recibir ACK','bootstrap M26','pendiente de backend'])assert.doesNotMatch(route,new RegExp(term,'i'));
});

import {computeProgressSummary,buildProgressTimeline,progressWindow} from '../src/m26/engagement/progress-engine.js';
import {executionElapsedMs,recoverExecutionTimers} from '../src/m26/workflows/session-timer.js';
import {createMemoryExecutionRecoveryStore} from '../src/m26/workflows/session-recovery.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

test('progreso interpreta resultados por clave, cargas con unidad y fechas canónicas',()=>{
  const state={collections:{
    appointments:[{id:'a1',clientId:'c1',scheduledAt:'2026-06-25T10:00:00Z',status:'completed'},{id:'a2',clientId:'c1',scheduledAt:'2026-07-18T10:00:00Z',status:'completed'}],
    sessionExecutions:[
      {id:'e-new',clientId:'c1',completedAt:'2026-07-18T11:00:00Z',status:'completed',results:{'x:1':{reps:10,load:'20 kg',rpe:8}}},
      {id:'e-old',clientId:'c1',completedAt:'2026-06-25T11:00:00Z',status:'completed',results:{'x:1':{reps:10,load:'10 kg',rpe:6}}},
    ],
    checkins:[{id:'ch1',clientId:'c1',recordedAt:'2026-07-17T09:00:00Z',energy:7,sleep:6,stress:4,pain:0}],
    iriAssessments:[{id:'i1',clientId:'c1',assessmentDate:'2026-07-16',score:75},{id:'i0',clientId:'c1',assessmentDate:'2026-06-10',score:70}],
  }};
  const summary=computeProgressSummary(state,'c1',{now:'2026-07-19T12:00:00Z',days:28});
  assert.equal(summary.averageRpe,7);assert.equal(summary.volume,150);assert.equal(summary.volumeDelta,100);assert.equal(summary.checkins,1);assert.equal(summary.iriCurrent,0);assert.equal(summary.iriAssessmentCount,2);
  const timeline=buildProgressTimeline(state,'c1',{now:'2026-07-19T12:00:00Z',days:90});assert.ok(timeline.some((row)=>row.kind==='checkin'));assert.ok(timeline.some((row)=>row.kind==='iri'));
});

test('ventana de progreso rechaza fecha inválida y acota días no válidos',()=>{
  assert.throws(()=>progressWindow({now:'no-es-fecha'}),/NOW_INVALID/);
  const window=progressWindow({now:'2026-07-19T00:00:00Z',days:0});assert.equal(window.days,28);
});

test('snapshot de recuperación rechaza índices, fechas y temporizadores corruptos',()=>{
  const d=session(),execution=createExecution({session:d,clientId:'c1'}),base=createExecutionSnapshot({execution,session:d,ownerId:'u1'});
  const badIndex=structuredClone(base);badIndex.execution.status='active';badIndex.execution.index=badIndex.execution.queue.length;assert.ok(validateExecutionSnapshot(badIndex).errors.includes('EXECUTION_INDEX_INVALID'));
  const badSet=structuredClone(base);badSet.execution.setIndex=badSet.execution.queue[0].sets;assert.ok(validateExecutionSnapshot(badSet).errors.includes('EXECUTION_SET_INDEX_INVALID'));
  const badDate=structuredClone(base);badDate.execution.activeSince='fecha-imposible';assert.ok(validateExecutionSnapshot(badDate).errors.includes('EXECUTION_DATE_INVALID'));
  const badSaved=structuredClone(base);badSaved.savedAt='fecha-imposible';assert.ok(validateExecutionSnapshot(badSaved).errors.includes('SAVED_AT_INVALID'));
});

test('temporizador corrupto nunca infla duración y se recupera desde tiempo seguro',()=>{
  const execution={status:'active',activeSince:'fecha-imposible',accumulatedActiveMs:2500,restUntil:'fecha-imposible'};
  const at=Date.parse('2026-07-19T12:00:00Z');assert.equal(executionElapsedMs(execution,at),2500);recoverExecutionTimers(execution,at);assert.equal(execution.activeSince,'2026-07-19T12:00:00.000Z');assert.equal(execution.restUntil,null);assert.equal(execution.accumulatedActiveMs,2500);
});

test('almacén de recuperación elimina sesiones vencidas',async()=>{
  let at=new Date('2026-07-01T12:00:00Z');const d=session(),execution=createExecution({session:d,clientId:'c1'});const store=createMemoryExecutionRecoveryStore({ownerId:'u1',now:()=>at,ttlDays:30});await store.save({execution,session:d});at=new Date('2026-08-02T12:00:00Z');assert.equal(await store.load(execution.id),null);
});

test('formularios conservan validación nativa y límites de texto de prescripción',()=>{
  const access=renderAccessUi({backendReady:true});assert.doesNotMatch(access,/novalidate/);assert.match(access,/type="email"[^>]*required/);assert.match(access,/type="password"[^>]*minlength="8"/);
  const d=session();const html=renderSessionBuilder({draft:d,catalog});assert.match(html,/data-session-block-field="reps"[^>]*maxlength="80"/);assert.match(html,/data-session-block-field="tempo"[^>]*maxlength="80"/);
  const css=text('src/m26/shell/shell.css');assert.match(css,/\.m26-builder-editor\{grid-template-columns:minmax\(0,1fr\)/);
});


test('resolución del catálogo tolera about:blank sin permitir orígenes cruzados',()=>{
  assert.equal(resolveBrowserCatalogUrl('/baseline_m25_2/exercise-catalog-m25.json',{href:'about:blank',origin:'null'}),'http://localhost/baseline_m25_2/exercise-catalog-m25.json');
  assert.equal(resolveBrowserCatalogUrl('/catalog.json',{href:'https://app.iberfit.cl/m26/',origin:'https://app.iberfit.cl'}),'https://app.iberfit.cl/catalog.json');
  assert.throws(()=>resolveBrowserCatalogUrl('https://evil.example/catalog.json',{href:'https://app.iberfit.cl/m26/',origin:'https://app.iberfit.cl'}),/CROSS_ORIGIN_FORBIDDEN/);
});
