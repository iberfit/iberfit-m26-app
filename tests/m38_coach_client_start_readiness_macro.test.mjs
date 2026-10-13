import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sessionReadyToStart,clientSessionProjection,actorCanExecuteSession} from '../src/m26/rc39/session-policy.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {renderHoyRoute,renderSessionsRoute,renderPlanningRoute} from '../src/m26/modules/route-render.js';
import {__applicationInternals} from '../src/m26/app/application.js';

const cid='client-m38';
const block={id:'b-running',type:'exercise',exerciseId:'IBF-CARRERA-SUAVE',sets:1,plannedDistanceKm:5,plannedDurationMinutes:30};
const guided=(status,id='guided-m38')=>({
  id,clientId:cid,title:'Running guiado',status,visibleToClient:true,
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  clientVisibilityLevel:'full',revision:status==='disponible'?2:1,blocks:[block]
});
const coach=(status)=>({
  ...guided(status,'coach-m38'),title:'Fuerza con Coach',
  deliveryModality:'presencial',deliveryOwnership:'coach_led',clientVisibilityLevel:'summary_only',
});
const projected=(status)=>clientSessionProjection(guided(status),null,new Date('2026-10-13T15:00:00Z'));
const rc39=(item)=>renderRc39Route({kind:'sesion',role:'client',serviceActive:true,rc39:{sessionProjections:[item]},selectedClient:{modality:'hibrido'}});
const home=(item)=>renderHoyRoute({kind:'hoy',role:'client',clients:[{id:cid,name:'Cliente IBERFIT',serviceActive:true}],
  appointments:[],upcoming:[],rc39:{sessionProjections:[item]},operations:{pending:0,conflicts:0,rejected:0},clientGuide:{communicationAvailable:false}});

test('M38 visibility is not the same as start authorization',()=>{
  for(const status of ['publicada','publicado','published','aprobada','borrador','en_curso','completada']){
    assert.equal(sessionReadyToStart(guided(status)),false,status);
  }
  assert.equal(sessionReadyToStart(guided('disponible')),true);
  assert.equal(sessionReadyToStart({...guided('disponible'),blocks:[]}),false);
  assert.equal(actorCanExecuteSession({role:'client',session:coach('disponible')}),false);
  assert.equal(clientSessionProjection(guided('publicada')).visible,true);
  assert.equal(clientSessionProjection(guided('publicada')).canClientExecute,true);
  assert.equal(clientSessionProjection(guided('publicada')).canClientStart,false);
  assert.equal(clientSessionProjection(guided('disponible')).canClientStart,true);
});

test('M38 Client homepage and RC39 never advertise execution before available',()=>{
  const awaiting=projected('publicada');
  const available=projected('disponible');
  assert.doesNotMatch(rc39(awaiting),/data-workflow-action="start-published-session"/);
  assert.doesNotMatch(home(awaiting),/data-workflow-action="start-published-session"/);
  assert.match(rc39(available),/data-workflow-action="start-published-session"/);
  assert.match(home(available),/data-entity-id="guided-m38"/);
  assert.doesNotMatch(rc39(clientSessionProjection(coach('disponible'))),/data-workflow-action="start-published-session"/);
});

test('M38 route cards give a recoverable explanation and only ready session has CTA',()=>{
  const item=(status)=>({
    id:'guided-m38',title:'Running guiado',canClientExecute:true,
    canClientStart:status==='disponible',sessionStatus:status,
    deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
    clientContent:{title:'Running guiado',summary:'Rodaje personalizado'}
  });
  const vm=(status)=>({
    kind:'sesion',role:'client',serviceKind:'training',serviceActive:true,
    sessions:[item(status)],sessionCounts:{published:1},executions:[],wearableContext:null
  });
  const pending=renderSessionsRoute(vm('publicada'));
  assert.match(pending,/pendiente de habilitación/);
  assert.doesNotMatch(pending,/data-workflow-action="start-published-session"/);
  const ready=renderSessionsRoute(vm('disponible'));
  assert.match(ready,/data-workflow-action="start-published-session" data-entity-id="guided-m38"/);
  assert.match(ready,/data-client-session-executable="true"/);
  const already=renderSessionsRoute(vm('en_curso'));
  assert.match(already,/Recupera el entrenamiento activo/);
  assert.doesNotMatch(already,/data-workflow-action="start-published-session"/);
  const paused=renderSessionsRoute({...vm('disponible'),serviceActive:false});
  assert.doesNotMatch(paused,/data-workflow-action="start-published-session"/);
});

test('M38 Coach planning sends available guided sessions to session, not invented appointment',()=>{
  const v=(status,mode='guiada_en_app')=>({
    role:'coach',serviceKind:'training',serviceActive:true,canEdit:false,periodization:null,
    profile:{},currentCycle:{id:'cycle-m38',name:'Running 5 semanas',status:'aprobado',modality:'hibrido'},
    cycles:[],cycleCounts:{approved:1},sessions:[{
      id:'sess-m38',title:'Rodaje',clientContent:{title:'Rodaje'},
      raw:mode==='guiada_en_app'?guided(status):coach(status),
      publication:{status:'published',statusLabel:'Publicada',visibleToClient:true,actions:[]}
    }],sessionCounts:{published:1}
  });
  const guidedHtml=renderPlanningRoute(v('disponible'));
  assert.match(guidedHtml,/Ver entrenamiento disponible/);
  assert.match(guidedHtml,/data-m26-area="sesion"/);
  assert.match(guidedHtml,/sin crear una cita ficticia/);
  const waiting=renderPlanningRoute(v('publicada'));
  assert.match(waiting,/Programar próxima cita/);
  const supervised=renderPlanningRoute(v('disponible','presencial'));
  assert.match(supervised,/Programar próxima cita/);
});

test('M38 application prioritizes canonical status over stale body status',()=>{
  const normalize=__applicationInternals.normalizePublishedSession;
  assert.equal(normalize({...guided('publicada'),body:{...guided('disponible')}}).status,'publicada');
  const find=__applicationInternals.publishedSessionForClient;
  assert.equal(find([guided('publicada')],cid),null);
  assert.equal(find([guided('disponible')],cid)?.id,'guided-m38');
  assert.equal(find([guided('en_curso')],cid),null);
});

test('M38 workflow gate refuses a second or premature execution',()=>{
  const controller=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  assert.ok(controller.includes('M38_SESSION_NOT_YET_AVAILABLE'));
  assert.ok(controller.includes('sessionReadyToStart(session)'));
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.ok(app.includes('if(!sessionReadyToStart(event.detail.session))'));
});
