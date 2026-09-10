import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {createActionState} from '../src/m26/ui/action-state.js';

function harness(){
  const listeners=new Map();
  const nodes=new Map();
  function node(selector,value='',attrs={}){
    const n={value,disabled:false,options:[],attrs:new Map(Object.entries(attrs)),
      getAttribute(k){return this.attrs.get(k)??null;},setAttribute(k,v){this.attrs.set(k,v);},removeAttribute(k){this.attrs.delete(k);},
      closest(s){return s===selector||(s==='[data-session-action]'&&this.attrs.has('data-session-action'))?this:null;}};
    nodes.set(selector,n);return n;
  }
  const select=node('[data-session-live-add-exercise]');
  select.options=[{value:''},{value:'exercise-valid'}];
  const button=node('[data-session-action="add-live-exercise"]','',{'data-session-action':'add-live-exercise'});
  for(const [key,value] of Object.entries({sets:'2',reps:'10',rest:'60',tempo:'2-0-2',rpe:'7',rir:'3'}))node(`[data-session-live-add-${key}]`,value);
  const root={querySelector:s=>nodes.get(s),querySelectorAll:()=>[],
    addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);},
    removeEventListener(k,fn){listeners.get(k)?.delete(fn);}};
  const session={id:'session-1',blocks:[{id:'block-1',type:'exercise',exerciseId:'original',sets:2}]};
  const execution=createExecution({session,clientId:'client-1',executionId:'execution-1'});startExecution(execution);
  const context={session,execution,catalog:new Set(['exercise-valid']),actor:{role:'coach'},actionState:createActionState()};
  const errors=[];
  const controller=createSessionController({root,getContext:()=>context,render:()=>{},onError:e=>errors.push(e),
    liveTelemetryController:{stop:async()=>{},start:async()=>{}},lifecycleTarget:null,visibilityTarget:null});
  const fire=async(k,target)=>Promise.all([...listeners.get(k)||[]].map(fn=>fn({target,preventDefault(){}})));
  controller.mount();
  return {select,button,context,execution,errors,controller,listeners,fire};
}

test('mount, input, change and shell render track valid catalog options',async()=>{
  const h=harness();assert.equal(h.button.disabled,true);
  h.select.value='exercise-valid';await h.fire('input',h.select);assert.equal(h.button.disabled,false);
  h.select.value='missing';await h.fire('change',h.select);assert.equal(h.button.disabled,true);
  h.select.options=[{value:''},{value:'missing'}];await h.fire('m26:shell-rendered',h.select);assert.equal(h.select.disabled,true);
  h.select.options=[{value:'exercise-valid'}];h.select.value='exercise-valid';await h.fire('m26:shell-rendered',h.select);
  assert.equal(h.select.disabled,false);assert.equal(h.button.disabled,false);
  h.controller.destroy();for(const set of h.listeners.values())assert.equal(set.size,0);
});

test('stale invalid selection never reaches domain and valid trimmed selection adds exactly once',async()=>{
  const h=harness();h.select.value='exercise-valid';await h.fire('change',h.select);
  h.select.value='missing';await h.fire('click',h.button);
  assert.equal(h.execution.queue.length,1);assert.equal(h.errors.length,0);
  h.select.value='  exercise-valid  ';await h.fire('change',h.select);await h.fire('click',h.button);
  assert.equal(h.execution.queue.length,2);assert.equal(h.execution.queue[1].exerciseId,'exercise-valid');assert.equal(h.errors.length,0);
  h.controller.destroy();
});

test('invalid selection after asynchronous flush is rejected before mutation and controls recover',async()=>{
  const h=harness();h.select.value='exercise-valid';await h.fire('change',h.select);
  const pending=h.fire('click',h.button);
  h.select.value='missing';await pending;
  assert.equal(h.execution.queue.length,1);assert.equal(h.errors.length,1);assert.equal(h.button.getAttribute('aria-busy'),null);
  h.select.value='exercise-valid';await h.fire('change',h.select);await h.fire('click',h.button);
  assert.equal(h.execution.queue.length,2);h.controller.destroy();
});

test('pending add stays locked through change and shell render, rejects duplicate click, unlocks on failure',async()=>{
  const h=harness();let reject;let calls=0;
  h.context.commandBus={execute:()=>{calls++;return new Promise((_,r)=>{reject=r;});}};
  h.select.value='exercise-valid';await h.fire('change',h.select);
  const pending=h.fire('click',h.button);
  for(let i=0;i<20&&!reject;i++)await Promise.resolve();
  assert.equal(calls,1);
  await h.fire('change',h.select);await h.fire('m26:shell-rendered',h.select);
  assert.equal(h.button.disabled,true);assert.equal(h.select.disabled,true);
  await h.fire('click',h.button);assert.equal(calls,1);
  reject(new Error('M26_NETWORK_UNAVAILABLE'));await pending;
  assert.equal(h.button.disabled,false);assert.equal(h.select.disabled,false);assert.equal(h.button.getAttribute('aria-busy'),null);
  assert.equal(h.context.actionState.status,'offline');assert.equal(h.errors.length,1);h.controller.destroy();
});
