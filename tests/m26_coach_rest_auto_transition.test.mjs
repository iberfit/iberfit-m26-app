import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  advanceExecution,
  advanceExpiredRest,
  beginRest,
  createExecution,
  currentStep,
  executionResultForStep,
  recordSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {
  createSessionController,
  dispatchSessionAction,
} from '../src/m26/workflows/session-controller.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const exercise={id:'exercise-rest-1',name_es:'Sentadilla',pattern:'squat',cues:[]};
const catalog={
  get(id){return id===exercise.id?exercise:null;},
  has(id){return id===exercise.id;},
  search(){return [exercise];},
};
function makeSession({sets=2}={}){
  return {
    id:'session-rest-transition',
    clientId:'client-rest-transition',
    title:'Transición de descanso',
    status:'published',
    blocks:[{
      id:'block-rest-1',
      type:'exercise',
      exerciseId:exercise.id,
      sets,
      reps:'10',
      restSeconds:1,
      targetRpe:7,
      targetRir:3,
    }],
  };
}
function executionWithRecordedSet({sets=2,restMs=-1}={}){
  const session=makeSession({sets});
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-rest-transition'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});
  recordSet(execution,session,{reps:10,load:'40 kg',rpe:7,rir:3,actor:{role:'coach',userId:'coach-1'}});
  beginRest(execution,1,{actor:{role:'coach',userId:'coach-1'}});
  execution.restUntil=new Date(Date.now()+restMs).toISOString();
  return {session,execution};
}
function coach(){return {role:'coach',userId:'coach-1'};}
function client(){return {role:'client',userId:'client-1',clientId:'client-rest-transition'};}

test('expired rest advances exactly one step for Coach and keeps traceability',()=>{
  const {session,execution}=executionWithRecordedSet();
  advanceExpiredRest(execution,session,{actor:coach(),nowMs:Date.now()});
  assert.equal(execution.index,0);
  assert.equal(execution.setIndex,1);
  assert.equal(execution.restUntil,null);
  assert.equal(execution.events.at(-1)?.type,'REST_COMPLETED_AUTO_ADVANCE');
  assert.equal(execution.events.at(-1)?.actor?.role,'coach');
  assert.deepEqual(execution.events.at(-1)?.payload,{
    index:0,
    setIndex:0,
    blockId:'block-rest-1',
    exerciseId:exercise.id,
    setNumber:1,
    toIndex:0,
    toSetIndex:1,
  });
});

test('expired-rest auto advance rejects Client and pre-expiry calls without mutation',()=>{
  const first=executionWithRecordedSet();
  assert.throws(
    ()=>advanceExpiredRest(first.execution,first.session,{actor:client(),nowMs:Date.now()}),
    /M26_EXECUTION_COACH_ACTION_REQUIRED/,
  );
  assert.equal(first.execution.setIndex,0);

  const second=executionWithRecordedSet({restMs:60000});
  assert.throws(
    ()=>advanceExpiredRest(second.execution,second.session,{actor:coach(),nowMs:Date.now()}),
    /M26_EXECUTION_REST_NOT_EXPIRED/,
  );
  assert.equal(second.execution.setIndex,0);
});

test('final session set never auto-advances into feedback',()=>{
  const {session,execution}=executionWithRecordedSet({sets:1});
  assert.throws(
    ()=>advanceExpiredRest(execution,session,{actor:coach(),nowMs:Date.now()}),
    /M26_EXECUTION_REST_AUTO_ADVANCE_FINAL_STEP/,
  );
  assert.equal(execution.status,'active');
  assert.equal(execution.index,0);
});

test('final recorded set skips terminal countdown while preserving review and Coach extra-set choice',()=>{
  const session=makeSession({sets:1});
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-terminal-review'});
  startExecution(execution,{actor:coach()});

  const result=dispatchSessionAction({
    action:'complete-set',
    execution,
    session,
    catalog,
    actor:coach(),
    payload:{reps:10,load:'40 kg',rpe:7,rir:3,restSeconds:60},
  });

  assert.equal(result.kind,'execution');
  assert.equal(execution.status,'active');
  assert.equal(execution.index,0);
  assert.equal(execution.setIndex,0);
  assert.equal(execution.restUntil,null);
  assert.equal(execution.events.some((item)=>item.type==='REST_STARTED'),false);

  const html=renderGuidedExecution({execution,session,catalog,role:'coach'});
  assert.match(html,/data-session-rest-active="false"/);
  assert.match(html,/Última serie completada/);
  assert.match(html,/Corregir esta serie/);
  assert.match(html,/\+ 1 serie y seguir/);
  assert.match(html,/Continuar al cierre/);

  dispatchSessionAction({action:'next',execution,session,catalog,actor:coach()});
  assert.equal(execution.status,'awaiting_feedback');
  assert.equal(execution.restUntil,null);
});

