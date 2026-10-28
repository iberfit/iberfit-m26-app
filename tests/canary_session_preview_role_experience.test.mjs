import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';

const exercises=[
 {id:'press',name_es:'Press de pecho',equipment:'Mancuernas',cues:['Control escapular'],instructions_es:['Descender con control'],precautions:['No forzar rango doloroso']},
 {id:'row',name_es:'Remo TRX',equipment:'TRX'},
 {id:'squat',name_es:'Sentadilla',equipment:'Silla'},
];
const blocks=[
 {id:'one',type:'exercise',exerciseId:'press',sets:3,reps:'8-12',restSeconds:60,targetRpe:7,targetRir:3,tempo:'3-1-1',alternativeId:'row',prescriptionNotes:'Sin dolor'},
 {id:'two',type:'biserie',rounds:3,exerciseIds:['row','squat'],prescriptions:{row:{reps:'10',restSeconds:40,targetRpe:7},squat:{reps:'12',restSeconds:40,targetRir:2}}},
];
const appointment={id:'app-1',sessionId:'presencial',status:'confirmada',startAt:'2026-10-20T15:00:00Z'};
function item(id,ownership,visibility){
 return {id,title:id==='presencial'?'Fuerza presencial':'Fuerza autónoma',
  startAt:'2026-10-20T15:00:00Z',modality:ownership==='coach_led'?'presencial':'guiada_en_app',
  ownership,visibility,visible:true,calendarVisible:true,canClientExecute:ownership!=='coach_led',canClientStart:ownership!=='coach_led',
  session:{id,status:'published',durationMinutes:55,blocks,coachPrivateNotes:'NOTA PRIVADA NO MOSTRAR'},
  appointment:id==='presencial'?appointment:null,appointmentId:id==='presencial'?'app-1':null};
}
function html(role='client',items=[item('presencial','coach_led','summary_only'),item('guiada','guided_in_app','full')]){
 return renderRc39Route({kind:'sesion',role,serviceActive:true,
  sessionPreviewAssets:{catalog:exercises,mediaMap:null},
  rc39:{role,sessionProjections:items,appointments:[]},selectedClient:{modality:'hibrido'}});
}
test('Cliente presencial: título y duración, nunca bloques ni prescripción',()=>{
 const value=html('client',[item('presencial','coach_led','summary_only')]);
 assert.match(value,/Fuerza presencial/);
 assert.match(value,/55 min/);
 assert.match(value,/Esta sesión la dirige tu Coach/);
 for(const forbidden of ['Press de pecho','Remo TRX','Biserie','3-1-1','Control escapular','NOTA PRIVADA NO MOSTRAR','Ver sesión','Preparar entrenamiento']){
   assert.doesNotMatch(value,new RegExp(forbidden),forbidden);
 }
});
test('Cliente autónomo: Ver sesión completo y ejercicios con medios honestos; el CTA conserva ID exacto',()=>{
 const value=html('client',[item('guiada','guided_in_app','full')]);
 for(const visible of ['Ver sesión','Press de pecho','Remo TRX','Sentadilla','Biserie','3 rondas','8-12','60 s','RPE','RIR','3-1-1','Control escapular','Alternativa','Sin referencia visual','Preparar entrenamiento']){
   assert.ok(value.includes(visible),visible);
 }
 assert.match(value,/data-entity-id="guiada"/);
 assert.equal((value.match(/data-workflow-action="start-published-session"/g)||[]).length,1);
 const disclosure=value.indexOf('<details class="m26-rc39-session-content');
 const launch=value.indexOf('data-workflow-action="start-published-session"');
 assert.ok(disclosure>=0&&launch>value.indexOf('</details>',disclosure),'primary start is visible after optional preview');
 assert.doesNotMatch(value,/data-session-primary-start/);
 assert.match(value,/loading="lazy"|Sin referencia visual/);
 assert.doesNotMatch(value,/NOTA PRIVADA NO MOSTRAR/);
});
test('Visibilidad summary_only contradictoria oculta prescripción aunque tenga bloques',()=>{
 const guided=item('guiada','guided_in_app','summary_only');
 const value=html('client',[guided]);
 assert.doesNotMatch(value,/Press de pecho|Ver sesión|Sin referencia visual|Preparar entrenamiento/);
 assert.match(value,/El detalle de esta sesión estará disponible/);
});
test('Coach conserva acceso a prescripción de sesiones dirigidas y conoce visibilidad del cliente',()=>{
 const value=html('coach',[item('presencial','coach_led','summary_only')]);
 assert.match(value,/Revisar prescripción y vista del cliente/);
 assert.match(value,/Cliente: título, duración y cita/);
 assert.match(value,/Press de pecho/);
 assert.match(value,/Biserie/);
});
test('La pantalla real transporta catálogo y manifiesto desde el VM, sin mutar el estado de sesión',()=>{
 const state={identity:{id:'user-1',role:'client',clientId:'c1'},selectedClientId:'c1',collections:{sessions:[],appointments:[]}};
 const shell={activeArea:'sesion',identity:state.identity,page:{title:'Sesiones'}};
 const vm=createRouteViewModel(shell,state,new Date('2026-10-16T14:00:00Z'),{catalog:exercises,mediaMap:null});
 assert.equal(vm.sessionPreviewAssets.catalog,exercises);
 assert.equal(vm.sessionPreviewAssets.mediaMap,null);
});

