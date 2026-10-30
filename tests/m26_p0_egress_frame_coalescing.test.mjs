import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHydrationCoordinator} from '../src/m26/app/hydration-coordinator.js';

const deferred=()=>{
  let resolve,reject;
  const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});
  return {resolve,reject,promise};
};
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('simultaneous same-owner login bootstrap is coalesced before and during request',async()=>{
  const owner={id:'A'},first=deferred(),calls=[];
  const c=createHydrationCoordinator(({reason,ownerSession})=>{
    calls.push({reason,ownerSession});
    return first.promise;
  },{getOwner:()=>owner});
  const a=c.request({reason:'login'});
  const b=c.request({reason:'login'});
  await tick();
  const d=c.request({reason:'login'});
  assert.strictEqual(a,b);
  assert.strictEqual(b,d);
  assert.equal(calls.length,1,'one privileged bootstrap per initial login');
  first.resolve('fresh-login');
  assert.equal(await a,'fresh-login');
  assert.equal(await b,'fresh-login');
  assert.equal(await d,'fresh-login');
  assert.equal(calls.length,1,'identical login must not run a second pass');
});
test('post-ACK reads are never dropped even when an initial login is loading',async()=>{
  const owner={id:'A'},first=deferred(),second=deferred(),third=deferred(),calls=[];
  const steps=[first,second,third];
  const c=createHydrationCoordinator(({reason})=>{
    calls.push(reason);
    return steps[calls.length-1].promise;
  },{getOwner:()=>owner});
  const login=c.request({reason:'login'});
  await tick();
  const ack1=c.request({reason:'session-published-verify'});
  first.resolve('initial');
  await tick();
  assert.deepEqual(calls,['login','session-published-verify']);
  const ack2=c.request({reason:'session-published-verify'});
  second.resolve('post-ack-1');
  await tick();
  assert.deepEqual(calls,['login','session-published-verify','session-published-verify']);
  third.resolve('post-ack-2');
  assert.equal(await login,'post-ack-2');
  assert.equal(await ack1,'post-ack-2');
  assert.equal(await ack2,'post-ack-2');
});
test('same reason other than login still queues, never removes post-command readback',async()=>{
  const owner={id:'A'},a=deferred(),b=deferred(),calls=[];
  const c=createHydrationCoordinator(({reason})=>{
    calls.push(reason);return calls.length===1?a.promise:b.promise;
  },{getOwner:()=>owner});
  const one=c.request({reason:'readback'});
  await tick();
  const two=c.request({reason:'readback'});
  a.resolve('old');
  await tick();
  assert.deepEqual(calls,['readback','readback']);
  b.resolve('new');
  assert.equal(await one,'new');
  assert.equal(await two,'new');
});
test('identity switch never coalesces with an earlier owner even with identical login reason',async()=>{
  const a={id:'A'},b={id:'B'},pA=deferred(),pB=deferred(),calls=[];
  let owner=a;
  const c=createHydrationCoordinator(({ownerSession})=>{
    calls.push(ownerSession.id);
    return ownerSession===a?pA.promise:pB.promise;
  },{getOwner:()=>owner});
  const old=c.request({reason:'login'});
  await tick();
  owner=b;
  const next=c.request({reason:'login'});
  await tick();
  assert.deepEqual(calls,['A','B']);
  pA.resolve('A');
  assert.equal(await old,'A');
  pB.resolve('B');
  assert.equal(await next,'B');
});
test('rendering remains microtask-ordered with synchronous navigation; no rAF delay on clicks',()=>{
  const shell=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
  const start=shell.indexOf('  function renderSafely(state=store.getState())');
  const end=shell.indexOf('  function onPointerDown(',start);
  assert.ok(start>0&&end>start);
  const scheduler=shell.slice(start,end);
  assert.match(scheduler,/queueMicrotask\(\(\)=>\{/u);
  assert.match(scheduler,/renderNow\(next\);/u);
  assert.doesNotMatch(scheduler,/requestAnimationFrame|scheduledRenderFrame|scheduledRenderFallback/u);
  assert.match(shell,/reconcileRouteRender\(decision\.area\);/u);
  assert.match(shell,/store\.navigate\(decision\.area\);/u);
});