test('non-terminal recorded set keeps the planned rest unchanged',()=>{
  const session=makeSession({sets:2});
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-rest-still-required'});
  startExecution(execution,{actor:coach()});

  dispatchSessionAction({
    action:'complete-set',
    execution,
    session,
    catalog,
    actor:coach(),
    payload:{reps:10,load:'40 kg',rpe:7,rir:3,restSeconds:60},
  });

  assert.equal(execution.status,'active');
  assert.equal(execution.index,0);
  assert.equal(execution.setIndex,0);
  assert.ok(new Date(execution.restUntil).getTime()>Date.now());
  assert.equal(execution.events.some((item)=>item.type==='REST_STARTED'),true);
  assert.match(
    renderGuidedExecution({execution,session,catalog,role:'coach'}),
    /data-session-live-state="rest"/,
  );
});

test('Coach repeat on the terminal set preserves review without starting a fake rest',()=>{
  const session=makeSession({sets:2});
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-terminal-repeat'});
  startExecution(execution,{actor:coach()});
  recordSet(execution,session,{reps:10,load:'40 kg',rpe:7,rir:3,actor:coach()});
  advanceExecution(execution,{actor:coach()});

  const result=dispatchSessionAction({
    action:'repeat-previous-set',
    execution,
    session,
    catalog,
    actor:coach(),
    payload:{restSeconds:60},
  });

  assert.equal(result.kind,'execution');
  assert.equal(execution.status,'active');
  assert.equal(execution.setIndex,1);
  assert.equal(execution.restUntil,null);
  assert.ok(executionResultForStep(execution,currentStep(execution,session)));
  assert.equal(execution.events.some((item)=>item.type==='REST_STARTED'),false);
  assert.equal(execution.events.some((item)=>item.type==='SET_REPEATED_FROM_PREVIOUS'),true);

  const html=renderGuidedExecution({execution,session,catalog,role:'coach'});
  assert.match(html,/data-session-rest-active="false"/);
  assert.match(html,/\+ 1 serie y seguir/);
  assert.match(html,/Continuar al cierre/);
});

test('internal expired-rest dispatch uses the normal progress persistence command',async()=>{
  const {session,execution}=executionWithRecordedSet();
  const commands=[];
  const commandBus={
    async execute(command){
      commands.push(structuredClone(command));
      return {ok:true,kind:'applied',command,response:{remoteRevision:3}};
    },
  };
  const result=dispatchSessionAction({
    action:'rest-expired-auto',
    execution,
    session,
    catalog,
    actor:coach(),
    commandBus,
    payload:{nowMs:Date.now()},
  });
  assert.equal(result.kind,'command');
  await result.value;
  assert.equal(commands.length,1);
  assert.equal(commands[0].type,'EJECUCION_GUARDAR_PROGRESO');
  assert.equal(commands[0].payload.progressSnapshot.setIndex,1);
  assert.equal(execution.revision,3);
});

test('manual previous persists a real rewind but avoids a redundant write at the first step',async()=>{
  const {session,execution}=executionWithRecordedSet({restMs:60000});
  advanceExecution(execution,{actor:coach()});
  const commands=[];
  const commandBus={
    async execute(command){
      commands.push(structuredClone(command));
      return {ok:true,kind:'applied',command,response:{remoteRevision:5}};
    },
  };
  const rewound=dispatchSessionAction({
    action:'previous',
    execution,
    session,
    catalog,
    actor:coach(),
    commandBus,
  });
  assert.equal(rewound.kind,'command');
  await rewound.value;
  assert.equal(execution.setIndex,0);
  assert.equal(commands[0]?.type,'EJECUCION_GUARDAR_PROGRESO');
  assert.equal(commands[0]?.payload?.progressSnapshot?.setIndex,0);

  const firstSession=makeSession({sets:2});
  const firstExecution=createExecution({session:firstSession,clientId:firstSession.clientId,executionId:'execution-first-step'});
  startExecution(firstExecution,{actor:coach()});
  const firstCommands=[];
  const first=dispatchSessionAction({
    action:'previous',
    execution:firstExecution,
    session:firstSession,
    catalog,
    actor:coach(),
    commandBus:{async execute(command){firstCommands.push(command);return {ok:true,kind:'applied',command,response:{remoteRevision:2}};}},
  });
  assert.equal(first.kind,'execution');
  assert.equal(firstCommands.length,0);
});

test('rest adjustments persist through the normal progress command path',async()=>{
  for(const [action,expectedDirection] of [['rest-plus',1],['rest-minus',-1]]){
    const {session,execution}=executionWithRecordedSet({restMs:60000});
    const before=new Date(execution.restUntil).getTime();
    const commands=[];
    const commandBus={
      async execute(command){
        commands.push(structuredClone(command));
        return {ok:true,kind:'applied',command,response:{remoteRevision:6}};
      },
    };
    const result=dispatchSessionAction({action,execution,session,catalog,actor:coach(),commandBus});
    assert.equal(result.kind,'command');
    await result.value;
    const after=new Date(execution.restUntil).getTime();
    assert.equal(Math.sign(after-before),expectedDirection);
    assert.equal(commands.length,1);
    assert.equal(commands[0]?.type,'EJECUCION_GUARDAR_PROGRESO');
    assert.equal(commands[0]?.payload?.progressSnapshot?.restUntil,execution.restUntil);
  }
});

