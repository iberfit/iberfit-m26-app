import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  actorCanExecuteSession,appointmentConfirmationState,clientSessionProjection,
  sessionHasExecutableBlocks,
} from '../src/m26/rc39/session-policy.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {renderHoyRoute,renderPlanningRoute} from '../src/m26/modules/route-render.js';
import {renderLiveModalityPrescription,explicitSessionEffort} from '../src/m26/workflows/session-ui.js';
import {renderCommunicationRoute} from '../src/m26/communication/route-render.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const clientId='c-m32';
const guided={id:'guided-m32',clientId,status:'publicado',visibleToClient:true,
  title:'Fuerza guiada',deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  blocks:[{id:'b1',type:'exercise',exerciseId:'squat',name:'Sentadilla',sets:3,reps:'10'}]};
const supervised={...guided,id:'coach-m32',title:'Fuerza con Coach',
  deliveryModality:'presencial',deliveryOwnership:'coach_led',clientVisibilityLevel:'summary_only'};
const projection=(session,appointment=null)=>clientSessionProjection(session,appointment,new Date('2026-10-13T14:00:00Z'));
const vmSession=(items,{role='client',serviceActive=true}={})=>({kind:'sesion',role,serviceActive,
  selectedClient:{modality:'hibrido'},rc39:{sessionProjections:items}});

test('M32: a session with no actual exercise cannot be presented as a runnable workout',()=>{
  assert.equal(sessionHasExecutableBlocks({...guided,blocks:[]}),false);
  assert.equal(sessionHasExecutableBlocks({...guided,blocks:[{type:'circuito',exerciseIds:[]}]}),false);
  assert.equal(sessionHasExecutableBlocks(guided),true);
  assert.equal(projection({...guided,blocks:[]}).canClientExecute,true);
  assert.equal(projection({...guided,blocks:[]}).canClientStart,false);
  assert.equal(projection(guided).canClientStart,true);
  assert.equal(projection(supervised).canClientStart,false);
});

test('M32: confirmed attendance never overrides a subsequently canceled appointment',()=>{
  const a={startAt:'2026-10-16T12:00:00Z',status:'cancelada',confirmedByClientAt:'2026-10-12T13:00:00Z'};
  const result=appointmentConfirmationState(a,new Date('2026-10-13T14:00:00Z'));
  assert.equal(result.state,'closed');
  assert.equal(result.canConfirm,false);
  assert.equal(result.canRequestChange,false);
  const change={...a,changeRequestedAt:'2026-10-13T13:00:00Z'};
  assert.equal(appointmentConfirmationState(change).state,'closed');
});

test('M32: the RC39 Client session page never presents a false start when paused',()=>{
  const p=projection(guided);
  const enabled=renderRc39Route(vmSession([p]));
  const paused=renderRc39Route(vmSession([p],{serviceActive:false}));
  assert.match(enabled,/data-workflow-action="start-published-session"/);
  assert.doesNotMatch(paused,/data-workflow-action="start-published-session"/);
});

test('M32: supervised or unprepared sessions do not expose Live Workout',()=>{
  const records=[projection(supervised),projection({...guided,id:'empty-m32',blocks:[]})];
  const html=renderRc39Route(vmSession(records));
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/);
  assert.match(html,/Sesión supervisada|con tu Coach|Coach/);
});

test('M32: Coach cannot start an unconfirmed supervised appointment or empty session',()=>{
  const pending={id:'appt-m32',clientId,sessionId:supervised.id,status:'pendiente',startAt:'2026-10-16T12:00:00Z'};
  const pendingView=renderRc39Route(vmSession([projection(supervised,pending)],{role:'coach'}));
  assert.doesNotMatch(pendingView,/data-workflow-action="start-published-session"/);
  const confirmed={...pending,status:'confirmada'};
  const confirmedView=renderRc39Route(vmSession([projection(supervised,confirmed)],{role:'coach'}));
  assert.match(confirmedView,/data-workflow-action="start-published-session"/);
  const emptyView=renderRc39Route(vmSession([projection({...guided,blocks:[]})],{role:'coach'}));
  assert.doesNotMatch(emptyView,/data-workflow-action="start-published-session"/);
});

