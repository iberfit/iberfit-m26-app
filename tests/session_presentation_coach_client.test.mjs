import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {renderSessionsRoute,renderPlanningRoute} from '../src/m26/modules/route-render.js';
import {sessionPresentation} from '../src/m26/experience/session-presentation.js';
import {projectCollectionsForRole,assertClientProjectionSafe} from '../src/m26/security/role-projection.js';
import {renderClientSessionPresentation,renderCoachSessionPreview} from '../src/m26/experience/session-render.js';

const catalog=[
 {id:'press',name_es:'Press de pecho con mancuernas',equipment:'Mancuernas',pattern:'Empuje',
   instructions_es:['Controla el descenso','Empuja sin perder estabilidad'],
   cues:['Escápulas estables'],precautions:['Evita dolor de hombro']},
 {id:'row',name_es:'Remo con TRX',equipment:'TRX',pattern:'Tracción',cues:['Mantén el tronco firme']},
 {id:'squat',name_es:'Sentadilla a silla',equipment:'Silla',pattern:'Rodilla'},
];
const block={id:'block-1',type:'exercise',exerciseId:'press',sets:3,reps:'8–12',restSeconds:75,tempo:'3-1-1',targetRpe:7,targetRir:3,alternativeId:'row',name:'Press de pecho'};
const group={id:'block-2',type:'biserie',rounds:3,exerciseIds:['row','squat'],prescriptions:{
 row:{reps:'10',restSeconds:45,targetRpe:7,targetRir:2,tempo:'controlado'},
 squat:{reps:'12',restSeconds:45,targetRpe:6,targetRir:3},
}};
const session=(id,deliveryOwnership,extra={})=>({
 id,clientId:'c1',status:'published',visibleToClient:true,
 title:id==='coach'?'Fuerza presencial':'Fuerza autónoma',
 durationMinutes:60,deliveryOwnership,
 deliveryModality:deliveryOwnership==='coach_led'?'presencial':'guiada_en_app',
 clientVisibilityLevel:deliveryOwnership==='coach_led'?'summary_only':'full',
 blocks:[block,group],coachPrivateNotes:'INSTRUCCIÓN INTERNA: nunca publicar',
 ...extra,
});
const directed=session('coach','coach_led');
const autonomous=session('guided','client_autonomous');
const appointments=[{id:'appointment-1',clientId:'c1',sessionId:'coach',startAt:'2026-10-20T15:00:00Z',status:'confirmed'}];