test('Una cita no resucita detalles de un entrenamiento retirado ni el botón de empezar',()=>{
 const hidden={...item('guiada','guided_in_app','full'),visible:false,appointmentId:'apt-guided'};
 const appointment={id:'apt-guided',title:'Entrenamiento con cita',startAt:'2026-10-21T15:00:00Z',status:'confirmada'};
 const result=renderRc39Route({kind:'agenda',role:'client',serviceActive:true,selectedClient:{modality:'hibrido'},
   rc39:{role:'client',appointments:[appointment],sessionProjections:[hidden]},sessionPreviewAssets:{catalog:exercises,mediaMap:null}});
 assert.match(result,/Entrenamiento con cita/);
 assert.doesNotMatch(result,/Press de pecho|data-rc39-session="guiada"|data-workflow-action="start-published-session"/);
});


test('Cliente no recibe prescripción ni CTA si la proyección contradice al servidor',()=>{
 const misleading=item('guiada','guided_in_app','full');
 misleading.session={...misleading.session,deliveryOwnership:'coach_led',deliveryModality:'presencial',clientVisibilityLevel:'full'};
 let value=html('client',[misleading]);
 assert.doesNotMatch(value,/Ver sesión|Preparar entrenamiento|Press de pecho/);
 const wrongId={...item('guiada','guided_in_app','full'),id:'OTRA-SESION'};
 value=html('client',[wrongId]);
 assert.doesNotMatch(value,/Ver sesión|Preparar entrenamiento|Press de pecho/);
});

test('Vista previa robusta: bloques nulos, dispersos y arrays importados no bloquean Cliente ni Coach',()=>{
  const broken=item('guiada','guided_in_app','full');
  broken.session={...broken.session,blocks:[null,undefined,[],...blocks]};
  for(const role of ['client','coach']){
    const value=html(role,[broken]);
    assert.match(value,/Press de pecho/);
    assert.match(value,/Remo TRX/);
    assert.match(value,/Biserie/);
    assert.match(value,/Ejercicio 1/);
    assert.doesNotMatch(value,/Ejercicio 4|NOTA PRIVADA NO MOSTRAR/);
    if(role==='client')assert.match(value,/Preparar entrenamiento/);
  }
});


