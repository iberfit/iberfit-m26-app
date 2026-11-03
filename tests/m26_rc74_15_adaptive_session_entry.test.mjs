import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {buildAdaptiveSessionContext} from '../src/m26/intelligence/adaptive-context.js';
import {buildSessionEntryDecision} from '../src/m26/intelligence/session-entry-policy.js';
import {
  setPendingSessionEntry,
  peekPendingSessionEntry,
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
    // A direct Client start needs an explicitly enabled published session.
    status:'disponible',visibleToClient:true,clientVisibilityLevel:'full',
    deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
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


test('Running first intent survives a loading render and starts exactly once after the matching workspace mounts',async()=>{
  const root=fakeRoot();
  const session=publishedSession();
  const execution=createExecution({session,clientId,executionId:'execution-running-race'});
  let context=null,starts=0;
  const controller=createSessionController({
    root,getContext:()=>context,render:()=>{},
    liveTelemetryController:{start(){starts+=1;},pause(){},resume(){},stop(){}},
  });
  controller.mount();
  setPendingSessionEntry(root,{clientId,sessionId});
  revalidatePendingSessionEntry(root,{
    state:{},now,buildContext:()=>({decision:{level:'normal'}}),
    buildDecision:({decision})=>({level:decision.level,directStartAllowed:true}),
  });
  await root.emit('m26:shell-rendered');
  assert.ok(peekPendingSessionEntry(root),'an intermediate shell must not discard the first click');
  context={session,execution,online:true,sessionRevision:3,actor:{role:'client',clientId,userId:'owner-running'}};
  await root.emit('m26:shell-rendered');
  assert.equal(execution.status,'active');
  assert.equal(execution.events.filter(x=>x.type==='SESSION_STARTED').length,1);
  assert.equal(starts,1);
  assert.equal(peekPendingSessionEntry(root),null,'the matching execution consumes intent once');
  await root.emit('m26:shell-rendered');
  assert.equal(starts,1);
  controller.destroy();
});

test('Running first intent survives stale previous session but refuses foreign account',async()=>{
  const root=fakeRoot(),session=publishedSession();
  const former={...session,id:'other-session'};
  const previous=createExecution({session:former,clientId,executionId:'execution-former'});
  const target=createExecution({session,clientId,executionId:'execution-target'});
  let context={session:former,execution:previous,actor:{role:'client',clientId,userId:'owner-running'}};
  const controller=createSessionController({root,getContext:()=>context,render:()=>{},
    liveTelemetryController:{start(){},pause(){},resume(){},stop(){}},
  });
  controller.mount();
  setPendingSessionEntry(root,{clientId,sessionId});
  revalidatePendingSessionEntry(root,{state:{},now,buildContext:()=>({}),
    buildDecision:()=>({level:'normal',directStartAllowed:true}),
  });
  await root.emit('m26:shell-rendered');
  assert.ok(peekPendingSessionEntry(root),'stale previous training does not eat first click');
  assert.equal(previous.status,'ready');
  context={session,execution:target,actor:{role:'client',clientId,userId:'owner-running'}};
  await root.emit('m26:shell-rendered');
  assert.equal(target.status,'active');
  controller.destroy();

  const foreignRoot=fakeRoot();
  let foreignContext={actor:{role:'client',clientId:'other-client'},session:null,execution:null};
  const foreign=createSessionController({root:foreignRoot,getContext:()=>foreignContext,render:()=>{},
    liveTelemetryController:{start(){},pause(){},resume(){},stop(){}},
  });
  foreign.mount();
  setPendingSessionEntry(foreignRoot,{clientId,sessionId});
  revalidatePendingSessionEntry(foreignRoot,{state:{},now,buildContext:()=>({}),
    buildDecision:()=>({level:'normal',directStartAllowed:true}),
  });
  await foreignRoot.emit('m26:shell-rendered');
  assert.equal(peekPendingSessionEntry(foreignRoot),null,'account switch revokes pending intent');
  foreignContext={session,execution:createExecution({session,clientId}),actor:{role:'client',clientId,userId:'owner-running'}};
  await foreignRoot.emit('m26:shell-rendered');
  assert.equal(foreignContext.execution.status,'ready','revoked intent cannot start later');
  foreign.destroy();
});

test('Running auto-start with failed local autosave still obtains one remote ACK and shows recovery warning',async()=>{
  const root=fakeRoot();
  const session=publishedSession();
  const execution=createExecution({session,clientId,executionId:'execution-quota'});
  const commands=[];
  const actionState={status:'idle',message:''};
  const context={session,execution,actor:{role:'client',clientId,userId:'owner-running'},
    online:true,sessionRevision:3,actionState,
    draft:{id:'draft-quota',title:'Running'},
    autosaveDraft:async()=>{throw new Error('LOCAL_QUOTA');},
    commandBus:{execute:async command=>{
      commands.push(command);
      return {ok:true,kind:'ack',command:{operationId:'start-quota'},response:{executionRevision:1,remoteRevision:4}};
    }},
  };
  const errors=[];
  const controller=createSessionController({root,getContext:()=>context,render:()=>{},onError:e=>errors.push(e),
    liveTelemetryController:{start(){},pause(){},resume(){},stop(){}},
  });
  controller.mount();
  const field={value:'Running',getAttribute:()=> 'title'};
  await root.emit('input',{target:{closest(selector){return selector==='[data-session-draft-field]'?field:null;}}});
  setPendingSessionEntry(root,{clientId,sessionId});
  revalidatePendingSessionEntry(root,{state:{},now,buildContext:()=>({}),
    buildDecision:()=>({level:'normal',directStartAllowed:true}),
  });
  await root.emit('m26:shell-rendered');
  assert.equal(commands.length,1);
  assert.equal(commands[0].type,'SESION_INICIAR');
  assert.equal(execution.status,'active');
  assert.match(actionState.message,/iniciado y confirmado/i);
  await root.emit('m26:shell-rendered');
  assert.equal(commands.length,1);
  controller.destroy();
});

test('Running delayed start does not issue remote command after owner or execution changes',async()=>{
  const root=fakeRoot(),session=publishedSession();
  const execution=createExecution({session,clientId,executionId:'execution-delayed'});
  let resolveAutosave;
  const barrier=new Promise(resolve=>{resolveAutosave=resolve;});
  const commands=[];
  const base={session,execution,actor:{role:'client',clientId,userId:'owner-running'},
    online:true,sessionRevision:3,draft:{id:'draft-delayed',title:'Running'},
    autosaveDraft:async()=>barrier,
    commandBus:{execute:async cmd=>{commands.push(cmd);return {ok:true,kind:'ack',response:{remoteRevision:4}};}},
  };
  let current=base;
  const controller=createSessionController({root,getContext:()=>current,render:()=>{},
    liveTelemetryController:{start(){},pause(){},resume(){},stop(){}},
  });
  controller.mount();
  const field={value:'Running',getAttribute:()=> 'title'};
  await root.emit('input',{target:{closest(selector){return selector==='[data-session-draft-field]'?field:null;}}});
  setPendingSessionEntry(root,{clientId,sessionId});
  revalidatePendingSessionEntry(root,{state:{},now,buildContext:()=>({}),
    buildDecision:()=>({level:'normal',directStartAllowed:true}),
  });
  const startAttempt=root.emit('m26:shell-rendered');
  current={...base,actor:{role:'client',clientId:'other-client',userId:'other-owner'},
    execution:createExecution({session,clientId,executionId:'execution-foreign'})};
  resolveAutosave();
  await startAttempt;
  assert.equal(commands.length,0);
  assert.equal(execution.status,'ready');
  controller.destroy();
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
  assert.match(controller,/String\(execution\.status\|\|''\)\.trim\(\)\.toLowerCase\(\)!=='ready'/);
  assert.match(controller,/pending\.decision\?\.directStartAllowed!==true/);
  assert.match(controller,/sessionController|createSessionController|start\(\)/);
  assert.doesNotMatch(controller,/MutationObserver/);
  assert.doesNotMatch(controller,/\.click\(\)/);
  assert.doesNotMatch(`${home}\n${policy}\n${intent}\n${shell}\n${controller}`,/SUPABASE_SERVICE_ROLE|service[_-]?role/i);

  assert.match(application,/if\(recovered\)\{[\s\S]*Sesión recuperada desde este dispositivo\.[\s\S]*return true;\s*\}/);
  assert.match(application,/if\(!isCurrent\(\)\)return false;/);
  assert.match(application,/workspaceEntryGate\.run\('session:'\+clientId/);
});