test('Coach dirigida presenta solo título, duración y cita: no prescripción en HTML ni en VM',()=>{
 const view=sessionPresentation(directed,{role:'client',catalog,appointments});
 assert.equal(view.mode,'coach_led');
 assert.equal(view.canStart,false);
 assert.equal(view.canInspect,false);
 assert.equal(view.blocks.length,0);
 assert.equal(view.durationMinutes,60);
 assert.equal(view.appointmentId,'appointment-1');
 const html=renderClientSessionPresentation({sessionView:view});
 assert.match(html,/Fuerza presencial/);
 assert.match(html,/60 min/);
 assert.match(html,/Sesión programada/);
 for(const forbidden of ['Press de pecho','Remo con TRX','3-1-1','RPE','Técnica e indicaciones','data-workflow-action="start-published-session"','INSTRUCCIÓN INTERNA']){
   assert.doesNotMatch(html,new RegExp(forbidden),forbidden);
 }
});
test('Incluso si una sesión Coach dirigida trae visibility=full erróneo, no se ofrece iniciar',()=>{
 const record=session('coach','coach_led',{clientVisibilityLevel:'full'});
 const view=sessionPresentation(record,{role:'client',catalog});
 assert.equal(view.canStart,false);
 assert.equal(view.blocks.length,0);
 assert.doesNotMatch(renderClientSessionPresentation({sessionView:view}),/data-preview-exercise/);
});
test('Cliente autónomo abre Ver sesión con grupos, medios visuales, prescripción y acción identificada',()=>{
 const view=sessionPresentation(autonomous,{role:'client',catalog});
 assert.equal(view.canStart,true);
 assert.equal(view.blocks.length,2);
 assert.equal(view.blocks[1].title,'Biserie');
 assert.equal(view.blocks[1].rounds,3);
 assert.equal(view.blocks[1].exercises.length,2);
 const html=renderClientSessionPresentation({sessionView:view});
 for(const fragment of ['<summary>Ver sesión','data-entity-id="guided"','Comenzar entrenamiento','Press de pecho con mancuernas','Remo con TRX','Sentadilla a silla','Biserie','3 rondas','8–12','75 s','RPE','RIR','3-1-1','Alternativa','Técnica e indicaciones','data-preview-exercise="press"']){
   assert.ok(html.includes(fragment),fragment);
 }
 assert.doesNotMatch(html,/INSTRUCCIÓN INTERNA/);
 assert.match(html,/loading="lazy"|Sin referencia visual/);
});
test('Cliente solo recibe sesiones publicadas; las retiradas no obtienen ficha ni botón',()=>{
 const withdrawn=session('old','client_autonomous',{status:'withdrawn'});
 const view=sessionPresentation(withdrawn,{role:'client',catalog});
 assert.equal(view.visible,false);
 assert.equal(renderClientSessionPresentation({sessionView:view}),'');
});
test('Coach inspecciona contenidos completos y sabe exactamente qué verá Cliente',()=>{
 const directedView=sessionPresentation(directed,{role:'coach',catalog,appointments});
 assert.equal(directedView.canInspect,true);
 const html=renderCoachSessionPreview(directedView);
 assert.match(html,/Revisar prescripción y vista del cliente/);
 assert.match(html,/Cliente: verá solo el título, duración y cita/);
 assert.match(html,/Press de pecho/);
 assert.match(html,/Remo con TRX/);
});
test('Pantallas Planificación y Sesiones conservan el mismo contraste de modalidades',()=>{
 const state={
  identity:{role:'client',clientId:'c1'},selectedClientId:'c1',
  collections:{sessions:[directed,autonomous],appointments,sessionExecutions:[],trainingCycles:[]},
  environment:{},
 };
 for(const area of ['sesion','planificacion']){
  const shell={activeArea:area,identity:{role:'client'},page:{title:'Sesiones'}};
  const vm=createRouteViewModel(shell,state,new Date('2026-10-16T18:00:00Z'),{catalog});
  assert.deepEqual(vm.sessions.map(x=>x.id),['coach','guided']);
  assert.equal(vm.sessions[0].sessionView.blocks.length,0);
  assert.equal(vm.sessions[1].sessionView.blocks.length,2);
  const html=area==='sesion'?renderSessionsRoute(vm):renderPlanningRoute(vm);
  assert.match(html,/data-session-presentation="scheduled"/);
  assert.match(html,/data-session-presentation="guided"/);
  assert.equal((html.match(/data-workflow-action="start-published-session"/g)||[]).length,1);
  assert.equal((html.match(/<summary>Ver sesión/g)||[]).length,1);
  assert.match(html,/data-entity-id="guided"/);
  assert.doesNotMatch(html,/INSTRUCCIÓN INTERNA/);
 }
});

test('Proyección Cliente elimina prescripciones dirigidas y conserva rondas y ejercicios de biserie guiada',()=>{
 const prepared=[
  {...directed,clientVisibilityLevel:'full',coachNotes:'NO-COMPARTIR'},
  {...autonomous,blocks:[{...block},{...group,prescriptions:{
   row:{...group.prescriptions.row,internalNote:'NO-COMPARTIR'},
   squat:group.prescriptions.squat,
  }}]},
  session('hidden','coach_led',{clientVisibilityLevel:'hidden'}),
 ];
 const safe=projectCollectionsForRole({sessions:prepared},{id:'client-u',role:'client',clientId:'c1'});
 assert.equal(safe.sessions.length,2);
 assert.equal(safe.sessions[0].blocks.length,0);
 assert.equal(safe.sessions[1].blocks[1].type,'biserie');
 assert.equal(safe.sessions[1].blocks[1].rounds,3);
 assert.deepEqual(safe.sessions[1].blocks[1].exerciseIds,['row','squat']);
 assert.equal(safe.sessions[1].blocks[1].prescriptions.row.reps,'10');
 assert.doesNotMatch(JSON.stringify(safe),/NO-COMPARTIR|internalNote|coachNotes/);
 assert.equal(assertClientProjectionSafe(safe.sessions?{sessions:safe.sessions}:safe,{id:'client-u',role:'client',clientId:'c1'}),true);
 const projectedView=sessionPresentation(safe.sessions[1],{role:'client',catalog});
 assert.equal(projectedView.blocks[1].exercises.length,2);
 assert.equal(projectedView.blocks[1].rounds,3);
});
