import test from 'node:test';
import assert from 'node:assert/strict';
import {stateFromBootstrap,createProductionState,createShellViewModel,createRouteViewModel,renderSessionsRoute,renderPlanningRoute} from '../src/m26/index.js';
import {actorCanExecuteSession} from '../src/m26/rc39/session-policy.js';
import {readFileSync} from 'node:fs';

const clientId='CLI-M31-01';
function sample(mode,id){
  return {id,clientId,title:mode==='presencial'?'Fuerza presencial':'Running guiado',status:'publicado',visibleToClient:true,
    deliveryModality:mode,deliveryOwnership:mode==='presencial'?'coach_led':'guided_in_app',
    clientVisibilityLevel:mode==='presencial'?'summary_only':'full',
    blocks:[{id:'b1',type:'exercise',name:'Ejercicio',sets:3,reps:'10'}]};
}
function state(sessions,area='sesion'){
  const user={id:'usr-m31',role:'client',clientId,name:'Cliente'};
  const data={clients:[{id:clientId,name:'Cliente',status:'activo',trainingServiceStatus:'activo'}],
    clientProfiles:[{id:clientId,clientId}],
    sessions,trainingCycles:[],appointments:[],sessionExecutions:[],iriAssessments:[]};
  return stateFromBootstrap({user,canary:{active:true},data},createProductionState({activeArea:area}));
}
function view(sessions,area='sesion'){const source=state(sessions,area);return createRouteViewModel(createShellViewModel(source),source);}

test('M31: modelo Cliente distingue cada sesión ejecutable sin inferir desde la visibilidad',()=>{
  const vm=view([sample('presencial','supervised'),sample('guiada_en_app','guided')]);
  assert.deepEqual(vm.sessions.map(s=>[s.id,s.canClientExecute]),[['supervised',false],['guided',true]]);
  assert.equal(actorCanExecuteSession({role:'client',session:{...sample('presencial','supervised'),clientVisibilityLevel:'full'}}),false);
});

test('M31: Cliente nunca ve Comenzar en presencial, pero sí en la sesión guiada concreta',()=>{
  const html=renderSessionsRoute(view([sample('presencial','supervised'),sample('guiada_en_app','guided')]));
  assert.match(html,/data-client-session-executable="false"/);
  assert.match(html,/data-client-session-executable="true"/);
  assert.match(html,/Sesión dirigida por tu Coach/);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session" data-entity-id="supervised"/);
  assert.match(html,/data-workflow-action="start-published-session" data-entity-id="guided"/);
  assert.equal((html.match(/>Comenzar esta sesión<\/button>/gu)||[]).length,1);
});

test('M31: si solo hay presencial, no aparece CTA de inicio autónomo activo',()=>{
  const html=renderSessionsRoute(view([sample('presencial','supervised')]));
  assert.match(html,/No tienes una sesión autónoma disponible/);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/);
});

test('M31: planificación también respeta permiso por sesión',()=>{
  const html=renderPlanningRoute(view([sample('presencial','supervised'),sample('guiada_en_app','guided')],'planificacion'));
  assert.doesNotMatch(html,/data-workflow-action="start-published-session" data-entity-id="supervised"/);
  assert.match(html,/data-workflow-action="start-published-session" data-entity-id="guided"/);
});

test('M31: controlador no lanza la sesión más reciente si es presencial',()=>{
  const source=readFileSync('src/m26/app/workflow-controller.js','utf8');
  assert.match(source,/eligible\.find\(\(item\)=>actorCanExecuteSession\(\{role,session:item\}\)\)/);
  assert.match(source,/M26_SESSION_EXECUTION_FORBIDDEN/);
  assert.match(source,/requestedId\?candidate/);
});
