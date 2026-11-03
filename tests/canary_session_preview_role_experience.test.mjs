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
test('SIGNATURE R47 session primary remains one role-authorized action ahead of secondary content',()=>{
 const guided=html('client',[item('guiada','guided_in_app','full')]);
 const card=guided.split('<article class="m26-rc39-session-card')[1];
 assert.ok(card);
 const button=card.indexOf('data-client-session-primary');
 const detail=card.indexOf('<details class="m26-rc39-session-content');
 assert.ok(button>0&&detail>button);
 assert.equal((guided.match(/data-client-session-primary/g)||[]).length,1);
 assert.equal((guided.match(/data-workflow-action="start-published-session"/g)||[]).length,1);
 assert.doesNotMatch(guided,/Contenido completo/,'Client needs useful exercises rather than a technical visibility badge');
 assert.match(guided,/Press de pecho|Remo TRX/,'all prescribed blocks remain accessible');
 assert.doesNotMatch(guided,/NOTA PRIVADA NO MOSTRAR/);
 for(const unsafe of [
  {...item('guiada','guided_in_app','full'),visible:false},
  {...item('guiada','guided_in_app','full'),canClientStart:false},
  {...item('guiada','guided_in_app','full'),canClientExecute:false},
 ]){
  const htmlValue=html('client',[unsafe]);
  assert.doesNotMatch(htmlValue,/data-client-session-primary|data-workflow-action="start-published-session"/);
 }
 const coach=html('coach',[item('guiada','guided_in_app','full')]);
 assert.doesNotMatch(coach,/data-client-session-primary/);
 assert.match(coach,/Revisar prescripción y vista del cliente/);
 const supervised=html('client',[item('presencial','coach_led','summary_only')]);
 assert.doesNotMatch(supervised,/data-client-session-primary|data-workflow-action="start-published-session"/);
});
test('SIGNATURE R47 current and recovery actions keep honest text without duplicating server commands',()=>{
 const inProgress=item('guiada','guided_in_app','full');
 inProgress.canClientResume=true;
 inProgress.session={...inProgress.session,status:'en_curso'};
 const value=html('client',[inProgress]);
 assert.match(value,/Continuar entrenamiento/);
 assert.doesNotMatch(value,/Preparar entrenamiento/);
 assert.equal((value.match(/data-workflow-action="start-published-session"/g)||[]).length,1);
 assert.ok(value.indexOf('data-client-session-primary')<value.indexOf('<details class="m26-rc39-session-content'));
});
test('SIGNATURE R48: running real targets, one calm action, no fabricated distance or technical jargon',()=>{
 const running=item('guiada','guided_in_app','full');
 running.title='Carrera suave';
 running.session={...running.session,durationMinutes:60,blocks:[{
   id:'running-continuous',type:'exercise',exerciseId:'IBF-CARRERA-SUAVE',
   name:'Carrera suave',sets:1,plannedDurationMinutes:35,
   plannedPace:'5:30',targetRpe:6,
 }]};
 const value=html('client',[running]);
 assert.match(value,/Carrera suave/);
 assert.match(value,/Tiempo de trabajo<\/dt><dd>35 min/);
 assert.match(value,/Ritmo orientativo<\/dt><dd>5:30 min\/km/);
 assert.match(value,/Esfuerzo orientativo<\/dt><dd>6 de 10/);
 assert.doesNotMatch(value,/Distancia \(km\)|-- km|6[.,]5 km|1 serie continua|<dt>RPE<\/dt>|<dt>RIR<\/dt>/);
 assert.doesNotMatch(value,/data-client-sessions-brief="ready"|data-signature-session-guidance="ready"|data-session-available-count="1"/);
 assert.doesNotMatch(value,/Abre una sesión para revisar los ejercicios|Tienes una sesión guiada que puedes revisar/);
 assert.ok(value.indexOf('data-client-session-primary')<value.indexOf('<details class="m26-rc39-session-content'));
 assert.equal((value.match(/data-workflow-action="start-published-session"/g)||[]).length,1);
 const coach=html('coach',[running]);
 assert.match(coach,/<dt>RPE<\/dt><dd>6<\/dd>/);
 assert.match(coach,/<dt>Duración \(min\)<\/dt><dd>35<\/dd>/);
});
test('SIGNATURE R48: planned swim pace remains per 100m, no km pace invented',()=>{
 const swim=item('guiada','guided_in_app','full');
 swim.session={...swim.session,blocks:[{
   id:'swim',type:'exercise',exerciseId:'swim-100',name:'Natación continua',
   plannedDurationMinutes:30,plannedPacePer100M:'2:05',
 }]};
 const value=html('client',[swim]);
 assert.match(value,/2:05 min\/100 m/);
 assert.doesNotMatch(value,/2:05 min\/km/);
});
test('SIGNATURE R48: unavailable training preserves one useful warning, not an actionable CTA',()=>{
 const supervised=html('client',[item('presencial','coach_led','summary_only')]);
 assert.match(supervised,/data-signature-session-guidance="published"/);
 assert.doesNotMatch(supervised,/data-client-session-primary|data-client-sessions-brief="ready"/);
 const paused=html('client',[item('guiada','guided_in_app','full')]);
 assert.doesNotMatch(paused,/data-client-sessions-brief="paused"/);
 const rendered=renderRc39Route({kind:'sesion',role:'client',serviceActive:false,
    sessionPreviewAssets:{catalog:exercises,mediaMap:null},
    rc39:{role:'client',sessionProjections:[item('guiada','guided_in_app','full')],appointments:[]},
    selectedClient:{modality:'hibrido'}});
 assert.match(rendered,/data-client-sessions-brief="paused"/);
 assert.doesNotMatch(rendered,/data-client-session-primary|data-workflow-action="start-published-session"/);
});
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
 for(const visible of ['Ver sesión','Press de pecho','Remo TRX','Sentadilla','Biserie','3 rondas','8-12','60 s','Esfuerzo orientativo','Repeticiones en reserva','3-1-1','Control escapular','Alternativa','Sin referencia visual','Preparar entrenamiento']){
   assert.ok(value.includes(visible),visible);
 }
 assert.match(value,/data-entity-id="guiada"/);
 assert.equal((value.match(/data-workflow-action="start-published-session"/g)||[]).length,1);
 const disclosure=value.indexOf('<details class="m26-rc39-session-content');
 const launch=value.indexOf('data-workflow-action="start-published-session"');
 assert.ok(disclosure>=0&&launch<disclosure,'primary action must precede the optional exercise preview');
 assert.match(value,/<div class="m26-session-preview-actions" data-client-session-primary>/);
 assert.match(value,/>Preparar entrenamiento<\/button>/);
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

test('SIGNATURE U48 continue requires an independently verified active execution, not stale session status',()=>{
 const stale=item('guiada','guided_in_app','full');
 stale.session={...stale.session,status:'en_curso',deliveryOwnership:'guided_in_app',
   deliveryModality:'guiada_en_app',visibleToClient:true,clientVisibilityLevel:'full'};
 const forged={...stale,canClientResume:true,canClientStart:false};
 const value=html('client',[forged]);
 assert.match(value,/Continuar entrenamiento/u);
 assert.match(value,/data-workflow-action="start-published-session"/u);
 assert.doesNotMatch(value,/Preparar entrenamiento/u);
 const denied=html('client',[{...forged,canClientResume:false}]);
 assert.doesNotMatch(denied,/Continuar entrenamiento|data-workflow-action="start-published-session"/u);
});

test('P0 #919: Coach session view also exposes durable status without altering authorizations',()=>{
  const value=html('coach',[item('guiada','guided_in_app','full')]);
  assert.equal((value.match(/data-workflow-status="session"/gu)||[]).length,1);
  assert.match(value,/role="status" aria-live="polite"/u);
  assert.match(value,/data-workflow-action="start-published-session"/u);
});
