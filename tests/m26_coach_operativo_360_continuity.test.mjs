import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSessionDraft} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';

function rootFixture(){
  const listeners=new Map();
  const root={
    ownerDocument:{activeElement:null},
    setFields:[],
    addEventListener(name,handler){const group=listeners.get(name)||[];group.push(handler);listeners.set(name,group);},
    removeEventListener(name,handler){listeners.set(name,(listeners.get(name)||[]).filter(item=>item!==handler));},
    querySelector(){return null;},
    querySelectorAll(selector){return selector==='[data-set-field]'?this.setFields:[];},
    emit(type,target){for(const handler of listeners.get(type)||[])handler({target,preventDefault(){}});},
  };
  return root;
}
const noopEvents={addEventListener(){},removeEventListener(){},visibilityState:'visible'};
const telemetry={start:async()=>{},stop:async()=>{},pause:async()=>{},resume:async()=>{}};
function controller(root,getContext,extra={}){
  return createSessionController({
    root,getContext,render:()=>{},autosaveDelayMs:50,
    liveTelemetryController:telemetry,lifecycleTarget:noopEvents,
    visibilityTarget:noopEvents,clockTarget:{},...extra,
  });
}
function inputNode(selector,attribute,value){
  return {value,getAttribute(name){return name===attribute?selector:null;}};
}
function inputEvent(match,node){
  return {closest(selector){return selector===match?node:null;}};
}
const sessionFor=(client)=>({id:'session-'+client,clientId:client,blocks:[{
  id:'block-'+client,type:'exercise',exerciseId:'exercise-'+client,
  sets:2,reps:'10',restSeconds:45,targetRpe:7,targetRir:2,
}]});
function liveContext(client,persisted){
  const session=sessionFor(client);
  const execution=createExecution({session,clientId:client,executionId:'execution-'+client});
  startExecution(execution);
  return {
    actor:{role:'client'},session,execution,sessionRevision:0,
    recoveryCoordinator:{
      async persist(payload){persisted.push({owner:client,payload:structuredClone(payload)});},
      async settle(){},
    },
  };
}
const nextTick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('rapid Coach draft edits persist both clients instead of discarding the first debounce',async()=>{
  const root=rootFixture(),saved=[];
  const contextA={draft:createSessionDraft({clientId:'client-A'}),autosaveDraft:async(draft)=>saved.push(['A',draft.clientId,draft.title])};
  const contextB={draft:createSessionDraft({clientId:'client-B'}),autosaveDraft:async(draft)=>saved.push(['B',draft.clientId,draft.title])};
  let active=contextA;const c=controller(root,()=>active);c.mount();
  const fieldA=inputNode('title','data-session-draft-field','Fuerza A');
  root.emit('input',inputEvent('[data-session-draft-field]',fieldA));
  active=contextB;
  const fieldB=inputNode('title','data-session-draft-field','Fuerza B');
  root.emit('input',inputEvent('[data-session-draft-field]',fieldB));
  await new Promise(resolve=>setTimeout(resolve,95));
  assert.deepEqual(saved,[['A','client-A','Fuerza A'],['B','client-B','Fuerza B']]);
  c.destroy();
});

test('forced save on a new context preserves the old pending draft and current new draft',async()=>{
  const root=rootFixture(),saved=[];
  const contextA={draft:createSessionDraft({clientId:'client-A'}),autosaveDraft:async()=>saved.push('A')};
  const contextB={draft:createSessionDraft({clientId:'client-B'}),autosaveDraft:async()=>saved.push('B')};
  let active=contextA;const c=controller(root,()=>active);c.mount();
  root.emit('input',inputEvent('[data-session-draft-field]',inputNode('title','data-session-draft-field','A')));
  active=contextB;
  await c.flushAutosave?.(contextB,{force:true});
  assert.deepEqual(saved,['A','B']);
  c.destroy();
});

