import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {buildAdaptiveSessionContext} from '../src/m26/intelligence/adaptive-context.js';
import {buildSessionEntryDecision} from '../src/m26/intelligence/session-entry-policy.js';
import {
  setPendingSessionEntry,
  revalidatePendingSessionEntry,
} from '../src/m26/intelligence/session-entry-intent.js';
import {buildClientHomeSnapshot} from '../src/m26/ui/progress-continuity.js';
import {createExecution} from '../src/m26/workflows/session-execution.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';

const clientId='client-rc74-15';
const sessionId='session-rc74-15';
const now=new Date('2026-09-04T12:00:00Z');

function baseState({linked=true,checkin={energy:7,sleep:8,stress:3,pain:2}}={}){
  return {
    collections:{
      clients:[{id:clientId}],
      appointments:[{
        id:'appointment-today',
        clientId,
        sessionId:linked?sessionId:null,
        startAt:'2026-09-04T15:00:00Z',
        status:'confirmed',
        title:'Fuerza IBERFIT',
        modality:'online',
      }],
      sessionExecutions:[],
      checkins:checkin?[{id:'checkin-latest',clientId,createdAt:'2026-09-04T08:00:00Z',...checkin}]:[],
      iriAssessments:[],
      clientProfiles:[],
      wearableDailySummaries:[],
      wearableConnections:[],
      trainingCycles:[],
    },
    communication:{available:false,threads:[],notifications:[]},
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

function publishedSession(){
  return {
    id:sessionId,
    clientId,
    revision:3,
    blocks:[{
      id:'block-1',
      type:'exercise',
      exerciseId:'exercise-1',
      sets:2,
      reps:'8',
      restSeconds:60,
      targetRpe:7,
      targetRir:3,
    }],
  };
}

function fakeRoot(){
  const listeners=new Map();
  return {
    addEventListener(type,handler){
      if(!listeners.has(type))listeners.set(type,new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type,handler){listeners.get(type)?.delete(handler);},
    querySelectorAll(){return [];},
    querySelector(){return null;},
    async emit(type,event={}){
      for(const handler of listeners.get(type)||[])await handler(event);
    },
  };
}

test('política de entrada sólo permite inicio directo para normal y falla cerrada',()=>{
  const normal=buildSessionEntryDecision({decision:{level:'normal',reason:'stable_progression'}});
  assert.equal(normal.directStartAllowed,true);
  assert.equal(normal.reviewRequired,false);
  assert.equal(normal.actionLabel,'Iniciar entrenamiento');
  assert.equal(normal.reasonCode,'stable_progression');

  for(const level of ['simplified','reduced','hold']){
    const decision=buildSessionEntryDecision({decision:{level,reason:`${level}_reason`}});
    assert.equal(decision.directStartAllowed,false,level);
    assert.equal(decision.reviewRequired,true,level);
    assert.equal(decision.actionLabel,'Revisar antes de entrenar',level);
  }

  for(const malformed of [null,{}, {decision:{}}, {decision:{level:'future-mode'}}]){
    const decision=buildSessionEntryDecision(malformed);
    assert.equal(decision.level,'unknown');
    assert.equal(decision.directStartAllowed,false);
    assert.equal(decision.reviewRequired,true);
  }
});

test('Home inicia directamente una sesión vinculada normal',()=>{
  const snapshot=buildClientHomeSnapshot(baseState(),clientId,{now});
  assert.equal(snapshot.todayTraining.sessionId,sessionId);
  assert.equal(snapshot.todayTraining.workflowAction,'start-published-session');
  assert.equal(snapshot.todayTraining.entry.level,'normal');
  assert.equal(snapshot.todayTraining.entry.directStartAllowed,true);
  assert.equal(snapshot.todayTraining.actionLabel,'Iniciar entrenamiento');
});

test('dolor alto y recuperación limitada obligan a revisar antes de entrenar',()=>{
  const painState=baseState({checkin:{energy:7,sleep:8,stress:3,pain:7}});
  const painContext=buildAdaptiveSessionContext(painState,clientId,{now});
  const painEntry=buildSessionEntryDecision(painContext);
  assert.equal(painEntry.level,'hold');
  assert.equal(painEntry.directStartAllowed,false);
  assert.equal(painEntry.reasonCode,'pain_review');

  const recoveryState=baseState({checkin:{energy:4,sleep:8,stress:3,pain:2}});
  const recoveryContext=buildAdaptiveSessionContext(recoveryState,clientId,{now});
  const recoveryEntry=buildSessionEntryDecision(recoveryContext);
  assert.equal(recoveryEntry.level,'reduced');
  assert.equal(recoveryEntry.directStartAllowed,false);
  assert.equal(recoveryEntry.reasonCode,'recovery_context');

  const home=buildClientHomeSnapshot(painState,clientId,{now});
  assert.equal(home.todayTraining.actionLabel,'Revisar antes de entrenar');
  assert.equal(home.todayTraining.entry.level,'hold');
});

test('sin sesión vinculada no existe una ruta de inicio directo',()=>{
  const snapshot=buildClientHomeSnapshot(baseState({linked:false}),clientId,{now});
  assert.equal(snapshot.todayTraining.ready,false);
  assert.equal(snapshot.todayTraining.sessionId,null);
  assert.equal(snapshot.todayTraining.workflowAction,null);
  assert.equal(snapshot.todayTraining.actionLabel,'Ver agenda');
  assert.equal(snapshot.todayTraining.entry,null);
});

test('ausencia de bienestar no inventa un bloqueo cuando no hay otra señal confirmada',()=>{
  const context=buildAdaptiveSessionContext(baseState({checkin:null}),clientId,{now});
  const entry=buildSessionEntryDecision(context);
  assert.equal(entry.level,'normal');
  assert.equal(entry.directStartAllowed,true);
});

test('intención revalidada normal inicia exactamente una vez por el controlador canónico',async()=>{
  const root=fakeRoot();
  const session=publishedSession();
  const execution=createExecution({session,clientId,executionId:'execution-fresh'});
  let telemetryStarts=0;
  let renders=0;
  const context={
    session,
    execution,
    actor:{role:'client',clientId,userId:'user-1'},
    online:true,
    appointmentId:'appointment-today',
    sessionRevision:session.revision,
  };
  const controller=createSessionController({
    root,
    getContext:()=>context,
    render:()=>{renders+=1;},
    liveTelemetryController:{
      start(){telemetryStarts+=1;},
      pause(){},resume(){},stop(){},
    },
  });
  controller.mount();
  setPendingSessionEntry(root,{clientId,sessionId});
  revalidatePendingSessionEntry(root,{
    state:baseState(),
    now,
    buildContext:buildAdaptiveSessionContext,
    buildDecision:buildSessionEntryDecision,
  });

  await root.emit('m26:shell-rendered');
  assert.equal(execution.status,'active');
  assert.equal(execution.events.filter((item)=>item.type==='SESSION_STARTED').length,1);
  assert.equal(telemetryStarts,1);
  assert.ok(renders>=1);

  await root.emit('m26:shell-rendered');
  assert.equal(execution.events.filter((item)=>item.type==='SESSION_STARTED').length,1);
  assert.equal(telemetryStarts,1);
  controller.destroy();
});

test('revisión adaptativa y ejecución recuperada no pueden autoarrancar',async()=>{
  const session=publishedSession();

  for(const scenario of [
    {name:'review',status:'ready',decision:{level:'hold',directStartAllowed:false,reviewRequired:true}},
    {name:'recovered-active',status:'active',decision:{level:'normal',directStartAllowed:true,reviewRequired:false}},
    {name:'recovered-paused',status:'paused',decision:{level:'normal',directStartAllowed:true,reviewRequired:false}},
  ]){
    const root=fakeRoot();
    const execution=createExecution({session,clientId,executionId:`execution-${scenario.name}`});
    execution.status=scenario.status;
    let telemetryStarts=0;
    const controller=createSessionController({
      root,
      getContext:()=>({
        session,execution,
        actor:{role:'client',clientId,userId:'user-1'},
        online:true,
        appointmentId:'appointment-today',
        sessionRevision:session.revision,
      }),
      render:()=>{},
      liveTelemetryController:{start(){telemetryStarts+=1;},pause(){},resume(){},stop(){}},
    });
    controller.mount();
    setPendingSessionEntry(root,{clientId,sessionId});
    revalidatePendingSessionEntry(root,{
      state:{},
      now,
      buildContext:()=>({decision:scenario.decision}),
      buildDecision:(value)=>value.decision,
    });
    await root.emit('m26:shell-rendered');
    assert.equal(execution.status,scenario.status,scenario.name);
    assert.equal(telemetryStarts,0,scenario.name);
    assert.equal(execution.events.filter((item)=>item.type==='SESSION_STARTED').length,0,scenario.name);
    controller.destroy();
  }
});

test('contrato RC74.15 conserva política única, recuperación y ausencia de atajos inseguros',async()=>{
  const [home,policy,intent,shell,controller,application]=await Promise.all([
    readFile(new URL('../src/m26/ui/progress-continuity.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/intelligence/session-entry-policy.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/intelligence/session-entry-intent.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/app/application.js',import.meta.url),'utf8'),
  ]);

  assert.match(home,/start-published-session/);
  assert.match(home,/data-session-entry-level/);
  assert.match(policy,/Iniciar entrenamiento/);
  assert.match(policy,/Revisar antes de entrenar/);
  assert.match(home,/no se modifica automáticamente/i);

  assert.doesNotMatch(policy,/pain\s*[><=]|sleep\s*[><=]|energy\s*[><=]|stress\s*[><=]/i);
  assert.doesNotMatch(intent,/localStorage|sessionStorage|service[_-]?role/i);
  assert.match(shell,/revalidatePendingSessionEntry/);
  assert.match(shell,/revalidatePendingSessionEntry[\s\S]*m26:shell-rendered/);
  assert.match(controller,/status\|\|'\)\.trim\(\)\.toLowerCase\(\)!=='ready'/);
  assert.match(controller,/pending\.decision\?\.directStartAllowed!==true/);
  assert.match(controller,/sessionController|createSessionController|start\(\)/);
  assert.doesNotMatch(controller,/MutationObserver/);
  assert.doesNotMatch(controller,/\.click\(\)/);
  assert.doesNotMatch(`${home}\n${policy}\n${intent}\n${shell}\n${controller}`,/SUPABASE_SERVICE_ROLE|service[_-]?role/i);

  assert.match(application,/if\(recovered\)\{[\s\S]*Sesión recuperada desde este dispositivo\.[\s\S]*return;\}/);
});
