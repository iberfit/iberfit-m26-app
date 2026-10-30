import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHydrationCoordinator} from '../src/m26/app/hydration-coordinator.js';

const source=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
const begin=source.indexOf('  let scheduledRenderFrame=null;');
const end=source.indexOf('  function onPointerDown(',begin);
assert.ok(begin>=0&&end>begin,'real shell frame scheduler must be present');
const schedulingSource=source.slice(begin,end);
const drain=async()=>{await Promise.resolve();await Promise.resolve();};

function frameFixture({visible=true}={}){
  const frames=new Map(),timers=new Map(),calls=[],microtasks=[];
  let nextId=1,generation=1,busy=false;
  const host={
    requestAnimationFrame:(fn)=>{const id=nextId++;frames.set(id,fn);return id;},
    cancelAnimationFrame:(id)=>frames.delete(id),
    setTimeout:(fn)=>{const id=nextId++;timers.set(id,fn);return id;},
    clearTimeout:(id)=>timers.delete(id),
  };
  const store={getState:()=>({v:'from-store'})};
  const state={
    root:{ownerDocument:{visibilityState:visible?'visible':'hidden'}},
    store,adaptiveWindow:host,generation,renderQueued:false,queuedState:null,
    shellInteractionActive:()=>busy,
    renderNow:(v)=>{calls.push(v);return true;},
    queueMicrotask:(fn)=>microtasks.push(fn),
  };
  const api=runInNewContext(schedulingSource+'\n({scheduleRender,renderSafely,clearScheduledRender})',state);
  return {api,state,frames,timers,calls,microtasks,setBusy:v=>busy=v,
    setGeneration:v=>{state.generation=v;},
    tickFrame(){const fn=[...frames.values()][0];assert.ok(fn);fn();},
    tickTimer(){const fn=[...timers.values()][0];assert.ok(fn);fn();},
    tickMicrotask(){const fn=microtasks.shift();assert.ok(fn);fn();},
  };
}
test('coalesces multiple store emissions in one visible frame, newest state wins',()=>{
  const f=frameFixture();
  f.api.scheduleRender({v:1});
  f.api.scheduleRender({v:2});
  f.api.scheduleRender({v:3});
  assert.equal(f.frames.size,1);
  assert.equal(f.timers.size,1);
  assert.equal(f.calls.length,0);
  f.tickFrame();
  assert.deepEqual(f.calls,[{v:3}]);
  assert.equal(f.frames.size,0);
  assert.equal(f.timers.size,0);
});
test('fallback timer makes progress if browser animation frame is suspended',()=>{
  const f=frameFixture();
  f.api.scheduleRender({v:4});
  f.tickTimer();
  assert.deepEqual(f.calls,[{v:4}]);
  assert.equal(f.frames.size,0);
  assert.equal(f.timers.size,0);
});
test('hidden document retains safe microtask semantics',()=>{
  const f=frameFixture({visible:false});
  f.api.scheduleRender({v:5});
  f.api.scheduleRender({v:6});
  assert.equal(f.frames.size,0);
  assert.equal(f.microtasks.length,1);
  f.tickMicrotask();
  assert.deepEqual(f.calls,[{v:6}]);
});
test('interaction and stale generation must not repaint old state',()=>{
  const f=frameFixture();
  f.api.scheduleRender({v:'old'});
  f.setBusy(true);
  f.tickFrame();
  assert.equal(f.calls.length,0);
  f.setBusy(false);
  f.api.scheduleRender({v:'new'});
  f.tickFrame();
  assert.deepEqual(f.calls,[{v:'new'}]);
  f.api.scheduleRender({v:'stale'});
  f.setGeneration(2);
  f.api.clearScheduledRender();
  assert.equal(f.frames.size,0);
  assert.equal(f.timers.size,0);
});
test('explicit render cancels queued frame and prevents stale post-click repaint',()=>{
  const f=frameFixture();
  f.api.scheduleRender({v:'queued'});
  f.api.renderSafely({v:'clicked'});
  assert.deepEqual(f.calls,[{v:'clicked'}]);
  assert.equal(f.frames.size,0);
  assert.equal(f.timers.size,0);
});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {resolve,promise};};
test('duplicate login coalesces without extra privileged bootstrap; post-ACK reasons still replay',async()=>{
  let owner={id:'A'},calls=[];
  const p1=deferred(),p2=deferred(),p3=deferred();
  const co=createHydrationCoordinator(({reason})=>{
    calls.push(reason);
    return [p1,p2,p3][calls.length-1].promise;
  },{getOwner:()=>owner});
  const one=co.request({reason:'login'});
  await drain();
  const two=co.request({reason:'login'});
  assert.strictEqual(one,two);
  assert.deepEqual(calls,['login']);
  co.request({reason:'training-ACK'});
  p1.resolve('first');
  await drain();
  assert.deepEqual(calls,['login','training-ACK']);
  const third=co.request({reason:'training-ACK'});
  p2.resolve('second');
  await drain();
  assert.deepEqual(calls,['login','training-ACK','training-ACK']);
  p3.resolve('third');
  assert.equal(await one,'third');
  assert.equal(await two,'third');
  assert.equal(await third,'third');
});