test('rapid set edits on two different executions retain two owner-scoped checkpoints',async()=>{
  const root=rootFixture(),stored=[];
  const a=liveContext('client-A',stored),b=liveContext('client-B',stored);
  let active=a;const c=controller(root,()=>active);c.mount();
  const reps={value:'12',getAttribute(name){return name==='data-set-field'?'reps':null;}};
  root.setFields=[reps];
  root.emit('input',inputEvent('[data-set-field]',reps));
  assert.equal(a.execution.activeSetDraft.values.reps,'12');
  active=b;reps.value='8';
  root.emit('input',inputEvent('[data-set-field]',reps));
  await new Promise(resolve=>setTimeout(resolve,95));
  const pair=stored.filter(item=>item.payload.execution.activeSetDraft).map(item=>[
    item.payload.execution.clientId,item.payload.execution.activeSetDraft.values.reps,
  ]);
  assert.ok(pair.some(([id,reps])=>id==='client-A'&&reps==='12'));
  assert.ok(pair.some(([id,reps])=>id==='client-B'&&reps==='8'));
  assert.ok(stored.every(item=>item.owner===item.payload.execution.clientId));
  c.destroy();
});

test('explicit and automatic start attempts share a lock until remote acknowledgement',async()=>{
  const root=rootFixture(),session=sessionFor('client-C');
  const execution=createExecution({session,clientId:'client-C',executionId:'execution-client-C'});
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let commands=0;
  const context={
    session,execution,appointmentId:'appointment-C',sessionRevision:0,
    actor:{role:'coach',id:'coach-C'},
    commandBus:{async execute(){commands++;await gate;return {ok:true,kind:'ack',response:{executionRevision:1}};}},
  };
  const c=controller(root,()=>context);c.mount();
  const first=c.start();
  const second=await c.start();
  assert.equal(second,false);
  assert.equal(commands,0,'the first start is still crossing the asynchronous preflight');
  await nextTick();
  assert.equal(commands,1);
  const third=await c.start();
  assert.equal(third,false);
  release();
  assert.equal(await first,true);
  assert.equal(execution.status,'active');
  assert.equal(commands,1);
  assert.equal(await c.start(),false,'an already active session must not start again');
  c.destroy();
});

function actionButton(action){
  const attrs=new Map([['data-session-action',action]]);
  return {
    disabled:false,
    closest(selector){return selector==='[data-session-action]'?this:null;},
    getAttribute(name){return attrs.get(name)||null;},
    setAttribute(name,value){attrs.set(name,String(value));},
    removeAttribute(name){attrs.delete(name);},
  };
}
test('navigation exit is single-flight even if different buttons are tapped before persistence returns',async()=>{
  const root=rootFixture();
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let exits=0;
  const context={async onExit(){exits+=1;await gate;}};
  const c=controller(root,()=>context);c.mount();
  root.emit('click',actionButton('exit-session'));
  root.emit('click',actionButton('exit-session'));
  await nextTick();
  assert.equal(exits,1);
  root.emit('click',actionButton('exit-session'));
  assert.equal(exits,1);
  release();
  await nextTick();
  c.destroy();
});
test('an explicit start click cannot duplicate the shell-initiated start in flight',async()=>{
  const root=rootFixture(),session=sessionFor('client-D');
  const execution=createExecution({session,clientId:'client-D',executionId:'execution-client-D'});
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let starts=0;
  const context={
    session,execution,appointmentId:'appointment-D',sessionRevision:0,
    actor:{role:'coach',id:'coach-D'},
    commandBus:{async execute(){starts+=1;await gate;return {ok:true,kind:'ack',response:{executionRevision:1}};}},
  };
  const c=controller(root,()=>context);c.mount();
  const automatic=c.start();
  root.emit('click',actionButton('start'));
  await nextTick();
  assert.equal(starts,1);
  release();
  assert.equal(await automatic,true);
  assert.equal(starts,1);
  c.destroy();
});

test('app persistence binds each queued save to a captured draft, never mutable sessionUi',async()=>{
  const source=await readFile(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const start=source.indexOf('async function saveSessionDraft(draftOverride=null)');
  const end=source.indexOf('async function loadSessionDraft(',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/const selectedDraft=draftOverride\?\?sessionUi\?\.draft/);
  assert.match(block,/const draft=structuredClone\(selectedDraft\)/);
  assert.match(block,/await draftRepository\.save\(clientId,SESSION_DRAFT_SCOPE,draft\)/);
  assert.match(block,/if\(sessionUi\?\.draft===selectedDraft\)/);
  assert.doesNotMatch(block,/updatedAt:sessionUi\.draftPersistence\.updatedAt/);
  const controller=await readFile(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(controller,/previous\.autosaveDraft\(previous\.draft\)/);
  assert.match(controller,/target\?\.autosaveDraft\?\.\(target\.draft\)/);
  assert.match(controller,/context\.autosaveDraft\(context\.draft\)/);
});