test('manual next also persists the advanced step through the progress command bus',async()=>{
  const {session,execution}=executionWithRecordedSet();
  const commands=[];
  const commandBus={
    async execute(command){
      commands.push(structuredClone(command));
      return {ok:true,kind:'applied',command,response:{remoteRevision:4}};
    },
  };
  const result=dispatchSessionAction({
    action:'next',
    execution,
    session,
    catalog,
    actor:coach(),
    commandBus,
  });
  assert.equal(result.kind,'command');
  await result.value;
  assert.equal(execution.setIndex,1);
  assert.equal(commands[0]?.type,'EJECUCION_GUARDAR_PROGRESO');
  assert.equal(commands[0]?.payload?.progressSnapshot?.setIndex,1);
});

class FakeTarget{
  constructor(){this.listeners=new Map();this.visibilityState='visible';this.ownerDocument={activeElement:null};}
  addEventListener(type,listener){const set=this.listeners.get(type)||new Set();set.add(listener);this.listeners.set(type,set);}
  removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
}
function fakeRoot({correctionOpen=false}={}){
  const root=new FakeTarget();
  const disclosure={open:correctionOpen,contains(){return false;}};
  root.querySelectorAll=()=>[];
  root.querySelector=(selector)=>selector==='[data-session-rest-correction]'?disclosure:null;
  return root;
}
const telemetryStub={start:async()=>{},pause:async()=>{},resume:async()=>{},stop:async()=>{}};
function sleep(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}

test('Coach controller advances after rest expiry while Client remains manual',async()=>{
  const coachState=executionWithRecordedSet({restMs:35});
  const coachRoot=fakeRoot();
  const coachPersisted=[];
  const coachContext={
    execution:coachState.execution,
    session:coachState.session,
    catalog,
    actor:coach(),
    recoveryCoordinator:{
      async persist(payload){coachPersisted.push(structuredClone(payload));},
      async settle(){},
    },
  };
  const coachController=createSessionController({
    root:coachRoot,
    getContext:()=>coachContext,
    render:()=>{},
    liveTelemetryController:telemetryStub,
    lifecycleTarget:new FakeTarget(),
    visibilityTarget:new FakeTarget(),
  });
  coachController.mount();
  await sleep(110);
  assert.equal(coachState.execution.setIndex,1);
  assert.ok(coachPersisted.some((item)=>item.execution.setIndex===1));
  coachController.destroy();

  const clientState=executionWithRecordedSet({restMs:35});
  const clientRoot=fakeRoot();
  const clientContext={
    execution:clientState.execution,
    session:clientState.session,
    catalog,
    actor:client(),
    recoveryCoordinator:{async persist(){},async settle(){}},
  };
  const clientController=createSessionController({
    root:clientRoot,
    getContext:()=>clientContext,
    render:()=>{},
    liveTelemetryController:telemetryStub,
    lifecycleTarget:new FakeTarget(),
    visibilityTarget:new FakeTarget(),
  });
  clientController.mount();
  await sleep(110);
  assert.equal(clientState.execution.setIndex,0);
  clientController.destroy();
});

test('Coach auto-advance is suppressed while correcting the recorded set',async()=>{
  const {session,execution}=executionWithRecordedSet({restMs:30});
  const root=fakeRoot({correctionOpen:true});
  const context={
    execution,
    session,
    catalog,
    actor:coach(),
    recoveryCoordinator:{async persist(){},async settle(){}},
  };
  const controller=createSessionController({
    root,
    getContext:()=>context,
    render:()=>{},
    liveTelemetryController:telemetryStub,
    lifecycleTarget:new FakeTarget(),
    visibilityTarget:new FakeTarget(),
  });
  controller.mount();
  await sleep(100);
  assert.equal(execution.setIndex,0);
  assert.ok(executionResultForStep(execution,currentStep(execution,session)));
  controller.destroy();
});

test('rendered rest correction disclosure is wired to the Coach auto-advance guard',()=>{
  const {session,execution}=executionWithRecordedSet({restMs:60000});
  const html=renderGuidedExecution({execution,session,catalog,role:'coach'});
  assert.match(html,/data-session-rest-correction/);
  assert.match(html,/data-session-rest-countdown-value/);
  assert.match(html,/Corregir esta serie/);
});

test('controller source keeps manual controls and suppresses auto advance on hidden/correction states',()=>{
  const source=fs.readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(source,/action==='rest-minus'\|\|action==='rest-plus'/);
  assert.match(source,/action==='next'/);
  assert.match(source,/visibilityState==='hidden'/);
  assert.match(source,/data-session-rest-correction/);
  assert.match(source,/coachRestSuppressedSignature/);
  assert.match(source,/rest-expired-auto/);
});