test('Una sesion con todos los bloques importados invalidos no ofrece inicio Cliente ni Coach',()=>{
  const broken=item('guiada','guided_in_app','full');
  broken.session={...broken.session,blocks:[null,undefined,[],false,0,'invalido',{}]};
  for(const role of ['client','coach']){
    const value=html(role,[broken]);
    assert.match(value,/Fuerza autónoma/);
    assert.match(value,/El detalle de esta sesión estará disponible/);
    assert.doesNotMatch(value,/Ver sesión|Preparar entrenamiento|Comenzar con Coach|data-workflow-action="start-published-session"/);
    assert.doesNotMatch(value,/NOTA PRIVADA NO MOSTRAR/);
  }
});

test('El limite de 120 bloques se aplica despues de descartar bloques nulos',()=>{
  const broken=item('guiada','guided_in_app','full');
  broken.session={...broken.session,blocks:[...Array.from({length:130},()=>null),...blocks]};
  const value=html('client',[broken]);
  assert.match(value,/Ver sesión/);
  assert.match(value,/Press de pecho/);
  assert.match(value,/Biserie/);
  assert.match(value,/Ejercicio 1/);
  assert.match(value,/Preparar entrenamiento/);
  assert.doesNotMatch(value,/NOTA PRIVADA NO MOSTRAR/);
});


test('La vista previa conserva exactamente el maximo de 120 bloques validos',()=>{
  const long=item('guiada','guided_in_app','full');
  long.session={...long.session,blocks:Array.from({length:125},(_,index)=>({
    id:'block-'+index,type:'exercise',exerciseId:'press',sets:1,reps:'8'
  }))};
  const value=html('client',[long]);
  assert.equal((value.match(/class="m26-session-preview-block"/g)||[]).length,120);
  assert.doesNotMatch(value,/Ejercicio 121/);
});

test('SIGNATURE Client distinguishes a Coach-led session from an authorized guided session',()=>{
  const supervised=html('client',[item('presencial','coach_led','summary_only')]);
  assert.match(supervised,/data-client-session-state="published"/u);
  assert.match(supervised,/Esta sesión la dirige tu Coach/u);
  assert.doesNotMatch(supervised,/data-workflow-action="start-published-session"|data-client-session-state="ready"/u);
  const autonomous=html('client',[item('guiada','guided_in_app','full')]);
  assert.match(autonomous,/data-client-session-state="ready"/u);
  assert.match(autonomous,/Ver sesión/u);
  assert.equal((autonomous.match(/data-workflow-action="start-published-session"/gu)||[]).length,1);
  assert.match(autonomous,/data-entity-id="guiada"/u);
  assert.doesNotMatch(autonomous,/NOTA PRIVADA NO MOSTRAR/u);
  const coach=html('coach',[item('presencial','coach_led','summary_only')]);
  assert.match(coach,/data-client-session-state="professional"/u);
  assert.doesNotMatch(coach,/data-client-session-empty|A tu ritmo, con criterio/u);
});
test('SIGNATURE Client blocked exercise view keeps the session visible but never promises a start',()=>{
  const projection=item('guiada','guided_in_app','summary_only');
  const value=html('client',[projection]);
  assert.match(value,/data-client-session-state="published"/u);
  assert.match(value,/El detalle de esta sesión estará disponible/u);
  assert.doesNotMatch(value,/data-workflow-action="start-published-session"|data-client-session-state="ready"/u);
});

test('SIGNATURE stale client projection cannot re-enable a workout that has already started',()=>{
  // A cached projection may still say canClientStart=true, but the underlying
  // canonical session status must win. Keep the full authorized preview.
  const stale=item('guiada','guided_in_app','full');
  stale.session={...stale.session,status:'en_curso',
    deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
    clientVisibilityLevel:'full',visibleToClient:true};
  const value=html('client',[stale]);
  assert.match(value,/Fuerza autónoma/u);
  assert.match(value,/Ver sesión/u);
  assert.doesNotMatch(value,/data-workflow-action="start-published-session"|Preparar entrenamiento/u);
  assert.doesNotMatch(value,/NOTA PRIVADA NO MOSTRAR/u);
});
