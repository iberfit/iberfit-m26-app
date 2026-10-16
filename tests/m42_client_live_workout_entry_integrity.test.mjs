import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createExecution,startExecution,pauseExecution} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution,sessionDurationConsistency} from '../src/m26/workflows/session-ui.js';
import {sessionCommandFailureOutcome} from '../src/m26/workflows/session-sync-recovery-ui.js';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';

const clientId='10000000-0000-4000-8000-000000000271';
const session={
  id:'10000000-0000-4000-8000-000000000272',clientId,
  status:'disponible',title:'SESIÓN Carrera',durationMinutes:45,
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',clientVisibilityLevel:'full',
  blocks:[{
    id:'run-block',type:'exercise',exerciseId:'IBF-CARRERA-SUAVE',name:'Carrera suave',
    sets:1,restSeconds:60,targetRpe:5,targetRir:0,
    plannedDurationMinutes:'48',plannedWarmupMinutes:'3',
    plannedCooldownMinutes:'5',targetHeartRateZone:'Z2',
  }],
};
const catalog=createExerciseCatalog([{
  id:'IBF-CARRERA-SUAVE',name_es:'Carrera suave',
  pattern:'locomoción',measurement_profile:'endurance',
}]);

test('M42: live preview discloses contradictory real running duration without mutating published prescription',()=>{
  const execution=createExecution({session,clientId,executionId:'10000000-0000-4000-8000-000000000273'});
  const before=JSON.stringify({execution,session});
  assert.deepEqual(sessionDurationConsistency(execution,session),{sessionMinutes:45,exerciseMinutes:48});
  const html=renderGuidedExecution({session,execution,catalog,role:'client'});
  assert.match(html,/data-session-duration-consistency/u);
  assert.match(html,/45 min/u);
  assert.match(html,/48 min/u);
  assert.match(html,/Revisión de tiempos del plan/u);
  assert.match(html,/data-session-action="start"/u,'advisory does not block a legitimate client start');
  assert.equal(JSON.stringify({execution,session}),before,'never alter the signed Coach prescription');
});

test('M42: no invented total duration when targets are missing or coherent',()=>{
  const ready=createExecution({session,clientId});
  assert.equal(sessionDurationConsistency(ready,{durationMinutes:48}),null);
  assert.equal(sessionDurationConsistency(ready,{durationMinutes:49}),null);
  assert.equal(sessionDurationConsistency(ready,{durationMinutes:null}),null);
  assert.equal(sessionDurationConsistency({...ready,queue:[]},session),null);
  assert.equal(sessionDurationConsistency({...ready,queue:[{prescription:{plannedDurationMinutes:''}}]},session),null);
  assert.equal(sessionDurationConsistency({...ready,queue:[{prescription:{plannedDurationMinutes:'abc'}}]},session),null);
});

test('M42: actionable start errors survive without leaking technical internals',()=>{
  const reasons=[
    ['REVISION_MISMATCH',/última revisión/u],
    ['CONFIRMED_APPOINTMENT_REQUIRED',/cita confirmada/u],
    ['ACTIVE_EXECUTION_EXISTS',/entrenamiento activo/u],
    ['M28_COACH_LED_CLIENT_START_FORBIDDEN',/supervisada/u],
    ['M26_EXECUTION_BLOCK_INVALID',/prescripción/u],
  ];
  for(const [reason,pattern] of reasons){
    const result=sessionCommandFailureOutcome({result:{response:{reason}}},{role:'client',action:'start'});
    assert.match(result.message,pattern);
    assert.match(result.status,/retry|error/u);
  }
  const local=sessionCommandFailureOutcome(new Error('M26_COMMAND_CONTRACT_INVALID:ROLE_NOT_ALLOWED'),{role:'client',action:'start'});
  assert.equal(local.status,'error');
  assert.match(local.message,/validar la orden de inicio/u);
});

test('M42: haptics opt-in is a separate readable row, not an overlapping heading badge',()=>{
  const haptics=readFileSync(new URL('../src/m26/experience/session-haptics.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
  assert.match(haptics,/label\.className='m26-session-haptics-control'/u);
  assert.match(haptics,/host\.insertAdjacentElement\('afterend',label\)/u);
  assert.match(css,/\.m26-session-haptics-control\{display:grid;grid-template-columns:auto minmax\(0,1fr\)/u);
  assert.match(css,/\.m26-session-haptics-control>span\{display:grid;gap:\.1rem;min-width:0;overflow-wrap:anywhere\}/u);
});

test('M42: failed start keeps action-specific diagnostic after global onError',()=>{
  const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  const failure=controller.indexOf("if(!outcome.ok){",controller.indexOf("async function start(){"));
  const onError=controller.indexOf("onError(outcome.error);",failure);
  const mapped=controller.indexOf("const mapped=sessionCommandFailureOutcome(outcome.error,{action:'start'",failure);
  assert.ok(onError>failure&&mapped>onError,'specific failure must overwrite generic global diagnostic');
  assert.match(controller,/const mapped=sessionCommandFailureOutcome\(error,\{action:'start'/u);
});

test('M42: remote-ACK start is not turned into failure by local checkpoint failure',()=>{
  const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  const start=controller.slice(controller.indexOf('async function start(){'),controller.indexOf('function captureSessionEntryIntent('));
  assert.match(start,/try\{await persistContext\(getContext\(\)\);\}/u);
  assert.match(start,/context\.actionState\.message='Entrenamiento iniciado y confirmado/u);
  assert.match(start,/if\(context\?\.execution\?\.status==='active'\)/u);
  assert.match(start,/return true;/u);
});

test('M42: Cliente comienza entrenamiento y sale sin pantalla inglesa ni modal invasivo',()=>{
  const execution=createExecution({session,clientId,executionId:'10000000-0000-4000-8000-000000000299'});
  const ready=renderGuidedExecution({session,execution,catalog,role:'client'});
  assert.match(ready,/data-session-action="start">Comenzar entrenamiento<\/button>/u);
  assert.doesNotMatch(ready,/Leave workout|>Iniciar sesión<|Live Workout/iu);

  startExecution(execution);
  const active=renderGuidedExecution({session,execution,catalog,role:'client'});
  assert.match(active,/data-session-live-state="active"/u);
  assert.match(active,/data-session-live-quick-exit/u);
  assert.match(active,/data-session-action="exit-session">Guardar y salir<\/button>/u);
  assert.doesNotMatch(active,/Leave workout|Live Workout/iu);

  pauseExecution(execution);
  const paused=renderGuidedExecution({session,execution,catalog,role:'client'});
  assert.match(paused,/data-session-live-state="paused"/u);
  assert.match(paused,/data-session-action="exit-session">Guardar y salir<\/button>/u);
  assert.doesNotMatch(paused,/Leave workout|Live Workout/iu);

  const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  const exit=controller.slice(controller.indexOf("if(action==='exit-session')"),controller.indexOf("if(action==='exit-session')")+1150);
  assert.ok(exit.indexOf('persistContext(context)')>=0);
  assert.ok(exit.indexOf('persistContext(context)')<exit.indexOf('context.onExit'));
});

test('M42: Pantallas de planificación y citas no mezclan inglés ni login con ejercicio',()=>{
  const planning=readFileSync(new URL('../src/m26/rc39/route-render.js',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.doesNotMatch(planning,/Live Workout|Leave workout/u);
  assert.match(planning,/Comenzar entrenamiento/u);
  assert.match(routes,/Comenzar entrenamiento/u);
  assert.doesNotMatch(routes,/>Iniciar sesión preparada<|>Iniciar entrenamiento</u);
});