test('M32: Client home reaches a standalone autonomous session directly without a fictitious appointment',()=>{
  const html=renderHoyRoute({kind:'hoy',role:'client',clients:[{id:clientId,name:'Cliente',serviceActive:true}],
    appointments:[],upcoming:[],rc39:{sessionProjections:[projection(guided)]},operations:{},clientGuide:{communicationAvailable:false}});
  assert.match(html,/data-workflow-action="start-published-session" data-entity-id="guided-m32"/);
  assert.match(html,/Entrenar ahora/);
});

test('M32: live strength prescriptions never fabricate rest, tempo, RPE or RIR',()=>{
  const html=renderLiveModalityPrescription({reps:'10'}, {kind:'strength',cardio:false},{},'client');
  assert.match(html,/10/);
  assert.doesNotMatch(html,/RPE 7|RIR 3|Controlado|60 s|Descanso prescrito|Ritmo prescrito/);
  const confirmed=renderLiveModalityPrescription({reps:'8',restSeconds:0,targetRpe:8,targetRir:2,tempo:'3-1-1'}, {kind:'strength',cardio:false},{},'client');
  assert.match(confirmed,/0 s/);assert.match(confirmed,/RPE 8/);assert.match(confirmed,/RIR 2/);assert.match(confirmed,/3-1-1/);
  assert.equal(explicitSessionEffort(null),null);
});

test('M32: messaging makes empty unread states calm and labels its accessible inputs',()=>{
  const html=renderCommunicationRoute({kind:'mensajes',communication:{active:true},role:'client',threads:[{
    id:'thread-1',coachName:'Coach',unreadCount:0,messages:[{senderRole:'coach',body:'Bienvenido',createdAt:'2026-10-12T10:00:00Z'}]
  }],notifications:[],canOpenThread:false,clients:[]});
  assert.match(html,/data-thread-unread-count="0"/);
  assert.doesNotMatch(html,/0 nuevos/);
  assert.match(html,/<label class="m32-message-label">Escribe tu mensaje/);
  assert.match(html,/<time datetime="2026-10-12T10:00:00\.000Z">/);
});

test('M32: Coach publication defaults to concise progressive disclosure',()=>{
  const vm={role:'coach',serviceKind:'training',canEdit:false,periodization:null,
    currentCycle:{id:'cycle-m32',name:'Fuerza',status:'aprobado'},profile:{},
    cycles:[],cycleCounts:{approved:1},sessions:[{id:'sess-m32',title:'Sesión borrador',clientContent:{title:'Fuerza',summary:'Resumen'},publication:{status:'approved',statusLabel:'Aprobada',actions:[{action:'publish',label:'Publicar',requiresPreview:true}]}}],
    sessionCounts:{published:0},iriPlanningSeed:null};
  const html=renderPlanningRoute(vm);
  assert.match(html,/m32-planning-journey/);
  assert.match(html,/id="m26-planning-publications"/);
  assert.match(html,/<details class="m26-publication-preview" data-publication-preview-details>/);
  assert.doesNotMatch(html,/<details class="m26-publication-preview"[^>]* open/);
  assert.match(html,/Siguiente decisión/);
  assert.match(html,/data-publication-preview/);
});

test('M32: live workout and publication controls remain fail-closed in event controller',()=>{
  const ctrl=readFileSync('src/m26/app/workflow-controller.js','utf8');
  const policy=readFileSync('src/m26/rc39/session-policy.js','utf8');
  assert.match(ctrl,/sessionHasExecutableBlocks\(session\)/);
  assert.match(ctrl,/M26_SESSION_EXECUTION_FORBIDDEN/);
  assert.match(policy,/TERMINAL_APPOINTMENT_STATES\.has\(rawStatus\)/);
  assert.match(readFileSync('src/m26/design/premium-ux.css','utf8'),/M32 UX 360:/);
});

test('M32: new primary navigation and prescription copy stays translated in EN/FR/PT',()=>{
  for(const copy of ['Entrenamiento disponible','Sesión en preparación. Tu Coach revisará los ejercicios antes de habilitarla.',
    'Descanso prescrito','Ritmo prescrito','Esfuerzo objetivo','Escribe tu mensaje','Revisar publicación']){
    for(const language of ['en','fr','pt'])assert.notEqual(iberfitSurfaceTranslate(copy,{language}),copy,copy+':'+language);
  }
});
